import { AuthService } from './auth.service';
import { PatientAuthService } from '../patient-auth/patient-auth.service';
import { AuthGuard } from './guards/auth.guard';
import { UnauthorizedException, BadRequestException, ExecutionContext } from '@nestjs/common';
import * as crypto from 'crypto';

describe('Dentrinqo P0 Security Remediation: Auth & Token Security', () => {
  const originalEnv = process.env.SESSION_SECRET;
  const strongSecret = 'f3b89a02c81e4b8d7a16e502c4b819e6d30f18a5e729c1b4e058d2a6f194c7b2'; // 64 chars

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.SESSION_SECRET = originalEnv;
    } else {
      delete process.env.SESSION_SECRET;
    }
    AuthService.clearUserStatusCache();
  });

  describe('SEC-05: Hardcoded JWT Fallback Secret Remediation', () => {
    it('PatientAuthService MUST throw fatal configuration error if SESSION_SECRET is missing', () => {
      delete process.env.SESSION_SECRET;
      expect(() => new PatientAuthService({} as any, {} as any)).toThrow(
        /FATAL SECURITY CONFIGURATION ERROR: SESSION_SECRET environment variable is missing/,
      );
    });

    it('PatientAuthService MUST throw fatal configuration error if SESSION_SECRET is shorter than 32 chars', () => {
      process.env.SESSION_SECRET = 'short-key-12345';
      expect(() => new PatientAuthService({} as any, {} as any)).toThrow(
        /minimum 32 characters required/,
      );
    });

    it('PatientAuthService instantiates successfully with strong secret >= 32 chars', () => {
      process.env.SESSION_SECRET = strongSecret;
      expect(() => new PatientAuthService({} as any, {} as any)).not.toThrow();
    });

    it('PatientAuthService MUST reject tokens signed with the removed hardcoded fallback key', () => {
      process.env.SESSION_SECRET = strongSecret;
      const patientAuthService = new PatientAuthService({} as any, {} as any);

      const oldFallbackSecret = 'aks-elite-jwt-secure-super-key-madurai-2026-production';
      const payload = {
        accountId: 'acc-uuid-1',
        clinicId: 'clinic-aks-uuid',
        phone: '+919876543210',
        role: 'PATIENT',
        exp: Date.now() + 3600000,
      };

      const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const forgedSig = crypto.createHmac('sha256', oldFallbackSecret).update(data).digest('base64url');
      const forgedToken = `${data}.${forgedSig}`;

      const verified = patientAuthService.verifyPatientToken(forgedToken);
      expect(verified).toBeNull();
    });
  });

  describe('SEC-04: Password Reset Token Security & Plaintext Elimination', () => {
    let mockPrisma: any;
    let authService: AuthService;
    let storedUser: any;

    beforeEach(() => {
      process.env.SESSION_SECRET = strongSecret;
      storedUser = {
        id: 'user-reset-1',
        clinicId: 'clinic-aks-uuid',
        email: 'doctor@akselitedental.com',
        passwordHash: 'old_hashed_password',
        resetPasswordToken: null as string | null,
        resetPasswordExpiry: null as Date | null,
        isActive: true,
      };

      mockPrisma = {
        clinic: {
          findMany: jest.fn().mockResolvedValue([{ id: 'clinic-aks-uuid' }]),
        },
        forTenant: jest.fn().mockImplementation((clinicId: string, callback: (tx: any) => Promise<any>) => {
          const tx = {
            user: {
              findFirst: jest.fn().mockImplementation(({ where }: any) => {
                if (where.email && where.email === storedUser.email) return storedUser;
                if (where.resetPasswordToken && where.resetPasswordToken === storedUser.resetPasswordToken) {
                  if (where.resetPasswordExpiry?.gt && storedUser.resetPasswordExpiry <= where.resetPasswordExpiry.gt) {
                    return null;
                  }
                  return storedUser;
                }
                return null;
              }),
              findUnique: jest.fn().mockImplementation(({ where }: any) => {
                if (where.id === storedUser.id) return storedUser;
                return null;
              }),
              update: jest.fn().mockImplementation(({ data }: any) => {
                Object.assign(storedUser, data);
                return storedUser;
              }),
            },
            $executeRaw: jest.fn().mockResolvedValue(1),
          };
          return callback(tx);
        }),
      };

      authService = new AuthService(mockPrisma);
    });

    it('forgotPassword stores ONLY a SHA-256 hash in the database, never the raw token', async () => {
      const res = await authService.forgotPassword('doctor@akselitedental.com');

      expect(res.message).toContain('If an active account exists');
      expect((res as any).resetToken).toBeUndefined(); // Raw token MUST NOT be in API response

      // Verify what was stored in the database
      expect(storedUser.resetPasswordToken).not.toBeNull();
      // SHA-256 hex digest is exactly 64 characters long
      expect(storedUser.resetPasswordToken).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(storedUser.resetPasswordToken!)).toBe(true);
    });

    it('forgotPassword returns a generic response for non-existent emails to prevent enumeration', async () => {
      const res = await authService.forgotPassword('unknown_person@nowhere.com');
      expect(res.message).toContain('If an active account exists');
    });

    it('resetPasswordWithToken successfully consumes token when valid', async () => {
      // Use internal test helper to get raw token
      const rawToken = await authService.createTestPasswordResetToken('doctor@akselitedental.com');
      expect(rawToken).not.toBeNull();

      // Submit valid reset
      const resetRes = await authService.resetPasswordWithToken(rawToken!, 'newSecurePassword123');
      expect(resetRes.message).toContain('Your password has been reset successfully');

      // Verify token was atomically cleared
      expect(storedUser.resetPasswordToken).toBeNull();
      expect(storedUser.resetPasswordExpiry).toBeNull();
      expect(storedUser.passwordHash).not.toBe('old_hashed_password');
    });

    it('resetPasswordWithToken rejects replay / re-use of consumed token', async () => {
      const rawToken = await authService.createTestPasswordResetToken('doctor@akselitedental.com');
      expect(rawToken).not.toBeNull();

      // First reset succeeds
      await authService.resetPasswordWithToken(rawToken!, 'newSecurePassword123');

      // Second attempt with exact same raw token MUST be rejected
      await expect(
        authService.resetPasswordWithToken(rawToken!, 'anotherPassword456'),
      ).rejects.toThrow(BadRequestException);
    });

    it('resetPasswordWithToken rejects expired reset tokens', async () => {
      const rawToken = await authService.createTestPasswordResetToken('doctor@akselitedental.com');
      // Expire the token by setting expiry in the past
      storedUser.resetPasswordExpiry = new Date(Date.now() - 1000);

      await expect(
        authService.resetPasswordWithToken(rawToken!, 'newPassword123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('resetPasswordWithToken rejects invalid or tampered tokens', async () => {
      await authService.createTestPasswordResetToken('doctor@akselitedental.com');

      const forgedToken = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      await expect(
        authService.resetPasswordWithToken(forgedToken, 'newPassword123'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('SEC-07: Deactivated Accounts Access Revocation', () => {
    let mockPrisma: any;
    let authService: AuthService;
    let authGuard: AuthGuard;
    let testUser: any;

    beforeEach(() => {
      process.env.SESSION_SECRET = strongSecret;
      testUser = {
        id: 'staff-user-123',
        clinicId: 'clinic-aks-uuid',
        email: 'staff@akselitedental.com',
        role: 'RECEPTIONIST',
        isActive: true,
      };

      mockPrisma = {
        forTenant: jest.fn().mockImplementation((_clinicId: string, fn: any) => fn(mockPrisma)),
        user: {
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            if (where.id === testUser.id) return testUser;
            return null;
          }),
        },
      };

      authService = new AuthService(mockPrisma);
      authGuard = new AuthGuard(authService);
    });

    const createMockContext = (token: string, hostClinicId = 'clinic-aks-uuid'): ExecutionContext => {
      const request = {
        headers: { authorization: `Bearer ${token}` },
        cookies: {},
        clinicId: hostClinicId,
      };
      return {
        switchToHttp: () => ({
          getRequest: () => request,
        }),
      } as any;
    };

    it('AuthGuard permits requests from active staff accounts', async () => {
      const token = authService.createToken(testUser);
      const ctx = createMockContext(token);

      const canActivate = await authGuard.canActivate(ctx);
      expect(canActivate).toBe(true);
    });

    it('AuthGuard IMMEDIATELY rejects requests when account has been deactivated (isActive = false)', async () => {
      const token = authService.createToken(testUser);

      // Admin deactivates staff account
      testUser.isActive = false;
      AuthService.invalidateUserStatus(testUser.id);

      const ctx = createMockContext(token);
      await expect(authGuard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('AuthGuard rejects requests when user account record has been deleted', async () => {
      const token = authService.createToken(testUser);

      // Account deleted from database
      mockPrisma.user.findUnique.mockResolvedValue(null);
      AuthService.invalidateUserStatus(testUser.id);

      const ctx = createMockContext(token);
      await expect(authGuard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('UsersService.toggleActiveStatus AUTOMATICALLY invalidates cached authorization status upon deactivation', async () => {
      const invalidateSpy = jest.spyOn(AuthService, 'invalidateUserStatus');

      const mockTx = {
        user: {
          findFirst: jest.fn().mockResolvedValue({ id: 'staff-doc-1', role: 'DENTIST', email: 'doc@aks.com' }),
          update: jest.fn().mockResolvedValue({ id: 'staff-doc-1', email: 'doc@aks.com', isActive: false }),
        },
      };

      const mockPrismaTenant = {
        forTenant: jest.fn().mockImplementation((clinicId, cb) => cb(mockTx)),
      };

      const mockAudit = {
        log: jest.fn().mockResolvedValue({}),
      };

      const { UsersService } = require('../users/users.service');
      const usersService = new UsersService(mockPrismaTenant as any, mockAudit as any);

      await usersService.toggleActiveStatus('clinic-aks-uuid', 'staff-doc-1', false, { userId: 'admin-1', role: 'CLINIC_ADMIN' });

      // Verify that AuthService.invalidateUserStatus was called with the target user's ID
      expect(invalidateSpy).toHaveBeenCalledWith('staff-doc-1');
      invalidateSpy.mockRestore();
    });
  });

  describe('OPS-03: Sensitive Endpoint Rate Limiting Verification', () => {
    it('AuthController endpoints MUST have explicit strict rate limiting configured', () => {
      const { AuthController } = require('./auth.controller');

      // Login route: max 5 requests per 60s
      const loginLimit = Reflect.getMetadata('THROTTLER:LIMITdefault', AuthController.prototype.login);
      const loginTtl = Reflect.getMetadata('THROTTLER:TTLdefault', AuthController.prototype.login);
      expect(loginLimit).toBe(5);
      expect(loginTtl).toBe(60000);

      // Forgot-Password route: max 3 requests per 60s (strict anti-spam limit)
      const forgotLimit = Reflect.getMetadata('THROTTLER:LIMITdefault', AuthController.prototype.forgotPassword);
      const forgotTtl = Reflect.getMetadata('THROTTLER:TTLdefault', AuthController.prototype.forgotPassword);
      expect(forgotLimit).toBe(3);
      expect(forgotTtl).toBe(60000);

      // Reset-Password route: max 5 requests per 60s
      const resetLimit = Reflect.getMetadata('THROTTLER:LIMITdefault', AuthController.prototype.resetPassword);
      const resetTtl = Reflect.getMetadata('THROTTLER:TTLdefault', AuthController.prototype.resetPassword);
      expect(resetLimit).toBe(5);
      expect(resetTtl).toBe(60000);
    });
  });
});
