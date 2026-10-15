import { AppointmentsService } from './appointments.service';
import { ClinicHoursService } from '../clinic/clinic-hours.service';
import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';

describe('Dentrinqo Smart Dual-Track Scheduling & Queue Engine Specification', () => {
  let apptService: AppointmentsService;
  let clinicHoursService: ClinicHoursService;
  let mockPrisma: any;
  let mockAudit: any;

  const CLINIC_ID = '0b54d6a2-07c1-4bb5-9766-e249050d88eb';

  const mockClinic = {
    id: CLINIC_ID,
    code: 'AKS',
    name: "AK's Elite Dental Clinic",
    chairCount: 3,
    maxLateMinutes: 45,
    requireDeskConfirmation: true,
    requireLobbyCode: false,
    workingHours: JSON.stringify({
      chairStatus: { '1': true, '2': true, '3': true },
    }),
  };

  const drArun = {
    id: 'dentist-arun',
    clinicId: CLINIC_ID,
    fullName: 'Dr. Arun Kumar',
    role: 'DENTIST',
    assignedChairNumber: 1,
    isActive: true,
  };

  const drPriya = {
    id: 'dentist-priya',
    clinicId: CLINIC_ID,
    fullName: 'Dr. Priya Mani',
    role: 'DENTIST',
    assignedChairNumber: 2,
    isActive: true,
  };

  const receptionistUser = {
    id: 'reception-staff-1',
    clinicId: CLINIC_ID,
    role: 'RECEPTIONIST',
    fullName: 'Reception Desk',
  };

  beforeEach(() => {
    mockAudit = {
      log: jest.fn().mockResolvedValue(true),
    };

    mockPrisma = {
      clinic: {
        findUnique: jest.fn().mockResolvedValue(mockClinic),
        findFirst: jest.fn().mockResolvedValue(mockClinic),
        update: jest.fn().mockResolvedValue(mockClinic),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([drArun, drPriya]),
        findFirst: jest.fn().mockImplementation((args: any) => {
          if (args?.where?.id === 'dentist-arun') return Promise.resolve(drArun);
          if (args?.where?.id === 'dentist-priya') return Promise.resolve(drPriya);
          return Promise.resolve(drArun);
        }),
      },
      patient: {
        findFirst: jest.fn().mockResolvedValue({ id: 'patient-1', fullName: 'Ramesh Kumar', phone: '+919876543210', uhid: 'AKS-2026-0001' }),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: 'new-patient-id', ...args.data })),
        update: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: args.where.id, ...args.data })),
      },
      appointment: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: 'appt-id-1', ...args.data, patient: { fullName: 'Ramesh Kumar', phone: '+919876543210' }, dentist: { fullName: 'Dr. Arun Kumar' } })),
        update: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: args.where.id, ...args.data, patient: { fullName: 'Ramesh Kumar', phone: '+919876543210', uhid: 'AKS-2026-0001' }, dentist: { fullName: 'Dr. Arun Kumar' } })),
        count: jest.fn().mockResolvedValue(0),
      },
      dailyQueueSequence: {
        upsert: jest.fn().mockResolvedValue({ lastSequence: 5 }),
      },
      dentistUnavailability: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      auditLog: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'log-1' }),
      },
      forTenant: jest.fn().mockImplementation((cid: string, fn: any) => fn(mockPrisma)),
      $transaction: jest.fn().mockImplementation((fn: any) => fn(mockPrisma)),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };

    clinicHoursService = {
      assertOpen: jest.fn().mockResolvedValue({ isOpen: true }),
      getClinicStatus: jest.fn().mockResolvedValue({ isOpen: true }),
      isDentistUnavailable: jest.fn().mockResolvedValue(null),
      getDentistLeaveForSlot: jest.fn().mockResolvedValue(null),
    } as any;

    apptService = new AppointmentsService(
      mockPrisma,
      mockAudit,
      clinicHoursService,
    );
  });

  describe('Scenario 1: Online Booking vs Concurrency Protection', () => {
    it('should reject a second booking attempt when the dentist is already booked in that slot', async () => {
      const start = new Date('2026-10-20T10:00:00+05:30');
      const end = new Date('2026-10-20T10:30:00+05:30');

      // Mock an existing booking on Dr. Arun at 10:00 AM
      mockPrisma.appointment.findFirst.mockResolvedValueOnce({
        id: 'existing-appt',
        dentistId: drArun.id,
        chairNumber: 1,
        scheduledStart: start,
        scheduledEnd: end,
        status: 'CONFIRMED',
      });

      await expect(
        apptService.create(CLINIC_ID, {
          patientId: 'patient-2',
          dentistId: drArun.id,
          chairNumber: 1,
          scheduledStart: start.toISOString(),
          durationMinutes: 30,
          reason: 'Severe Toothache',
        }, receptionistUser)
      ).rejects.toThrow(ConflictException);
    });

    it('should reject booking when dentist is on registered leave during that slot', async () => {
      const start = new Date('2026-10-20T14:00:00+05:30');

      (clinicHoursService.getDentistLeaveForSlot as jest.Mock).mockResolvedValueOnce({
        id: 'leave-1',
        dentistId: drArun.id,
        reason: 'Medical Conference in Chennai',
        startAt: new Date('2026-10-20T13:00:00+05:30'),
        endAt: new Date('2026-10-20T18:00:00+05:30'),
        dentist: { fullName: 'Dr. Arun Kumar', specialization: 'Endodontist' },
      });

      await expect(
        apptService.create(CLINIC_ID, {
          patientId: 'patient-2',
          dentistId: drArun.id,
          chairNumber: 1,
          scheduledStart: start.toISOString(),
          durationMinutes: 30,
          reason: 'Routine Cleaning',
        }, receptionistUser)
      ).rejects.toThrow(ConflictException);

      expect(clinicHoursService.getDentistLeaveForSlot).toHaveBeenCalledWith(
        CLINIC_ID,
        drArun.id,
        expect.any(Date),
        expect.any(Date),
        expect.anything()
      );
    });

    it('should reject booking when appointment interval overlaps a recorded leave period', async () => {
      const start = new Date('2026-10-20T11:30:00+05:30');

      (clinicHoursService.getDentistLeaveForSlot as jest.Mock).mockResolvedValueOnce({
        id: 'leave-2',
        dentistId: drArun.id,
        reason: 'Emergency Leave',
        startAt: new Date('2026-10-20T11:45:00+05:30'),
        endAt: new Date('2026-10-20T16:00:00+05:30'),
        dentist: { fullName: 'Dr. Arun Kumar' },
      });

      await expect(
        apptService.create(CLINIC_ID, {
          patientId: 'patient-2',
          dentistId: drArun.id,
          chairNumber: 1,
          scheduledStart: start.toISOString(),
          durationMinutes: 30,
          reason: 'Checkup',
        }, receptionistUser)
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Scenario 2: Dynamic Capacity Gap-Fitting Engine (DCGFE)', () => {
    it('should compute available treatment gaps correctly before the next scheduled booking', async () => {
      const now = new Date('2026-10-20T09:30:00+05:30');
      const nextBookingStart = new Date('2026-10-20T10:30:00+05:30'); // 60 minutes later

      // Chair 1 has an upcoming appointment at 10:30 AM (60 min gap from 9:30 AM)
      mockPrisma.appointment.findMany.mockResolvedValue([
        {
          id: 'future-appt',
          chairNumber: 1,
          dentistId: drArun.id,
          scheduledStart: nextBookingStart,
          scheduledEnd: new Date('2026-10-20T11:00:00+05:30'),
          status: 'CONFIRMED',
          patient: { fullName: 'Patient B', phone: '+919999999999', uhid: 'AKS-002' },
          dentist: { id: drArun.id, fullName: drArun.fullName },
        },
      ]);

      const gapsResult = await apptService.calculateAvailableGaps(CLINIC_ID, '2026-10-20', now);

      expect(gapsResult.totalChairs).toBe(3);
      const chair1 = gapsResult.chairGaps.find(g => g.chairNumber === 1);
      expect(chair1).toBeDefined();
      expect(chair1?.gapMinutes).toBe(60);
      expect(chair1?.canFitStandardConsultation).toBe(true);
      expect(chair1?.recommendation).toContain('Fits 30m consultation');
    });

    it('should flag when a gap is too short (e.g. 15 minutes) before the next booking', async () => {
      const now = new Date('2026-10-20T09:45:00+05:30');
      const nextBookingStart = new Date('2026-10-20T10:00:00+05:30'); // Only 15 minutes later!

      mockPrisma.appointment.findMany.mockResolvedValue([
        {
          id: 'future-appt',
          chairNumber: 1,
          dentistId: drArun.id,
          scheduledStart: nextBookingStart,
          scheduledEnd: new Date('2026-10-20T10:30:00+05:30'),
          status: 'CONFIRMED',
          patient: { fullName: 'Patient C', phone: '+919999999999', uhid: 'AKS-003' },
          dentist: { id: drArun.id, fullName: drArun.fullName },
        },
      ]);

      const gapsResult = await apptService.calculateAvailableGaps(CLINIC_ID, '2026-10-20', now);

      const chair1 = gapsResult.chairGaps.find(g => g.chairNumber === 1);
      expect(chair1?.gapMinutes).toBe(15);
      expect(chair1?.canFitStandardConsultation).toBe(false);
      expect(chair1?.recommendation).toContain('Cannot fit 30m consultation without delay');
    });

    it('should protect a slot during active grace period and not report capacity as available to walk-ins', async () => {
      // Appointment was scheduled for 10:00 AM. Current time is 10:04 AM (4 mins late, 6 mins grace left).
      const now = new Date('2026-10-20T10:04:00+05:30');
      const scheduledStart = new Date('2026-10-20T10:00:00+05:30');

      mockPrisma.appointment.findMany.mockResolvedValue([
        {
          id: 'grace-period-appt',
          chairNumber: 1,
          dentistId: drArun.id,
          scheduledStart,
          scheduledEnd: new Date('2026-10-20T10:30:00+05:30'),
          status: 'SCHEDULED',
          patient: { fullName: 'Running Late Patient', phone: '+919876543210', uhid: 'AKS-010' },
          dentist: { id: drArun.id, fullName: drArun.fullName },
        },
      ]);

      const gapsResult = await apptService.calculateAvailableGaps(CLINIC_ID, '2026-10-20', now);

      const chair1 = gapsResult.chairGaps.find(g => g.chairNumber === 1);
      expect(chair1).toBeDefined();
      expect(chair1?.gapMinutes).toBe(0);
      expect(chair1?.canFitStandardConsultation).toBe(false);
      expect(chair1?.recommendation).toContain('into arrival grace period');
      expect(chair1?.recommendation).toContain('Chair protected for booked patient');
    });
  });

  describe('Scenario 3: Arrival Grace Period & No-Show Slot Release Protocol', () => {
    it('should identify appointments exceeding the 10-minute grace period as eligible for review', async () => {
      const now = new Date('2026-10-20T10:15:00+05:30');
      const scheduled10AM = new Date('2026-10-20T10:00:00+05:30'); // 15 mins ago!

      mockPrisma.appointment.findMany.mockResolvedValue([
        {
          id: 'late-patient-appt',
          chairNumber: 1,
          dentistId: drArun.id,
          scheduledStart: scheduled10AM,
          scheduledEnd: new Date('2026-10-20T10:30:00+05:30'),
          status: 'SCHEDULED', // Never checked in
          patient: { fullName: 'Absent Patient', phone: '+919876543210', uhid: 'AKS-009' },
          dentist: { id: drArun.id, fullName: drArun.fullName },
        },
      ]);

      const result = await apptService.calculateAvailableGaps(CLINIC_ID, '2026-10-20', now);

      expect(result.lateReviewAppts.length).toBe(1);
      expect(result.lateReviewAppts[0].patientName).toBe('Absent Patient');
      expect(result.lateReviewAppts[0].minutesLate).toBe(15);
      expect(result.lateReviewAppts[0].isGracePeriodExpired).toBe(true);
    });

    it('should reject releasing an appointment BEFORE the arrival grace period expires', async () => {
      // Scheduled start is 5 minutes ago (grace period is 10 minutes)
      const scheduledStart = new Date(Date.now() - 5 * 60 * 1000);

      mockPrisma.appointment.findFirst.mockResolvedValueOnce({
        id: 'early-release-appt',
        clinicId: CLINIC_ID,
        chairNumber: 1,
        status: 'SCHEDULED',
        scheduledStart,
        patient: { fullName: 'Slightly Late Patient', phone: '+919876543210' },
        dentist: { fullName: 'Dr. Arun Kumar' },
      });

      await expect(
        apptService.releaseLateSlot(
          CLINIC_ID,
          'early-release-appt',
          'Attempting release early',
          receptionistUser
        )
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully release chair capacity AFTER grace period expires and mark status NO_SHOW', async () => {
      // Scheduled start was 15 minutes ago (10-minute grace period expired)
      const scheduledStart = new Date(Date.now() - 15 * 60 * 1000);
      const apptToRelease = {
        id: 'late-appt-123',
        clinicId: CLINIC_ID,
        chairNumber: 1,
        status: 'SCHEDULED',
        scheduledStart,
        notes: 'Original booking',
        patient: { fullName: 'Absent Patient', phone: '+919876543210', uhid: 'AKS-009' },
        dentist: { fullName: 'Dr. Arun Kumar' },
      };

      mockPrisma.appointment.findFirst.mockResolvedValueOnce(apptToRelease);
      mockPrisma.appointment.update.mockResolvedValueOnce({
        ...apptToRelease,
        status: 'NO_SHOW',
      });

      const releaseResult = await apptService.releaseLateSlot(
        CLINIC_ID,
        'late-appt-123',
        'Patient absent past 10-minute arrival grace period',
        receptionistUser
      );

      expect(releaseResult.success).toBe(true);
      expect(releaseResult.message).toContain('Operatory Chair #1 released');
      expect(mockPrisma.appointment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'late-appt-123' },
          data: expect.objectContaining({
            status: 'NO_SHOW',
            cancellationReason: 'Patient absent past 10-minute arrival grace period',
          }),
        })
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'APPOINTMENT_LATE_RELEASED',
          entityId: 'late-appt-123',
        })
      );
    });

    it('should refuse to release an appointment that has already CHECKED_IN', async () => {
      const scheduledStart = new Date(Date.now() - 20 * 60 * 1000);
      mockPrisma.appointment.findFirst.mockResolvedValueOnce({
        id: 'arrived-appt-789',
        clinicId: CLINIC_ID,
        status: 'CHECKED_IN',
        scheduledStart,
        patient: { fullName: 'Patient In Lobby', phone: '+919876543210' },
        dentist: { fullName: 'Dr. Arun Kumar' },
      });

      await expect(
        apptService.releaseLateSlot(
          CLINIC_ID,
          'arrived-appt-789',
          'Attempting release on checked-in patient',
          receptionistUser
        )
      ).rejects.toThrow(BadRequestException);
    });

    it('should refuse to release an appointment that has been CALLED', async () => {
      const scheduledStart = new Date(Date.now() - 25 * 60 * 1000);
      mockPrisma.appointment.findFirst.mockResolvedValueOnce({
        id: 'called-appt-101',
        clinicId: CLINIC_ID,
        status: 'CALLED',
        scheduledStart,
        patient: { fullName: 'Paging Patient', phone: '+919876543210' },
        dentist: { fullName: 'Dr. Arun Kumar' },
      });

      await expect(
        apptService.releaseLateSlot(
          CLINIC_ID,
          'called-appt-101',
          'Attempting release on called patient',
          receptionistUser
        )
      ).rejects.toThrow(BadRequestException);
    });

    it('should refuse to release an appointment that is already IN_CHAIR or COMPLETED', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValueOnce({
        id: 'active-appt-456',
        clinicId: CLINIC_ID,
        status: 'IN_CHAIR',
        scheduledStart: new Date(Date.now() - 30 * 60 * 1000),
        patient: { fullName: 'Active Seated Patient', phone: '+919876543210' },
        dentist: { fullName: 'Dr. Arun Kumar' },
      });

      await expect(
        apptService.releaseLateSlot(
          CLINIC_ID,
          'active-appt-456',
          'Attempting release on seated patient',
          receptionistUser
        )
      ).rejects.toThrow(BadRequestException);
    });

    it('should serialize concurrent operations via row-level locking during release', async () => {
      const scheduledStart = new Date(Date.now() - 20 * 60 * 1000);
      mockPrisma.appointment.findFirst.mockResolvedValueOnce({
        id: 'lock-test-appt',
        clinicId: CLINIC_ID,
        chairNumber: 1,
        status: 'SCHEDULED',
        scheduledStart,
        patient: { fullName: 'Concurrent Test Patient', phone: '+919876543210' },
        dentist: { fullName: 'Dr. Arun Kumar' },
      });

      mockPrisma.appointment.update.mockResolvedValueOnce({
        id: 'lock-test-appt',
        status: 'NO_SHOW',
      });

      await apptService.releaseLateSlot(
        CLINIC_ID,
        'lock-test-appt',
        'Grace period release',
        receptionistUser
      );

      // Verify row lock was requested
      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
    });
  });
});
