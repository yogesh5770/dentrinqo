import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePatientDto, UpdatePatientDto } from './patient.dto';

function safeJsonStringArray(val: any): string {
  if (!val) return JSON.stringify([]);
  if (Array.isArray(val)) {
    return JSON.stringify(val.map(x => String(x).trim()).filter(Boolean));
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return JSON.stringify([]);
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return JSON.stringify(parsed.map(x => String(x).trim()).filter(Boolean));
      }
    } catch {}
    const list = trimmed.split(',').map(s => s.trim()).filter(Boolean);
    return JSON.stringify(list.length > 0 ? list : [trimmed]);
  }
  return JSON.stringify([]);
}

function parseJsonArray(val: any): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(x => String(x));
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed.map(x => String(x));
    } catch {}
    return val ? [val] : [];
  }
  return [];
}

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // Generate sequence-based UHID e.g. AKS-2026-0004 (collision-proof)
  private async generateNextUhid(clinicCode: string): Promise<string> {
    const currentYear = new Date().getFullYear();
    const count = await this.prisma.patient.count();
    let seq = count + 1;
    let uhid = `${clinicCode}-${currentYear}-${seq.toString().padStart(4, '0')}`;
    while (await this.prisma.patient.findUnique({ where: { uhid } })) {
      seq++;
      uhid = `${clinicCode}-${currentYear}-${seq.toString().padStart(4, '0')}`;
    }
    return uhid;
  }

  // Pre-check for duplicate phone or email
  async checkDuplicate(clinicId: string, phone: string, email?: string) {
    const existing = await this.prisma.patient.findFirst({
      where: {
        clinicId,
        OR: [
          { phone: phone.trim() },
          ...(email ? [{ email: email.trim().toLowerCase() }] : []),
        ],
      },
      select: {
        id: true,
        uhid: true,
        fullName: true,
        phone: true,
        age: true,
        gender: true,
        createdAt: true,
      },
    });

    return {
      isDuplicate: !!existing,
      existingPatient: existing || null,
    };
  }

  async create(clinicId: string, dto: CreatePatientDto, actor: any) {
    // 15-second rapid double-click duplicate patient registration check
    const recentPatient = await this.prisma.patient.findFirst({
      where: {
        clinicId,
        phone: dto.phone.trim(),
        createdAt: { gte: new Date(Date.now() - 15000) },
      },
    });
    if (recentPatient) {
      return this.formatPatient(recentPatient);
    }

    const clinic = await this.prisma.clinic.findUnique({ where: { id: clinicId } });
    const uhid = await this.generateNextUhid(clinic?.code || 'AKS');

    const patient = await this.prisma.patient.create({
      data: {
        clinicId,
        uhid,
        fullName: dto.fullName.trim(),
        age: dto.age ? Number(dto.age) : null,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
        gender: dto.gender,
        phone: dto.phone.trim(),
        email: dto.email ? dto.email.trim().toLowerCase() : null,
        address: dto.address,
        emergencyContactName: dto.emergencyContactName,
        emergencyContactPhone: dto.emergencyContactPhone,
        bloodGroup: dto.bloodGroup,
        allergies: safeJsonStringArray(dto.allergies),
        medicalConditions: safeJsonStringArray(dto.medicalConditions),
        currentMedications: safeJsonStringArray(dto.currentMedications),
        notes: dto.notes,
      },
    });

    await this.auditService.log({
      clinicId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'PATIENT_REGISTERED',
      entityType: 'Patient',
      entityId: patient.id,
      details: { uhid: patient.uhid, fullName: patient.fullName, phone: patient.phone },
    });

    return this.formatPatient(patient);
  }

  async findAll(clinicId: string, page = 1, limit = 20, search?: string) {
    const skip = (page - 1) * limit;
    const where: any = { clinicId, isArchived: false };

    if (search && search.trim()) {
      const term = search.trim();
      where.OR = [
        { fullName: { contains: term } },
        { phone: { contains: term } },
        { uhid: { contains: term } },
      ];
    }

    const [records, total] = await Promise.all([
      this.prisma.patient.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              appointments: true,
              consultations: true,
            },
          },
        },
      }),
      this.prisma.patient.count({ where }),
    ]);

    return {
      data: records.map(p => ({
        ...this.formatPatient(p),
        appointmentCount: p._count.appointments,
        consultationCount: p._count.consultations,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(clinicId: string, id: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, clinicId },
      include: {
        appointments: {
          orderBy: { scheduledStart: 'desc' },
          take: 10,
          include: {
            dentist: { select: { fullName: true } },
          },
        },
        consultations: {
          orderBy: { visitDate: 'desc' },
          take: 10,
          include: {
            dentist: { select: { fullName: true } },
          },
        },
        dentalChartEntries: {
          orderBy: { toothNumber: 'asc' },
        },
      },
    });

    if (!patient) {
      throw new NotFoundException('Patient record not found');
    }

    return {
      ...this.formatPatient(patient),
      appointments: patient.appointments.map(a => ({
        id: a.id,
        scheduledStart: a.scheduledStart,
        scheduledEnd: a.scheduledEnd,
        dentistName: a.dentist.fullName,
        chairNumber: a.chairNumber,
        reason: a.reason,
        status: a.status,
      })),
      consultations: patient.consultations.map(c => ({
        id: c.id,
        visitDate: c.visitDate,
        dentistName: c.dentist.fullName,
        chiefComplaint: c.chiefComplaint,
        diagnosis: c.diagnosis,
        isFinalized: c.isFinalized,
      })),
      dentalChart: patient.dentalChartEntries.map(e => ({
        toothNumber: e.toothNumber,
        surface: e.surface,
        condition: e.condition,
        notes: e.notes,
      })),
    };
  }

  async update(clinicId: string, id: string, dto: UpdatePatientDto, actor: any) {
    const existing = await this.prisma.patient.findFirst({ where: { id, clinicId } });
    if (!existing) {
      throw new NotFoundException('Patient record not found');
    }

    const updated = await this.prisma.patient.update({
      where: { id },
      data: {
        fullName: dto.fullName?.trim(),
        age: dto.age !== undefined ? Number(dto.age) : undefined,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        gender: dto.gender,
        phone: dto.phone?.trim(),
        email: dto.email ? dto.email.trim().toLowerCase() : null,
        address: dto.address,
        emergencyContactName: dto.emergencyContactName,
        emergencyContactPhone: dto.emergencyContactPhone,
        bloodGroup: dto.bloodGroup,
        allergies: dto.allergies !== undefined ? safeJsonStringArray(dto.allergies) : undefined,
        medicalConditions: dto.medicalConditions !== undefined ? safeJsonStringArray(dto.medicalConditions) : undefined,
        currentMedications: dto.currentMedications !== undefined ? safeJsonStringArray(dto.currentMedications) : undefined,
        notes: dto.notes,
      },
    });

    await this.auditService.log({
      clinicId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'PATIENT_UPDATED',
      entityType: 'Patient',
      entityId: id,
      details: { uhid: updated.uhid, fullName: updated.fullName },
    });

    return this.formatPatient(updated);
  }

  private formatPatient(p: any) {
    return {
      id: p.id,
      clinicId: p.clinicId,
      uhid: p.uhid,
      fullName: p.fullName,
      dateOfBirth: p.dateOfBirth,
      age: p.age,
      gender: p.gender,
      phone: p.phone,
      email: p.email,
      address: p.address,
      emergencyContactName: p.emergencyContactName,
      emergencyContactPhone: p.emergencyContactPhone,
      bloodGroup: p.bloodGroup,
      allergies: parseJsonArray(p.allergies),
      medicalConditions: parseJsonArray(p.medicalConditions),
      currentMedications: parseJsonArray(p.currentMedications),
      notes: p.notes,
      isArchived: p.isArchived,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }
}