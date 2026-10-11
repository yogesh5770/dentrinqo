import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class ClinicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getSettings(clinicId: string) {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
    });

    if (!clinic) {
      throw new NotFoundException('Clinic record not found');
    }

    return {
      id: clinic.id,
      name: clinic.name,
      code: clinic.code,
      tagline: clinic.tagline,
      phone: clinic.phone,
      email: clinic.email,
      address: clinic.address,
      city: clinic.city,
      state: clinic.state,
      postalCode: clinic.postalCode,
      timezone: clinic.timezone,
      currency: clinic.currency,
      gstin: clinic.gstin,
      chairCount: clinic.chairCount,
      workingHours: clinic.workingHours
        ? (() => {
            try {
              return JSON.parse(clinic.workingHours);
            } catch {
              return clinic.workingHours;
            }
          })()
        : null,
    };
  }

  async updateSettings(clinicId: string, data: any, actor: any) {
    const updated = await this.prisma.clinic.update({
      where: { id: clinicId },
      data: {
        name: data.name,
        tagline: data.tagline,
        phone: data.phone,
        email: data.email,
        address: data.address,
        city: data.city,
        state: data.state,
        postalCode: data.postalCode,
        chairCount: data.chairCount ? parseInt(data.chairCount, 10) : undefined,
        workingHours: data.workingHours !== undefined
          ? (typeof data.workingHours === 'string' ? data.workingHours : JSON.stringify(data.workingHours))
          : undefined,
        gstin: data.gstin,
      },
    });

    await this.auditService.log({
      clinicId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'CLINIC_SETTINGS_UPDATED',
      entityType: 'Clinic',
      entityId: clinicId,
      details: { updatedFields: Object.keys(data) },
    });

    return updated;
  }
}