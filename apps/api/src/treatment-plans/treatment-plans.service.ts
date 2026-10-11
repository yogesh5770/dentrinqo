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
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, clinicId },
    });
    if (!patient) throw new NotFoundException('Patient record not found');

    const totalEstimatedPaise = dto.items.reduce((sum, item) => sum + (item.estimatedCostPaise || 0), 0);

    const plan = await this.prisma.treatmentPlan.create({
      data: {
        patientId: dto.patientId,
        consultationId: dto.consultationId || null,
        title: dto.title.trim(),
        status: 'PROPOSED',
        totalEstimatedPaise,
        dentistNotes: dto.dentistNotes?.trim() || null,
        items: {
          create: dto.items.map((item, index) => ({
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
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'TREATMENT_PLAN_CREATED',
      entityType: 'TreatmentPlan',
      entityId: plan.id,
      details: {
        patientUhid: patient.uhid,
        title: plan.title,
        itemCount: plan.items.length,
        totalEstimatedPaise,
      },
    });

    return plan;
  }

  async findByPatient(clinicId: string, patientId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, clinicId },
    });
    if (!patient) throw new NotFoundException('Patient record not found');

    return this.prisma.treatmentPlan.findMany({
      where: { patientId },
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
  }

  async updateStatus(clinicId: string, id: string, dto: UpdateTreatmentPlanStatusDto, actor: any) {
    const plan = await this.prisma.treatmentPlan.findUnique({
      where: { id },
      include: { patient: true },
    });
    if (!plan || plan.patient.clinicId !== clinicId) {
      throw new NotFoundException('Treatment plan not found');
    }

    const updated = await this.prisma.treatmentPlan.update({
      where: { id },
      data: { status: dto.status as any },
      include: { items: true },
    });

    await this.auditService.log({
      clinicId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'TREATMENT_PLAN_STATUS_UPDATED',
      entityType: 'TreatmentPlan',
      entityId: id,
      details: {
        patientUhid: plan.patient.uhid,
        previousStatus: plan.status,
        newStatus: dto.status,
      },
    });

    return updated;
  }

  async addItem(clinicId: string, planId: string, dto: AddTreatmentPlanItemDto, actor: any) {
    const plan = await this.prisma.treatmentPlan.findUnique({
      where: { id: planId },
      include: { patient: true, items: true },
    });
    if (!plan || plan.patient.clinicId !== clinicId) {
      throw new NotFoundException('Treatment plan not found');
    }

    const nextSeq = dto.sequenceOrder || plan.items.length + 1;
    const item = await this.prisma.treatmentPlanItem.create({
      data: {
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
    const allItems = await this.prisma.treatmentPlanItem.findMany({
      where: { treatmentPlanId: planId },
    });
    const totalEstimatedPaise = allItems.reduce((sum, it) => sum + (it.estimatedCostPaise || 0), 0);
    await this.prisma.treatmentPlan.update({
      where: { id: planId },
      data: { totalEstimatedPaise },
    });

    await this.auditService.log({
      clinicId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'TREATMENT_PLAN_ITEM_ADDED',
      entityType: 'TreatmentPlanItem',
      entityId: item.id,
      details: {
        planId,
        procedureName: item.procedureName,
        toothNumber: item.toothNumber,
        estimatedCostPaise: item.estimatedCostPaise,
      },
    });

    return item;
  }

  async updateItem(clinicId: string, itemId: string, dto: UpdateTreatmentPlanItemDto, actor: any) {
    const item = await this.prisma.treatmentPlanItem.findUnique({
      where: { id: itemId },
      include: { treatmentPlan: { include: { patient: true } } },
    });
    if (!item || item.treatmentPlan.patient.clinicId !== clinicId) {
      throw new NotFoundException('Treatment plan item not found');
    }

    const updateData: any = {};
    if (dto.toothNumber !== undefined) updateData.toothNumber = dto.toothNumber || null;
    if (dto.procedureName !== undefined) updateData.procedureName = dto.procedureName.trim();
    if (dto.estimatedCostPaise !== undefined) {
      updateData.estimatedCostPaise = Math.max(0, Math.round(dto.estimatedCostPaise));
    }
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.notes !== undefined) updateData.notes = dto.notes?.trim() || null;

    const updatedItem = await this.prisma.treatmentPlanItem.update({
      where: { id: itemId },
      data: updateData,
    });

    // Recalculate plan total
    const allItems = await this.prisma.treatmentPlanItem.findMany({
      where: { treatmentPlanId: item.treatmentPlanId },
    });
    const totalEstimatedPaise = allItems.reduce((sum, it) => sum + (it.estimatedCostPaise || 0), 0);
    await this.prisma.treatmentPlan.update({
      where: { id: item.treatmentPlanId },
      data: { totalEstimatedPaise },
    });

    await this.auditService.log({
      clinicId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'TREATMENT_PLAN_ITEM_UPDATED',
      entityType: 'TreatmentPlanItem',
      entityId: itemId,
      details: {
        previousFeePaise: item.estimatedCostPaise,
        newFeePaise: updatedItem.estimatedCostPaise,
        status: updatedItem.status,
      },
    });

    return updatedItem;
  }

  async deleteItem(clinicId: string, itemId: string, actor: any) {
    const item = await this.prisma.treatmentPlanItem.findUnique({
      where: { id: itemId },
      include: { treatmentPlan: { include: { patient: true } }, completedProcedure: true },
    });
    if (!item || item.treatmentPlan.patient.clinicId !== clinicId) {
      throw new NotFoundException('Treatment plan item not found');
    }
    if (item.completedProcedure) {
      throw new BadRequestException('Cannot delete an item that already has completed procedure records');
    }

    await this.prisma.treatmentPlanItem.delete({
      where: { id: itemId },
    });

    // Recalculate plan total
    const allItems = await this.prisma.treatmentPlanItem.findMany({
      where: { treatmentPlanId: item.treatmentPlanId },
    });
    const totalEstimatedPaise = allItems.reduce((sum, it) => sum + (it.estimatedCostPaise || 0), 0);
    await this.prisma.treatmentPlan.update({
      where: { id: item.treatmentPlanId },
      data: { totalEstimatedPaise },
    });

    await this.auditService.log({
      clinicId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'TREATMENT_PLAN_ITEM_DELETED',
      entityType: 'TreatmentPlanItem',
      entityId: itemId,
      details: {
        planId: item.treatmentPlanId,
        procedureName: item.procedureName,
      },
    });

    return { success: true, message: 'Treatment plan item deleted' };
  }
}
