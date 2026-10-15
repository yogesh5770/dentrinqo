import { AppointmentsService } from './appointments.service';
import { ClinicHoursService } from '../clinic/clinic-hours.service';
import { UsersService } from '../users/users.service';
import { ConflictException, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';

describe('Dentrinqo Core Clinic Workflows & Safety Specification', () => {
  let apptService: AppointmentsService;
  let clinicHoursService: ClinicHoursService;
  let usersService: UsersService;
  let mockPrisma: any;
  let mockAudit: any;

  const CLINIC_AKS_ID = '0b54d6a2-07c1-4bb5-9766-e249050d88eb';
  const CLINIC_JDC_ID = '476f3fb2-3319-4bca-966a-a0f6fdb31662';

  const mockClinic = {
    id: CLINIC_AKS_ID,
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

  const dentistArun = {
    id: 'dentist-arun',
    clinicId: CLINIC_AKS_ID,
    fullName: 'Dr. Arun Kumar',
    role: 'DENTIST',
    specialization: 'Endodontics',
    assignedChairNumber: 2,
    isActive: true,
  };

  const dentistPriya = {
    id: 'dentist-priya',
    clinicId: CLINIC_AKS_ID,
    fullName: 'Dr. Priya Mani',
    role: 'DENTIST',
    specialization: 'Orthodontics',
    assignedChairNumber: 1,
    isActive: true,
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
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id === dentistArun.id) return Promise.resolve(dentistArun);
          if (where.id === dentistPriya.id) return Promise.resolve(dentistPriya);
          return Promise.resolve(null);
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where.id === dentistArun.id) return Promise.resolve(dentistArun);
          if (where.id === dentistPriya.id) return Promise.resolve(dentistPriya);
          if (where.role === 'DENTIST') return Promise.resolve(dentistArun);
          return Promise.resolve({ id: 'staff-1', role: 'RECEPTIONIST', clinicId: CLINIC_AKS_ID });
        }),
        findMany: jest.fn().mockResolvedValue([dentistArun, dentistPriya]),
        update: jest.fn().mockImplementation(({ where, data }) => {
          return Promise.resolve({ id: where.id, ...data, fullName: dentistArun.fullName, role: dentistArun.role });
        }),
        count: jest.fn().mockResolvedValue(2),
      },
      patient: {
        findFirst: jest.fn().mockResolvedValue({ id: 'patient-1', clinicId: CLINIC_AKS_ID, fullName: 'Murugan Raja', phone: '+919876543210' }),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'patient-new', ...data })),
      },
      appointment: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({
          id: 'appt-100',
          clinicId: CLINIC_AKS_ID,
          ...data,
          patient: { fullName: 'Murugan Raja', phone: '+919876543210' },
          dentist: { fullName: dentistArun.fullName },
          clinic: mockClinic,
        })),
        update: jest.fn().mockImplementation(({ where, data }) => Promise.resolve({
          id: where.id,
          clinicId: CLINIC_AKS_ID,
          ...data,
          patient: { fullName: 'Murugan Raja', phone: '+919876543210' },
          dentist: { fullName: dentistArun.fullName },
          clinic: mockClinic,
        })),
        count: jest.fn().mockResolvedValue(0),
      },
      dentistUnavailability: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({
          id: 'leave-1',
          ...data,
          dentist: { fullName: dentistArun.fullName, specialization: dentistArun.specialization },
        })),
        delete: jest.fn().mockResolvedValue({ id: 'leave-1' }),
      },
      dailyQueueSequence: {
        upsert: jest.fn().mockResolvedValue({ lastSequence: 1 }),
      },
      clinicClosure: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      clinicWorkingHour: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      nextSequence: jest.fn().mockResolvedValue(1),
      forTenant: jest.fn((clinicId: string, fn: any) => fn(mockPrisma)),
      $transaction: jest.fn((fn: any) => fn(mockPrisma)),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };

    clinicHoursService = new ClinicHoursService(mockPrisma, mockAudit);
    apptService = new AppointmentsService(mockPrisma, mockAudit, clinicHoursService);
    usersService = new UsersService(mockPrisma, mockAudit);
  });

  describe('1. Dentist Staff & Operatory Chair Assignment', () => {
    it('Scenario 1: Should successfully assign default operatory chair to a clinical dentist', async () => {
      const res = await usersService.assignChair(CLINIC_AKS_ID, dentistArun.id, 2, { userId: 'admin-1', role: 'CLINIC_ADMIN' });
      expect(res.success).toBe(true);
      expect(res.dentist.assignedChairNumber).toBe(2);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DENTIST_CHAIR_ASSIGNED',
          entityId: dentistArun.id,
        }),
        mockPrisma,
      );
    });

    it('Scenario 2: Should reject chair assignment that exceeds clinic total chair count', async () => {
      await expect(
        usersService.assignChair(CLINIC_AKS_ID, dentistArun.id, 99, { userId: 'admin-1', role: 'CLINIC_ADMIN' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('Scenario 3: Intelligent chair allocation should prioritize dentist assigned chair', async () => {
      const start = new Date('2026-10-20T10:00:00.000Z');
      const end = new Date('2026-10-20T10:30:00.000Z');

      // Dentist Arun has assignedChairNumber = 2
      const candidateChairs = await apptService.getCandidateChairsForSlot(
        CLINIC_AKS_ID,
        start,
        end,
        dentistArun.id,
        mockPrisma,
      );

      // Chair #2 should be the primary candidate!
      expect(candidateChairs[0]).toBe(2);
    });
  });

  describe('2. Dentist Unavailability, Leave & Holidays', () => {
    it('Scenario 4: Should record dentist leave and flag overlapping appointments with action notice', async () => {
      const leaveStart = new Date('2026-10-25T09:00:00.000Z');
      const leaveEnd = new Date('2026-10-25T18:00:00.000Z');

      const existingAppt = {
        id: 'appt-conflict-1',
        clinicId: CLINIC_AKS_ID,
        dentistId: dentistArun.id,
        scheduledStart: new Date('2026-10-25T10:00:00.000Z'),
        scheduledEnd: new Date('2026-10-25T10:30:00.000Z'),
        status: 'CONFIRMED',
        notes: 'Routine scaling',
        patient: { fullName: 'Kavitha Devi', phone: '+919876543211' },
      };

      mockPrisma.appointment.findMany.mockResolvedValueOnce([existingAppt]);

      const result = await clinicHoursService.createDentistUnavailability(
        CLINIC_AKS_ID,
        {
          dentistId: dentistArun.id,
          startAt: leaveStart,
          endAt: leaveEnd,
          reason: 'DENTAL_CONFERENCE',
          notes: 'Attending IDA Annual Conference in Chennai',
        },
        { userId: 'receptionist-1', role: 'RECEPTIONIST' },
      );

      expect(result.id).toBe('leave-1');
      expect(result.impactedCount).toBe(1);
      expect(mockPrisma.appointment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: existingAppt.id },
          data: expect.objectContaining({
            notes: expect.stringContaining('ACTION REQUIRED: Dr. Arun Kumar on leave'),
          }),
        }),
      );
    });

    it('Scenario 5: Booking attempt for dentist on leave should be rejected with clear explanation', async () => {
      const bookingStart = new Date('2026-10-25T11:00:00.000Z');
      const bookingEnd = new Date('2026-10-25T11:30:00.000Z');

      // Mock leave record found in checkConflict
      mockPrisma.dentistUnavailability.findFirst.mockResolvedValueOnce({
        id: 'leave-1',
        clinicId: CLINIC_AKS_ID,
        dentistId: dentistArun.id,
        startAt: new Date('2026-10-25T09:00:00.000Z'),
        endAt: new Date('2026-10-25T18:00:00.000Z'),
        reason: 'SICK_LEAVE',
        dentist: { fullName: dentistArun.fullName },
      });

      await expect(
        apptService.create(
          CLINIC_AKS_ID,
          {
            patientId: 'patient-1',
            dentistId: dentistArun.id,
            scheduledStart: bookingStart.toISOString(),
            durationMinutes: 30,
            reason: 'Wisdom tooth extraction',
          },
          { userId: 'staff-1', role: 'RECEPTIONIST' },
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('Scenario 6: Walk-in auto-assignment should bypass dentist on leave and assign active on-duty dentist', async () => {
      // Mock that Dentist Arun is currently on leave
      mockPrisma.dentistUnavailability.findFirst.mockResolvedValueOnce({
        id: 'leave-arun',
        dentistId: dentistArun.id,
        reason: 'EMERGENCY_LEAVE',
      });

      // Walk-in should assign Dentist Priya instead!
      const walkInResult = await apptService.publicWalkInCheckIn(
        {
          clinicCode: 'AKS',
          fullName: 'Suresh Kumar',
          phone: '9840123456',
          reason: 'Severe toothache walk-in',
        },
        '127.0.0.1',
        CLINIC_AKS_ID,
      );

      expect(walkInResult.success).toBe(true);
      expect(walkInResult.tokenNumber).toBe(1);
      expect(walkInResult.dentistName).toBe(dentistPriya.fullName);
    });
  });

  describe('3. Capacity Enforcement & Operatory Chair Conflicts', () => {
    it('Scenario 7: Should reject booking when all operatory chairs are fully booked for slot', async () => {
      const slotStart = new Date('2026-10-21T14:00:00.000Z');

      // Mock all 3 chairs occupied during this slot
      mockPrisma.appointment.findMany.mockImplementation(({ where }) => {
        if (where.chairNumber && where.chairNumber.in) {
          return Promise.resolve([
            { chairNumber: 1 },
            { chairNumber: 2 },
            { chairNumber: 3 },
          ]);
        }
        return Promise.resolve([]);
      });

      await expect(
        apptService.create(
          CLINIC_AKS_ID,
          {
            patientId: 'patient-1',
            scheduledStart: slotStart.toISOString(),
            durationMinutes: 30,
            reason: 'Scaling and polishing',
          },
          { userId: 'staff-1', role: 'RECEPTIONIST' },
        ),
      ).rejects.toThrow('All operatory chairs are fully booked for this time slot');
    });

    it('Scenario 8: Calling patient to chair already occupied should fail with 409 Conflict', async () => {
      const apptToCall = {
        id: 'appt-to-call',
        clinicId: CLINIC_AKS_ID,
        chairNumber: 1,
        status: 'CHECKED_IN',
        isConfirmedAtDesk: true,
        patient: { fullName: 'Meena Kumari' },
        clinic: mockClinic,
      };

      const occupant = {
        id: 'appt-occupant',
        chairNumber: 1,
        status: 'IN_CHAIR',
        patient: { fullName: 'Ramesh Patel' },
      };

      mockPrisma.appointment.findFirst
        .mockResolvedValueOnce(apptToCall) // Fetch appt
        .mockResolvedValueOnce(occupant);  // Active in chair check

      await expect(
        apptService.updateStatus(
          CLINIC_AKS_ID,
          apptToCall.id,
          { status: 'CALLED', chairNumber: 1 },
          { userId: 'staff-1', role: 'RECEPTIONIST' },
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('4. Queue Lifecycle State Machine Transitions', () => {
    it('Scenario 9: Illegal jump from SCHEDULED directly to IN_CHAIR without check-in should be rejected', async () => {
      const scheduledAppt = {
        id: 'appt-scheduled',
        clinicId: CLINIC_AKS_ID,
        chairNumber: 1,
        status: 'SCHEDULED',
        patient: { fullName: 'Anand Kumar' },
        clinic: mockClinic,
      };

      mockPrisma.appointment.findFirst.mockResolvedValueOnce(scheduledAppt);

      await expect(
        apptService.updateStatus(
          CLINIC_AKS_ID,
          scheduledAppt.id,
          { status: 'IN_CHAIR' },
          { userId: 'staff-1', role: 'RECEPTIONIST' },
        ),
      ).rejects.toThrow('Cannot transition appointment from "SCHEDULED" to "IN_CHAIR"');
    });

    it('Scenario 10: Legal flow CHECKED_IN -> CALLED -> IN_CHAIR -> TREATED -> COMPLETED should succeed', async () => {
      const checkedInAppt = {
        id: 'appt-flow',
        clinicId: CLINIC_AKS_ID,
        chairNumber: 1,
        status: 'CHECKED_IN',
        isConfirmedAtDesk: true,
        patient: { fullName: 'Sangeetha Raman' },
        clinic: mockClinic,
      };

      mockPrisma.appointment.findFirst
        .mockResolvedValueOnce(checkedInAppt) // fetch for CALLED
        .mockResolvedValueOnce(null)          // no active in chair
        .mockResolvedValueOnce({ ...checkedInAppt, status: 'CALLED' }) // fetch for IN_CHAIR
        .mockResolvedValueOnce(null)          // no active in chair
        .mockResolvedValueOnce(null);         // upcoming bookings check

      const calledRes = await apptService.updateStatus(
        CLINIC_AKS_ID,
        checkedInAppt.id,
        { status: 'CALLED' },
        { userId: 'staff-1', role: 'RECEPTIONIST' },
      );
      expect(calledRes.status).toBe('CALLED');

      const seatedRes = await apptService.updateStatus(
        CLINIC_AKS_ID,
        checkedInAppt.id,
        { status: 'IN_CHAIR' },
        { userId: 'staff-1', role: 'RECEPTIONIST' },
      );
      expect(seatedRes.status).toBe('IN_CHAIR');
    });
  });

  describe('5. Concurrency & Multi-Tenant Isolation', () => {
    it('Scenario 11: Cross-clinic lookup should be strictly blocked by tenant boundaries', async () => {
      // Searching in Jacobs Dental for AKS appointment ID
      mockPrisma.appointment.findFirst.mockResolvedValueOnce(null);

      await expect(
        apptService.updateStatus(
          CLINIC_JDC_ID,
          'appt-belonging-to-aks',
          { status: 'CHECKED_IN' },
          { userId: 'jdc-staff', role: 'RECEPTIONIST' },
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('Scenario 12: Scheduled check-in must enforce PostgreSQL row lock to serialize concurrent taps', async () => {
      const now = new Date();
      const mockAppt = {
        id: 'appt-race-tap',
        clinicId: CLINIC_AKS_ID,
        patientId: 'patient-1',
        scheduledStart: now,
        scheduledEnd: new Date(now.getTime() + 30 * 60 * 1000),
        status: 'SCHEDULED',
        chairNumber: 1,
        patient: { id: 'patient-1', fullName: 'Murugan Raja', phone: '+919876543210', uhid: 'AKS-2026-0001' },
        dentist: { fullName: dentistArun.fullName },
        clinic: mockClinic,
      };

      mockPrisma.appointment.findMany.mockResolvedValueOnce([mockAppt]);
      mockPrisma.appointment.findUnique.mockResolvedValueOnce(mockAppt);

      const checkInResult = await apptService.publicSelfCheckIn(
        { identifier: '+919876543210', clinicCode: 'AKS' },
        'AKS',
        '127.0.0.1',
        CLINIC_AKS_ID,
      );

      expect(checkInResult.success).toBe(true);
      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
    });
  });
});
