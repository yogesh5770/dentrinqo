import { AppointmentsService } from './appointments.service';
import { BadRequestException, UnauthorizedException, ConflictException, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';

describe('Dentrinqo P0 Security Remediation: Appointments, Public Status, Intake & Tenant Isolation', () => {
  const strongSecret = 'f3b89a02c81e4b8d7a16e502c4b819e6d30f18a5e729c1b4e058d2a6f194c7b2';
  const clinicA = { id: 'clinic-a-uuid', code: 'AKSA', name: 'AKS Clinic Madurai' };
  const clinicB = { id: 'clinic-b-uuid', code: 'AKSB', name: 'AKS Clinic Anna Nagar' };

  let service: AppointmentsService;
  let mockPrisma: any;
  let mockAudit: any;
  let mockClinicHours: any;

  // In-memory data store for testing
  let patients: any[];
  let appointments: any[];
  let auditLogs: any[];

  beforeEach(() => {
    process.env.SESSION_SECRET = strongSecret;
    patients = [
      {
        id: 'patient-a-1',
        clinicId: clinicA.id,
        uhid: 'AKSA-2026-0001',
        fullName: 'Ramesh Kumar',
        phone: '+919876543210',
        medicalConditions: '[]',
        allergies: '[]',
        emergencyContactName: null,
        emergencyContactPhone: null,
        notes: 'Sensitive clinical history: History of severe pericoronitis',
        isArchived: false,
      },
      {
        id: 'patient-b-1',
        clinicId: clinicB.id,
        uhid: 'AKSB-2026-0001',
        fullName: 'Priya Sharma',
        phone: '+919876543210', // Same phone in Clinic B
        medicalConditions: '[]',
        allergies: '[]',
        isArchived: false,
      },
    ];

    appointments = [
      {
        id: 'appta123-uuid',
        clinicId: clinicA.id,
        patientId: 'patient-a-1',
        dentistId: 'dentist-1',
        chairNumber: 2,
        expectedChairNumber: 2,
        tokenNumber: 5,
        trackingCode: 'track-code-a-128bit-secret-12345678',
        scheduledStart: new Date(),
        scheduledEnd: new Date(Date.now() + 30 * 60 * 1000),
        status: 'CHECKED_IN',
        reason: 'Extraction under local anesthesia',
        createdAt: new Date(),
        clinic: clinicA,
        patient: patients[0],
        dentist: { fullName: 'Dr. A. K. Sundaram' },
      },
      {
        id: 'appt-b-1',
        clinicId: clinicB.id,
        patientId: 'patient-b-1',
        dentistId: 'dentist-2',
        chairNumber: 1,
        expectedChairNumber: 1,
        tokenNumber: 2,
        trackingCode: 'track-code-b-128bit-secret-87654321',
        scheduledStart: new Date(),
        scheduledEnd: new Date(Date.now() + 30 * 60 * 1000),
        status: 'SCHEDULED',
        reason: 'Root Canal Treatment Step 2',
        createdAt: new Date(),
        clinic: clinicB,
        patient: patients[1],
        dentist: { fullName: 'Dr. Meenakshi' },
      },
    ];

    auditLogs = [];

    mockPrisma = {
      clinic: {
        findFirst: jest.fn().mockImplementation(({ where }: any) => {
          if (where.code === clinicA.code || where.OR?.some((o: any) => o.code === clinicA.code || o.id === clinicA.id)) {
            return clinicA;
          }
          if (where.code === clinicB.code || where.OR?.some((o: any) => o.code === clinicB.code || o.id === clinicB.id)) {
            return clinicB;
          }
          return null;
        }),
        findUnique: jest.fn().mockImplementation(({ where }: any) => {
          if (where.id === clinicA.id) return clinicA;
          if (where.id === clinicB.id) return clinicB;
          return null;
        }),
        findMany: jest.fn().mockResolvedValue([clinicA, clinicB]),
      },
      forTenant: jest.fn().mockImplementation((tenantId: string, callback: (tx: any) => Promise<any>) => {
        const tx = {
          appointment: {
            findFirst: jest.fn().mockImplementation(({ where }: any) => {
              return appointments.find(a => {
                if (a.clinicId !== tenantId) return false;
                if (where.trackingCode && a.trackingCode === where.trackingCode) return true;
                if (where.id && a.id === where.id) return true;
                if (where.OR) {
                  return where.OR.some((cond: any) => {
                    if (cond.id === a.id) return true;
                    if (cond.trackingCode === a.trackingCode) return true;
                    if (cond.id?.startsWith && a.id.startsWith(cond.id.startsWith)) return true;
                    return false;
                  });
                }
                return false;
              }) || null;
            }),
            findMany: jest.fn().mockImplementation(({ where }: any) => {
              return appointments.filter(a => a.clinicId === tenantId);
            }),
            count: jest.fn().mockImplementation(({ where }: any) => {
              return appointments.filter(a => a.clinicId === tenantId && (a.tokenNumber || 0) < (where.tokenNumber?.lt || 999)).length;
            }),
          },
          patient: {
            findFirst: jest.fn().mockImplementation(({ where }: any) => {
              return patients.find(p => p.clinicId === tenantId && (p.id === where.id || p.uhid === where.uhid || p.phone === where.phone)) || null;
            }),
            findMany: jest.fn().mockImplementation(({ where }: any) => {
              return patients.filter(p => p.clinicId === tenantId && p.phone === where.phone);
            }),
            update: jest.fn().mockImplementation(({ where, data }: any) => {
              const p = patients.find(pt => pt.id === where.id && pt.clinicId === tenantId);
              if (p) Object.assign(p, data);
              return p;
            }),
          },
          auditLog: {
            findFirst: jest.fn().mockImplementation(({ where }: any) => {
              return auditLogs.find(l => l.clinicId === tenantId && l.action === where.action && l.entityId === where.entityId) || null;
            }),
            create: jest.fn().mockImplementation(({ data }: any) => {
              auditLogs.push({ id: `log-${Date.now()}`, ...data });
              return data;
            }),
          },
          clinic: {
            findUnique: jest.fn().mockImplementation(({ where }: any) => {
              if (where.id === tenantId) return tenantId === clinicA.id ? clinicA : clinicB;
              return null;
            }),
          },
          $executeRaw: jest.fn().mockResolvedValue(1),
        };
        return callback(tx);
      }),
    };

    mockAudit = { log: jest.fn().mockResolvedValue(true) };
    mockClinicHours = { assertOpen: jest.fn().mockResolvedValue(true) };

    service = new AppointmentsService(mockPrisma, mockAudit, mockClinicHours);
  });

  describe('SEC-01: Public Patient Information Disclosure Remediation', () => {
    it('getPublicStatus MUST reject direct phone-number queries', async () => {
      await expect(
        service.getPublicStatus('+919876543210', clinicA.id),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.getPublicStatus('9876543210', clinicA.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('getPublicStatus returns ONLY minimal queue metrics and STRIPS sensitive patient PII and clinical reasons', async () => {
      const res = await service.getPublicStatus('AKSA-2026-appta123', clinicA.id);

      expect(res.success).toBe(true);
      expect(res.tokenNumber).toBe(5);
      expect(res.status).toBe('CHECKED_IN');
      expect(res.clinicName).toBe('AKS Clinic Madurai');

      // CRITICAL P0 VERIFICATION: Sensitive patient PII and clinical notes MUST be omitted/undefined
      expect((res as any).patientName).toBeUndefined();
      expect((res as any).patientPhone).toBeUndefined();
      expect((res as any).patientUhid).toBeUndefined();
      expect((res as any).dentistName).toBeUndefined();
      expect((res as any).reason).toBeUndefined(); // Medical reason MUST NOT be exposed
      expect((res as any).hasIntakeCompleted).toBeUndefined();
    });

    it('trackByCode masks patient phone numbers and never exposes full phone to public requests', async () => {
      const res = await service.trackByCode('track-code-a-128bit-secret-12345678', clinicA.id);

      expect(res.success).toBe(true);
      // Phone number MUST be masked
      expect(res.patientPhone).toContain('******');
      expect(res.patientPhone).not.toBe('+919876543210');
      expect(res.patientPhone).toBe('+91 ****** 3210');
    });
  });

  describe('SEC-02: Public Clinical Intake Modification & Replay Protection', () => {
    it('submitPublicIntake MUST REJECT unauthenticated requests lacking an intake token', async () => {
      await expect(
        service.submitPublicIntake('AKSA-2026-APPT-A-1', { diabetic: true }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('submitPublicIntake MUST REJECT forged or tampered intake tokens', async () => {
      const forgedToken = 'fake-data.fake-signature';
      await expect(
        service.submitPublicIntake('AKSA-2026-APPT-A-1', { diabetic: true }, forgedToken),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('submitPublicIntake MUST REJECT expired intake tokens', async () => {
      // Craft expired token
      const expiredPayload = {
        sub: 'patient-a-1',
        clinicId: clinicA.id,
        appointmentId: 'appta123-uuid',
        action: 'INTAKE_SUBMISSION',
        nonce: 'test-nonce-123',
        exp: Date.now() - 5000, // Expired 5 seconds ago
      };
      const data = Buffer.from(JSON.stringify(expiredPayload)).toString('base64url');
      const sig = crypto.createHmac('sha256', strongSecret).update(data).digest('base64url');
      const expiredToken = `${data}.${sig}`;

      await expect(
        service.submitPublicIntake('AKSA-2026-APPT-A-1', { diabetic: true }, expiredToken),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('submitPublicIntake accepts valid signed single-use token and updates clinical history safely', async () => {
      const validToken = service.generateIntakeToken(clinicA.id, 'patient-a-1', 'appta123-uuid');

      const res = await service.submitPublicIntake('AKSA-2026-APPT-A-1', {
        diabetic: true,
        hypertension: true,
        allergies: ['Penicillin'],
        emergencyContactName: 'Sundar',
        emergencyContactPhone: '+919888877777',
      }, validToken);

      expect(res.success).toBe(true);
      expect(res.conditionsCount).toBe(2);
      expect(res.allergiesCount).toBe(1);

      // Verify patient record updated
      const p = patients.find(x => x.id === 'patient-a-1');
      expect(p.medicalConditions).toContain('Diabetes');
      expect(p.medicalConditions).toContain('Hypertension');
      expect(p.allergies).toContain('Penicillin');
      expect(p.emergencyContactName).toBe('Sundar');
    });

    it('submitPublicIntake MUST REJECT replay attempts using the same consumed token', async () => {
      const validToken = service.generateIntakeToken(clinicA.id, 'patient-a-1', 'appta123-uuid');

      // First submission succeeds
      await service.submitPublicIntake('AKSA-2026-APPT-A-1', {
        diabetic: true,
      }, validToken);

      // Second submission attempt with the same token MUST fail closed with ConflictException
      await expect(
        service.submitPublicIntake('AKSA-2026-APPT-A-1', {
          diabetic: false,
          hypertension: true,
        }, validToken),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('SEC-03: Cross-Tenant Existence Leakage Remediation', () => {
    it('publicLookup rejects requests without clinic context and NEVER scans other clinics', async () => {
      const res = await service.publicLookup({
        phone: '9876543210',
      });

      expect(res.found).toBe(false);
      expect(res.message).toContain('No active visit');
      // Verify clinic.findMany was NOT called to scan across tenants
      expect(mockPrisma.clinic.findMany).not.toHaveBeenCalled();
    });

    it('publicSelfCheckIn MUST NOT infer tenant authorization from a patient phone number across clinics', async () => {
      await expect(
        service.publicSelfCheckIn({
          phone: '+919876543210',
          // No clinicCode, hostClinicId, or clinic reference prefix provided
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('trackByCode MUST REJECT requests when clinic context is absent instead of scanning all clinics', async () => {
      await expect(
        service.trackByCode('track-code-a-128bit-secret-12345678'), // No hostClinicId
      ).rejects.toThrow(BadRequestException);
    });

    it('Cross-clinic discovery prevention: Clinic B context cannot find Clinic A appointments', async () => {
      // Attacker queries tracking code for Clinic A under Clinic B's tenant context
      await expect(
        service.trackByCode('track-code-a-128bit-secret-12345678', clinicB.id),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
