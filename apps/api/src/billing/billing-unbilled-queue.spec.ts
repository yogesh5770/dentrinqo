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
});
