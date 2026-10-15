import { ConsultationsService } from './consultations.service';
import { NotFoundException } from '@nestjs/common';

describe('Task 3: Clinic Isolation - Consultations Authorization', () => {
  let consultationsService: ConsultationsService;
  let mockPrisma: any;
  let mockAudit: any;

  const CLINIC_A = 'clinic-aks-001';
  const CLINIC_B = 'clinic-jacobs-002';

  beforeEach(() => {
    mockAudit = { log: jest.fn().mockResolvedValue(true) };
    mockPrisma = {
      patient: {
        findFirst: jest.fn(),
      },
      consultation: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      consultationAmendment: {
        create: jest.fn(),
      },
      appointment: {
        update: jest.fn(),
      },
      forTenant: jest.fn((clinicId: string, callback: any) => callback(mockPrisma)),
      nextSequence: jest.fn().mockResolvedValue(1),
    };
    consultationsService = new ConsultationsService(mockPrisma, mockAudit);
  });

  describe('findByPatient Isolation', () => {
    it('MUST verify patient ownership before returning clinical examination and diagnosis notes', async () => {
      // Patient belongs to Clinic A
      mockPrisma.patient.findFirst.mockResolvedValue({ id: 'pat-1', clinicId: CLINIC_A });
      mockPrisma.consultation.findMany.mockResolvedValue([
        { id: 'c-1', chiefComplaint: 'Toothache' },
      ]);

      const result = await consultationsService.findByPatient(CLINIC_A, 'pat-1');
      expect(result).toHaveLength(1);
      expect(mockPrisma.patient.findFirst).toHaveBeenCalledWith({
        where: { id: 'pat-1', clinicId: CLINIC_A },
      });
    });

    it('MUST REJECT with NotFoundException when Clinic B attempts to read Clinic A patient consultations', async () => {
      // Clinic B tries to read patient pat-1 belonging to Clinic A -> patient not found under CLINIC_B
      mockPrisma.patient.findFirst.mockResolvedValue(null);

      await expect(
        consultationsService.findByPatient(CLINIC_B, 'pat-1'),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.consultation.findMany).not.toHaveBeenCalled();
    });
  });

  describe('finalize & amend Isolation', () => {
    it('MUST REJECT finalize when consultation belongs to another clinic', async () => {
      mockPrisma.consultation.findUnique.mockResolvedValue({
        id: 'c-foreign',
        patient: { clinicId: CLINIC_B, uhid: 'JDC-2026-0001' }, // Foreign clinic
        isFinalized: false,
      });

      await expect(
        consultationsService.finalize(CLINIC_A, 'c-foreign', { userId: 'u1', role: 'DENTIST' }),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.consultation.update).not.toHaveBeenCalled();
    });

    it('MUST REJECT amend when consultation belongs to another clinic', async () => {
      mockPrisma.consultation.findUnique.mockResolvedValue({
        id: 'c-foreign',
        patient: { clinicId: CLINIC_B, uhid: 'JDC-2026-0001' }, // Foreign clinic
        isFinalized: true,
      });

      await expect(
        consultationsService.amend(
          CLINIC_A,
          'c-foreign',
          { reason: 'Correction', newContent: { chiefComplaint: 'Updated' } },
          { userId: 'u1', role: 'DENTIST' },
        ),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.consultationAmendment.create).not.toHaveBeenCalled();
    });
  });

  describe('Draft Consultation Upsert & Idempotency', () => {
    it('MUST update existing unfinalized consultation draft instead of throwing unique constraint error', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue({ id: 'pat-1', uhid: 'AKS-001', clinicId: CLINIC_A });
      mockPrisma.consultation.findUnique.mockResolvedValue({
        id: 'consult-draft-1',
        isFinalized: false,
        dentist: { fullName: 'Dr. Jacob' },
        patient: { fullName: 'Kavitha', uhid: 'AKS-001' },
      });
      mockPrisma.consultation.update.mockResolvedValue({
        id: 'consult-draft-1',
        chiefComplaint: 'Toothache on 46',
        diagnosis: 'Pulpitis 46',
        isFinalized: false,
        dentist: { fullName: 'Dr. Jacob' },
        patient: { fullName: 'Kavitha', uhid: 'AKS-001' },
      });

      const res = await consultationsService.create(
        CLINIC_A,
        {
          patientId: 'pat-1',
          appointmentId: 'appt-1',
          chiefComplaint: 'Toothache on 46',
          clinicalExamination: 'Deep occlusal pit',
          diagnosis: 'Pulpitis 46',
          clinicalNotes: 'Advised RCT',
        },
        { userId: 'u1', role: 'DENTIST' },
      );

      expect(res.id).toBe('consult-draft-1');
      expect(mockPrisma.consultation.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'consult-draft-1' },
        data: expect.objectContaining({
          chiefComplaint: 'Toothache on 46',
          diagnosis: 'Pulpitis 46',
        }),
      }));
    });
  });
});
