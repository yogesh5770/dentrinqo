import { AppointmentsService } from './appointments.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('Dentrinqo Fixed Clinic QR Check-In & Queue Token Architecture', () => {
  let service: AppointmentsService;
  let mockPrisma: any;
  let mockAudit: any;
  let mockClinicHours: any;

  const CLINIC_AKS_ID = '0b54d6a2-07c1-4bb5-9766-e249050d88eb';
  const CLINIC_JDC_ID = '476f3fb2-3319-4bca-966a-a0f6fdb31662';

  const clinicAks = {
    id: CLINIC_AKS_ID,
    code: 'AKS',
    name: "AK's Elite Dental Clinic",
    maxLateMinutes: 45,
    requireDeskConfirmation: true,
    requireLobbyCode: false,
    chairCount: 3,
  };

  const clinicJdc = {
    id: CLINIC_JDC_ID,
    code: 'JDC',
    name: 'Jacobs Dental Clinic',
    maxLateMinutes: 45,
    requireDeskConfirmation: true,
    requireLobbyCode: false,
    chairCount: 2,
  };

  beforeEach(() => {
    mockAudit = { log: jest.fn().mockResolvedValue(true) };
    mockClinicHours = {
      assertOpen: jest.fn().mockResolvedValue(true),
      getClinicStatus: jest.fn().mockResolvedValue({ isOpen: true }),
    };

    mockPrisma = {
      clinic: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id === CLINIC_AKS_ID) return Promise.resolve(clinicAks);
          if (where.id === CLINIC_JDC_ID) return Promise.resolve(clinicJdc);
          return Promise.resolve(null);
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where.code === 'AKS') return Promise.resolve(clinicAks);
          if (where.code === 'JDC') return Promise.resolve(clinicJdc);
          return Promise.resolve(null);
        }),
      },
      patient: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        count: jest.fn().mockResolvedValue(1),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'dentist-1', fullName: 'Dr. Khalidh', role: 'DENTIST', isActive: true }),
      },
      appointment: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      dailyQueueSequence: {
        upsert: jest.fn().mockResolvedValue({ lastSequence: 1 }),
      },
      nextSequence: jest.fn().mockResolvedValue(1),
      forTenant: jest.fn((clinicId: string, fn: any) => fn(mockPrisma)),
      $transaction: jest.fn((fn: any) => fn(mockPrisma)),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };

    service = new AppointmentsService(mockPrisma, mockAudit, mockClinicHours);
  });

  describe('1. Appointment Identifier Resolution', () => {
    it('Scenario 1: Should check in patient using Booking Reference (e.g. AKS-2026-A1B2)', async () => {
      const scheduledNow = new Date();
      const mockAppt = {
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        clinicId: CLINIC_AKS_ID,
        status: 'CONFIRMED',
        tokenNumber: null,
        scheduledStart: scheduledNow,
        createdAt: new Date(),
        patient: { id: 'p1', fullName: 'Venkatesh Rao', phone: '+919876543210', uhid: 'AKS-2026-0001' },
        dentist: { fullName: 'Dr. Khalidh' },
        clinic: clinicAks,
      };

      mockPrisma.appointment.findMany.mockResolvedValueOnce([mockAppt]);
      mockPrisma.appointment.findUnique.mockResolvedValueOnce(mockAppt);
      mockPrisma.appointment.update.mockResolvedValueOnce({
        ...mockAppt,
        status: 'CHECKED_IN',
        tokenNumber: 1,
      });

      const res = await service.publicSelfCheckIn({
        identifier: 'AKS-2026-A1B2',
        clinicCode: 'AKS',
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('CHECKED_IN');
      expect(res.tokenNumber).toBe(1);
      expect(mockPrisma.dailyQueueSequence.upsert).toHaveBeenCalledTimes(1);
    });

    it('Scenario 2: Should check in patient using 10-digit mobile number', async () => {
      const scheduledNow = new Date();
      const mockAppt = {
        id: 'appt-phone-1',
        clinicId: CLINIC_AKS_ID,
        status: 'CONFIRMED',
        tokenNumber: null,
        scheduledStart: scheduledNow,
        createdAt: new Date(),
        patient: { id: 'p1', fullName: 'Anitha Rajan', phone: '+919876543210', uhid: 'AKS-2026-0002' },
        dentist: { fullName: 'Dr. Khalidh' },
        clinic: clinicAks,
      };

      mockPrisma.appointment.findMany.mockResolvedValueOnce([mockAppt]);
      mockPrisma.appointment.findUnique.mockResolvedValueOnce(mockAppt);
      mockPrisma.appointment.update.mockResolvedValueOnce({
        ...mockAppt,
        status: 'CHECKED_IN',
        tokenNumber: 2,
      });
      mockPrisma.dailyQueueSequence.upsert.mockResolvedValueOnce({ lastSequence: 2 });

      const res = await service.publicSelfCheckIn({
        identifier: '9876543210',
        clinicCode: 'AKS',
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('CHECKED_IN');
      expect(res.tokenNumber).toBe(2);
    });

    it('Scenario 3: Should reject non-existent or invalid booking reference with 404', async () => {
      mockPrisma.appointment.findMany.mockResolvedValueOnce([]);

      await expect(
        service.publicSelfCheckIn({
          identifier: 'AKS-2026-INVALID',
          clinicCode: 'AKS',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('2. Multi-Tenant QR Isolation', () => {
    it('Scenario 4: Should reject appointment belonging to Jacobs Dental when scanned on AKS portal', async () => {
      // The appointment exists only in Jacobs Dental
      mockPrisma.appointment.findMany.mockResolvedValueOnce([]); // AKS has 0 matching appointments

      await expect(
        service.publicSelfCheckIn(
          { identifier: 'JDC-2026-0001' },
          'AKS', // Scanned at AKS reception
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('Scenario 5: Should reject public check-in fail-closed if clinic cannot be resolved', async () => {
      await expect(
        service.publicSelfCheckIn({ identifier: '9876543210' }), // No clinicCode, no hostClinicId
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('3. Idempotency & Repeated Scans', () => {
    it('Scenario 6: Should return existing token without re-incrementing sequence on repeated scans', async () => {
      const alreadyCheckedInAppt = {
        id: 'appt-already-1',
        clinicId: CLINIC_AKS_ID,
        status: 'CHECKED_IN',
        tokenNumber: 5,
        scheduledStart: new Date(),
        createdAt: new Date(),
        patient: { id: 'p1', fullName: 'Suresh Kumar', phone: '+919876543210', uhid: 'AKS-2026-0003' },
        dentist: { fullName: 'Dr. Khalidh' },
        clinic: clinicAks,
      };

      mockPrisma.appointment.findMany.mockResolvedValueOnce([alreadyCheckedInAppt]);
      mockPrisma.appointment.findUnique.mockResolvedValueOnce(alreadyCheckedInAppt);

      const res = await service.publicSelfCheckIn({
        identifier: 'AKS-2026-ALREADY',
        clinicCode: 'AKS',
      });

      expect(res.success).toBe(true);
      expect(res.alreadyCheckedIn).toBe(true);
      expect(res.tokenNumber).toBe(5);
      expect(mockPrisma.dailyQueueSequence.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.appointment.update).not.toHaveBeenCalled();
    });
  });

  describe('4. Concurrency Protection (Same Appointment)', () => {
    it('Scenario 7: Should serialize concurrent requests and re-verify state after row lock', async () => {
      const scheduledNow = new Date();
      const initialAppt = {
        id: 'appt-concurrent-1',
        clinicId: CLINIC_AKS_ID,
        status: 'CONFIRMED',
        tokenNumber: null,
        scheduledStart: scheduledNow,
        createdAt: new Date(),
        patient: { id: 'p1', fullName: 'Radha Mohan', phone: '+919876543210', uhid: 'AKS-2026-0004' },
        dentist: { fullName: 'Dr. Khalidh' },
        clinic: clinicAks,
      };

      // Candidate search initially returns unconfirmed appt
      mockPrisma.appointment.findMany.mockResolvedValueOnce([initialAppt]);

      // BUT when row lock is acquired, the concurrent thread already checked it in!
      const lockedState = {
        ...initialAppt,
        status: 'CHECKED_IN',
        tokenNumber: 7,
      };
      mockPrisma.appointment.findUnique.mockResolvedValueOnce(lockedState);

      const res = await service.publicSelfCheckIn({
        identifier: 'AKS-2026-CONC',
        clinicCode: 'AKS',
      });

      expect(res.success).toBe(true);
      expect(res.alreadyCheckedIn).toBe(true);
      expect(res.tokenNumber).toBe(7);
      expect(mockPrisma.dailyQueueSequence.upsert).not.toHaveBeenCalled();
    });
  });

  describe('5. Early & Late Arrival Rules', () => {
    it('Scenario 8: Should reject check-in if patient arrives > 2 hours early', async () => {
      const fourHoursFuture = new Date(Date.now() + 4 * 60 * 60 * 1000);
      const earlyAppt = {
        id: 'appt-early-1',
        clinicId: CLINIC_AKS_ID,
        status: 'CONFIRMED',
        tokenNumber: null,
        scheduledStart: fourHoursFuture,
        createdAt: new Date(),
        patient: { id: 'p1', fullName: 'Early Bird', phone: '+919876543210', uhid: 'AKS-2026-0005' },
        dentist: { fullName: 'Dr. Khalidh' },
        clinic: clinicAks,
      };

      mockPrisma.appointment.findMany.mockResolvedValueOnce([earlyAppt]);

      await expect(
        service.publicSelfCheckIn({
          identifier: 'AKS-2026-EARLY',
          clinicCode: 'AKS',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('Scenario 9: Should reject check-in if patient arrives past clinic maxLateMinutes', async () => {
      const ninetyMinutesAgo = new Date(Date.now() - 90 * 60 * 1000); // 90 min late > 45 min maxLate
      const lateAppt = {
        id: 'appt-late-1',
        clinicId: CLINIC_AKS_ID,
        status: 'CONFIRMED',
        tokenNumber: null,
        scheduledStart: ninetyMinutesAgo,
        createdAt: new Date(),
        patient: { id: 'p1', fullName: 'Late Comer', phone: '+919876543210', uhid: 'AKS-2026-0006' },
        dentist: { fullName: 'Dr. Khalidh' },
        clinic: clinicAks,
      };

      mockPrisma.appointment.findMany.mockResolvedValueOnce([lateAppt]);

      await expect(
        service.publicSelfCheckIn({
          identifier: 'AKS-2026-LATE',
          clinicCode: 'AKS',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('Scenario 10: Should allow slightly late arrival (e.g. 15 mins) and append late notice to notes', async () => {
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000); // 15 mins late <= 45 mins limit
      const slightlyLateAppt = {
        id: 'appt-slight-1',
        clinicId: CLINIC_AKS_ID,
        status: 'CONFIRMED',
        tokenNumber: null,
        scheduledStart: fifteenMinutesAgo,
        createdAt: new Date(),
        notes: 'Pre-existing clinical note',
        patient: { id: 'p1', fullName: 'Slightly Late', phone: '+919876543210', uhid: 'AKS-2026-0007' },
        dentist: { fullName: 'Dr. Khalidh' },
        clinic: clinicAks,
      };

      mockPrisma.appointment.findMany.mockResolvedValueOnce([slightlyLateAppt]);
      mockPrisma.appointment.findUnique.mockResolvedValueOnce(slightlyLateAppt);
      const updateSpy = mockPrisma.appointment.update.mockResolvedValueOnce({
        ...slightlyLateAppt,
        status: 'CHECKED_IN',
        tokenNumber: 3,
      });

      const res = await service.publicSelfCheckIn({
        identifier: 'AKS-2026-SLIGHT',
        clinicCode: 'AKS',
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('CHECKED_IN');
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            notes: expect.stringContaining('LATE ARRIVAL: 15 mins past start'),
          }),
        }),
      );
    });
  });

  describe('6. Walk-In Registration Idempotency', () => {
    it('Scenario 11: Should return existing token if walk-in patient submits form twice (double click protection)', async () => {
      const existingPatient = {
        id: 'pat-walkin-1',
        fullName: 'Karthik Subramanian',
        phone: '+919876543210',
        clinicId: CLINIC_AKS_ID,
        uhid: 'AKS-2026-0008',
      };

      const existingActiveAppt = {
        id: 'appt-walkin-active-1',
        clinicId: CLINIC_AKS_ID,
        patientId: existingPatient.id,
        status: 'CHECKED_IN',
        tokenNumber: 4,
        scheduledStart: new Date(),
        dentist: { fullName: 'Dr. Khalidh' },
        trackingCode: 'track-12345',
        isConfirmedAtDesk: true,
      };

      mockPrisma.patient.findMany.mockResolvedValueOnce([existingPatient]);
      mockPrisma.appointment.findFirst.mockResolvedValueOnce(existingActiveAppt);

      const res = await service.publicWalkInCheckIn(
        {
          patientName: 'Karthik Subramanian',
          patientPhone: '9876543210',
          clinicCode: 'AKS',
        },
        '127.0.0.1',
        CLINIC_AKS_ID,
      );

      expect(res.success).toBe(true);
      expect(res.alreadyCheckedIn).toBe(true);
      expect(res.tokenNumber).toBe(4);
      expect(mockPrisma.appointment.create).not.toHaveBeenCalled();
      expect(mockPrisma.dailyQueueSequence.upsert).not.toHaveBeenCalled();
    });
  });

  describe('7. Ineligible / Cancelled Appointments', () => {
    it('Scenario 12: Should reject cancelled appointment with clear explanation', async () => {
      const cancelledAppt = {
        id: 'appt-cancelled-1',
        clinicId: CLINIC_AKS_ID,
        status: 'CANCELLED',
        tokenNumber: null,
        scheduledStart: new Date(),
        createdAt: new Date(),
        patient: { id: 'p1', fullName: 'Cancelled Patient', phone: '+919876543210', uhid: 'AKS-2026-0009' },
        dentist: { fullName: 'Dr. Khalidh' },
        clinic: clinicAks,
      };

      mockPrisma.appointment.findMany.mockResolvedValueOnce([cancelledAppt]);

      await expect(
        service.publicSelfCheckIn({
          identifier: 'AKS-2026-CANCEL',
          clinicCode: 'AKS',
        }),
      ).rejects.toThrow('This appointment was cancelled. Please register with the reception desk.');
    });
  });
});
