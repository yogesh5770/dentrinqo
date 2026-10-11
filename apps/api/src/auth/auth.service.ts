import { Injectable, UnauthorizedException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { verify, hash } from '@node-rs/argon2';
import * as crypto from 'crypto';
import { resolveUserPermissions } from '@aks/shared-types';

interface TokenPayload {
  userId: string;
  clinicId: string;
  email: string;
  username?: string | null;
  role: string;
  permissions?: string[];
  exp: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly secretKey: string;

  constructor(private readonly prisma: PrismaService) {
    const secret = process.env.SESSION_SECRET;
    if (!secret || secret.trim().length < 32) {
      this.logger.error('CRITICAL: SESSION_SECRET is missing or insufficiently random (minimum 32 characters required).');
      throw new Error(
        'FATAL SECURITY CONFIGURATION ERROR: SESSION_SECRET environment variable is missing or insufficiently random (minimum 32 characters required). The application refuses to start in an insecure state.'
      );
    }
    this.secretKey = secret.trim();
  }

  createToken(user: { id: string; clinicId: string; email: string; username?: string | null; role: string; permissions?: any }): string {
    const effectivePermissions = resolveUserPermissions(user.role, user.permissions);
    const payload: TokenPayload = {
      userId: user.id,
      clinicId: user.clinicId,
      email: user.email,
      username: user.username,
      role: user.role,
      permissions: effectivePermissions,
      exp: Date.now() + 8 * 60 * 60 * 1000, // 8 hours session expiry
    };
    const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', this.secretKey).update(data).digest('base64url');
    return `${data}.${signature}`;
  }

  verifyToken(token: string): TokenPayload | null {
    try {
      if (!token || typeof token !== 'string') return null;
      const parts = token.split('.');
      if (parts.length !== 2) return null;
      const [data, signature] = parts;
      if (!data || !signature) return null;

      const expectedSig = crypto.createHmac('sha256', this.secretKey).update(data).digest('base64url');
      
      const sigBuf = Buffer.from(signature, 'utf8');
      const expectedBuf = Buffer.from(expectedSig, 'utf8');
      if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        return null;
      }

      const payload: TokenPayload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
      if (!payload || !payload.exp || typeof payload.exp !== 'number') return null;
      if (Date.now() > payload.exp) return null;
      if (!payload.userId || !payload.clinicId || !payload.role) return null;

      return payload;
    } catch {
      return null;
    }
  }

  async validateUserCredentials(identifier: string, plainPass: string) {
    const clean = identifier.toLowerCase().trim();
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: clean },
          { username: clean },
        ],
      },
      include: { clinic: true },
    });

    if (!user) {
      this.logger.warn(`Failed login attempt for unknown user/email: ${identifier}`);
      throw new UnauthorizedException('Invalid email/username or password');
    }

    if (!user.isActive) {
      throw new ForbiddenException('Account is inactive. Please contact the clinic administrator.');
    }

    const isValid = await verify(user.passwordHash, plainPass);
    if (!isValid) {
      this.logger.warn(`Failed login attempt (wrong password) for: ${identifier}`);
      throw new UnauthorizedException('Invalid email/username or password');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return user;
  }

  async hashPassword(plainText: string): Promise<string> {
    return hash(plainText);
  }

  async changePassword(userId: string, currentPass: string, newPass: string) {
    if (!newPass || newPass.trim().length < 6) {
      throw new BadRequestException('New password must be at least 6 characters long');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const isCurrentValid = await verify(user.passwordHash, currentPass);
    if (!isCurrentValid) {
      throw new BadRequestException('Current password does not match. Please verify and try again.');
    }

    if (currentPass === newPass) {
      throw new BadRequestException('New password must be different from current password');
    }

    const newPasswordHash = await hash(newPass);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: newPasswordHash,
        mustChangePassword: false,
      },
    });

    this.logger.log(`Password changed successfully for user: ${user.email}`);
    return {
      message: 'Password changed successfully. Your account is now secured with your new password.',
    };
  }

  async forgotPassword(email: string) {
    const cleanEmail = (email || '').toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    // To prevent email enumeration attacks, always return generic message
    if (!user) {
      return {
        message: 'If an active account exists with this email address, password reset instructions have been generated.',
      };
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: resetToken,
        resetPasswordExpiry: resetExpiry,
      },
    });

    this.logger.log(`Password reset token generated for ${user.email}: ${resetToken}`);

    return {
      message: 'If an active account exists with this email address, password reset instructions have been generated.',
      // In development or if needed for direct access
      resetToken: process.env.NODE_ENV !== 'production' ? resetToken : undefined,
    };
  }

  async resetPasswordWithToken(token: string, newPass: string) {
    if (!token) throw new BadRequestException('Reset token is required');
    if (!newPass || newPass.trim().length < 6) {
      throw new BadRequestException('New password must be at least 6 characters long');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        resetPasswordToken: token,
        resetPasswordExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException('Password reset link is invalid or has expired. Please request a new one.');
    }

    const newPasswordHash = await hash(newPass);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newPasswordHash,
        resetPasswordToken: null,
        resetPasswordExpiry: null,
        mustChangePassword: false,
      },
    });

    return {
      message: 'Your password has been reset successfully. You can now log in with your new password.',
    };
  }

  async getCurrentProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        clinicId: true,
        email: true,
        username: true,
        fullName: true,
        role: true,
        permissions: true,
        phone: true,
        designation: true,
        department: true,
        employeeId: true,
        licenseNumber: true,
        specialization: true,
        mustChangePassword: true,
        isActive: true,
        lastLoginAt: true,
        clinic: {
          select: {
            id: true,
            name: true,
            code: true,
            city: true,
            timezone: true,
            currency: true,
            chairCount: true,
            phone: true,
            address: true,
            email: true,
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User session invalid or user inactive');
    }

    const effectivePermissions = resolveUserPermissions(user.role, user.permissions);

    return {
      ...user,
      permissions: effectivePermissions,
    };
  }
}