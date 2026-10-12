import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateFollowUpDto, UpdateFollowUpDto } from './follow-ups.dto';

@Injectable()
export class FollowUpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getFollowUps(clinicId: string, status?: string) {
    return this.prisma.forTenant(clinicId, async (tx) => {
      const where: any = { clinicId };

      if (status && status !== 'ALL') {
        where.status = status;
      }

      const items = await tx.followUpReminder.findMany({
        where,
        include: {
          patient: {
            select: {
              id: true,
              fullName: true,
              uhid: true,
              phone: true,
            },
          },
          appointment: {
            select: {
              id: true,
              reason: true,
              scheduledStart: true,
              chairNumber: true,
            },
          },
        },
        orderBy: {
          scheduledDate: 'asc',
        },
      });

      return items;
    });
  }

  async getRecallCampaigns(clinicId: string) {
    return this.prisma.forTenant(clinicId, async (tx) => {
      const clinic = await tx.clinic.findUnique({ where: { id: clinicId } });
      const clinicName = clinic?.name || 'our dental clinic';
      const now = new Date();

      // 1. Pending treatment plan dropouts
      const treatmentDropouts = await tx.treatmentPlan.findMany({
        where: {
          clinicId,
          status: { in: ['PROPOSED', 'IN_PROGRESS'] },
          items: { some: { status: 'PLANNED' } },
        },
        include: {
          patient: { select: { id: true, fullName: true, uhid: true, phone: true } },
          items: true,
        },
        take: 30,
      });

      const dropoutsList = treatmentDropouts.map(plan => {
        const remainingItems = plan.items.filter(i => i.status === 'PLANNED');
        const unbilledValue = remainingItems.reduce((acc, i) => acc + (i.estimatedCostPaise || 0), 0);
        return {
          id: plan.id,
          patientId: plan.patient.id,
          patientName: plan.patient.fullName,
          uhid: plan.patient.uhid,
          phone: plan.patient.phone,
          type: 'TREATMENT_DROPOUT',
          title: plan.title,
          pendingProcedures: remainingItems.map(i => i.procedureName).join(', '),
          potentialRevenuePaise: unbilledValue,
          whatsappText: `Dear ${plan.patient.fullName}, this is from ${clinicName}. We noticed you have pending scheduled dental care (${plan.title}). Completing your treatment prevents tooth complications and higher costs. Would you like to schedule your continuation appointment this week?`,
        };
      });

      // 2. Hygiene Recalls (6-month cleaning)
      const hygieneFollowUps = await tx.followUpReminder.findMany({
        where: {
          clinicId,
          status: 'PENDING',
          type: 'RECALL',
          scheduledDate: { lte: now },
        },
        include: {
          patient: { select: { id: true, fullName: true, uhid: true, phone: true } },
        },
        take: 30,
      });

      const hygieneList = hygieneFollowUps.map(fu => ({
        id: fu.id,
        patientId: fu.patient.id,
        patientName: fu.patient.fullName,
        uhid: fu.patient.uhid,
        phone: fu.patient.phone,
        type: 'HYGIENE_RECALL',
        title: '6-Month Routine Oral Prophylaxis',
        notes: fu.notes || 'Routine cleaning recall due',
        whatsappText: `Dear ${fu.patient.fullName}, warm greetings from ${clinicName}. Your 6-month preventive dental scaling and health check is now due. Regular cleanings protect your gums and maintain fresh breath. Please reply or call to reserve your convenient time slot.`,
      }));

      return {
        dropouts: dropoutsList,
        hygieneRecalls: hygieneList,
        totalDropoutRevenuePaise: dropoutsList.reduce((acc, d) => acc + d.potentialRevenuePaise, 0),
      };
    });
  }

  async createFollowUp(clinicId: string, dto: CreateFollowUpDto, actor: any) {
    return this.prisma.forTenant(clinicId, async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: dto.patientId, clinicId },
      });
      if (!patient) throw new NotFoundException('Patient record not found in this clinic');

      const scheduledDate = new Date(dto.scheduledDate);
      if (isNaN(scheduledDate.getTime())) {
        throw new BadRequestException('Invalid scheduled date');
      }

      const item = await tx.followUpReminder.create({
        data: {
          clinicId,
          patientId: dto.patientId,
          appointmentId: dto.appointmentId || null,
          scheduledDate,
          type: dto.type || 'GENERAL',
          status: 'PENDING',
          notes: dto.notes?.trim() || null,
          reminderSent: false,
        },
        include: {
          patient: {
            select: {
              id: true,
              fullName: true,
              uhid: true,
              phone: true,
            },
          },
        },
      });

      await this.auditService.log({
        clinicId,
        actorId: actor.userId || actor.id,
        actorRole: actor.role || 'STAFF',
        action: 'FOLLOW_UP_CREATED',
        entityType: 'FollowUpReminder',
        entityId: item.id,
        details: {
          patientId: item.patientId,
          type: item.type,
          scheduledDate: item.scheduledDate,
        },
      }, tx);

      return item;
    });
  }

  async updateFollowUp(clinicId: string, id: string, dto: UpdateFollowUpDto, actor: any) {
    return this.prisma.forTenant(clinicId, async (tx) => {
      const existing = await tx.followUpReminder.findFirst({
        where: {
          id,
          clinicId,
        },
      });
      if (!existing) throw new NotFoundException('Follow-up reminder not found');

      const data: any = {};
      if (dto.status !== undefined) data.status = dto.status;
      if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;
      if (dto.reminderSent !== undefined) data.reminderSent = dto.reminderSent;
      if (dto.scheduledDate) {
        const parsed = new Date(dto.scheduledDate);
        if (!isNaN(parsed.getTime())) {
          data.scheduledDate = parsed;
        }
      }

      const updated = await tx.followUpReminder.update({
        where: { id },
        data,
        include: {
          patient: {
            select: {
              id: true,
              fullName: true,
              uhid: true,
              phone: true,
            },
          },
        },
      });

      await this.auditService.log({
        clinicId,
        actorId: actor.userId || actor.id,
        actorRole: actor.role || 'STAFF',
        action: 'FOLLOW_UP_UPDATED',
        entityType: 'FollowUpReminder',
        entityId: updated.id,
        details: data,
      }, tx);

      return updated;
    });
  }

  async deleteFollowUp(clinicId: string, id: string, actor: any) {
    return this.prisma.forTenant(clinicId, async (tx) => {
      const existing = await tx.followUpReminder.findFirst({
        where: {
          id,
          clinicId,
        },
      });
      if (!existing) throw new NotFoundException('Follow-up reminder not found');

      await tx.followUpReminder.delete({
        where: { id },
      });

      await this.auditService.log({
        clinicId,
        actorId: actor.userId || actor.id,
        actorRole: actor.role || 'STAFF',
        action: 'FOLLOW_UP_DELETED',
        entityType: 'FollowUpReminder',
        entityId: id,
      }, tx);

      return { success: true, message: 'Follow-up reminder deleted' };
    });
  }
}
