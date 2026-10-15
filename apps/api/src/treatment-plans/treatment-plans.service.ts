import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateTreatmentPlanDto, UpdateTreatmentPlanStatusDto, AddTreatmentPlanItemDto, UpdateTreatmentPlanItemDto } from './treatment-plan.dto';

@Injectable()
export class TreatmentPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(clinicId: string, dto: CreateTreatmentPlanDto, actor: any) {
    return this.prisma.forTenant(clinicId, async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: dto.patientId, clinicId },
      });
      if (!patient) throw new NotFoundException('Patient record not found');

      const totalEstimatedPaise = dto.items.reduce((sum, item) => sum + (item.estimatedCostPaise || 0), 0);

      const plan = await tx.treatmentPlan.create({
        data: {
          clinicId,
          patientId: dto.patientId,
          consultationId: dto.consultationId || null,
          title: dto.title.trim(),
          status: 'PROPOSED',
          totalEstimatedPaise,
          dentistNotes: dto.dentistNotes?.trim() || null,
          items: {
            create: dto.items.map((item, index) => ({
              clinicId,
              toothNumber: item.toothNumber || null,
              procedureCode: item.procedureCode,
              procedureName: item.procedureName,
              estimatedCostPaise: item.estimatedCostPaise,
              sequenceOrder: item.sequenceOrder || index + 1,
              notes: item.notes?.trim() || null,
              status: 'PLANNED',
            })),
          },
        },
        include: {
          items: {
            orderBy: { sequenceOrder: 'asc' },
          },
        },
      });

      await this.auditService.log({
        clinicId,
        actorId: actor.userId || actor.id,
        actorRole: actor.role || 'DENTIST',
        action: 'TREATMENT_PLAN_CREATED',
        entityType: 'TreatmentPlan',
        entityId: plan.id,
        details: {
          patientUhid: patient.uhid,
          title: plan.title,
          itemCount: plan.items.length,
          totalEstimatedPaise,
        },
      }, tx);

      return plan;
    });
  }

  async findByPatient(clinicId: string, patientId: string) {
    return this.prisma.forTenant(clinicId, async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: patientId, clinicId },
      });
      if (!patient) throw new NotFoundException('Patient record not found');

      return tx.treatmentPlan.findMany({
        where: { patientId, clinicId },
        include: {
          items: {
            orderBy: { sequenceOrder: 'asc' },
            include: {
              completedProcedure: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  async updateStatus(clinicId: string, id: string, dto: UpdateTreatmentPlanStatusDto, actor: any) {
    return this.prisma.forTenant(clinicId, async (tx) => {
      const plan = await tx.treatmentPlan.findUnique({
        where: { id },
        include: { patient: true },
      });
      if (!plan || plan.clinicId !== clinicId) {
        throw new NotFoundException('Treatment plan not found');
      }

      if (dto.status === 'COMPLETED') {
        const items = await tx.treatmentPlanItem.findMany({
          where: { treatmentPlanId: id },
        });
        const hasUnperformed = items.length === 0 || items.some(it => it.status !== 'COMPLETED' && it.status !== 'CANCELLED');
        if (hasUnperformed) {
          throw new BadRequestException('Cannot mark treatment plan COMPLETED while procedures remain planned or unperformed');
        }
      }

      const updated = await tx.treatmentPlan.update({
        where: { id },
        data: { status: dto.status as any },
        include: { items: true },
      });

      await this.auditService.log({
        clinicId,
        actorId: actor.userId || actor.id,
        actorRole: actor.role || 'DENTIST',
        action: 'TREATMENT_PLAN_STATUS_UPDATED',
        entityType: 'TreatmentPlan',
        entityId: id,
        details: {
          patientUhid: plan.patient?.uhid,
          previousStatus: plan.status,
          newStatus: dto.status,
        },
      }, tx);

      return updated;
    });
  }

  async addItem(clinicId: string, planId: string, dto: AddTreatmentPlanItemDto, actor: any) {
    return this.prisma.forTenant(clinicId, async (tx) => {
      const plan = await tx.treatmentPlan.findUnique({
        where: { id: planId },
        include: { patient: true, items: true },
      });
      if (!plan || plan.clinicId !== clinicId) {
        throw new NotFoundException('Treatment plan not found');
      }

      const nextSeq = dto.sequenceOrder || plan.items.length + 1;
      const item = await tx.treatmentPlanItem.create({
        data: {
          clinicId,
          treatmentPlanId: planId,
          toothNumber: dto.toothNumber || null,
          procedureCode: dto.procedureCode,
          procedureName: dto.procedureName,
          estimatedCostPaise: Math.max(0, Math.round(dto.estimatedCostPaise || 0)),
          sequenceOrder: nextSeq,
          notes: dto.notes?.trim() || null,
          status: 'PLANNED',
        },
      });

      // Recalculate plan total
      const allItems = await tx.treatmentPlanItem.findMany({
        where: { treatmentPlanId: planId },
      });
      const totalEstimatedPaise = allItems.reduce((sum, it) => sum + (it.estimatedCostPaise || 0), 0);
      await tx.treatmentPlan.update({
        where: { id: planId },
        data: { totalEstimatedPaise },
      });

      await this.auditService.log({
        clinicId,
        actorId: actor.userId || actor.id,
        actorRole: actor.role || 'DENTIST',
        action: 'TREATMENT_PLAN_ITEM_ADDED',
        entityType: 'TreatmentPlanItem',
        entityId: item.id,
        details: {
          planId,
          procedureName: item.procedureName,
          toothNumber: item.toothNumber,
          estimatedCostPaise: item.estimatedCostPaise,
        },
      }, tx);

      return item;
    });
  }

  async updateItem(clinicId: string, itemId: string, dto: UpdateTreatmentPlanItemDto, actor: any) {
    return this.prisma.forTenant(clinicId, async (tx) => {
      const item = await tx.treatmentPlanItem.findUnique({
        where: { id: itemId },
        include: { treatmentPlan: { include: { patient: true } }, completedProcedure: true },
      });
      if (!item || item.clinicId !== clinicId) {
        throw new NotFoundException('Treatment plan item not found');
      }

      if (item.completedProcedure) {
        if (dto.procedureName || dto.toothNumber !== undefined || (dto.status && dto.status !== item.status)) {
          throw new BadRequestException('Cannot modify clinical procedure, tooth, or status of an item that has already been performed in the chair');
        }
      }

      if (dto.status === 'COMPLETED' && !item.completedProcedure) {
        throw new BadRequestException('A treatment plan item can only be marked COMPLETED by recording the completed clinical procedure.');
      }

      const updateData: any = {};
      if (dto.toothNumber !== undefined) updateData.toothNumber = dto.toothNumber || null;
      if (dto.procedureName !== undefined) updateData.procedureName = dto.procedureName.trim();
      if (dto.estimatedCostPaise !== undefined) {
        updateData.estimatedCostPaise = Math.max(0, Math.round(dto.estimatedCostPaise));
      }
      if (dto.status !== undefined) updateData.status = dto.status;
      if (dto.notes !== undefined) updateData.notes = dto.notes?.trim() || null;

      const updatedItem = await tx.treatmentPlanItem.update({
        where: { id: itemId },
        data: updateData,
      });

      // Recalculate plan total
      const allItems = await tx.treatmentPlanItem.findMany({
        where: { treatmentPlanId: item.treatmentPlanId },
      });
      const totalEstimatedPaise = allItems.reduce((sum, it) => sum + (it.estimatedCostPaise || 0), 0);
      await tx.treatmentPlan.update({
        where: { id: item.treatmentPlanId },
        data: { totalEstimatedPaise },
      });

      await this.auditService.log({
        clinicId,
        actorId: actor.userId || actor.id,
        actorRole: actor.role || 'DENTIST',
        action: 'TREATMENT_PLAN_ITEM_UPDATED',
        entityType: 'TreatmentPlanItem',
        entityId: itemId,
        details: {
          previousFeePaise: item.estimatedCostPaise,
          newFeePaise: updatedItem.estimatedCostPaise,
          status: updatedItem.status,
        },
      }, tx);

      return updatedItem;
    });
  }

  async deleteItem(clinicId: string, itemId: string, actor: any) {
    return this.prisma.forTenant(clinicId, async (tx) => {
      const item = await tx.treatmentPlanItem.findUnique({
        where: { id: itemId },
        include: { treatmentPlan: { include: { patient: true } }, completedProcedure: true },
      });
      if (!item || item.clinicId !== clinicId) {
        throw new NotFoundException('Treatment plan item not found');
      }
      if (item.completedProcedure) {
        throw new BadRequestException('Cannot delete an item that already has completed procedure records');
      }

      await tx.treatmentPlanItem.delete({
        where: { id: itemId },
      });

      // Recalculate plan total
      const allItems = await tx.treatmentPlanItem.findMany({
        where: { treatmentPlanId: item.treatmentPlanId },
      });
      const totalEstimatedPaise = allItems.reduce((sum, it) => sum + (it.estimatedCostPaise || 0), 0);
      await tx.treatmentPlan.update({
        where: { id: item.treatmentPlanId },
        data: { totalEstimatedPaise },
      });

      await this.auditService.log({
        clinicId,
        actorId: actor.userId || actor.id,
        actorRole: actor.role || 'DENTIST',
        action: 'TREATMENT_PLAN_ITEM_DELETED',
        entityType: 'TreatmentPlanItem',
        entityId: itemId,
        details: {
          planId: item.treatmentPlanId,
          procedureName: item.procedureName,
        },
      }, tx);

      return { success: true, message: 'Treatment plan item deleted' };
    });
  }
}
