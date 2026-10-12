import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
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
  private async generateNextUhid(clinicCode: string, clinicId?: string): Promise<string> {
    const currentYear = new Date().getFullYear();
    const count = clinicId
      ? await this.prisma.patient.count({ where: { clinicId } })
      : await this.prisma.patient.count();
    let seq = count + 1;
    let uhid = `${clinicCode}-${currentYear}-${seq.toString().padStart(4, '0')}`;
    while (await this.prisma.patient.findFirst({ where: { ...(clinicId ? { clinicId } : {}), uhid } })) {
      seq++;
      uhid = `${clinicCode}-${currentYear}-${seq.toString().padStart(4, '0')}`;
    }
    return uhid;
  }

  // Pre-check for duplicate phone or email
  async checkDuplicate(clinicId: string, phone: string, email?: string) {
    const cleanPhone = phone ? phone.trim() : '';
    if (!cleanPhone || cleanPhone.toUpperCase() === 'N/A') {
      return { isDuplicate: false, existingPatient: null };
    }
    const existing = await this.prisma.patient.findFirst({
      where: {
        clinicId,
        OR: [
          { phone: cleanPhone },
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

  async findBySerial(clinicId: string, serialNo: string) {
    const trimmed = (serialNo || '').trim();
    if (!trimmed) {
      throw new BadRequestException('Serial Number or UHID is required');
    }

    const patient = await this.prisma.patient.findFirst({
      where: {
        clinicId,
        isArchived: false,
        OR: [
          { legacySlNo: trimmed },
          { uhid: trimmed },
          { legacySlNo: { contains: trimmed } },
          { uhid: { contains: trimmed } },
        ],
      },
      include: {
        appointments: {
          orderBy: { scheduledStart: 'desc' },
          take: 5,
        },
      },
    });

    if (!patient) {
      throw new NotFoundException(`No patient found with Serial Number or UHID "${serialNo}"`);
    }

    return this.formatPatient(patient);
  }

  async create(clinicId: string, dto: CreatePatientDto, actor: any) {
    const cleanPhone = (dto.phone && dto.phone.trim()) ? dto.phone.trim() : 'N/A';

    // 15-second rapid double-click duplicate patient registration check
    if (cleanPhone !== 'N/A') {
      const recentPatient = await this.prisma.patient.findFirst({
        where: {
          clinicId,
          phone: cleanPhone,
          createdAt: { gte: new Date(Date.now() - 15000) },
        },
      });
      if (recentPatient) {
        return this.formatPatient(recentPatient);
      }
    }

    const clinic = await this.prisma.clinic.findUnique({ where: { id: clinicId } });
    const uhid = await this.generateNextUhid(clinic?.code || 'AKS', clinicId);

    const patient = await this.prisma.patient.create({
      data: {
        clinicId,
        uhid,
        fullName: dto.fullName.trim(),
        age: dto.age ? Number(dto.age) : null,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
        gender: dto.gender || 'UNKNOWN',
        phone: cleanPhone,
        email: dto.email ? dto.email.trim().toLowerCase() : null,
        address: dto.address,
        emergencyContactName: dto.emergencyContactName,
        emergencyContactPhone: dto.emergencyContactPhone,
        bloodGroup: dto.bloodGroup,
        allergies: safeJsonStringArray(dto.allergies),
        medicalConditions: safeJsonStringArray(dto.medicalConditions),
        currentMedications: safeJsonStringArray(dto.currentMedications),
        notes: dto.notes,
        legacySlNo: dto.legacySlNo ? dto.legacySlNo.trim() : null,
        guardianName: dto.guardianName ? dto.guardianName.trim() : null,
        occupation: dto.occupation ? dto.occupation.trim() : null,
        legacyRegistrationDate: dto.legacyRegistrationDate ? new Date(dto.legacyRegistrationDate) : null,
        legacyChiefComplaint: dto.legacyChiefComplaint,
        legacyPastHistory: dto.legacyPastHistory,
        legacyTreatmentPlan: dto.legacyTreatmentPlan,
        voiceNoteUrl: dto.voiceNoteUrl,
        cardPhotoUrl: dto.cardPhotoUrl,
        physicalLocation: (dto as any).physicalLocation ? (dto as any).physicalLocation.trim() : null,
      },
    });

    await this.auditService.log({
      clinicId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'PATIENT_REGISTERED',
      entityType: 'Patient',
      entityId: patient.id,
      details: { uhid: patient.uhid, fullName: patient.fullName, phone: patient.phone, legacySlNo: patient.legacySlNo },
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
        { legacySlNo: { contains: term } },
        { guardianName: { contains: term } },
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
      appointments: (patient.appointments || []).map(a => ({
        id: a.id,
        scheduledStart: a.scheduledStart,
        scheduledEnd: a.scheduledEnd,
        dentistName: a.dentist?.fullName || 'Attending Dentist',
        chairNumber: a.chairNumber,
        reason: a.reason,
        status: a.status,
      })),
      consultations: (patient.consultations || []).map(c => ({
        id: c.id,
        visitDate: c.visitDate,
        dentistName: c.dentist?.fullName || 'Consulting Specialist',
        chiefComplaint: c.chiefComplaint,
        diagnosis: c.diagnosis,
        isFinalized: c.isFinalized,
      })),
      dentalChart: (patient.dentalChartEntries || []).map(e => ({
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
        legacySlNo: dto.legacySlNo !== undefined ? (dto.legacySlNo ? dto.legacySlNo.trim() : null) : undefined,
        guardianName: dto.guardianName !== undefined ? (dto.guardianName ? dto.guardianName.trim() : null) : undefined,
        occupation: dto.occupation !== undefined ? (dto.occupation ? dto.occupation.trim() : null) : undefined,
        legacyRegistrationDate: dto.legacyRegistrationDate !== undefined ? (dto.legacyRegistrationDate ? new Date(dto.legacyRegistrationDate) : null) : undefined,
        legacyChiefComplaint: dto.legacyChiefComplaint !== undefined ? dto.legacyChiefComplaint : undefined,
        legacyPastHistory: dto.legacyPastHistory !== undefined ? dto.legacyPastHistory : undefined,
        legacyTreatmentPlan: dto.legacyTreatmentPlan !== undefined ? dto.legacyTreatmentPlan : undefined,
        voiceNoteUrl: dto.voiceNoteUrl !== undefined ? dto.voiceNoteUrl : undefined,
        cardPhotoUrl: dto.cardPhotoUrl !== undefined ? dto.cardPhotoUrl : undefined,
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
      legacySlNo: p.legacySlNo,
      guardianName: p.guardianName,
      occupation: p.occupation,
      legacyRegistrationDate: p.legacyRegistrationDate,
      legacyChiefComplaint: p.legacyChiefComplaint,
      legacyPastHistory: p.legacyPastHistory,
      legacyTreatmentPlan: p.legacyTreatmentPlan,
      voiceNoteUrl: p.voiceNoteUrl,
      cardPhotoUrl: p.cardPhotoUrl,
      isArchived: p.isArchived,
      possibleDuplicate: p.possibleDuplicate,
      mergeSurvivingId: p.mergeSurvivingId,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }

  // Quick Archive Case Sheet Update (with audio note and card photo)
  async updateCaseSheet(clinicId: string, id: string, data: any, actor: any) {
    const existing = await this.prisma.patient.findFirst({ where: { id, clinicId } });
    if (!existing) throw new NotFoundException('Patient record not found');

    const updated = await this.prisma.patient.update({
      where: { id },
      data: {
        legacySlNo: data.legacySlNo !== undefined ? data.legacySlNo : existing.legacySlNo,
        guardianName: data.guardianName !== undefined ? data.guardianName : existing.guardianName,
        occupation: data.occupation !== undefined ? data.occupation : existing.occupation,
        legacyRegistrationDate: data.legacyRegistrationDate ? new Date(data.legacyRegistrationDate) : existing.legacyRegistrationDate,
        legacyChiefComplaint: data.legacyChiefComplaint !== undefined ? data.legacyChiefComplaint : existing.legacyChiefComplaint,
        legacyPastHistory: data.legacyPastHistory !== undefined ? data.legacyPastHistory : existing.legacyPastHistory,
        legacyTreatmentPlan: data.legacyTreatmentPlan !== undefined ? data.legacyTreatmentPlan : existing.legacyTreatmentPlan,
        voiceNoteUrl: data.voiceNoteUrl !== undefined ? data.voiceNoteUrl : existing.voiceNoteUrl,
        cardPhotoUrl: data.cardPhotoUrl !== undefined ? data.cardPhotoUrl : existing.cardPhotoUrl,
        notes: data.notes !== undefined ? data.notes : existing.notes,
      },
    });

    await this.auditService.log({
      clinicId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'CASE_SHEET_ARCHIVE_UPDATED',
      entityType: 'Patient',
      entityId: id,
      details: { legacySlNo: updated.legacySlNo, uhid: updated.uhid },
    });

    return this.formatPatient(updated);
  }

  // Mark patient as reappeared today and check-in to doctor desk immediately
  async checkInReappearance(clinicId: string, id: string, data: any, actor: any) {
    const patient = await this.prisma.patient.findFirst({ where: { id, clinicId } });
    if (!patient) throw new NotFoundException('Patient record not found');

    // Find default dentist or requested dentist
    let dentistId = data.dentistId;
    if (!dentistId) {
      const defaultDentist = await this.prisma.user.findFirst({
        where: { clinicId, role: { in: ['DENTIST', 'ADMIN'] } },
      });
      dentistId = defaultDentist?.id || actor.userId;
    }

    const chairNumber = Number(data.chairNumber) || 1;
    const now = new Date();
    const endTime = new Date(now.getTime() + 30 * 60000);

    const appointment = await this.prisma.appointment.create({
      data: {
        clinicId,
        patientId: id,
        dentistId,
        createdById: actor.userId,
        chairNumber,
        scheduledStart: now,
        scheduledEnd: endTime,
        durationMinutes: 30,
        reason: data.reason || `Archived Patient Return (Card Sl. No: ${patient.legacySlNo || 'N/A'})`,
        status: 'CHECKED_IN',
        checkInTime: now,
        isReappearance: true,
        legacySlNo: patient.legacySlNo || null,
        notes: data.notes || `Reappeared from physical archives on ${now.toISOString().split('T')[0]}`,
      },
      include: {
        patient: { select: { id: true, fullName: true, uhid: true, phone: true } },
        dentist: { select: { id: true, fullName: true } },
      },
    });

    await this.auditService.log({
      clinicId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'PATIENT_REAPPEARANCE_CHECKED_IN',
      entityType: 'Appointment',
      entityId: appointment.id,
      details: { patientId: id, uhid: patient.uhid, legacySlNo: patient.legacySlNo, chairNumber },
    });

    return appointment;
  }

  // Lookup existing patient records on a phone number for family selection
  async lookupByPhone(phone: string, clinicCode?: string) {
    const digits = phone.replace(/\D/g, '');
    const tail10 = digits.slice(-10);
    if (tail10.length !== 10) {
      return { exists: false, patients: [] };
    }

    const clinic = await this.prisma.clinic.findFirst({
      where: clinicCode ? { code: clinicCode.toUpperCase() } : {},
    });
    if (!clinic) return { exists: false, patients: [] };

    const patients = await this.prisma.patient.findMany({
      where: {
        clinicId: clinic.id,
        phone: { contains: tail10 },
        isArchived: false,
      },
      select: {
        id: true,
        uhid: true,
        fullName: true,
        relationToAccount: true,
        gender: true,
        age: true,
        dateOfBirth: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      exists: patients.length > 0,
      patients,
    };
  }

  // Find patients flagged as possible duplicates for reception desk review
  async getPossibleDuplicates(clinicId: string) {
    const flagged = await this.prisma.patient.findMany({
      where: {
        clinicId,
        isArchived: false,
        possibleDuplicate: true,
      },
      select: {
        id: true,
        uhid: true,
        fullName: true,
        phone: true,
        gender: true,
        age: true,
        createdAt: true,
        notes: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return flagged;
  }

  // Atomic patient merge tool: transfers all clinical and billing records to survivor
  async mergePatients(
    clinicId: string,
    survivorId: string,
    duplicateId: string,
    reason: string,
    actor: any,
  ) {
    if (survivorId === duplicateId) {
      throw new BadRequestException('Cannot merge a patient into themselves');
    }
    if (!reason || reason.trim().length < 5) {
      throw new BadRequestException('A reason of at least 5 characters is required for patient merge');
    }

    const survivor = await this.prisma.patient.findFirst({
      where: { id: survivorId, clinicId, isArchived: false },
    });
    const duplicate = await this.prisma.patient.findFirst({
      where: { id: duplicateId, clinicId, isArchived: false },
    });

    if (!survivor || !duplicate) {
      throw new NotFoundException('One or both patients could not be found');
    }

    const transferSummary = await this.prisma.$transaction(async (tx) => {
      const apptRes = await tx.appointment.updateMany({
        where: { patientId: duplicateId },
        data: { patientId: survivorId },
      });
      const consultRes = await tx.consultation.updateMany({
        where: { patientId: duplicateId },
        data: { patientId: survivorId },
      });
      const rxRes = await tx.prescription.updateMany({
        where: { patientId: duplicateId },
        data: { patientId: survivorId },
      });
      const invRes = await tx.invoice.updateMany({
        where: { patientId: duplicateId },
        data: { patientId: survivorId },
      });
      const payRes = await tx.payment.updateMany({
        where: { patientId: duplicateId },
        data: { patientId: survivorId },
      });
      const fileRes = await tx.medicalFile.updateMany({
        where: { patientId: duplicateId },
        data: { patientId: survivorId },
      });
      const chartRes = await tx.dentalChartEntry.updateMany({
        where: { patientId: duplicateId },
        data: { patientId: survivorId },
      });
      const planRes = await tx.treatmentPlan.updateMany({
        where: { patientId: duplicateId },
        data: { patientId: survivorId },
      });
      const procRes = await tx.completedProcedure.updateMany({
        where: { patientId: duplicateId },
        data: { patientId: survivorId },
      });
      const consentRes = await tx.patientConsent.updateMany({
        where: { patientId: duplicateId },
        data: { patientId: survivorId },
      });
      const labRes = await tx.labOrder.updateMany({
        where: { patientId: duplicateId },
        data: { patientId: survivorId },
      });
      const reminderRes = await tx.followUpReminder.updateMany({
        where: { patientId: duplicateId },
        data: { patientId: survivorId },
      });

      // Archive duplicate and set forward pointer
      await tx.patient.update({
        where: { id: duplicateId },
        data: {
          isArchived: true,
          possibleDuplicate: false,
          mergeSurvivingId: survivorId,
          mergedAt: new Date(),
          mergedById: actor.userId,
        },
      });

      return {
        appointments: apptRes.count,
        consultations: consultRes.count,
        prescriptions: rxRes.count,
        invoices: invRes.count,
        payments: payRes.count,
        medicalFiles: fileRes.count,
        dentalChartEntries: chartRes.count,
        treatmentPlans: planRes.count,
        completedProcedures: procRes.count,
        consents: consentRes.count,
        labOrders: labRes.count,
        reminders: reminderRes.count,
      };
    });

    // Comprehensive audit trail
    await this.auditService.log({
      clinicId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'PATIENT_RECORDS_MERGED',
      entityType: 'Patient',
      entityId: survivorId,
      details: {
        survivorUhid: survivor.uhid,
        survivorName: survivor.fullName,
        duplicateUhid: duplicate.uhid,
        duplicateName: duplicate.fullName,
        duplicateId,
        reason: reason.trim(),
        transferred: transferSummary,
      },
    });

    return {
      success: true,
      message: `Successfully merged records from ${duplicate.fullName} (${duplicate.uhid}) into ${survivor.fullName} (${survivor.uhid}).`,
      survivor: {
        id: survivor.id,
        uhid: survivor.uhid,
        fullName: survivor.fullName,
      },
      transferred: transferSummary,
    };
  }

  // Get all visits across family members under a patient account
  async getPortalVisits(accountId: string) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      include: {
        patients: {
          where: { isArchived: false },
          select: { id: true, fullName: true, uhid: true, relationToAccount: true },
        },
      },
    });
    if (!account) throw new NotFoundException('Account not found');

    const patientIds = account.patients.map(p => p.id);
    if (patientIds.length === 0) return [];

    const appointments = await this.prisma.appointment.findMany({
      where: {
        patientId: { in: patientIds },
      },
      include: {
        patient: {
          select: { id: true, fullName: true, uhid: true, relationToAccount: true },
        },
        dentist: {
          select: { id: true, fullName: true, designation: true },
        },
      },
      orderBy: { scheduledStart: 'desc' },
      take: 50,
    });

    return appointments.map(a => ({
      id: a.id,
      patientName: a.patient.fullName,
      patientUhid: a.patient.uhid,
      relation: a.patient.relationToAccount || 'SELF',
      dentistName: a.dentist?.fullName || 'Doctor on Duty',
      chairNumber: a.chairNumber,
      scheduledStart: a.scheduledStart,
      scheduledEnd: a.scheduledEnd,
      reason: a.reason,
      status: a.status,
      notes: a.notes,
    }));
  }
}