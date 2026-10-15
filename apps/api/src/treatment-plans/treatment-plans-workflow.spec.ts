import { TreatmentPlansService } from './treatment-plans.service';
import { ProceduresService } from '../procedures/procedures.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('Treatment Plans & Completed Procedures Workflow', () => {
  let treatmentPlansService: TreatmentPlansService;
  let proceduresService: ProceduresService;
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
      treatmentPlan: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      treatmentPlanItem: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      completedProcedure: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      followUpReminder: {
        create: jest.fn(),
      },
      treatmentCatalogItem: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      forTenant: jest.fn((clinicId: string, callback: any) => callback(mockPrisma)),
    };
    treatmentPlansService = new TreatmentPlansService(mockPrisma, mockAudit);
    proceduresService = new ProceduresService(mockPrisma, mockAudit);
  });

  describe('Treatment Plan Creation & Fee Summation', () => {
    it('accurately calculates totalEstimatedPaise from item list', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue({
        id: 'pat-1',
        uhid: 'AKS-2026-0001',
        clinicId: CLINIC_A,
      });

      mockPrisma.treatmentPlan.create.mockImplementation(({ data }: any) => {
        return {
          id: 'plan-1',
          ...data,
          items: data.items.create,
        };
      });

      const plan = await treatmentPlansService.create(
        CLINIC_A,
        {
          patientId: 'pat-1',
          title: 'Tooth 46 RCT & Crown',
          items: [
            {
              procedureCode: 'RCT',
              procedureName: 'Molar RCT',
              estimatedCostPaise: 450000,
              toothNumber: 46,
            },
            {
              procedureCode: 'CROWN',
              procedureName: 'Zirconia Crown',
              estimatedCostPaise: 650000,
              toothNumber: 46,
            },
          ],
        },
        { userId: 'u1', role: 'DENTIST' },
      );

      expect(plan.totalEstimatedPaise).toBe(1100000);
      expect(mockPrisma.treatmentPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalEstimatedPaise: 1100000,
            status: 'PROPOSED',
          }),
        }),
      );
    });
  });

  describe('Parent Treatment Plan Status Auto-Advancement', () => {
    it('advances treatment plan status to IN_PROGRESS when first item is completed', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue({
        id: 'pat-1',
        clinicId: CLINIC_A,
      });
      mockPrisma.completedProcedure.findFirst.mockResolvedValue(null);
      mockPrisma.completedProcedure.create.mockResolvedValue({
        id: 'comp-1',
        procedureName: 'Molar RCT',
        treatmentPlanItemId: 'item-1',
      });
      mockPrisma.treatmentPlanItem.update.mockResolvedValue({
        id: 'item-1',
        treatmentPlanId: 'plan-1',
        status: 'COMPLETED',
      });
      // Sibling items: item-1 COMPLETED, item-2 PLANNED
      mockPrisma.treatmentPlanItem.findMany.mockResolvedValue([
        { id: 'item-1', status: 'COMPLETED' },
        { id: 'item-2', status: 'PLANNED' },
      ]);

      await proceduresService.recordCompleted(
        CLINIC_A,
        {
          patientId: 'pat-1',
          procedureCode: 'RCT',
          procedureName: 'Molar RCT',
          treatmentPlanItemId: 'item-1',
        },
        { userId: 'u1', role: 'DENTIST' },
      );

      expect(mockPrisma.treatmentPlan.update).toHaveBeenCalledWith({
        where: { id: 'plan-1' },
        data: { status: 'IN_PROGRESS' },
      });
    });

    it('advances treatment plan status to COMPLETED when all items are finished', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue({
        id: 'pat-1',
        clinicId: CLINIC_A,
      });
      mockPrisma.completedProcedure.findFirst.mockResolvedValue(null);
      mockPrisma.completedProcedure.create.mockResolvedValue({
        id: 'comp-2',
        procedureName: 'Zirconia Crown',
        treatmentPlanItemId: 'item-2',
      });
      mockPrisma.treatmentPlanItem.update.mockResolvedValue({
        id: 'item-2',
        treatmentPlanId: 'plan-1',
        status: 'COMPLETED',
      });
      // All items completed
      mockPrisma.treatmentPlanItem.findMany.mockResolvedValue([
        { id: 'item-1', status: 'COMPLETED' },
        { id: 'item-2', status: 'COMPLETED' },
      ]);

      await proceduresService.recordCompleted(
        CLINIC_A,
        {
          patientId: 'pat-1',
          procedureCode: 'CROWN',
          procedureName: 'Zirconia Crown',
          treatmentPlanItemId: 'item-2',
        },
        { userId: 'u1', role: 'DENTIST' },
      );

      expect(mockPrisma.treatmentPlan.update).toHaveBeenCalledWith({
        where: { id: 'plan-1' },
        data: { status: 'COMPLETED' },
      });
    });
  });

  describe('Item Deletion & Data Protection', () => {
    it('REJECTS deleting an item if it already has completed procedure records', async () => {
      mockPrisma.treatmentPlanItem.findUnique.mockResolvedValue({
        id: 'item-1',
        clinicId: CLINIC_A,
        treatmentPlanId: 'plan-1',
        completedProcedure: { id: 'comp-1' }, // Already completed!
      });

      await expect(
        treatmentPlansService.deleteItem(CLINIC_A, 'item-1', { userId: 'u1', role: 'DENTIST' }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.treatmentPlanItem.delete).not.toHaveBeenCalled();
    });

    it('REJECTS deleting an item if it belongs to another clinic', async () => {
      mockPrisma.treatmentPlanItem.findUnique.mockResolvedValue({
        id: 'item-foreign',
        clinicId: CLINIC_B, // Foreign clinic
      });

      await expect(
        treatmentPlansService.deleteItem(CLINIC_A, 'item-foreign', { userId: 'u1', role: 'DENTIST' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('Strict Planned vs Completed Invariants & State Transitions', () => {
    it('REJECTS updating parent plan status to COMPLETED while items remain PLANNED', async () => {
      mockPrisma.treatmentPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        clinicId: CLINIC_A,
        status: 'PROPOSED',
      });
      mockPrisma.treatmentPlanItem.findMany.mockResolvedValue([
        { id: 'item-1', status: 'COMPLETED' },
        { id: 'item-2', status: 'PLANNED' }, // Still planned!
      ]);

      await expect(
        treatmentPlansService.updateStatus(CLINIC_A, 'plan-1', { status: 'COMPLETED' }, { userId: 'u1', role: 'DENTIST' }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.treatmentPlan.update).not.toHaveBeenCalled();
    });

    it('REJECTS marking an item COMPLETED directly via updateItem without recording clinical procedure', async () => {
      mockPrisma.treatmentPlanItem.findUnique.mockResolvedValue({
        id: 'item-1',
        clinicId: CLINIC_A,
        status: 'PLANNED',
        completedProcedure: null, // No procedure actually performed!
      });

      await expect(
        treatmentPlansService.updateItem(
          CLINIC_A,
          'item-1',
          { status: 'COMPLETED' },
          { userId: 'u1', role: 'DENTIST' },
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.treatmentPlanItem.update).not.toHaveBeenCalled();
    });

    it('REJECTS altering procedureName or toothNumber on an item that has already been performed in chair', async () => {
      mockPrisma.treatmentPlanItem.findUnique.mockResolvedValue({
        id: 'item-1',
        clinicId: CLINIC_A,
        toothNumber: 46,
        procedureName: 'Molar RCT',
        status: 'COMPLETED',
        completedProcedure: { id: 'proc-1', procedureName: 'Molar RCT' },
      });

      await expect(
        treatmentPlansService.updateItem(
          CLINIC_A,
          'item-1',
          { procedureName: 'Premolar RCT' }, // Attempting to alter performed record
          { userId: 'u1', role: 'DENTIST' },
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.treatmentPlanItem.update).not.toHaveBeenCalled();
    });

    it('advances plan status to CANCELLED when all items are cancelled', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue({ id: 'pat-1', clinicId: CLINIC_A });
      mockPrisma.completedProcedure.findFirst.mockResolvedValue(null);
      mockPrisma.completedProcedure.create.mockResolvedValue({ id: 'proc-1' });
      mockPrisma.treatmentPlanItem.update.mockResolvedValue({
        id: 'item-1',
        treatmentPlanId: 'plan-1',
        status: 'CANCELLED',
      });
      // All items cancelled
      mockPrisma.treatmentPlanItem.findMany.mockResolvedValue([
        { id: 'item-1', status: 'CANCELLED' },
        { id: 'item-2', status: 'CANCELLED' },
      ]);

      await proceduresService.recordCompleted(
        CLINIC_A,
        {
          patientId: 'pat-1',
          procedureCode: 'RCT',
          procedureName: 'Molar RCT',
          treatmentPlanItemId: 'item-1',
        },
        { userId: 'u1', role: 'DENTIST' },
      );

      expect(mockPrisma.treatmentPlan.update).toHaveBeenCalledWith({
        where: { id: 'plan-1' },
        data: { status: 'CANCELLED' },
      });
    });

    it('advances plan status to COMPLETED when some items are completed and rest cancelled', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue({ id: 'pat-1', clinicId: CLINIC_A });
      mockPrisma.completedProcedure.findFirst.mockResolvedValue(null);
      mockPrisma.completedProcedure.create.mockResolvedValue({ id: 'proc-1' });
      mockPrisma.treatmentPlanItem.update.mockResolvedValue({
        id: 'item-1',
        treatmentPlanId: 'plan-1',
        status: 'COMPLETED',
      });
      // item-1 COMPLETED, item-2 CANCELLED (all terminal, with at least one completed)
      mockPrisma.treatmentPlanItem.findMany.mockResolvedValue([
        { id: 'item-1', status: 'COMPLETED' },
        { id: 'item-2', status: 'CANCELLED' },
      ]);

      await proceduresService.recordCompleted(
        CLINIC_A,
        {
          patientId: 'pat-1',
          procedureCode: 'RCT',
          procedureName: 'Molar RCT',
          treatmentPlanItemId: 'item-1',
        },
        { userId: 'u1', role: 'DENTIST' },
      );

      expect(mockPrisma.treatmentPlan.update).toHaveBeenCalledWith({
        where: { id: 'plan-1' },
        data: { status: 'COMPLETED' },
      });
    });
  });
});
