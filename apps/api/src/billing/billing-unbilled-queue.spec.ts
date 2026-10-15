import { BillingService } from './billing.service';

describe('Billing Operatory Unbilled Queue & Doctor-to-Billing Workflow', () => {
  let billingService: BillingService;
  let mockPrisma: any;
  let mockAudit: any;

  const CLINIC_ID = 'clinic-aks-001';

  beforeEach(() => {
    mockAudit = { log: jest.fn().mockResolvedValue(true) };
    mockPrisma = {
      completedProcedure: {
        findMany: jest.fn(),
      },
      treatmentCatalogItem: {
        findMany: jest.fn(),
      },
      appointment: {
        findMany: jest.fn(),
      },
      invoice: {
        findMany: jest.fn(),
      },
      forTenant: jest.fn((clinicId: string, callback: any) => callback(mockPrisma)),
      nextSequence: jest.fn().mockResolvedValue(1),
    };

    billingService = new BillingService(mockPrisma, mockAudit);
  });

  it('aggregates doctor-completed unbilled procedures with catalog fees and groups by patient', async () => {
    mockPrisma.completedProcedure.findMany.mockResolvedValue([
      {
        id: 'proc-1',
        procedureCode: 'RCT-01',
        procedureName: 'Root Canal Treatment',
        toothNumber: 16,
        performedAt: new Date('2026-10-10T10:30:00Z'),
        isBilled: false,
        notes: 'Completed obturation',
        patient: {
          id: 'pat-1',
          fullName: 'Suresh Kumar',
          uhid: 'AKS-2026-0001',
          phone: '+91 98765 43210',
        },
        dentist: {
          id: 'dentist-1',
          fullName: 'Dr. Khalidh Khan',
        },
        treatmentPlanItem: null,
      },
      {
        id: 'proc-2',
        procedureCode: 'RES-01',
        procedureName: 'Composite Restoration',
        toothNumber: 16,
        performedAt: new Date('2026-10-10T11:00:00Z'),
        isBilled: false,
        notes: 'Direct composite',
        patient: {
          id: 'pat-1',
          fullName: 'Suresh Kumar',
          uhid: 'AKS-2026-0001',
          phone: '+91 98765 43210',
        },
        dentist: {
          id: 'dentist-1',
          fullName: 'Dr. Khalidh Khan',
        },
        treatmentPlanItem: null,
      },
    ]);

    mockPrisma.treatmentCatalogItem.findMany.mockResolvedValue([
      { code: 'RCT-01', name: 'Root Canal Treatment', standardFeePaise: 450000, isActive: true },
      { code: 'RES-01', name: 'Composite Restoration', standardFeePaise: 150000, isActive: true },
    ]);

    mockPrisma.appointment.findMany.mockResolvedValue([
      {
        id: 'appt-1',
        clinicId: CLINIC_ID,
        scheduledStart: new Date('2026-10-10T10:00:00Z'),
        status: 'COMPLETED',
        chairNumber: 2,
        reason: 'Tooth pain',
        patient: {
          id: 'pat-1',
          fullName: 'Suresh Kumar',
          uhid: 'AKS-2026-0001',
          phone: '+91 98765 43210',
        },
        dentist: {
          id: 'dentist-1',
          fullName: 'Dr. Khalidh Khan',
        },
      },
    ]);

    mockPrisma.invoice.findMany.mockResolvedValue([]);

    const queue = await billingService.getUnbilledQueue(CLINIC_ID);

    expect(queue).toHaveLength(1);
    const patientItem = queue[0];
    expect(patientItem.patientId).toBe('pat-1');
    expect(patientItem.patientName).toBe('Suresh Kumar');
    expect(patientItem.procedures).toHaveLength(2);
    expect(patientItem.procedures[0].procedureCode).toBe('RCT-01');
    expect(patientItem.procedures[0].feePaise).toBe(450000);
    expect(patientItem.procedures[1].feePaise).toBe(150000);
    expect(patientItem.totalEstimatedPaise).toBe(600000); // ₹6,000
    expect(patientItem.appointmentId).toBe('appt-1');
    expect(patientItem.chairNumber).toBe(2);
  });

  it('filters out settled patients who have zero unbilled procedures', async () => {
    mockPrisma.completedProcedure.findMany.mockResolvedValue([]);
    mockPrisma.treatmentCatalogItem.findMany.mockResolvedValue([]);
    mockPrisma.appointment.findMany.mockResolvedValue([
      {
        id: 'appt-paid',
        clinicId: CLINIC_ID,
        scheduledStart: new Date('2026-10-10T09:00:00Z'),
        status: 'COMPLETED',
        chairNumber: 1,
        reason: 'Routine Consultation',
        patient: {
          id: 'pat-settled',
          fullName: 'Ramesh Patel',
          uhid: 'AKS-2026-0002',
          phone: '+91 98765 43211',
        },
        dentist: {
          id: 'dentist-1',
          fullName: 'Dr. Khalidh Khan',
        },
      },
    ]);

    // Already has PAID invoice today
    mockPrisma.invoice.findMany.mockResolvedValue([
      {
        patientId: 'pat-settled',
        status: 'PAID',
        totalPaise: 30000,
        paidPaise: 30000,
      },
    ]);

    const queue = await billingService.getUnbilledQueue(CLINIC_ID);

    expect(queue).toHaveLength(0); // Safely excluded because already paid
  });

  it('preserves zero estimated bill for in-chair patient awaiting doctor treatment plan (no phantom fees)', async () => {
    mockPrisma.completedProcedure.findMany.mockResolvedValue([]);
    mockPrisma.treatmentCatalogItem.findMany.mockResolvedValue([
      { code: 'CONSULTATION', name: 'General Consultation', standardFeePaise: 30000, isActive: true },
    ]);
    mockPrisma.appointment.findMany.mockResolvedValue([
      {
        id: 'appt-in-chair',
        clinicId: CLINIC_ID,
        scheduledStart: new Date('2026-10-10T11:00:00Z'),
        status: 'IN_CHAIR',
        chairNumber: 1,
        reason: '[WALK-IN] Toothache / Dental Consultation',
        patient: {
          id: 'pat-in-chair',
          fullName: 'Yogesh',
          uhid: 'AKS-2026-0003-4BF9',
          phone: '+91 82483 45770',
        },
        dentist: {
          id: 'dentist-1',
          fullName: 'Dr. Khalidh Khan',
        },
      },
    ]);
    mockPrisma.invoice.findMany.mockResolvedValue([]);

    const queue = await billingService.getUnbilledQueue(CLINIC_ID);

    expect(queue).toHaveLength(1);
    const item = queue[0];
    expect(item.patientName).toBe('Yogesh');
    expect(item.status).toBe('IN_CHAIR');
    expect(item.procedures).toHaveLength(0); // MUST be empty: doctor hasn't written plan or completed procedures yet!
    expect(item.totalEstimatedPaise).toBe(0); // NO phantom ₹300 estimate!
  });

  it('preserves explicit 0 paise for pro-bono or uncatalogued procedure without fabricating arbitrary ₹500 fees', async () => {
    mockPrisma.completedProcedure.findMany.mockResolvedValue([
      {
        id: 'proc-probono',
        procedureCode: 'SUTURE-REM',
        procedureName: 'Post-op Suture Removal',
        toothNumber: null,
        performedAt: new Date('2026-10-10T12:00:00Z'),
        isBilled: false,
        notes: 'Follow-up suture removal, courtesy visit',
        patient: {
          id: 'pat-probono',
          fullName: 'Meena Kumari',
          uhid: 'AKS-2026-0004',
          phone: '+91 98765 43212',
        },
        dentist: {
          id: 'dentist-1',
          fullName: 'Dr. Khalidh Khan',
        },
        treatmentPlanItem: null,
      },
    ]);
    mockPrisma.treatmentCatalogItem.findMany.mockResolvedValue([]); // Not in catalog
    mockPrisma.appointment.findMany.mockResolvedValue([]);
    mockPrisma.invoice.findMany.mockResolvedValue([]);

    const queue = await billingService.getUnbilledQueue(CLINIC_ID);

    expect(queue).toHaveLength(1);
    const item = queue[0];
    expect(item.procedures[0].feePaise).toBe(0); // Explicit ₹0, NEVER fabricated ₹500!
    expect(item.procedures[0].feeState).toBe('UNPRICED');
    expect(item.totalEstimatedPaise).toBe(0);
  });

  describe('Explicit Fee States & Invoicing Guards', () => {
    it('REJECTS creating an invoice for unpriced zero-fee procedure without explicit complimentary confirmation', async () => {
      mockPrisma.patient = {
        findFirst: jest.fn().mockResolvedValue({ id: 'pat-1', clinicId: CLINIC_ID }),
      };
      mockPrisma.completedProcedure = {
        findFirst: jest.fn().mockResolvedValue(null),
      };
      mockPrisma.invoice = {
        findFirst: jest.fn().mockResolvedValue(null),
      };

      await expect(
        billingService.createInvoice(
          CLINIC_ID,
          {
            patientId: 'pat-1',
            items: [
              {
                description: 'Unpriced Extraction',
                unitPricePaise: 0,
                quantity: 1,
                // Missing isComplimentary and zeroFeeReason!
              },
            ],
          },
          { userId: 'u1', role: 'ACCOUNTANT' },
        ),
      ).rejects.toThrow('has a zero fee. You must provide an approved fee or explicitly specify zeroFeeReason');
    });

    it('ACCEPTS creating an invoice for an intentionally approved zero-fee / complimentary procedure', async () => {
      mockPrisma.clinic = {
        findUnique: jest.fn().mockResolvedValue({ id: CLINIC_ID, code: 'AKS' }),
      };
      mockPrisma.patient = {
        findFirst: jest.fn().mockResolvedValue({ id: 'pat-1', clinicId: CLINIC_ID, fullName: 'Patient 1', uhid: 'AKS-001' }),
      };
      mockPrisma.completedProcedure = {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      };
      mockPrisma.invoice = {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'inv-comp-1',
          invoiceNumber: 'INV-2026-0001',
          totalPaise: 0,
          status: 'ISSUED',
          items: [],
          patient: { fullName: 'Patient 1', uhid: 'AKS-001' },
        }),
      };

      const res = await billingService.createInvoice(
        CLINIC_ID,
        {
          patientId: 'pat-1',
          items: [
            {
              description: 'Follow-up suture removal, courtesy visit',
              unitPricePaise: 0,
              quantity: 1,
              isComplimentary: true,
              zeroFeeReason: 'Post-op courtesy follow-up',
            },
          ],
        },
        { userId: 'u1', role: 'ACCOUNTANT' },
      );

      expect(res.id).toBe('inv-comp-1');
      expect(mockPrisma.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalPaise: 0,
          }),
        }),
      );
    });
  });
});
