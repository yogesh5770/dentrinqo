import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RecordToothConditionDto } from './dental-chart.dto';

@Injectable()
export class DentalChartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getPatientChart(clinicId: string, patientId: string) {
    return this.prisma.forTenant(clinicId, async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: patientId, clinicId },
      });
      if (!patient) throw new NotFoundException('Patient record not found');

      const entries = await tx.dentalChartEntry.findMany({
        where: { patientId, clinicId },
        orderBy: [{ toothNumber: 'asc' }, { createdAt: 'desc' }],
      });

      return entries;
    });
  }

  async recordCondition(clinicId: string, dto: RecordToothConditionDto, actor: any) {
    return this.prisma.forTenant(clinicId, async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: dto.patientId, clinicId },
      });
      if (!patient) throw new NotFoundException('Patient record not found');

      // If condition is HEALTHY, remove existing pathology on that tooth & surface
      if (dto.condition === 'HEALTHY') {
        const existing = await tx.dentalChartEntry.findMany({
          where: {
            clinicId,
            patientId: dto.patientId,
            toothNumber: dto.toothNumber,
            surface: dto.surface as any,
          },
        });

        if (existing.length > 0) {
          await tx.dentalChartEntry.deleteMany({
            where: {
              clinicId,
              patientId: dto.patientId,
              toothNumber: dto.toothNumber,
              surface: dto.surface as any,
            },
          });
        }

        await this.auditService.log({
          clinicId,
          actorId: actor.userId || actor.id,
          actorRole: actor.role || 'DENTIST',
          action: 'DENTAL_CHART_CLEARED_HEALTHY',
          entityType: 'DentalChartEntry',
          entityId: `${dto.toothNumber}-${dto.surface}`,
          details: { patientUhid: patient.uhid, tooth: dto.toothNumber, surface: dto.surface },
        }, tx);

        return { message: 'Marked healthy / condition cleared', toothNumber: dto.toothNumber, surface: dto.surface };
      }

      // Check if an existing entry exists for the same tooth and surface
      const existingEntry = await tx.dentalChartEntry.findFirst({
        where: {
          clinicId,
          patientId: dto.patientId,
          toothNumber: dto.toothNumber,
          surface: dto.surface as any,
        },
      });

      let entry;
      if (existingEntry) {
        entry = await tx.dentalChartEntry.update({
          where: { id: existingEntry.id },
          data: {
            condition: dto.condition as any,
            notes: dto.notes?.trim() || null,
            consultationId: dto.consultationId || null,
            recordedById: actor.userId || actor.id,
          },
        });
      } else {
        entry = await tx.dentalChartEntry.create({
          data: {
            clinicId,
            patientId: dto.patientId,
            toothNumber: dto.toothNumber,
            surface: dto.surface as any,
            condition: dto.condition as any,
            notes: dto.notes?.trim() || null,
            consultationId: dto.consultationId || null,
            recordedById: actor.userId || actor.id,
          },
        });
      }

      await this.auditService.log({
        clinicId,
        actorId: actor.userId || actor.id,
        actorRole: actor.role || 'DENTIST',
        action: 'DENTAL_CHART_RECORDED',
        entityType: 'DentalChartEntry',
        entityId: entry.id,
        details: {
          patientUhid: patient.uhid,
          tooth: dto.toothNumber,
          surface: dto.surface,
          condition: dto.condition,
        },
      }, tx);

      return entry;
    });
  }

  async removeEntry(clinicId: string, entryId: string, actor: any) {
    return this.prisma.forTenant(clinicId, async (tx) => {
      const entry = await tx.dentalChartEntry.findUnique({
        where: { id: entryId },
        include: { patient: true },
      });
      if (!entry || entry.clinicId !== clinicId) {
        throw new NotFoundException('Chart entry not found');
      }

      await tx.dentalChartEntry.delete({
        where: { id: entryId },
      });

      await this.auditService.log({
        clinicId,
        actorId: actor.userId || actor.id,
        actorRole: actor.role || 'DENTIST',
        action: 'DENTAL_CHART_DELETED',
        entityType: 'DentalChartEntry',
        entityId: entryId,
        details: {
          patientUhid: entry.patient?.uhid,
          tooth: entry.toothNumber,
          surface: entry.surface,
        },
      }, tx);

      return { message: 'Chart entry removed successfully' };
    });
  }
}
