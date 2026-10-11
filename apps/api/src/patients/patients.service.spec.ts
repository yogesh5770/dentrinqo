import { Test, TestingModule } from '@nestjs/testing';
import { PatientsService } from '../patients/patients.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('PatientsService', () => {
  let service: PatientsService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientsService,
        {
          provide: PrismaService,
          useValue: {
            clinic: { findUnique: jest.fn().mockResolvedValue({ code: 'AKS' }) },
            patient: {
              count: jest.fn().mockResolvedValue(4),
              findFirst: jest.fn(),
              create: jest.fn(),
              findMany: jest.fn(),
            },
          },
        },
        {
          provide: AuditService,
          useValue: { log: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<PatientsService>(PatientsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should detect duplicate phone numbers accurately', async () => {
    jest.spyOn(prisma.patient, 'findFirst').mockResolvedValueOnce({
      id: 'existing-id',
      uhid: 'AKS-2026-0001',
      fullName: 'Kavitha Murugan',
      phone: '9876543210',
    } as any);

    const result = await service.checkDuplicate('clinic-1', '9876543210');
    expect(result.isDuplicate).toBe(true);
    expect(result.existingPatient?.uhid).toBe('AKS-2026-0001');
  });

  it('should report non-duplicate when phone does not exist', async () => {
    jest.spyOn(prisma.patient, 'findFirst').mockResolvedValueOnce(null);

    const result = await service.checkDuplicate('clinic-1', '9999999999');
    expect(result.isDuplicate).toBe(false);
    expect(result.existingPatient).toBeNull();
  });
});