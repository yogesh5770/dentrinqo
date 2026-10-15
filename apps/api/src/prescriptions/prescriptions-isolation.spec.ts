import { PrescriptionsService } from './prescriptions.service';
import { NotFoundException } from '@nestjs/common';

describe('Task 3: Clinic Isolation - Prescriptions Authorization', () => {
  let prescriptionsService: PrescriptionsService;
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
      prescription: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      clinic: {
        findUnique: jest.fn().mockResolvedValue({ id: CLINIC_A, name: "AK's Elite Dental" }),
      },
      forTenant: jest.fn((clinicId: string, callback: any) => callback(mockPrisma)),
      nextSequence: jest.fn().mockResolvedValue(1),
    };
    prescriptionsService = new PrescriptionsService(mockPrisma, mockAudit);
  });

  describe('getById Cross-Clinic Protection', () => {
    it('allows access when prescription belongs to patient in caller clinic', async () => {
      mockPrisma.prescription.findUnique.mockResolvedValue({
        id: 'rx-100',
        clinicId: CLINIC_A,
        prescriptionNumber: 'RX-2026-0001',
        patient: {
          clinicId: CLINIC_A,
          fullName: 'John Doe',
          uhid: 'AKS-2026-0001',
        },
        items: [],
      });

      const result = await prescriptionsService.getById(CLINIC_A, 'rx-100');
      expect(result).toBeDefined();
      expect(result.id).toBe('rx-100');
    });

    it('MUST REJECT with NotFoundException when prescription belongs to a foreign clinic patient', async () => {
      // Prescription belongs to Patient from Clinic B
      mockPrisma.prescription.findUnique.mockResolvedValue({
        id: 'rx-200',
        prescriptionNumber: 'RX-2026-0002',
        patient: {
          clinicId: CLINIC_B, // Foreign clinic!
          fullName: 'Foreign Patient',
          uhid: 'JDC-2026-0001',
        },
        items: [],
      });

      // User from Clinic A tries to read it
      await expect(prescriptionsService.getById(CLINIC_A, 'rx-200')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects with NotFoundException if prescription does not exist', async () => {
      mockPrisma.prescription.findUnique.mockResolvedValue(null);

      await expect(prescriptionsService.getById(CLINIC_A, 'rx-999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByPatient Cross-Clinic Protection', () => {
    it('MUST REJECT with NotFoundException if patient does not belong to clinic', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(null);

      await expect(
        prescriptionsService.findByPatient(CLINIC_A, 'foreign-patient-id'),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.patient.findFirst).toHaveBeenCalledWith({
        where: { id: 'foreign-patient-id', clinicId: CLINIC_A },
      });
    });
  });

  describe('Prescription Creation & Rapid Double-Submission Debounce', () => {
    it('debounces rapid double-clicks within 5s and returns existing prescription without duplicate RX number', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue({
        id: 'pat-1',
        fullName: 'Aravind Swamy',
        uhid: 'AKS-2026-0001',
        clinicId: CLINIC_A,
      });

      // Existing recent RX returned
      const existingRecentRx = {
        id: 'rx-existing',
        prescriptionNumber: 'RX-2026-0001',
        clinicId: CLINIC_A,
        patientId: 'pat-1',
        items: [{ medicineName: 'Augmentin 625mg', dosage: '625 mg', durationDays: 5 }],
      };
      mockPrisma.prescription.findFirst = jest.fn().mockResolvedValue(existingRecentRx);

      const res = await prescriptionsService.create(
        CLINIC_A,
        {
          patientId: 'pat-1',
          items: [
            {
              medicineName: 'Augmentin 625mg',
              dosage: '625 mg',
              form: 'Tablet',
              frequency: '1-0-1',
              durationDays: 5,
              timing: 'After food',
            },
          ],
        },
        { userId: 'doc-1', role: 'DENTIST' },
      );

      expect(res.id).toBe('rx-existing');
      expect(mockPrisma.prescription.create).not.toHaveBeenCalled();
    });

    it('creates sequential prescription when no recent duplicate exists', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue({
        id: 'pat-1',
        fullName: 'Aravind Swamy',
        uhid: 'AKS-2026-0001',
        clinicId: CLINIC_A,
        allergies: JSON.stringify(['Penicillin', 'Sulfa']),
      });
      mockPrisma.prescription.findFirst = jest.fn().mockResolvedValue(null);
      mockPrisma.prescription.create.mockResolvedValue({
        id: 'rx-new',
        prescriptionNumber: 'RX-2026-0002',
        clinicId: CLINIC_A,
        items: [{ medicineName: 'Clindamycin 300mg', dosage: '300 mg', durationDays: 5 }],
      });

      const res = await prescriptionsService.create(
        CLINIC_A,
        {
          patientId: 'pat-1',
          items: [
            {
              medicineName: 'Clindamycin 300mg',
              dosage: '300 mg',
              form: 'Capsule',
              frequency: '1-0-1',
              durationDays: 5,
              timing: 'After food',
            },
          ],
        },
        { userId: 'doc-1', role: 'DENTIST' },
      );

      expect(res.id).toBe('rx-new');
      expect(mockPrisma.prescription.create).toHaveBeenCalled();
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PRESCRIPTION_CREATED',
          details: expect.objectContaining({
            prescriptionNumber: 'RX-2026-0001',
            patientUhid: 'AKS-2026-0001',
          }),
        }),
        mockPrisma,
      );
    });
  });

  describe('Prescription Request Idempotency & Retry Protection', () => {
    it('MUST return existing prescription when repeated request sends identical idempotencyKey', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue({
        id: 'pat-1',
        uhid: 'AKS-2026-0001',
        clinicId: CLINIC_A,
      });

      // Existing prescription matching idempotency marker
      mockPrisma.prescription.findFirst.mockResolvedValueOnce({
        id: 'rx-existing-idem',
        prescriptionNumber: 'RX-2026-0001',
        instructions: 'Take after meals [IDEM:req-uuid-999]',
        items: [{ medicineName: 'Amoxicillin 500mg' }],
      });

      const res = await prescriptionsService.create(
        CLINIC_A,
        {
          patientId: 'pat-1',
          idempotencyKey: 'req-uuid-999',
          instructions: 'Take after meals',
          items: [{ medicineName: 'Amoxicillin 500mg', dosage: '500mg', form: 'Capsule', frequency: '1-0-1', durationDays: 5, timing: 'After food' }],
        },
        { userId: 'doc-1', role: 'DENTIST' },
      );

      expect(res.id).toBe('rx-existing-idem');
      expect(mockPrisma.prescription.create).not.toHaveBeenCalled();
    });

    it('MUST return existing prescription when client retries after network timeout within 60s with identical medications', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue({
        id: 'pat-1',
        uhid: 'AKS-2026-0001',
        clinicId: CLINIC_A,
      });

      // Recent prescription exists with same meds within retry window
      mockPrisma.prescription.findFirst.mockResolvedValueOnce({
        id: 'rx-recent-retry',
        prescriptionNumber: 'RX-2026-0001',
        items: [{ medicineName: 'Paracetamol 650mg' }],
        createdAt: new Date(),
      });

      const res = await prescriptionsService.create(
        CLINIC_A,
        {
          patientId: 'pat-1',
          items: [{ medicineName: 'Paracetamol 650mg', dosage: '650mg', form: 'Tablet', frequency: '1-0-1', durationDays: 3, timing: 'After food' }],
        },
        { userId: 'doc-1', role: 'DENTIST' },
      );

      expect(res.id).toBe('rx-recent-retry');
      expect(mockPrisma.prescription.create).not.toHaveBeenCalled();
    });
  });
});
