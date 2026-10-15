import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
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
    return this.prisma.forTenant(clinicId, async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: dto.patientId, clinicId },
      });
      if (!patient) throw new NotFoundException('Patient record not found');

      // If linked to an appointment, check if draft already exists
      if (dto.appointmentId) {
        const existing = await tx.consultation.findUnique({
          where: { appointmentId: dto.appointmentId },
          include: {
            dentist: { select: { fullName: true } },
            patient: { select: { fullName: true, uhid: true } },
          },
        });

        if (existing) {
          if (existing.isFinalized) {
            throw new BadRequestException('Consultation record is already finalized. Please submit an amendment instead.');
          }

          const updated = await tx.consultation.update({
            where: { id: existing.id },
            data: {
              chiefComplaint: dto.chiefComplaint.trim(),
              clinicalExamination: dto.clinicalExamination.trim(),
              diagnosis: dto.diagnosis.trim(),
              clinicalNotes: dto.clinicalNotes?.trim() || null,
            },
            include: {
              dentist: { select: { fullName: true } },
              patient: { select: { fullName: true, uhid: true } },
            },
          });

          await this.auditService.log({
            clinicId,
            actorId: actor.userId || actor.id,
            actorRole: actor.role || 'DENTIST',
            action: 'CONSULTATION_UPDATED',
            entityType: 'Consultation',
            entityId: updated.id,
            details: {
              patientUhid: updated.patient.uhid,
              dentist: updated.dentist.fullName,
              diagnosis: updated.diagnosis,
            },
          }, tx);

          return updated;
        }
      }

      const consultation = await tx.consultation.create({
        data: {
          clinicId,
          patientId: dto.patientId,
          dentistId: actor.userId || actor.id,
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

      // If linked to an appointment, transition appointment status to IN_CHAIR
      if (dto.appointmentId) {
        await tx.appointment.update({
          where: { id: dto.appointmentId },
          data: { status: 'IN_CHAIR' },
        });
      }

      await this.auditService.log({
        clinicId,
        actorId: actor.userId || actor.id,
        actorRole: actor.role || 'DENTIST',
        action: 'CONSULTATION_CREATED',
        entityType: 'Consultation',
        entityId: consultation.id,
        details: {
          patientUhid: consultation.patient.uhid,
          dentist: consultation.dentist.fullName,
          diagnosis: consultation.diagnosis,
        },
      }, tx);

      return consultation;
    });
  }

  async findByPatient(clinicId: string, patientId: string) {
    return this.prisma.forTenant(clinicId, async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: patientId, clinicId },
      });
      if (!patient) throw new NotFoundException('Patient record not found');

      const records = await tx.consultation.findMany({
        where: { patientId, clinicId },
        orderBy: { visitDate: 'desc' },
        include: {
          dentist: { select: { fullName: true, specialization: true } },
          amendments: { orderBy: { amendedAt: 'desc' } },
          dentalChartEntries: true,
        },
      });

      return records;
    });
  }

  async finalize(clinicId: string, id: string, actor: any) {
    return this.prisma.forTenant(clinicId, async (tx) => {
      const consult = await tx.consultation.findUnique({
        where: { id },
        include: { patient: true },
      });

      if (!consult || consult.clinicId !== clinicId) {
        throw new NotFoundException('Consultation not found');
      }
      if (consult.isFinalized) throw new BadRequestException('Consultation is already finalized');

      const updated = await tx.consultation.update({
        where: { id },
        data: {
          isFinalized: true,
          finalizedAt: new Date(),
        },
      });

      if (consult.appointmentId) {
        await tx.appointment.update({
          where: { id: consult.appointmentId },
          data: { status: 'COMPLETED' },
        });
      }

      await this.auditService.log({
        clinicId,
        actorId: actor.userId || actor.id,
        actorRole: actor.role || 'DENTIST',
        action: 'CONSULTATION_FINALIZED',
        entityType: 'Consultation',
        entityId: id,
        details: { patientUhid: consult.patient?.uhid, finalizedAt: updated.finalizedAt },
      }, tx);

      return updated;
    });
  }

  async amend(clinicId: string, id: string, dto: AmendConsultationDto, actor: any) {
    return this.prisma.forTenant(clinicId, async (tx) => {
      const consult = await tx.consultation.findUnique({
        where: { id },
        include: { patient: true },
      });

      if (!consult || consult.clinicId !== clinicId) {
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
      await tx.consultationAmendment.create({
        data: {
          clinicId,
          consultationId: id,
          amendedById: actor.userId || actor.id,
          reason: dto.reason,
          previousContent: JSON.stringify(previousContent),
          newContent: JSON.stringify(dto.newContent),
        },
      });

      // Apply amendments
      const updated = await tx.consultation.update({
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
        actorId: actor.userId || actor.id,
        actorRole: actor.role || 'DENTIST',
        action: 'CONSULTATION_AMENDED',
        entityType: 'Consultation',
        entityId: id,
        details: { reason: dto.reason, patientUhid: consult.patient?.uhid },
      }, tx);

      return updated;
    });
  }
}