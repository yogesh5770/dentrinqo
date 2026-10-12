import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class ClinicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getPublicInfo(identifier?: string) {
    const clean = (identifier || '').trim();
    let clinic = null;
    if (clean) {
      clinic = await this.prisma.clinic.findFirst({
        where: {
          OR: [
            { id: clean },
            { code: clean.toUpperCase() },
            { subdomain: clean.toLowerCase() },
          ],
        },
      });
    } else {
      clinic = await this.prisma.clinic.findFirst({
        where: { status: 'ACTIVE' },
      });
    }

    if (!clinic || clinic.status !== 'ACTIVE') {
      throw new NotFoundException(`Clinic not found or inactive`);
    }

    return this.formatPublicClinic(clinic);
  }

  private formatPublicClinic(clinic: any) {
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
      chairCount: clinic.chairCount,
      subdomain: clinic.subdomain,
      upiVpa: clinic.upiVpa,
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
      subdomain: clinic.subdomain,
      status: clinic.status,
      planTier: clinic.planTier,
      upiVpa: clinic.upiVpa,
      requireLobbyCode: clinic.requireLobbyCode ?? true,
      requireDeskConfirmation: clinic.requireDeskConfirmation ?? true,
      lobbyCodeDigits: clinic.lobbyCodeDigits ?? 4,
      lobbyCodeWindowSeconds: clinic.lobbyCodeWindowSeconds ?? 300,
      isDoctorVerified: clinic.isDoctorVerified ?? false,
      isBillingVerified: clinic.isBillingVerified ?? false,
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
        upiVpa: data.upiVpa,
        requireLobbyCode: data.requireLobbyCode !== undefined ? Boolean(data.requireLobbyCode) : undefined,
        requireDeskConfirmation: data.requireDeskConfirmation !== undefined ? Boolean(data.requireDeskConfirmation) : undefined,
        lobbyCodeDigits: data.lobbyCodeDigits ? parseInt(data.lobbyCodeDigits, 10) : undefined,
        lobbyCodeWindowSeconds: data.lobbyCodeWindowSeconds ? parseInt(data.lobbyCodeWindowSeconds, 10) : undefined,
        isDoctorVerified: data.isDoctorVerified !== undefined ? Boolean(data.isDoctorVerified) : undefined,
        isBillingVerified: data.isBillingVerified !== undefined ? Boolean(data.isBillingVerified) : undefined,
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

    // Exclude lobbySecret from returned object
    const { lobbySecret, ...safeClinic } = updated as any;
    return safeClinic;
  }
}