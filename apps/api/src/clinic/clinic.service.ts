import { Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantContextMiddleware } from '../common/middleware/tenant-context.middleware';

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

      if (!clinic) {
        const domainEntry = await this.prisma.clinicDomain.findUnique({
          where: { domain: clean.toLowerCase() },
          include: { clinic: true },
        });
        if (domainEntry?.clinic) {
          clinic = domainEntry.clinic;
        }
      }
    } else {
      clinic = await this.prisma.clinic.findFirst({
        where: { status: 'ACTIVE' },
      });
    }

    if (!clinic || clinic.status !== 'ACTIVE') {
      throw new NotFoundException(`Clinic not found or inactive`);
    }

    const now = new Date();
    const activeClosure = await this.prisma.clinicClosure.findFirst({
      where: {
        clinicId: clinic.id,
        startAt: { lte: now },
        endAt: { gt: now },
        endedAt: null,
      },
      orderBy: { endAt: 'desc' },
    });

    return this.formatPublicClinic(clinic, activeClosure);
  }

  private formatPublicClinic(clinic: any, activeClosure?: any) {
    return {
      id: clinic.id,
      name: clinic.name,
      code: clinic.code,
      tagline: clinic.tagline,
      phone: clinic.phone,
      emergencyPhone: clinic.emergencyPhone || clinic.phone,
      email: clinic.email,
      address: clinic.address,
      city: clinic.city,
      state: clinic.state,
      postalCode: clinic.postalCode,
      chairCount: clinic.chairCount,
      subdomain: clinic.subdomain,
      upiVpa: clinic.upiVpa,
      isOnLeave: Boolean(activeClosure),
      leaveReason: activeClosure?.reason || null,
      hoursEnforced: clinic.hoursEnforced ?? false,
      workingHoursConfigured: clinic.workingHoursConfigured ?? false,
      lastWalkinMinutesBeforeClose: clinic.lastWalkinMinutesBeforeClose ?? 30,
      lastWalkinTime: clinic.lastWalkinTime || '20:00',
      minVisitsForWaitEstimate: clinic.minVisitsForWaitEstimate ?? 20,
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

    const now = new Date();
    const activeClosure = await this.prisma.clinicClosure.findFirst({
      where: {
        clinicId: clinic.id,
        startAt: { lte: now },
        endAt: { gt: now },
        endedAt: null,
      },
      orderBy: { endAt: 'desc' },
    });

    return {
      id: clinic.id,
      name: clinic.name,
      code: clinic.code,
      tagline: clinic.tagline,
      phone: clinic.phone,
      emergencyPhone: clinic.emergencyPhone || clinic.phone,
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
      isOnLeave: Boolean(activeClosure),
      leaveReason: activeClosure?.reason || null,
      hoursEnforced: clinic.hoursEnforced ?? false,
      workingHoursConfigured: clinic.workingHoursConfigured ?? false,
      lastWalkinMinutesBeforeClose: clinic.lastWalkinMinutesBeforeClose ?? 30,
      lastWalkinTime: clinic.lastWalkinTime || '20:00',
      minVisitsForWaitEstimate: clinic.minVisitsForWaitEstimate ?? 20,
      customLobbyCode: (() => {
        try {
          const p = JSON.parse(clinic.workingHours || '{}');
          return p.customLobbyCode || null;
        } catch { return null; }
      })(),
      customWalkinQrUrl: (() => {
        try {
          const p = JSON.parse(clinic.workingHours || '{}');
          return p.customWalkinQrUrl || null;
        } catch { return null; }
      })(),
      customCheckinQrUrl: (() => {
        try {
          const p = JSON.parse(clinic.workingHours || '{}');
          return p.customCheckinQrUrl || null;
        } catch { return null; }
      })(),
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
    const current = await this.prisma.clinic.findUnique({ where: { id: clinicId } });
    let workingHoursObj: any = {};
    if (current?.workingHours) {
      try {
        workingHoursObj = JSON.parse(current.workingHours);
      } catch {
        workingHoursObj = {};
      }
    }

    if (data.customLobbyCode !== undefined) {
      workingHoursObj.customLobbyCode = data.customLobbyCode && String(data.customLobbyCode).trim() ? String(data.customLobbyCode).trim() : null;
    }
    if (data.customWalkinQrUrl !== undefined) {
      workingHoursObj.customWalkinQrUrl = data.customWalkinQrUrl && String(data.customWalkinQrUrl).trim() ? String(data.customWalkinQrUrl).trim() : null;
    }
    if (data.customCheckinQrUrl !== undefined) {
      workingHoursObj.customCheckinQrUrl = data.customCheckinQrUrl && String(data.customCheckinQrUrl).trim() ? String(data.customCheckinQrUrl).trim() : null;
    }
    if (data.workingHours !== undefined) {
      if (typeof data.workingHours === 'object') {
        workingHoursObj = { ...workingHoursObj, ...data.workingHours };
      }
    }

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
        workingHours: JSON.stringify(workingHoursObj),
        gstin: data.gstin,
        upiVpa: data.upiVpa,
        requireLobbyCode: data.requireLobbyCode !== undefined ? Boolean(data.requireLobbyCode) : undefined,
        requireDeskConfirmation: data.requireDeskConfirmation !== undefined ? Boolean(data.requireDeskConfirmation) : undefined,
        lobbyCodeDigits: data.lobbyCodeDigits ? parseInt(data.lobbyCodeDigits, 10) : undefined,
        lobbyCodeWindowSeconds: data.lobbyCodeWindowSeconds ? parseInt(data.lobbyCodeWindowSeconds, 10) : undefined,
        isDoctorVerified: data.isDoctorVerified !== undefined ? Boolean(data.isDoctorVerified) : undefined,
        isBillingVerified: data.isBillingVerified !== undefined ? Boolean(data.isBillingVerified) : undefined,
        isOnLeave: data.isOnLeave !== undefined ? Boolean(data.isOnLeave) : undefined,
        leaveReason: data.leaveReason !== undefined ? data.leaveReason : undefined,
      },
    });

    TenantContextMiddleware.clearClinicCache(clinicId);

    await this.auditService.log({
      clinicId,
      actorId: actor?.userId || actor?.id,
      actorRole: actor?.role || 'STAFF',
      action: 'CLINIC_SETTINGS_UPDATED',
      entityType: 'Clinic',
      entityId: clinicId,
      details: { updatedFields: Object.keys(data) },
    });

    // Exclude lobbySecret from returned object
    const { lobbySecret, ...safeClinic } = updated as any;
    return {
      ...safeClinic,
      customLobbyCode: workingHoursObj.customLobbyCode || null,
      customWalkinQrUrl: workingHoursObj.customWalkinQrUrl || null,
      customCheckinQrUrl: workingHoursObj.customCheckinQrUrl || null,
    };
  }

  async rotateLobbyCode(clinicId: string, actor: any) {
    const current = await this.prisma.clinic.findUnique({ where: { id: clinicId } });
    if (!current) throw new NotFoundException('Clinic not found');

    let workingHoursObj: any = {};
    if (current.workingHours) {
      try { workingHoursObj = JSON.parse(current.workingHours); } catch { workingHoursObj = {}; }
    }
    // Clear any static custom code on rotation so it returns to dynamic auto-generated code
    workingHoursObj.customLobbyCode = null;

    const newSecret = crypto.randomBytes(32).toString('hex');
    const updated = await this.prisma.clinic.update({
      where: { id: clinicId },
      data: {
        lobbySecret: newSecret,
        workingHours: JSON.stringify(workingHoursObj),
      },
    });

    TenantContextMiddleware.clearClinicCache(clinicId);

    await this.auditService.log({
      clinicId,
      actorId: actor?.userId || actor?.id,
      actorRole: actor?.role || 'STAFF',
      action: 'LOBBY_CODE_ROTATED',
      entityType: 'Clinic',
      entityId: clinicId,
      details: { rotatedAt: new Date().toISOString() },
    });

    const windowSec = updated.lobbyCodeWindowSeconds || 300;
    const digits = updated.lobbyCodeDigits === 6 ? 6 : 4;
    const now = Math.floor(Date.now() / 1000);
    const bucket = Math.floor(now / windowSec);
    const hmac = crypto.createHmac('sha256', newSecret);
    hmac.update(`${updated.id}:${bucket}`);
    const hash = hmac.digest('hex');

    const modulo = digits === 6 ? 900000 : 9000;
    const base = digits === 6 ? 100000 : 1000;
    const code = (parseInt(hash.substring(0, 8), 16) % modulo + base).toString();

    const expiresAt = (bucket + 1) * windowSec * 1000;
    const secondsRemaining = Math.max(0, (bucket + 1) * windowSec - now);

    return {
      success: true,
      code,
      expiresAt,
      secondsRemaining,
      digits,
      message: 'Live TV arrival code successfully rotated.',
    };
  }

  async toggleLeave(clinicId: string, isOnLeave: boolean, leaveReason?: string, actor?: any) {
    const now = new Date();
    const cleanReason = leaveReason !== undefined && leaveReason ? leaveReason : (isOnLeave ? 'Hospital Closed / Holiday' : null);

    if (isOnLeave) {
      // Create a 24-hour closure record in ClinicClosure
      const endAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      await this.prisma.clinicClosure.create({
        data: {
          clinicId,
          startAt: now,
          endAt,
          reason: cleanReason || 'Hospital Closed / Holiday',
          createdById: actor?.userId || actor?.id || 'admin',
        },
      });
    } else {
      // End all active closures in ClinicClosure
      await this.prisma.clinicClosure.updateMany({
        where: {
          clinicId,
          endedAt: null,
          startAt: { lte: now },
          endAt: { gt: now },
        },
        data: {
          endedAt: now,
          endedById: actor?.userId || actor?.id || 'admin',
        },
      });
    }

    const updated = await this.prisma.clinic.update({
      where: { id: clinicId },
      data: {
        isOnLeave: Boolean(isOnLeave),
        leaveReason: isOnLeave ? cleanReason : null,
      },
    });

    TenantContextMiddleware.clearClinicCache(clinicId);

    await this.auditService.log({
      clinicId,
      actorId: actor?.userId || actor?.id || 'admin',
      actorRole: actor?.role || 'STAFF',
      action: isOnLeave ? 'HOSPITAL_LEAVE_ON' : 'HOSPITAL_LEAVE_OFF',
      entityType: 'Clinic',
      entityId: clinicId,
      details: { isOnLeave: Boolean(isOnLeave), leaveReason: cleanReason },
    });

    const { lobbySecret, ...safeClinic } = updated as any;
    safeClinic.isOnLeave = Boolean(isOnLeave);
    safeClinic.leaveReason = isOnLeave ? cleanReason : null;
    return safeClinic;
  }
}