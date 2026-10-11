import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateCatalogueItemDto, RecordCompletedProcedureDto, UpdateCatalogueItemDto } from './procedure.dto';

export interface ProcedureCatalogueItem {
  id?: string;
  code: string;
  name: string;
  category: string;
  standardFeePaise: number;
  description?: string | null;
  isActive?: boolean;
}

@Injectable()
export class ProceduresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getCatalogue(clinicId?: string, includeInactive = false): Promise<any[]> {
    if (!clinicId) {
      return [];
    }

    try {
      const items = await (this.prisma as any).treatmentCatalogItem.findMany({
        where: {
          clinicId,
          ...(includeInactive ? {} : { isActive: true }),
        },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      });

      return items || [];
    } catch (err) {
      return [];
    }
  }

  async createCatalogueItem(clinicId: string, dto: CreateCatalogueItemDto, actor: any) {
    const rawCode = (dto.code?.trim() || dto.name.trim())
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '_')
      .slice(0, 32);

    let code = rawCode;
    const existing = await (this.prisma as any).treatmentCatalogItem.findFirst({
      where: { clinicId, code },
    });
    if (existing) {
      code = `${rawCode}_${Date.now().toString().slice(-4)}`;
    }

    const item = await (this.prisma as any).treatmentCatalogItem.create({
      data: {
        clinicId,
        code,
        name: dto.name.trim(),
        category: dto.category?.trim() || 'General',
        standardFeePaise: Math.max(0, Math.round(Number(dto.standardFeePaise) || 0)),
        description: dto.description?.trim() || null,
        isActive: true,
      },
    });

    await this.auditService.log({
      clinicId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'TREATMENT_CATALOGUE_CREATED',
      entityType: 'TreatmentCatalogItem',
      entityId: item.id,
      details: {
        code: item.code,
        name: item.name,
        category: item.category,
        feePaise: item.standardFeePaise,
      },
    });

    return item;
  }

  async updateCatalogueItem(clinicId: string, id: string, dto: UpdateCatalogueItemDto, actor: any) {
    const existing = await (this.prisma as any).treatmentCatalogItem.findFirst({
      where: { id, clinicId },
    });
    if (!existing) throw new NotFoundException('Treatment procedure not found in catalog');

    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name.trim();
    if (dto.category !== undefined) updateData.category = dto.category.trim();
    if (dto.standardFeePaise !== undefined) {
      updateData.standardFeePaise = Math.max(0, Math.round(Number(dto.standardFeePaise)));
    }
    if (dto.description !== undefined) updateData.description = dto.description?.trim() || null;
    if (dto.isActive !== undefined) updateData.isActive = Boolean(dto.isActive);

    const updated = await (this.prisma as any).treatmentCatalogItem.update({
      where: { id },
      data: updateData,
    });

    await this.auditService.log({
      clinicId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'TREATMENT_CATALOGUE_UPDATED',
      entityType: 'TreatmentCatalogItem',
      entityId: updated.id,
      details: {
        code: updated.code,
        name: updated.name,
        previousFeePaise: existing.standardFeePaise,
        newFeePaise: updated.standardFeePaise,
        isActive: updated.isActive,
      },
    });

    return updated;
  }

  async deleteCatalogueItem(clinicId: string, id: string, actor: any) {
    const existing = await (this.prisma as any).treatmentCatalogItem.findFirst({
      where: { id, clinicId },
    });
    if (!existing) throw new NotFoundException('Treatment procedure not found');

    const deactivated = await (this.prisma as any).treatmentCatalogItem.update({
      where: { id },
      data: { isActive: false },
    });

    await this.auditService.log({
      clinicId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'TREATMENT_CATALOGUE_DEACTIVATED',
      entityType: 'TreatmentCatalogItem',
      entityId: deactivated.id,
      details: { code: deactivated.code, name: deactivated.name },
    });

    return { success: true, message: 'Treatment procedure deactivated from catalog' };
  }


  async recordCompleted(clinicId: string, dto: RecordCompletedProcedureDto, actor: any) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, clinicId },
    });
    if (!patient) throw new NotFoundException('Patient record not found');

    // Prevent duplicate completion of the same treatment plan item
    if (dto.treatmentPlanItemId) {
      const existingPlanProc = await this.prisma.completedProcedure.findFirst({
        where: { treatmentPlanItemId: dto.treatmentPlanItemId },
        include: { dentist: { select: { fullName: true } } },
      });
      if (existingPlanProc) {
        return existingPlanProc;
      }
    }

    // 5-second rapid double-click duplicate procedure prevention
    const recentProc = await this.prisma.completedProcedure.findFirst({
      where: {
        patientId: dto.patientId,
        procedureCode: dto.procedureCode,
        toothNumber: dto.toothNumber || null,
        createdAt: { gte: new Date(Date.now() - 5000) },
      },
      include: { dentist: { select: { fullName: true } } },
    });
    if (recentProc) {
      return recentProc;
    }

    const procedure = await this.prisma.completedProcedure.create({
      data: {
        patientId: dto.patientId,
        consultationId: dto.consultationId || null,
        treatmentPlanItemId: dto.treatmentPlanItemId || null,
        dentistId: actor.userId,
        toothNumber: dto.toothNumber || null,
        procedureCode: dto.procedureCode,
        procedureName: dto.procedureName,
        notes: dto.notes?.trim() || null,
        performedAt: dto.performedAt ? new Date(dto.performedAt) : new Date(),
        isBilled: false,
      },
      include: {
        dentist: { select: { fullName: true } },
      },
    });

    // If associated with a treatment plan item, mark item as completed
    if (dto.treatmentPlanItemId) {
      await this.prisma.treatmentPlanItem.update({
        where: { id: dto.treatmentPlanItemId },
        data: { status: 'COMPLETED' },
      });
    }

    // Auto-schedule clinical recall or post-op follow-up based on procedure type
    try {
      const lowerName = procedure.procedureName.toLowerCase();
      let followUpDays = 0;
      let followUpType = 'GENERAL';
      let followUpNotes = '';

      if (lowerName.includes('scaling') || lowerName.includes('prophylaxis') || lowerName.includes('cleaning')) {
        followUpDays = 180; // 6 months routine recall
        followUpType = 'RECALL';
        followUpNotes = `6-Month Routine Oral Prophylaxis & Scaling Recall (Follows ${procedure.procedureName})`;
      } else if (lowerName.includes('extraction') || lowerName.includes('surgical') || lowerName.includes('implant')) {
        followUpDays = 7; // 7 days post-op
        followUpType = 'POST_OP';
        followUpNotes = `Suture removal & surgical wound healing assessment (${procedure.procedureName}${procedure.toothNumber ? `, Tooth #${procedure.toothNumber}` : ''})`;
      } else if (lowerName.includes('root canal') || lowerName.includes('rct') || lowerName.includes('obturation') || lowerName.includes('pulp')) {
        followUpDays = 10; // 10 days post-RCT
        followUpType = 'POST_OP';
        followUpNotes = `Post-obturation evaluation & crown preparation appointment (${procedure.procedureName}${procedure.toothNumber ? `, Tooth #${procedure.toothNumber}` : ''})`;
      } else if (lowerName.includes('crown') || lowerName.includes('bridge') || lowerName.includes('denture') || lowerName.includes('prosthesis')) {
        followUpDays = 14; // 2 weeks check
        followUpType = 'PROSTHESIS';
        followUpNotes = `Prosthesis occlusion, retention, and bite evaluation (${procedure.procedureName}${procedure.toothNumber ? `, Tooth #${procedure.toothNumber}` : ''})`;
      } else if (lowerName.includes('ortho') || lowerName.includes('braces') || lowerName.includes('aligner') || lowerName.includes('archwire')) {
        followUpDays = 30; // 1 month ortho check
        followUpType = 'ORTHO';
        followUpNotes = `Monthly orthodontic adjustment & archwire ligation (${procedure.procedureName})`;
      }

      if (followUpDays > 0) {
        const scheduledDate = new Date();
        scheduledDate.setDate(scheduledDate.getDate() + followUpDays);
        await this.prisma.followUpReminder.create({
          data: {
            patientId: dto.patientId,
            scheduledDate,
            type: followUpType,
            status: 'PENDING',
            reminderSent: false,
            notes: followUpNotes,
          },
        });
      }
    } catch (err) {
      // Non-blocking auto recall
    }

    await this.auditService.log({
      clinicId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'PROCEDURE_COMPLETED_RECORDED',
      entityType: 'CompletedProcedure',
      entityId: procedure.id,
      details: {
        patientUhid: patient.uhid,
        procedureName: procedure.procedureName,
        tooth: procedure.toothNumber,
        dentist: procedure.dentist.fullName,
      },
    });

    return procedure;
  }

  async findByPatient(clinicId: string, patientId: string, unbilledOnly = false) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, clinicId },
    });
    if (!patient) throw new NotFoundException('Patient record not found');

    const whereClause: any = { patientId };
    if (unbilledOnly) {
      whereClause.isBilled = false;
    }

    return this.prisma.completedProcedure.findMany({
      where: whereClause,
      include: {
        dentist: { select: { fullName: true } },
        treatmentPlanItem: true,
        invoiceItem: {
          include: {
            invoice: { select: { invoiceNumber: true, status: true } },
          },
        },
      },
      orderBy: { performedAt: 'desc' },
    });
  }
}
