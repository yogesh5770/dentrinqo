import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentsService } from '../appointments/appointments.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';

describe('AppointmentsService', () => {
  let service: AppointmentsService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        {
          provide: PrismaService,
          useValue: {
            clinic: {
              findFirst: jest.fn(),
            },
            patient: {
              findFirst: jest.fn().mockResolvedValue({ id: 'p1' }),
              findMany: jest.fn().mockResolvedValue([]),
              create: jest.fn(),
              count: jest.fn().mockResolvedValue(10),
            },
            user: {
              findFirst: jest.fn().mockResolvedValue({ id: 'd1', fullName: 'Dr. Khalidh', role: 'DENTIST', isActive: true }),
            },
            appointment: {
              findFirst: jest.fn(),
              create: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
              count: jest.fn().mockResolvedValue(0),
            },
            dailyQueueSequence: {
              upsert: jest.fn().mockResolvedValue({ lastSequence: 1 }),
            },
          },
        },
        {
          provide: AuditService,
          useValue: { log: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AppointmentsService>(AppointmentsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Internal Scheduling Conflicts', () => {
    it('should reject overlapping appointment for the same dentist', async () => {
      const start = new Date('2026-10-10T10:00:00.000Z');
      const existingStart = new Date('2026-10-10T10:00:00.000Z');
      const existingEnd = new Date('2026-10-10T10:30:00.000Z');

      jest.spyOn(prisma.patient, 'findFirst').mockResolvedValueOnce({ id: 'p1' } as any);
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValueOnce({ id: 'd1', isActive: true } as any);
      jest.spyOn(prisma.appointment, 'findFirst').mockResolvedValueOnce({
        id: 'existing-appt',
        scheduledStart: existingStart,
        scheduledEnd: existingEnd,
        patient: { fullName: 'Kavitha Murugan' },
      } as any);

      await expect(
        service.create('clinic-1', {
          patientId: 'p1',
          dentistId: 'd1',
          chairNumber: 1,
          scheduledStart: start.toISOString(),
          durationMinutes: 30,
          reason: 'Tooth extraction',
        }, { userId: 'reception-1', role: 'RECEPTIONIST' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject overlapping reservation for the same operatory chair', async () => {
      const start = new Date('2026-10-10T11:00:00.000Z');
      const existingStart = new Date('2026-10-10T11:00:00.000Z');
      const existingEnd = new Date('2026-10-10T11:30:00.000Z');

      jest.spyOn(prisma.patient, 'findFirst').mockResolvedValueOnce({ id: 'p1' } as any);
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValueOnce({ id: 'd1', isActive: true } as any);
      jest.spyOn(prisma.appointment, 'findFirst')
        .mockResolvedValueOnce(null) // No dentist conflict
        .mockResolvedValueOnce({    // Chair conflict!
          id: 'chair-appt',
          scheduledStart: existingStart,
          scheduledEnd: existingEnd,
          patient: { fullName: 'Ramesh Chandran' },
        } as any);

      await expect(
        service.create('clinic-1', {
          patientId: 'p1',
          dentistId: 'd1',
          chairNumber: 1,
          scheduledStart: start.toISOString(),
          durationMinutes: 30,
          reason: 'Crown seating',
        }, { userId: 'reception-1', role: 'RECEPTIONIST' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('TASK 2: Public Appointment Booking & Protection', () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const validDto = {
      fullName: 'Anitha Rajan',
      phone: '9876543210',
      email: 'anitha@example.com',
      service: 'Preventive Cleaning & Scaling',
      preferredDate: futureDate,
      preferredSlot: '10:30 AM',
      gender: 'FEMALE',
      age: 29,
      notes: 'No severe pain, routine hygiene check',
      clinicCode: 'AKS',
    };

    it('should successfully create a public request in PENDING_CONFIRMATION status without exposing internal secrets', async () => {
      jest.spyOn(prisma.clinic, 'findFirst').mockResolvedValueOnce({
        id: 'clinic-aks-id',
        code: 'AKS',
        name: 'AKS Elite Dental Clinic',
        phone: '+91 94431 55660',
      } as any);

      // No recent duplicate
      jest.spyOn(prisma.appointment, 'findFirst').mockResolvedValueOnce(null);

      // Patient matching: simulate new patient
      jest.spyOn(prisma.patient, 'findFirst').mockResolvedValueOnce(null);
      jest.spyOn(prisma.patient, 'count').mockResolvedValueOnce(5);
      jest.spyOn(prisma.patient, 'create').mockResolvedValueOnce({
        id: 'new-patient-id',
        uhid: 'AKS-2026-0006',
        fullName: 'Anitha Rajan',
        phone: '9876543210',
      } as any);

      // Staff resolution
      jest.spyOn(prisma.user, 'findFirst')
        .mockResolvedValueOnce({ id: 'staff-admin-id', role: 'CLINIC_ADMIN', fullName: 'Admin' } as any)
        .mockResolvedValueOnce({ id: 'dentist-doc-id', role: 'DENTIST', fullName: 'Dr. Khalidh' } as any);

      // Appointment creation
      jest.spyOn(prisma.appointment, 'create').mockResolvedValueOnce({
        id: 'appt-uuid-9999',
        clinicId: 'clinic-aks-id',
        status: 'PENDING_CONFIRMATION',
        scheduledStart: new Date(),
        scheduledEnd: new Date(),
      } as any);

      const result = await service.createPublicRequest(validDto, '192.168.1.100');

      expect(result.success).toBe(true);
      expect(result.status).toBe('PENDING_CONFIRMATION');
      expect(result.requiresConfirmation).toBe(true);
      expect(result.reference).toContain('AKS-');
      expect(result.clinicName).toBe('AKS Elite Dental Clinic');
      expect(result.patientName).toBe('Anitha Rajan');
      // Assert no sensitive internal data returned
      expect((result as any).passwordHash).toBeUndefined();
      expect((result as any).clinicId).toBeUndefined();
    });

    it('should reject booking requests with past appointment dates', async () => {
      jest.spyOn(prisma.clinic, 'findFirst').mockResolvedValueOnce({
        id: 'clinic-aks-id',
        code: 'AKS',
      } as any);

      const pastDto = {
        ...validDto,
        preferredDate: '2020-01-01',
      };

      await expect(service.createPublicRequest(pastDto)).rejects.toThrow(BadRequestException);
    });

    it('should reject booking request when clinic is not found', async () => {
      jest.spyOn(prisma.clinic, 'findFirst').mockResolvedValueOnce(null);

      await expect(service.createPublicRequest(validDto)).rejects.toThrow(NotFoundException);
    });

    it('should trigger duplicate-submission protection when same phone submits within 15 minutes', async () => {
      jest.spyOn(prisma.clinic, 'findFirst').mockResolvedValueOnce({
        id: 'clinic-aks-id',
        code: 'AKS',
      } as any);

      // Simulate recent pending appointment within 15 minutes
      jest.spyOn(prisma.appointment, 'findFirst').mockResolvedValueOnce({
        id: 'existing-pending-appt',
        status: 'PENDING_CONFIRMATION',
        createdAt: new Date(),
        patient: { phone: '9876543210' },
      } as any);

      await expect(service.createPublicRequest(validDto)).rejects.toThrow(ConflictException);
    });

    it('should strictly isolate clinic data and never attach patient to another clinic', async () => {
      jest.spyOn(prisma.clinic, 'findFirst').mockResolvedValueOnce({
        id: 'clinic-jdc-id',
        code: 'JDC',
        name: 'Jacobs Dental Clinic',
      } as any);

      jest.spyOn(prisma.appointment, 'findFirst').mockResolvedValueOnce(null);

      // Verify that patient lookup strictly checks clinicId = 'clinic-jdc-id'
      const patientSpy = jest.spyOn(prisma.patient, 'findMany').mockResolvedValueOnce([]);

      jest.spyOn(prisma.patient, 'count').mockResolvedValueOnce(1);
      jest.spyOn(prisma.patient, 'create').mockResolvedValueOnce({
        id: 'patient-jdc-id',
        fullName: 'Anitha Rajan',
        clinicId: 'clinic-jdc-id',
      } as any);

      jest.spyOn(prisma.user, 'findFirst')
        .mockResolvedValueOnce({ id: 'u1' } as any)
        .mockResolvedValueOnce({ id: 'd1' } as any);

      jest.spyOn(prisma.appointment, 'create').mockResolvedValueOnce({
        id: 'appt-jdc-1',
        clinicId: 'clinic-jdc-id',
        status: 'PENDING_CONFIRMATION',
      } as any);

      await service.createPublicRequest({ ...validDto, clinicCode: 'JDC' });

      expect(patientSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            clinicId: 'clinic-jdc-id',
          }),
        }),
      );
    });
    it('should automatically mark hospital walk-in bookings as CHECKED_IN always', async () => {
      jest.spyOn(prisma.clinic, 'findFirst').mockResolvedValueOnce({
        id: 'clinic-aks-id',
        code: 'AKS',
        name: 'AKS Elite Dental Clinic',
      } as any);

      jest.spyOn(prisma.appointment, 'findFirst').mockResolvedValueOnce(null);
      jest.spyOn(prisma.patient, 'findMany').mockResolvedValueOnce([]);
      jest.spyOn(prisma.patient, 'count').mockResolvedValueOnce(1);
      jest.spyOn(prisma.patient, 'create').mockResolvedValueOnce({
        id: 'patient-walkin-id',
        fullName: 'Ramesh Walkin',
        clinicId: 'clinic-aks-id',
      } as any);

      jest.spyOn(prisma.user, 'findFirst')
        .mockResolvedValueOnce({ id: 'u1' } as any)
        .mockResolvedValueOnce({ id: 'd1' } as any);

      const createSpy = jest.spyOn(prisma.appointment, 'create').mockResolvedValueOnce({
        id: 'appt-walkin-1',
        clinicId: 'clinic-aks-id',
        status: 'CHECKED_IN',
        scheduledStart: new Date(),
        scheduledEnd: new Date(),
      } as any);

      const walkinDto = {
        fullName: 'Ramesh Walkin',
        phone: '9876543210',
        service: '[HOSPITAL WALK-IN] Consultation',
        preferredDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        preferredSlot: 'WALK-IN IMMEDIATE QUEUE',
        isWalkin: true,
        clinicCode: 'AKS',
      };

      const result = await service.createPublicRequest(walkinDto);

      expect(result.success).toBe(true);
      expect(result.status).toBe('CHECKED_IN');
      expect(result.isCheckedIn).toBe(true);
      expect(result.requiresConfirmation).toBe(false);
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'CHECKED_IN',
            checkInTime: expect.any(Date),
          }),
        }),
      );
    });

    it('should transition scheduled appointment to CHECKED_IN via publicSelfCheckIn when arriving at hospital', async () => {
      const mockAppt = {
        id: 'appt-self-1',
        clinicId: 'clinic-aks-id',
        status: 'SCHEDULED',
        scheduledStart: new Date(),
        createdAt: new Date(),
        patient: { id: 'p1', fullName: 'Anitha Rajan', phone: '9876543210', uhid: 'AKS-2026-0001' },
        dentist: { fullName: 'Dr. Khalidh' },
        clinic: { name: 'AKS Elite Dental Clinic', code: 'AKS' },
      };

      jest.spyOn(prisma.appointment, 'findFirst').mockResolvedValueOnce(mockAppt as any);
      const updateSpy = jest.spyOn(prisma.appointment, 'update').mockResolvedValueOnce({
        ...mockAppt,
        status: 'CHECKED_IN',
        checkInTime: new Date(),
      } as any);
      jest.spyOn(prisma.appointment, 'findMany').mockResolvedValueOnce([{ id: 'appt-self-1', status: 'CHECKED_IN' }] as any);

      const res = await service.publicSelfCheckIn('9876543210');
      expect(res.success).toBe(true);
      expect(res.status).toBe('CHECKED_IN');
      expect(res.tokenNumber).toBe(1);
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'appt-self-1' },
          data: expect.objectContaining({ status: 'CHECKED_IN' }),
        }),
      );
    });
  });
});