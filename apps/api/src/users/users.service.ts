import { Injectable, ConflictException, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { hash } from '@node-rs/argon2';
import * as crypto from 'crypto';

function generateSecureTemporaryPassword(): string {
  // Generates a cryptographically strong, memorable 10-character temporary password
  // Format: Aks + 2 uppercase + 2 digits + 1 special + 2 lowercase (e.g. Aks#9K2mX8)
  const lettersUpper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lettersLower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*';

  const randomPick = (charset: string) => charset[crypto.randomInt(0, charset.length)];

  const p1 = randomPick(symbols);
  const p2 = randomPick(digits);
  const p3 = randomPick(lettersUpper);
  const p4 = randomPick(lettersLower);
  const p5 = randomPick(digits);
  const p6 = randomPick(lettersUpper);
  const p7 = randomPick(lettersLower);

  return `Dental${p1}${p2}${p3}${p4}${p5}${p6}${p7}`;
}

function formatPhoneForWhatsApp(phone: string): string {
  const digitsOnly = (phone || '').replace(/[^0-9]/g, '');
  // If 10 digits (standard Indian mobile), prepend India country code 91
  if (digitsOnly.length === 10) {
    return `91${digitsOnly}`;
  }
  return digitsOnly;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(clinicId: string, query?: { role?: string; search?: string; isActive?: string }) {
    const where: any = { clinicId };

    if (query?.role) {
      if (query.role === 'DENTIST' || query.role === 'DOCTOR') {
        where.role = { in: ['DENTIST', 'CLINIC_ADMIN'] };
      } else {
        where.role = query.role;
      }
    }

    if (query?.isActive !== undefined && query?.isActive !== '') {
      where.isActive = query.isActive === 'true';
    }

    if (query?.search && query.search.trim()) {
      const q = query.search.trim().toLowerCase();
      where.OR = [
        { fullName: { contains: q } },
        { email: { contains: q } },
        { phone: { contains: q } },
        { employeeId: { contains: q } },
        { designation: { contains: q } },
        { department: { contains: q } },
      ];
    }

    const users = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
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
        createdAt: true,
        updatedAt: true,
      },
    });

    return users.map(u => ({
      ...u,
      permissions: typeof u.permissions === 'string' ? (() => { try { return JSON.parse(u.permissions); } catch { return []; } })() : (u.permissions || []),
    }));
  }

  async findOne(clinicId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, clinicId },
      select: {
        id: true,
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
        createdAt: true,
      },
    });

    if (!user) throw new NotFoundException('Staff member not found');
    return {
      ...user,
      permissions: typeof user.permissions === 'string' ? (() => { try { return JSON.parse(user.permissions); } catch { return []; } })() : (user.permissions || []),
    };
  }

  async create(clinicId: string, data: any, actor: any) {
    const email = (data.email || '').toLowerCase().trim();
    if (!email) {
      throw new BadRequestException('Email address is required');
    }

    if (!data.fullName || !data.fullName.trim()) {
      throw new BadRequestException('Full name is required');
    }

    if (!data.phone || !data.phone.trim()) {
      throw new BadRequestException('Mobile phone number is required');
    }

    const existing = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existing) {
      throw new ConflictException(`A staff account with email "${email}" already exists`);
    }

    // Auto-generate a strong temporary password if not provided
    const temporaryPassword = data.password && data.password.trim().length >= 6
      ? data.password.trim()
      : generateSecureTemporaryPassword();

    const passwordHash = await hash(temporaryPassword);

    // Format phone
    const cleanPhone = formatPhoneForWhatsApp(data.phone);

    // Auto-generate sequential Employee ID (e.g. AKS-EMP-001, JDC-EMP-001...)
    let finalEmployeeId = data.employeeId?.trim();
    if (!finalEmployeeId) {
      const clinic = await this.prisma.clinic.findUnique({ where: { id: clinicId } });
      const clinicPrefix = clinic?.code ? clinic.code.toUpperCase() : 'EMP';
      const userCount = await this.prisma.user.count({ where: { clinicId } });
      let seq = userCount + 1;
      let candidate = `${clinicPrefix}-EMP-${seq.toString().padStart(3, '0')}`;
      while (await this.prisma.user.findFirst({ where: { clinicId, employeeId: candidate } })) {
        seq++;
        candidate = `${clinicPrefix}-EMP-${seq.toString().padStart(3, '0')}`;
      }
      finalEmployeeId = candidate;
    }

    const permissionsJson = data.permissions
      ? (Array.isArray(data.permissions) ? JSON.stringify(data.permissions) : data.permissions)
      : '[]';

    const user = await this.prisma.user.create({
      data: {
        clinicId,
        email,
        username: data.username ? data.username.toLowerCase().trim() : null,
        passwordHash,
        fullName: data.fullName.trim(),
        role: data.role || 'RECEPTIONIST',
        permissions: permissionsJson,
        phone: data.phone.trim(),
        designation: data.designation?.trim() || null,
        department: data.department?.trim() || null,
        employeeId: finalEmployeeId,
        licenseNumber: data.licenseNumber?.trim() || null,
        specialization: data.specialization?.trim() || null,
        mustChangePassword: true,
        isActive: true,
      },
    });

    // Generate WhatsApp Share Message and Direct Link
    const clinicLoginUrl = process.env.FRONTEND_URL || 'https://aksdental.duckdns.org';
    const whatsappText = `*Welcome to AKS Elite Dental Clinic!* 🦷\nYour staff account has been created.\n\n👤 *Name:* ${user.fullName}\n🆔 *Employee ID:* ${user.employeeId}\n📧 *Login Email:* ${user.email}\n🔑 *Temporary Password:* ${temporaryPassword}\n🌐 *Login Here:* ${clinicLoginUrl}\n\n⚠️ *Security Notice:* Please log in and change your temporary password immediately from your profile dashboard.`;
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(whatsappText)}`;

    await this.auditService.log({
      clinicId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'STAFF_ACCOUNT_CREATED',
      entityType: 'User',
      entityId: user.id,
      details: {
        email: user.email,
        role: user.role,
        fullName: user.fullName,
        employeeId: user.employeeId,
        designation: user.designation,
        phone: user.phone,
      },
    });

    return {
      message: 'Staff account created successfully',
      staff: {
        id: user.id,
        email: user.email,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        phone: user.phone,
        designation: user.designation,
        department: user.department,
        employeeId: user.employeeId,
        mustChangePassword: user.mustChangePassword,
        isActive: user.isActive,
        createdAt: user.createdAt,
      },
      temporaryPassword,
      whatsappText,
      whatsappUrl,
      cleanPhone,
    };
  }

  async resetStaffPassword(clinicId: string, id: string, actor: any) {
    const user = await this.prisma.user.findFirst({ where: { id, clinicId } });
    if (!user) throw new NotFoundException('Staff member not found');

    const temporaryPassword = generateSecureTemporaryPassword();
    const passwordHash = await hash(temporaryPassword);

    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: true,
      },
    });

    const cleanPhone = formatPhoneForWhatsApp(user.phone || '');
    const clinicLoginUrl = process.env.FRONTEND_URL || 'https://aksdental.duckdns.org';
    const whatsappText = `*AK's Elite Dental Clinic — Password Reset* 🦷\nYour login password has been reset by the Clinic Administrator.\n\n👤 *Name:* ${user.fullName}\n📧 *Login Email:* ${user.email}\n🔑 *New Temporary Password:* ${temporaryPassword}\n🌐 *Login Here:* ${clinicLoginUrl}\n\n⚠️ *Security Notice:* Please log in and change your temporary password immediately.`;
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(whatsappText)}`;

    await this.auditService.log({
      clinicId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'STAFF_PASSWORD_RESET_BY_ADMIN',
      entityType: 'User',
      entityId: id,
      details: { email: user.email, resetBy: actor.email },
    });

    return {
      message: 'Temporary password generated successfully',
      staff: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
      },
      temporaryPassword,
      whatsappText,
      whatsappUrl,
    };
  }

  async update(clinicId: string, id: string, data: any, actor: any) {
    const user = await this.prisma.user.findFirst({ where: { id, clinicId } });
    if (!user) throw new NotFoundException('Staff member not found');

    // Prevent modifying core protected admin email
    if ((user.email === 'akselitedental.madurai@gmail.com' || user.email === 'aksdental@gmail.com') && data.role && data.role !== 'CLINIC_ADMIN') {
      throw new ForbiddenException('Primary Hospital Administrator role cannot be changed');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: data.fullName?.trim(),
        phone: data.phone?.trim(),
        role: data.role,
        designation: data.designation?.trim(),
        department: data.department?.trim(),
        employeeId: data.employeeId?.trim(),
        licenseNumber: data.licenseNumber?.trim(),
        specialization: data.specialization?.trim(),
        ...(data.permissions !== undefined
          ? {
              permissions: Array.isArray(data.permissions)
                ? JSON.stringify(data.permissions)
                : data.permissions,
            }
          : {}),
      },
      select: {
        id: true,
        email: true,
        username: true,
        fullName: true,
        role: true,
        permissions: true,
        phone: true,
        designation: true,
        department: true,
        employeeId: true,
        isActive: true,
        mustChangePassword: true,
      },
    });

    await this.auditService.log({
      clinicId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'STAFF_ACCOUNT_UPDATED',
      entityType: 'User',
      entityId: id,
      details: { email: updated.email, fullName: updated.fullName, role: updated.role },
    });

    return updated;
  }

  async toggleActiveStatus(clinicId: string, id: string, isActive: boolean, actor: any) {
    const user = await this.prisma.user.findFirst({ where: { id, clinicId } });
    if (!user) throw new NotFoundException('Staff member not found');

    if (user.id === actor.userId && !isActive) {
      throw new ForbiddenException('You cannot deactivate your own administrative account');
    }

    if ((user.email === 'akselitedental.madurai@gmail.com' || user.email === 'aksdental@gmail.com') && !isActive) {
      throw new ForbiddenException('Primary Hospital Administrator account cannot be deactivated');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
      },
    });

    await this.auditService.log({
      clinicId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: isActive ? 'STAFF_ACTIVATED' : 'STAFF_DEACTIVATED',
      entityType: 'User',
      entityId: id,
      details: { email: user.email, newStatus: isActive },
    });

    return updated;
  }
}