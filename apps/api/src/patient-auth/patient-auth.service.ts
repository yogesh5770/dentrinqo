import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ConflictException,
  NotImplementedException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { hash, verify } from '@node-rs/argon2';
import * as crypto from 'crypto';
import { PatientSignupDto, PatientLoginDto, ResetPatientPasswordDto, AddFamilyMemberDto } from './patient-auth.dto';

export interface PatientTokenPayload {
  accountId: string;
  clinicId: string;
  phone: string;
  role: 'PATIENT';
  exp: number;
}

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const tail10 = digits.slice(-10);
  if (tail10.length !== 10) {
    throw new BadRequestException('Please provide a valid 10-digit mobile number');
  }
  return `+91${tail10}`;
}

@Injectable()
export class PatientAuthService {
  private readonly logger = new Logger(PatientAuthService.name);
  private readonly secretKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {
    const secret = process.env.SESSION_SECRET;
    if (!secret || secret.trim().length < 32) {
      this.secretKey = 'aks-elite-jwt-secure-super-key-madurai-2026-production';
    } else {
      this.secretKey = secret.trim();
    }
  }

  // Dedicated Patient JWT (HMAC-SHA256 with role 'PATIENT')
  createPatientToken(account: { id: string; clinicId: string; phone: string }): string {
    const payload: PatientTokenPayload = {
      accountId: account.id,
      clinicId: account.clinicId,
      phone: account.phone,
      role: 'PATIENT',
      exp: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30-day patient session
    };
    const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', this.secretKey).update(data).digest('base64url');
    return `${data}.${signature}`;
  }

  verifyPatientToken(token: string): PatientTokenPayload | null {
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

      const payload: PatientTokenPayload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
      if (!payload || !payload.exp || typeof payload.exp !== 'number') return null;
      if (Date.now() > payload.exp) return null;
      if (payload.role !== 'PATIENT' || !payload.accountId || !payload.clinicId) return null;

      return payload;
    } catch {
      return null;
    }
  }

  // Patient Registration
  async signup(dto: PatientSignupDto) {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Password confirmation does not match');
    }
    if (dto.password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters long');
    }
    if (!dto.consentDataUse) {
      throw new BadRequestException('You must agree to the healthcare data processing policy to create an account');
    }

    const normPhone = normalizePhone(dto.phone);

    // Resolve clinic
    const clinic = await this.prisma.clinic.findFirst({
      where: dto.clinicCode ? { code: dto.clinicCode.toUpperCase() } : { status: 'ACTIVE' },
    });
    if (!clinic) {
      throw new NotFoundException('Clinic record could not be identified');
    }

    const passwordHash = await hash(dto.password);

    return this.prisma.forTenant(clinic.id, async (tx) => {
      // Check if account already exists on this phone
      const existingAccount = await tx.account.findUnique({
        where: {
          clinicId_phone: {
            clinicId: clinic.id,
            phone: normPhone,
          },
        },
      });

      if (existingAccount && existingAccount.passwordHash) {
        throw new ConflictException(
          'An account already exists for this mobile number. Please log in with your password or use forgot password.',
        );
      }

      // Create or upgrade guest account
      let account = existingAccount;
      if (!account) {
        account = await tx.account.create({
          data: {
            clinicId: clinic.id,
            phone: normPhone,
            passwordHash,
            consentDataUse: dto.consentDataUse,
            consentWhatsapp: dto.consentWhatsapp ?? true,
            consentVersion: 'v1.0-dpdp',
            consentAt: new Date(),
          },
        });
      } else {
        account = await tx.account.update({
          where: { id: account.id },
          data: {
            passwordHash,
            consentDataUse: dto.consentDataUse,
            consentWhatsapp: dto.consentWhatsapp ?? true,
            consentVersion: 'v1.0-dpdp',
            consentAt: new Date(),
            failedLoginCount: 0,
            lockedUntil: null,
          },
        });
      }

      // Check if a patient record with this phone already exists (e.g. created by reception)
      const existingPatients = await tx.patient.findMany({
        where: {
          clinicId: clinic.id,
          phone: { contains: normPhone.slice(-10) },
          isArchived: false,
        },
      });

      let primaryPatient: any = null;
      let matchedExisting = false;

      // Check for exact Name match among existing unlinked patients
      const cleanSignupName = dto.fullName.trim().toLowerCase();
      const candidate = existingPatients.find(
        p => !p.accountId && p.fullName.trim().toLowerCase() === cleanSignupName,
      );

      if (candidate) {
        // Link existing reception patient
        primaryPatient = await tx.patient.update({
          where: { id: candidate.id },
          data: {
            accountId: account.id,
            relationToAccount: 'SELF',
            dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : candidate.dateOfBirth,
            age: dto.age ?? candidate.age,
            gender: dto.gender,
          },
        });
        matchedExisting = true;
      } else {
        // Create initial SELF patient profile
        const year = new Date().getFullYear();
        const patientCount = await tx.patient.count({ where: { clinicId: clinic.id } });
        const uhid = `${clinic.code}-${year}-${String(patientCount + 1).padStart(4, '0')}`;

        primaryPatient = await tx.patient.create({
          data: {
            clinicId: clinic.id,
            accountId: account.id,
            relationToAccount: 'SELF',
            uhid,
            fullName: dto.fullName.trim(),
            phone: normPhone,
            gender: dto.gender,
            dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
            age: dto.age ?? null,
            dobApproximate: !dto.dateOfBirth && !!dto.age,
            notes: 'Self-registered patient account via web portal',
          },
        });

        // If other patients exist on this phone with different names, flag them as possible duplicates for reception
        for (const ep of existingPatients) {
          if (!ep.accountId && ep.id !== primaryPatient.id) {
            await tx.patient.update({
              where: { id: ep.id },
              data: { possibleDuplicate: true },
            });
          }
        }
      }

      const token = this.createPatientToken(account);
      return {
        success: true,
        token,
        account: {
          id: account.id,
          phone: account.phone,
        },
        patient: {
          id: primaryPatient.id,
          uhid: primaryPatient.uhid,
          fullName: primaryPatient.fullName,
          relationToAccount: primaryPatient.relationToAccount,
        },
        matchedExisting,
      };
    });
  }

  // Patient Login with Lockout Protection
  async login(dto: PatientLoginDto) {
    const normPhone = normalizePhone(dto.phone);

    const findAccountInClinic = async (cId: string) => {
      return this.prisma.forTenant(cId, async (tx) => {
        return tx.account.findUnique({
          where: {
            clinicId_phone: {
              clinicId: cId,
              phone: normPhone,
            },
          },
          include: {
            patients: {
              where: { isArchived: false },
              orderBy: { createdAt: 'asc' },
            },
          },
        });
      });
    };

    let account: any = null;
    let targetClinicId: string | null = null;

    if (dto.clinicCode) {
      const clinic = await this.prisma.clinic.findFirst({
        where: { code: dto.clinicCode.toUpperCase() },
      });
      if (clinic) {
        account = await findAccountInClinic(clinic.id);
        if (account) targetClinicId = clinic.id;
      }
    }

    if (!account) {
      const clinics = await this.prisma.clinic.findMany({ select: { id: true } });
      for (const c of clinics) {
        account = await findAccountInClinic(c.id);
        if (account) {
          targetClinicId = c.id;
          break;
        }
      }
    }

    // Identical error response whether phone exists or password fails to prevent user enumeration
    const genericAuthError = new UnauthorizedException('Invalid mobile number or password.');

    if (!account || !account.passwordHash || !targetClinicId) {
      throw genericAuthError;
    }

    // Check 15-minute account lock
    if (account.lockedUntil && account.lockedUntil.getTime() > Date.now()) {
      const remainingMinutes = Math.ceil((account.lockedUntil.getTime() - Date.now()) / 60000);
      throw new UnauthorizedException(
        `Account is temporarily locked due to 5 consecutive failed login attempts. Please try again in ${remainingMinutes} minute(s) or visit the reception desk.`,
      );
    }

    const isValid = await verify(account.passwordHash, dto.password);
    if (!isValid) {
      const newFailedCount = account.failedLoginCount + 1;
      let lockedUntil: Date | null = null;
      if (newFailedCount >= 5) {
        lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes lockout
        this.logger.warn(`Account locked for phone ${normPhone} after 5 failed login attempts`);
      }

      await this.prisma.forTenant(targetClinicId, async (tx) => {
        return tx.account.update({
          where: { id: account.id },
          data: {
            failedLoginCount: newFailedCount,
            lockedUntil,
          },
        });
      });

      if (newFailedCount >= 5) {
        throw new UnauthorizedException(
          'Account has been temporarily locked for 15 minutes due to 5 failed login attempts. Please try again later or contact clinic staff.',
        );
      }
      throw genericAuthError;
    }

    // Successful login: reset failed counters and update lastLoginAt
    await this.prisma.forTenant(targetClinicId, async (tx) => {
      return tx.account.update({
        where: { id: account.id },
        data: {
          failedLoginCount: 0,
          lockedUntil: null,
          lastLoginAt: new Date(),
        },
      });
    });

    const token = this.createPatientToken(account);
    return {
      success: true,
      token,
      account: {
        id: account.id,
        phone: account.phone,
        lastLoginAt: account.lastLoginAt,
      },
      familyMembers: account.patients.map((p: any) => ({
        id: p.id,
        uhid: p.uhid,
        fullName: p.fullName,
        relationToAccount: p.relationToAccount || 'SELF',
        gender: p.gender,
        age: p.age,
        dateOfBirth: p.dateOfBirth,
        dobApproximate: p.dobApproximate,
      })),
    };
  }

  // Get Current Account & Family Members
  async getMe(accountId: string, clinicId?: string) {
    const resolveAccount = async (cId: string) => {
      return this.prisma.forTenant(cId, async (tx) => {
        return tx.account.findUnique({
          where: { id: accountId },
          include: {
            patients: {
              where: { isArchived: false },
              orderBy: { createdAt: 'asc' },
            },
          },
        });
      });
    };

    let account: any = null;
    if (clinicId) {
      account = await resolveAccount(clinicId);
    } else {
      const clinics = await this.prisma.clinic.findMany({ select: { id: true } });
      for (const c of clinics) {
        account = await resolveAccount(c.id);
        if (account) break;
      }
    }

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    return {
      id: account.id,
      phone: account.phone,
      lastLoginAt: account.lastLoginAt,
      familyMembers: account.patients.map((p: any) => ({
        id: p.id,
        uhid: p.uhid,
        fullName: p.fullName,
        relationToAccount: p.relationToAccount || 'SELF',
        gender: p.gender,
        age: p.age,
        dateOfBirth: p.dateOfBirth,
        dobApproximate: p.dobApproximate,
      })),
    };
  }

  // Add Family Member under Logged-in Account
  async addFamilyMember(accountId: string, dto: AddFamilyMemberDto, clinicId?: string) {
    const findAccount = async (cId: string) => {
      return this.prisma.forTenant(cId, async (tx) => {
        return tx.account.findUnique({
          where: { id: accountId },
          include: { clinic: true },
        });
      });
    };

    let account: any = null;
    let targetClinicId = clinicId;

    if (targetClinicId) {
      account = await findAccount(targetClinicId);
    } else {
      const clinics = await this.prisma.clinic.findMany({ select: { id: true } });
      for (const c of clinics) {
        account = await findAccount(c.id);
        if (account) {
          targetClinicId = c.id;
          break;
        }
      }
    }

    if (!account || !targetClinicId) {
      throw new NotFoundException('Account not found');
    }

    return this.prisma.forTenant(targetClinicId, async (tx) => {
      const year = new Date().getFullYear();
      const count = await tx.patient.count({ where: { clinicId: targetClinicId } });
      const uhid = `${account.clinic.code}-${year}-${String(count + 1).padStart(4, '0')}`;

      const newPatient = await tx.patient.create({
        data: {
          clinicId: targetClinicId,
          accountId: account.id,
          relationToAccount: dto.relationToAccount,
          uhid,
          fullName: dto.fullName.trim(),
          phone: account.phone,
          gender: dto.gender,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
          age: dto.age ?? null,
          dobApproximate: dto.dobApproximate || (!dto.dateOfBirth && !!dto.age),
          notes: dto.notes ? `Family member: ${dto.notes}` : `Family member under account ${account.phone}`,
        },
      });

      return {
        success: true,
        patient: {
          id: newPatient.id,
          uhid: newPatient.uhid,
          fullName: newPatient.fullName,
          relationToAccount: newPatient.relationToAccount,
          gender: newPatient.gender,
          age: newPatient.age,
          dateOfBirth: newPatient.dateOfBirth,
          dobApproximate: newPatient.dobApproximate,
        },
      };
    });
  }

  // Staff Password Reset (Receptionist or Admin only, with mandatory reason)
  async resetPasswordByStaff(accountId: string, dto: ResetPatientPasswordDto, staffUser: any) {
    if (!dto.reason || dto.reason.trim().length < 10) {
      throw new BadRequestException('A valid reason of at least 10 characters is mandatory to reset patient password');
    }

    return this.prisma.forTenant(staffUser.clinicId, async (tx) => {
      const account = await tx.account.findUnique({
        where: { id: accountId },
      });
      if (!account) {
        throw new NotFoundException('Patient account not found');
      }

      const newHash = await hash(dto.newPassword);
      await tx.account.update({
        where: { id: accountId },
        data: {
          passwordHash: newHash,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });

      // Write audit trail
      await this.auditService.log({
        clinicId: staffUser.clinicId,
        actorId: staffUser.userId,
        actorRole: staffUser.role,
        action: 'PATIENT_PASSWORD_RESET_BY_STAFF',
        entityType: 'Account',
        entityId: account.id,
        details: {
          phone: account.phone,
          reason: dto.reason.trim(),
          resetBy: staffUser.username || staffUser.email,
        },
      }, tx);

      return {
        success: true,
        message: 'Patient password has been successfully reset by clinic staff.',
      };
    });
  }

  // Future Extension Point: SMS OTP Login
  async sendLoginOtp(_phone: string) {
    throw new NotImplementedException(
      'SMS OTP gateway integration is configured as an extension point for Twilio / Fast2SMS. Please use mobile and password login.',
    );
  }

  async verifyLoginOtp(_phone: string, _otp: string) {
    throw new NotImplementedException(
      'SMS OTP gateway verification is configured as an extension point. Please use mobile and password login.',
    );
  }

  // Strict IDOR-protected visits query for logged-in account
  async getMyVisits(accountId: string, clinicId?: string) {
    const resolveVisits = async (cId: string) => {
      return this.prisma.forTenant(cId, async (tx) => {
        const account = await tx.account.findUnique({
          where: { id: accountId },
          include: {
            patients: {
              where: { isArchived: false },
              select: { id: true, fullName: true, uhid: true, relationToAccount: true },
            },
          },
        });
        if (!account) return null;

        const patientIds = account.patients.map(p => p.id);
        if (patientIds.length === 0) return [];

        const appointments = await tx.appointment.findMany({
          where: {
            clinicId: cId,
            patientId: { in: patientIds },
          },
          include: {
            patient: {
              select: { id: true, fullName: true, uhid: true, relationToAccount: true },
            },
            dentist: {
              select: { id: true, fullName: true, designation: true },
            },
          },
          orderBy: { scheduledStart: 'desc' },
          take: 50,
        });

        return appointments.map(a => ({
          id: a.id,
          patientName: a.patient.fullName,
          patientUhid: a.patient.uhid,
          relation: a.patient.relationToAccount || 'SELF',
          dentistName: a.dentist?.fullName || 'Doctor on Duty',
          chairNumber: a.chairNumber,
          scheduledStart: a.scheduledStart,
          scheduledEnd: a.scheduledEnd,
          reason: a.reason,
          status: a.status,
          notes: a.notes,
        }));
      });
    };

    let visits: any = null;
    if (clinicId) {
      visits = await resolveVisits(clinicId);
    } else {
      const clinics = await this.prisma.clinic.findMany({ select: { id: true } });
      for (const c of clinics) {
        visits = await resolveVisits(c.id);
        if (visits !== null) break;
      }
    }

    if (visits === null) {
      throw new NotFoundException('Account not found');
    }

    return visits;
  }
}
