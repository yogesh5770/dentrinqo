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
});
