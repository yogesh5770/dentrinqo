import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateLabOrderDto, UpdateLabOrderDto } from './lab-orders.dto';

@Injectable()
export class LabOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(clinicId: string, status?: string, patientId?: string) {
    return this.prisma.forTenant(clinicId, async (tx) => {
      const where: any = { clinicId };
      if (status && status !== 'ALL') {
        where.status = status;
      }
      if (patientId) {
        where.patientId = patientId;
      }

      return tx.labOrder.findMany({
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
        },
        orderBy: [
          { expectedDueDate: 'asc' },
          { createdAt: 'desc' },
        ],
      });
    });
  }

  async findOne(clinicId: string, id: string) {
    return this.prisma.forTenant(clinicId, async (tx) => {
      const order = await tx.labOrder.findFirst({
        where: { id, clinicId },
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
      if (!order) throw new NotFoundException('Dental lab order not found');
      return order;
    });
  }

  async create(clinicId: string, dto: CreateLabOrderDto, actor: any) {
    return this.prisma.forTenant(clinicId, async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: dto.patientId, clinicId },
      });
      if (!patient) throw new NotFoundException('Patient record not found in this clinic');

      const order = await tx.labOrder.create({
        data: {
          clinicId,
          patientId: dto.patientId,
          dentistId: dto.dentistId || actor.userId || actor.id,
          labName: dto.labName.trim(),
          itemType: dto.itemType.trim(),
          toothNumber: dto.toothNumber || null,
          shade: dto.shade?.trim() || null,
          sentDate: dto.sentDate ? new Date(dto.sentDate) : new Date(),
          expectedDueDate: dto.expectedDueDate ? new Date(dto.expectedDueDate) : null,
          patientApptDate: dto.patientApptDate ? new Date(dto.patientApptDate) : null,
          costPaise: dto.costPaise || 0,
          notes: dto.notes?.trim() || null,
          technicianPhone: dto.technicianPhone?.trim() || null,
          status: 'SENT',
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
        action: 'LAB_ORDER_CREATED',
        entityType: 'LabOrder',
        entityId: order.id,
        details: {
          patientUhid: patient.uhid,
          labName: order.labName,
          itemType: order.itemType,
          tooth: order.toothNumber,
          shade: order.shade,
        },
      }, tx);

      return order;
    });
  }

  async update(clinicId: string, id: string, dto: UpdateLabOrderDto, actor: any) {
    return this.prisma.forTenant(clinicId, async (tx) => {
      const existing = await tx.labOrder.findFirst({
        where: { id, clinicId },
      });
      if (!existing) throw new NotFoundException('Lab order not found');

      const data: any = {};
      if (dto.status !== undefined) data.status = dto.status;
      if (dto.labName !== undefined) data.labName = dto.labName.trim();
      if (dto.itemType !== undefined) data.itemType = dto.itemType.trim();
      if (dto.toothNumber !== undefined) data.toothNumber = dto.toothNumber;
      if (dto.shade !== undefined) data.shade = dto.shade?.trim() || null;
      if (dto.expectedDueDate !== undefined) {
        data.expectedDueDate = dto.expectedDueDate ? new Date(dto.expectedDueDate) : null;
      }
      if (dto.patientApptDate !== undefined) {
        data.patientApptDate = dto.patientApptDate ? new Date(dto.patientApptDate) : null;
      }
      if (dto.costPaise !== undefined) data.costPaise = dto.costPaise;
      if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;
      if (dto.technicianPhone !== undefined) data.technicianPhone = dto.technicianPhone?.trim() || null;

      const updated = await tx.labOrder.update({
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
        action: 'LAB_ORDER_UPDATED',
        entityType: 'LabOrder',
        entityId: updated.id,
        details: {
          previousStatus: existing.status,
          newStatus: updated.status,
        },
      }, tx);

      return updated;
    });
  }

  async remove(clinicId: string, id: string, actor: any) {
    return this.prisma.forTenant(clinicId, async (tx) => {
      const existing = await tx.labOrder.findFirst({
        where: { id, clinicId },
      });
      if (!existing) throw new NotFoundException('Lab order not found');

      await tx.labOrder.delete({ where: { id } });

      await this.auditService.log({
        clinicId,
        actorId: actor.userId || actor.id,
        actorRole: actor.role || 'STAFF',
        action: 'LAB_ORDER_DELETED',
        entityType: 'LabOrder',
        entityId: id,
      }, tx);

      return { success: true, message: 'Lab order deleted successfully' };
    });
  }
}
