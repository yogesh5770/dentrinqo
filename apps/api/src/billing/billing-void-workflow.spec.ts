import { BillingService } from './billing.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('Task 4: Financial Records - Non-Destructive Void Workflow & Statutory Integrity', () => {
  let billingService: BillingService;
  let mockPrisma: any;
  let mockAudit: any;

  const CLINIC_ID = 'clinic-aks-001';
  const ADMIN_ACTOR = { userId: 'admin-uuid', role: 'CLINIC_ADMIN', email: 'admin@akselitedental.com' };
  const RECEPTION_ACTOR = { userId: 'reception-uuid', role: 'RECEPTIONIST', email: 'reception@akselitedental.com' };

  beforeEach(() => {
    mockAudit = { log: jest.fn().mockResolvedValue(true) };
    mockPrisma = {
      clinic: {
        findUnique: jest.fn().mockResolvedValue({ id: CLINIC_ID, code: 'AKS', name: "AK's Elite Dental" }),
      },
      patient: {
        findFirst: jest.fn().mockResolvedValue({ id: 'pat-1', clinicId: CLINIC_ID, fullName: 'Jane Doe', uhid: 'AKS-2026-0001' }),
      },
      invoice: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        delete: jest.fn(), // Track if physical deletion is attempted!
      },
      payment: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        deleteMany: jest.fn(), // Track if physical deletion is attempted!
      },
      invoiceItem: {
        deleteMany: jest.fn(), // Track if physical deletion is attempted!
      },
      refundAdjustment: {
        deleteMany: jest.fn(), // Track if physical deletion is attempted!
      },
      completedProcedure: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      forTenant: jest.fn((clinicId: string, callback: any) => callback(mockPrisma)),
      nextSequence: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn((callback) => callback(mockPrisma)),
    };

    billingService = new BillingService(mockPrisma, mockAudit);
  });

  describe('Invoice Voiding vs Physical Deletion', () => {
    it('MUST soft-void the invoice and NEVER physically delete payments or receipts', async () => {
      const mockInvoice = {
        id: 'inv-123',
        clinicId: CLINIC_ID,
        invoiceNumber: 'AKS-INV-2026-0001',
        status: 'PARTIAL',
        totalPaise: 500000,
        paidPaise: 200000,
        balancePaise: 300000,
        notes: 'Initial consultation and restoration',
        patient: { fullName: 'Jane Doe', uhid: 'AKS-2026-0001' },
        items: [{ completedProcedureId: 'proc-abc' }],
        payments: [
          { id: 'pay-1', receiptNumber: 'AKS-RCP-2026-0001', amountPaise: 200000 },
        ],
      };

      mockPrisma.invoice.findFirst.mockResolvedValue(mockInvoice);
      mockPrisma.invoice.update.mockResolvedValue({
        ...mockInvoice,
        status: 'VOIDED',
        balancePaise: 0,
      });

      const result = await billingService.deleteInvoice(
        CLINIC_ID,
        'inv-123',
        ADMIN_ACTOR,
        'Patient cancelled remainder of treatment plan',
      );

      expect(result.success).toBe(true);

      // 1. Verify invoice was updated to VOIDED with 0 balance
      expect(mockPrisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-123' },
          data: expect.objectContaining({
            status: 'VOIDED',
            balancePaise: 0,
          }),
        }),
      );

      // 2. CRITICAL AUDIT ASSERTION: ZERO physical deletion calls!
      expect(mockPrisma.payment.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.invoiceItem.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.refundAdjustment.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.invoice.delete).not.toHaveBeenCalled();

      // 3. Verify procedure was unbilled for clinical correction
      expect(mockPrisma.completedProcedure.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['proc-abc'] } },
        data: { isBilled: false },
      });

      // 4. Verify audit trail was recorded with preserved payments count
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'INVOICE_VOIDED',
          entityId: 'inv-123',
          details: expect.objectContaining({
            invoiceNumber: 'AKS-INV-2026-0001',
            paymentsPreservedCount: 1,
            paidPaise: 200000,
          }),
        }),
        expect.anything(),
      );
    });

    it('rejects voiding if the invoice is already VOIDED', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: 'inv-123',
        clinicId: CLINIC_ID,
        status: 'VOIDED',
        items: [],
        payments: [],
      });

      await expect(
        billingService.deleteInvoice(CLINIC_ID, 'inv-123', ADMIN_ACTOR),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects unauthorized roles from voiding invoices (e.g. RECEPTIONIST)', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: 'inv-123',
        clinicId: CLINIC_ID,
        status: 'ISSUED',
        items: [],
        payments: [],
      });

      await expect(
        billingService.deleteInvoice(CLINIC_ID, 'inv-123', RECEPTION_ACTOR),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Invoice Numbering Multi-Tenant Isolation', () => {
    it('generates clinic-code prefixed sequential invoice numbers', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue(null);
      mockPrisma.invoice.create.mockImplementation(({ data }: any) => ({
        id: 'inv-created',
        ...data,
      }));

      const created = await billingService.createInvoice(
        CLINIC_ID,
        {
          patientId: 'pat-1',
          items: [{ description: 'Scaling', unitPricePaise: 150000, quantity: 1 }],
        },
        ADMIN_ACTOR,
      );

      const currentYear = new Date().getFullYear();
      expect(created.invoiceNumber).toMatch(new RegExp(`^AKS-INV-${currentYear}-\\d{4}$`));
    });
  });

  describe('Billing Summary Calculation with VOIDED Invoices', () => {
    it('excludes VOIDED invoices from outstanding receivables calculation', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([
        { amountPaise: 100000 },
      ]);
      mockPrisma.invoice.findMany.mockResolvedValue([
        { status: 'ISSUED', totalPaise: 300000, paidPaise: 0, balancePaise: 300000 },
        { status: 'PARTIAL', totalPaise: 200000, paidPaise: 100000, balancePaise: 100000 },
        { status: 'VOIDED', totalPaise: 500000, paidPaise: 0, balancePaise: 500000 }, // VOIDED! Must not inflate receivables
      ]);

      const summary = await billingService.getBillingSummary(CLINIC_ID);

      // Active receivables: 300,000 + 100,000 = 400,000 paise (not 900,000)
      expect(summary.totalOutstandingPaise).toBe(400000);
      // Active billed: 300,000 + 200,000 = 500,000 paise (not 1,000,000)
      expect(summary.totalBilledPaise).toBe(500000);
      expect(summary.activeInvoicesCount).toBe(2);
      expect(summary.totalInvoicesCount).toBe(3);
    });
  });
});
