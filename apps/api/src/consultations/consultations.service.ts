import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateConsultationDto, AmendConsultationDto } from './consultation.dto';

@Injectable()
export class ConsultationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(clinicId: string, dto: CreateConsultationDto, actor: any) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, clinicId },
    });
    if (!patient) throw new NotFoundException('Patient record not found');

    const consultation = await this.prisma.consultation.create({
      data: {
        patientId: dto.patientId,
        dentistId: actor.userId,
        appointmentId: dto.appointmentId,
        chiefComplaint: dto.chiefComplaint.trim(),
        clinicalExamination: dto.clinicalExamination.trim(),
        diagnosis: dto.diagnosis.trim(),
        clinicalNotes: dto.clinicalNotes?.trim(),
        isFinalized: false,
      },
      include: {
        dentist: { select: { fullName: true } },
        patient: { select: { fullName: true, uhid: true } },
      },
    });

    // If linked to an appointment, transition appointment status to IN_CHAIR or COMPLETED
    if (dto.appointmentId) {
      await this.prisma.appointment.update({
        where: { id: dto.appointmentId },
        data: { status: 'IN_CHAIR' },
      });
    }

    await this.auditService.log({
      clinicId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'CONSULTATION_CREATED',
      entityType: 'Consultation',
      entityId: consultation.id,
      details: {
        patientUhid: consultation.patient.uhid,
        dentist: consultation.dentist.fullName,
        diagnosis: consultation.diagnosis,
      },
    });

    return consultation;
  }

  async findByPatient(clinicId: string, patientId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, clinicId },
    });
    if (!patient) throw new NotFoundException('Patient record not found');

    const records = await this.prisma.consultation.findMany({
      where: { patientId },
      orderBy: { visitDate: 'desc' },
      include: {
        dentist: { select: { fullName: true, specialization: true } },
        amendments: { orderBy: { amendedAt: 'desc' } },
        dentalChartEntries: true,
      },
    });

    return records;
  }

  async finalize(clinicId: string, id: string, actor: any) {
    const consult = await this.prisma.consultation.findUnique({
      where: { id },
      include: { patient: true },
    });

    if (!consult || consult.patient?.clinicId !== clinicId) {
      throw new NotFoundException('Consultation not found');
    }
    if (consult.isFinalized) throw new BadRequestException('Consultation is already finalized');

    const updated = await this.prisma.consultation.update({
      where: { id },
      data: {
        isFinalized: true,
        finalizedAt: new Date(),
      },
    });

    if (consult.appointmentId) {
      await this.prisma.appointment.update({
        where: { id: consult.appointmentId },
        data: { status: 'COMPLETED' },
      });
    }

    await this.auditService.log({
      clinicId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'CONSULTATION_FINALIZED',
      entityType: 'Consultation',
      entityId: id,
      details: { patientUhid: consult.patient.uhid, finalizedAt: updated.finalizedAt },
    });

    return updated;
  }

  async amend(clinicId: string, id: string, dto: AmendConsultationDto, actor: any) {
    const consult = await this.prisma.consultation.findUnique({
      where: { id },
      include: { patient: true },
    });

    if (!consult || consult.patient?.clinicId !== clinicId) {
      throw new NotFoundException('Consultation not found');
    }
    if (!consult.isFinalized) {
      throw new BadRequestException('Consultation is not finalized yet. Direct editing permitted.');
    }

    const previousContent = {
      chiefComplaint: consult.chiefComplaint,
      clinicalExamination: consult.clinicalExamination,
      diagnosis: consult.diagnosis,
      clinicalNotes: consult.clinicalNotes,
    };

    // Create amendment audit record
    await this.prisma.consultationAmendment.create({
      data: {
        consultationId: id,
        amendedById: actor.userId,
        reason: dto.reason,
        previousContent: JSON.stringify(previousContent),
        newContent: JSON.stringify(dto.newContent),
      },
    });

    // Apply amendments
    const updated = await this.prisma.consultation.update({
      where: { id },
      data: {
        chiefComplaint: dto.newContent.chiefComplaint ?? consult.chiefComplaint,
        clinicalExamination: dto.newContent.clinicalExamination ?? consult.clinicalExamination,
        diagnosis: dto.newContent.diagnosis ?? consult.diagnosis,
        clinicalNotes: dto.newContent.clinicalNotes ?? consult.clinicalNotes,
      },
    });

    await this.auditService.log({
      clinicId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'CONSULTATION_AMENDED',
      entityType: 'Consultation',
      entityId: id,
      details: { reason: dto.reason, patientUhid: consult.patient.uhid },
    });

    return updated;
  }
}