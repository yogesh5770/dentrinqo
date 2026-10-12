import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface AuditLogEntry {
  clinicId: string;
  actorId?: string;
  actorRole?: string;
  action: string;
  entityType: string;
  entityId?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: any;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditLogEntry, txClient?: any) {
    if (!entry.clinicId) {
      this.logger.warn('AuditLog attempted without clinicId');
      return;
    }

    try {
      const execute = async (tx: any) => {
        let validActorId: string | null = null;
        if (entry.actorId) {
          const user = await tx.user.findUnique({ where: { id: entry.actorId } });
          if (user) {
            validActorId = entry.actorId;
          }
        }

        await tx.auditLog.create({
          data: {
            clinicId: entry.clinicId,
            actorId: validActorId,
            actorRole: entry.actorRole,
            action: entry.action,
            entityType: entry.entityType,
            entityId: entry.entityId,
            ipAddress: entry.ipAddress,
            userAgent: entry.userAgent,
            details: entry.details ? JSON.stringify(entry.details) : null,
          },
        });
      };

      if (txClient) {
        await execute(txClient);
      } else {
        await this.prisma.forTenant(entry.clinicId, execute);
      }
    } catch (err: any) {
      this.logger.error(`Failed to write audit log: ${err.message}`);
    }
  }

  async getLogs(clinicId: string, page = 1, limit = 20, action?: string, entityType?: string) {
    return this.prisma.forTenant(clinicId, async (tx) => {
      const skip = (page - 1) * limit;
      const where: any = { clinicId };
      if (action) where.action = action;
      if (entityType) where.entityType = entityType;

      const [logs, total] = await Promise.all([
        tx.auditLog.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            actor: {
              select: { fullName: true, email: true, role: true },
            },
          },
        }),
        tx.auditLog.count({ where }),
      ]);

      return {
        data: logs.map(l => ({
          id: l.id,
          action: l.action,
          entityType: l.entityType,
          entityId: l.entityId,
          actor: l.actor ? l.actor.fullName : (l.actorRole || 'System'),
          actorRole: l.actorRole,
          ipAddress: l.ipAddress,
          details: l.details ? (typeof l.details === 'string' ? JSON.parse(l.details) : l.details) : null,
          createdAt: l.createdAt,
        })),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    });
  }
}