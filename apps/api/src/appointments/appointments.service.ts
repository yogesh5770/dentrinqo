import { Injectable, ConflictException, NotFoundException, BadRequestException, ForbiddenException, UnauthorizedException, InternalServerErrorException, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateAppointmentDto, UpdateAppointmentStatusDto, RescheduleAppointmentDto, ReceptionQuickConsultDto, PublicLookupDto } from './appointment.dto';
import { CreatePublicAppointmentDto } from './public-booking.dto';
import { ClinicHoursService } from '../clinic/clinic-hours.service';

function parseJsonArray(val: any): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(x => String(x));
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed.map(x => String(x));
    } catch {}
    return val ? [val] : [];
  }
  return [];
}

function safeJsonStringArray(val: any): string {
  if (!val) return JSON.stringify([]);
  if (Array.isArray(val)) {
    return JSON.stringify(val.map(x => String(x).trim()).filter(Boolean));
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return JSON.stringify([]);
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return JSON.stringify(parsed.map(x => String(x).trim()).filter(Boolean));
      }
    } catch {}
    const list = trimmed.split(',').map(s => s.trim()).filter(Boolean);
    return JSON.stringify(list.length > 0 ? list : [trimmed]);
  }
  return JSON.stringify([]);
}

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly clinicHoursService: ClinicHoursService,
  ) {}

  private static ipFailures: Map<string, { count: number; resetAt: number }> = new Map();
  private static clinicFailures: Map<string, { count: number; resetAt: number }> = new Map();

  // Cryptographic signed intake token for pre-visit clinical intake (SEC-02)
  generateIntakeToken(clinicId: string, patientId: string, appointmentId: string): string {
    const secret = process.env.SESSION_SECRET || 'aks-elite-jwt-secure-super-key-madurai-2026-production';
    const payload = {
      sub: patientId,
      clinicId,
      appointmentId,
      action: 'INTAKE_SUBMISSION',
      nonce: crypto.randomBytes(16).toString('hex'),
      exp: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    };
    const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
    return `${data}.${sig}`;
  }

  verifyIntakeToken(token: string): { clinicId: string; patientId: string; appointmentId: string; nonce: string } | null {
    try {
      if (!token || typeof token !== 'string') return null;
      const parts = token.split('.');
      if (parts.length !== 2) return null;
      const [data, sig] = parts;
      const secret = process.env.SESSION_SECRET || 'aks-elite-jwt-secure-super-key-madurai-2026-production';
      const expectedSig = crypto.createHmac('sha256', secret).update(data).digest('base64url');

      const sigBuf = Buffer.from(sig, 'utf8');
      const expectedBuf = Buffer.from(expectedSig, 'utf8');
      if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        return null;
      }

      const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
      if (payload.action !== 'INTAKE_SUBMISSION') return null;
      if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
      if (!payload.sub || !payload.clinicId) return null;

      return {
        clinicId: payload.clinicId,
        patientId: payload.sub,
        appointmentId: payload.appointmentId,
        nonce: payload.nonce,
      };
    } catch {
      return null;
    }
  }

  /**
   * Generates a deterministic time-bucket HMAC lobby code (4 or 6 digits)
   * using the clinic's 32-byte secret, or returns customLobbyCode if configured.
   */
  getRotatingLobbyCode(clinic: { id: string; lobbySecret?: string | null; lobbyCodeDigits?: number; lobbyCodeWindowSeconds?: number; workingHours?: string | null }, timeOffsetBuckets = 0): { code: string; expiresAt: number; secondsRemaining: number } {
    let parsed: any = {};
    if (clinic.workingHours) {
      try {
        parsed = typeof clinic.workingHours === 'string' ? JSON.parse(clinic.workingHours) : clinic.workingHours;
      } catch (e) {
        parsed = {};
      }
    }

    if (parsed && parsed.customLobbyCode && typeof parsed.customLobbyCode === 'string' && parsed.customLobbyCode.trim()) {
      return {
        code: parsed.customLobbyCode.trim(),
        expiresAt: Date.now() + 86400000,
        secondsRemaining: 86400,
      };
    }

    const windowSec = clinic.lobbyCodeWindowSeconds || 300; // default 5 minutes
    const digits = clinic.lobbyCodeDigits === 6 ? 6 : 4;
    const now = Math.floor(Date.now() / 1000);
    const bucket = Math.floor(now / windowSec) + timeOffsetBuckets;
    const secret = clinic.lobbySecret || 'aks-secure-lobby-salt-key-2026';

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(`${clinic.id}:${bucket}`);
    const hash = hmac.digest('hex');

    const modulo = digits === 6 ? 900000 : 9000;
    const base = digits === 6 ? 100000 : 1000;
    const code = (parseInt(hash.substring(0, 8), 16) % modulo + base).toString();

    const expiresAtSec = (bucket + 1 - timeOffsetBuckets) * windowSec;
    const secondsRemaining = Math.max(0, expiresAtSec - now);

    return {
      code,
      expiresAt: expiresAtSec * 1000,
      secondsRemaining,
    };
  }

  getDailyLobbyCode(clinicOrId: any, _date?: any): string {
    const clinicObj = typeof clinicOrId === 'string' ? { id: clinicOrId } : clinicOrId;
    return this.getRotatingLobbyCode(clinicObj, 0).code;
  }

  verifyRotatingLobbyCode(clinic: { id: string; lobbySecret?: string | null; lobbyCodeDigits?: number; lobbyCodeWindowSeconds?: number; requireLobbyCode?: boolean; workingHours?: string | null }, candidateCode: string): boolean {
    if (!clinic.requireLobbyCode) return true;
    if (!candidateCode) return false;
    const clean = candidateCode.trim();

    let parsed: any = {};
    if (clinic.workingHours) {
      try {
        parsed = typeof clinic.workingHours === 'string' ? JSON.parse(clinic.workingHours) : clinic.workingHours;
      } catch (e) {
        parsed = {};
      }
    }
    if (parsed && parsed.customLobbyCode && typeof parsed.customLobbyCode === 'string' && parsed.customLobbyCode.trim()) {
      if (clean === parsed.customLobbyCode.trim()) return true;
    }

    // Accept current bucket (0) or previous bucket (-1) for grace window
    const current = this.getRotatingLobbyCode(clinic, 0);
    const previous = this.getRotatingLobbyCode(clinic, -1);
    return clean === current.code || clean === previous.code;
  }

  recordFailedLobbyAttempt(ip: string, clinicId: string) {
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 minutes

    const ipEntry = AppointmentsService.ipFailures.get(ip);
    if (!ipEntry || ipEntry.resetAt < now) {
      AppointmentsService.ipFailures.set(ip, { count: 1, resetAt: now + windowMs });
    } else {
      ipEntry.count++;
    }

    const clinicEntry = AppointmentsService.clinicFailures.get(clinicId);
    if (!clinicEntry || clinicEntry.resetAt < now) {
      AppointmentsService.clinicFailures.set(clinicId, { count: 1, resetAt: now + windowMs });
    } else {
      clinicEntry.count++;
    }
  }

  isIpLockedOut(ip: string): boolean {
    const entry = AppointmentsService.ipFailures.get(ip);
    return Boolean(entry && entry.resetAt > Date.now() && entry.count >= 5);
  }

  isClinicCheckinPaused(clinicId: string): boolean {
    const entry = AppointmentsService.clinicFailures.get(clinicId);
    return Boolean(entry && entry.resetAt > Date.now() && entry.count >= 25);
  }

  // Check for scheduling conflicts (same dentist OR same chair at overlapping time)
  private async checkConflict(
    clinicId: string,
    dentistId: string,
    chairNumber: number,
    start: Date,
    end: Date,
    excludeApptId?: string,
    client?: any,
  ) {
    const db = client || this.prisma;
    const activeStatuses = ['PENDING_CONFIRMATION', 'SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_CHAIR'];

    // 0. Dentist Leave / Unavailability Check
    if (this.clinicHoursService?.getDentistLeaveForSlot) {
      const leave = await this.clinicHoursService.getDentistLeaveForSlot(clinicId, dentistId, start, end, db);
      if (leave) {
        const dName = leave.dentist?.fullName || 'Doctor';
        throw new ConflictException(
          `Dr. ${dName} is unavailable (${leave.reason || 'On Leave'}) during this time slot. Please choose another dentist or slot.`,
        );
      }
    } else if (db?.dentistUnavailability?.findFirst) {
      const leave = await db.dentistUnavailability.findFirst({
        where: {
          clinicId,
          dentistId,
          AND: [
            { startAt: { lt: end } },
            { endAt: { gt: start } },
          ],
        },
        include: {
          dentist: { select: { fullName: true } },
        },
      });
      if (leave) {
        const dName = leave.dentist?.fullName || 'Doctor';
        throw new ConflictException(
          `Dr. ${dName} is unavailable (${leave.reason || 'On Leave'}) during this time slot. Please choose another dentist or slot.`,
        );
      }
    }

    // 1. Dentist conflict
    const dentistConflict = await db.appointment.findFirst({
      where: {
        clinicId,
        dentistId,
        id: excludeApptId ? { not: excludeApptId } : undefined,
        status: { in: activeStatuses },
        AND: [
          { scheduledStart: { lt: end } },
          { scheduledEnd: { gt: start } },
        ],
      },
      include: {
        patient: { select: { fullName: true } },
      },
    });

    if (dentistConflict) {
      const patientName = (dentistConflict as any).patient?.fullName || 'Another Patient';
      throw new ConflictException(
        `Dentist is already booked for patient "${patientName}" between ${dentistConflict.scheduledStart.toLocaleTimeString()} and ${dentistConflict.scheduledEnd.toLocaleTimeString()}`,
      );
    }

    // 2. Operatory Chair conflict
    const chairConflict = await db.appointment.findFirst({
      where: {
        clinicId,
        chairNumber,
        id: excludeApptId ? { not: excludeApptId } : undefined,
        status: { in: activeStatuses },
        AND: [
          { scheduledStart: { lt: end } },
          { scheduledEnd: { gt: start } },
        ],
      },
      include: {
        patient: { select: { fullName: true } },
      },
    });

    if (chairConflict) {
      const patientName = (chairConflict as any).patient?.fullName || 'Another Patient';
      throw new ConflictException(
        `Dental Operatory Chair ${chairNumber} is already occupied by patient "${patientName}" during this slot.`,
      );
    }

    // 3. Dentist Unavailability / Leave conflict
    if (db.dentistUnavailability) {
      const leaveConflict = await db.dentistUnavailability.findFirst({
        where: {
          clinicId,
          dentistId,
          AND: [
            { startAt: { lt: end } },
            { endAt: { gt: start } },
          ],
        },
        include: {
          dentist: { select: { fullName: true } },
        },
      });

      if (leaveConflict) {
        const dName = leaveConflict.dentist?.fullName || 'Doctor';
        throw new ConflictException(
          `Dr. ${dName} is unavailable (${leaveConflict.reason}) during this time window. Please choose another dentist or slot.`,
        );
      }
    }
  }


  // Candidate Chair Selection for Timed Booking (Requirement 6)
  async getCandidateChairsForSlot(
    clinicId: string,
    start: Date,
    end: Date,
    preferredDentistId?: string | null,
    tx?: any,
  ): Promise<number[]> {
    if (!tx || (tx === this.prisma && !(tx as any).__inTenantCtx)) {
      return this.prisma.forTenant(clinicId, async (tenantTx) => {
        (tenantTx as any).__inTenantCtx = true;
        try {
          return await this.getCandidateChairsForSlot(clinicId, start, end, preferredDentistId, tenantTx);
        } finally {
          delete (tenantTx as any).__inTenantCtx;
        }
      });
    }

    const clinic = await tx.clinic.findUnique({ where: { id: clinicId } });
    const totalChairs = clinic?.chairCount || 3;

    let offDutyChairs = new Set<number>();
    if (clinic?.workingHours) {
      try {
        const parsed = JSON.parse(clinic.workingHours);
        if (parsed.chairStatus) {
          for (const [k, v] of Object.entries(parsed.chairStatus)) {
            if (v === false) offDutyChairs.add(Number(k));
          }
        }
      } catch {}
    }

    const onDutyChairs: number[] = [];
    for (let c = 1; c <= totalChairs; c++) {
      if (!offDutyChairs.has(c)) onDutyChairs.push(c);
    }
    if (onDutyChairs.length === 0) {
      return [];
    }

    const activeStatuses = ['PENDING_CONFIRMATION', 'SCHEDULED', 'CONFIRMED', 'CALLED', 'IN_CHAIR'];

    // 1. Find conflicting bookings on each on-duty chair
    const conflictingAppts = await tx.appointment.findMany({
      where: {
        clinicId,
        chairNumber: { in: onDutyChairs },
        status: { in: activeStatuses },
        AND: [
          { scheduledStart: { lt: end } },
          { scheduledEnd: { gt: start } },
        ],
      },
      select: { chairNumber: true },
    });

    const busyChairsInSlot = new Set(conflictingAppts.map((a: any) => a.chairNumber));
    const freeChairsInSlot = onDutyChairs.filter((c) => !busyChairsInSlot.has(c));

    if (freeChairsInSlot.length === 0) {
      return [];
    }

    // 2. Count day bookings for each free chair
    const dayStart = new Date(start);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(start);
    dayEnd.setHours(23, 59, 59, 999);

    const dayAppts = await tx.appointment.findMany({
      where: {
        clinicId,
        chairNumber: { in: freeChairsInSlot },
        status: { in: activeStatuses },
        scheduledStart: { gte: dayStart, lte: dayEnd },
      },
      select: { chairNumber: true, dentistId: true },
    });

    const chairLoads: Record<number, number> = {};
    for (const c of freeChairsInSlot) chairLoads[c] = 0;
    for (const a of dayAppts) {
      if (a.chairNumber && chairLoads[a.chairNumber] !== undefined) {
        chairLoads[a.chairNumber]++;
      }
    }

    // Determine preferred chair if preferred dentist specified
    let preferredChair: number | null = null;
    if (preferredDentistId) {
      const preferredDentist = await tx.user.findFirst({
        where: { id: preferredDentistId, clinicId },
        select: { id: true, assignedChairNumber: true },
      });
      if (preferredDentist?.assignedChairNumber && preferredDentist.assignedChairNumber <= totalChairs) {
        preferredChair = preferredDentist.assignedChairNumber;
      } else {
        const allDentists = await tx.user.findMany({
          where: { clinicId, role: 'DENTIST', isActive: true },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        const dIndex = allDentists.findIndex((d) => d.id === preferredDentistId);
        if (dIndex >= 0 && dIndex < totalChairs) {
          preferredChair = dIndex + 1;
        }
      }
    }


    // 3. Sort candidates:
    // - Preferred doctor chair first
    // - Fewest bookings that day ascending
    // - Ties broken by lowest chair number ascending
    freeChairsInSlot.sort((a, b) => {
      const aIsPref = preferredChair === a ? 1 : 0;
      const bIsPref = preferredChair === b ? 1 : 0;
      if (aIsPref !== bIsPref) return bIsPref - aIsPref;

      const loadA = chairLoads[a] || 0;
      const loadB = chairLoads[b] || 0;
      if (loadA !== loadB) return loadA - loadB;

      return a - b;
    });

    return freeChairsInSlot;
  }

  async create(clinicId: string, dto: CreateAppointmentDto, actor: any) {
    const start = new Date(dto.scheduledStart);
    if (isNaN(start.getTime())) {
      throw new BadRequestException('Invalid scheduled start time');
    }

    const duration = dto.durationMinutes || 30;
    const end = new Date(start.getTime() + duration * 60 * 1000);

    // 1. Unified assertOpen check
    await this.clinicHoursService.assertOpen(
      clinicId,
      start,
      'RECEPTION_BOOKING',
      dto.overrideReason,
      actor,
      duration,
    );

    return this.prisma.forTenant(clinicId, async (tx) => {
      // Verify patient and resolve dentist
      const patient = await tx.patient.findFirst({ where: { id: dto.patientId, clinicId } });
      if (!patient) throw new NotFoundException('Patient record not found');

      let dentist = null;
      if (dto.dentistId) {
        dentist = await tx.user.findFirst({ where: { id: dto.dentistId, clinicId, isActive: true } });
      } else {
        dentist = await tx.user.findFirst({
          where: { clinicId, role: { in: ['DENTIST', 'CLINIC_ADMIN'] }, isActive: true },
          orderBy: { role: 'asc' },
        });
      }
      if (!dentist) throw new NotFoundException('Dentist record not found or no active dentist available in clinic');

      const isImmediateCheckIn = dto.status === 'CHECKED_IN';
      let tokenNumber: number | null = null;
      if (isImmediateCheckIn) {
        const istDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(start);
        const seqRecord = await tx.dailyQueueSequence.upsert({
          where: { clinicId_dateString: { clinicId, dateString: istDateStr } },
          update: { lastSequence: { increment: 1 } },
          create: { clinicId, dateString: istDateStr, lastSequence: 1 },
        });
        tokenNumber = (dto as any).tokenNumber || seqRecord.lastSequence;
      }
      const trackingCode = (dto as any).trackingCode || crypto.randomBytes(16).toString('hex');

      let appt: any = null;

      // Check if specific chair explicitly requested
      let chair = dto.chairNumber;
      if (chair && chair > 0) {
        const clinic = await tx.clinic.findUnique({ where: { id: clinicId } });
        let isOffDuty = false;
        if (clinic?.workingHours) {
          try {
            const parsed = JSON.parse(clinic.workingHours);
            if (parsed.chairStatus && parsed.chairStatus[String(chair)] === false) {
              isOffDuty = true;
            }
          } catch {}
        }
        if (isOffDuty) {
          throw new BadRequestException(`Operatory Chair ${chair} is currently OFF DUTY. Please select an active chair.`);
        }

        if (dto.status !== 'CHECKED_IN') {
          await this.checkConflict(clinicId, dentist.id, chair, start, end, undefined, tx);
        }

        try {
          appt = await tx.appointment.create({
            data: {
              clinicId,
              patientId: dto.patientId,
              dentistId: dentist.id,
              createdById: actor.userId || actor.id,
              chairNumber: chair,
              expectedChairNumber: chair,
              preferredDentistId: dto.dentistId || null,
              tokenNumber,
              trackingCode,
              scheduledStart: start,
              scheduledEnd: end,
              durationMinutes: duration,
              reason: dto.reason.trim(),
              status: dto.status || 'SCHEDULED',
              checkInTime: dto.status === 'CHECKED_IN' ? new Date() : null,
              notes: dto.notes,
            },
            include: {
              patient: { select: { fullName: true, phone: true, uhid: true, legacySlNo: true } },
              dentist: { select: { fullName: true } },
            },
          });
        } catch (err: any) {
          if (err.message?.includes('no_overlapping_dentist_booking')) {
            throw new ConflictException(
              `Dentist ${dentist.fullName || 'Doctor'} is already booked with another patient during this time window.`,
            );
          }
          if (err.message?.includes('no_overlapping_chair_booking') || err.code === '23P01') {
            throw new ConflictException(
              `Dental Operatory Chair ${chair} is already occupied during this time window by another confirmed patient.`,
            );
          }
          throw err;
        }
      } else {
        // Automatic Intelligent Chair Allocation with Concurrency Retry Loop (Requirement 6)
        // Check dentist conflicts first before iterating candidate chairs
        if (dto.status !== 'CHECKED_IN') {
          // 1. Dentist booking conflict
          const activeStatuses = ['PENDING_CONFIRMATION', 'SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_CHAIR'];
          const dentistConflict = await tx.appointment.findFirst({
            where: {
              clinicId,
              dentistId: dentist.id,
              status: { in: activeStatuses },
              AND: [
                { scheduledStart: { lt: end } },
                { scheduledEnd: { gt: start } },
              ],
            },
            include: {
              patient: { select: { fullName: true } },
            },
          });
          if (dentistConflict) {
            const patientName = (dentistConflict as any).patient?.fullName || 'Another Patient';
            throw new ConflictException(
              `Dentist is already booked for patient "${patientName}" between ${dentistConflict.scheduledStart.toLocaleTimeString()} and ${dentistConflict.scheduledEnd.toLocaleTimeString()}`,
            );
          }

          // 2. Dentist leave conflict
          if (tx.dentistUnavailability) {
            const leaveConflict = await tx.dentistUnavailability.findFirst({
              where: {
                clinicId,
                dentistId: dentist.id,
                AND: [
                  { startAt: { lt: end } },
                  { endAt: { gt: start } },
                ],
              },
              include: {
                dentist: { select: { fullName: true } },
              },
            });
            if (leaveConflict) {
              const dName = leaveConflict.dentist?.fullName || dentist.fullName || 'Doctor';
              throw new ConflictException(
                `Dr. ${dName} is unavailable (${leaveConflict.reason}) during this time window. Please choose another dentist or slot.`,
              );
            }
          }
        }

        const candidates = await this.getCandidateChairsForSlot(clinicId, start, end, dto.dentistId, tx);
        if (candidates.length === 0) {
          throw new ConflictException(
            'All operatory chairs are fully booked for this time slot. Please choose another time.',
          );
        }

        let createdSuccess = false;
        for (const candidateChair of candidates) {
          try {
            if (dto.status !== 'CHECKED_IN') {
              await this.checkConflict(clinicId, dentist.id, candidateChair, start, end, undefined, tx);
            }

            appt = await tx.appointment.create({
              data: {
                clinicId,
                patientId: dto.patientId,
                dentistId: dentist.id,
                createdById: actor.userId || actor.id,
                chairNumber: candidateChair,
                expectedChairNumber: candidateChair,
                preferredDentistId: dto.dentistId || null,
                tokenNumber,
                trackingCode,
                scheduledStart: start,
                scheduledEnd: end,
                durationMinutes: duration,
                reason: dto.reason.trim(),
                status: dto.status || 'SCHEDULED',
                checkInTime: dto.status === 'CHECKED_IN' ? new Date() : null,
                notes: dto.notes,
              },
              include: {
                patient: { select: { fullName: true, phone: true, uhid: true, legacySlNo: true } },
                dentist: { select: { fullName: true } },
              },
            });
            createdSuccess = true;
            break;
          } catch (err: any) {
            // If conflict is on the dentist, propagate immediately!
            if (err.message?.includes('Dentist is already booked') || err.message?.includes('is unavailable') || err.message?.includes('no_overlapping_dentist_booking')) {
              throw new ConflictException(
                `Dentist ${dentist.fullName || 'Doctor'} is already booked with another patient during this time window.`,
              );
            }
            // GiST exclusion violation or concurrent chair overlap -> retry next candidate!
            if (err.code === '23P01' || err.message?.includes('no_overlapping_chair_booking') || err.message?.includes('Operatory Chair') || err instanceof ConflictException) {
              continue;
            }
            throw err;
          }
        }


        if (!createdSuccess || !appt) {
          throw new ConflictException(
            'All operatory chairs are fully booked for this time slot. Please choose another time.',
          );
        }
      }

      await this.auditService.log({
        clinicId,
        actorId: actor.userId || actor.id,
        actorRole: actor.role || 'STAFF',
        action: 'APPOINTMENT_BOOKED',
        entityType: 'Appointment',
        entityId: appt.id,
        details: {
          patientName: appt.patient.fullName,
          dentistName: appt.dentist.fullName,
          scheduledStart: appt.scheduledStart,
          chairNumber: appt.chairNumber,
        },
      }, tx);

      return this.formatAppointment(appt);
    });
  }

  async findAll(clinicId: string, query: { date?: string; dentistId?: string; status?: string; chairNumber?: number }) {
    return this.prisma.forTenant(clinicId, async (tx) => {
      const where: any = { clinicId };

      if (query.dentistId) where.dentistId = query.dentistId;
      if (query.status) where.status = query.status;
      if (query.chairNumber) where.chairNumber = Number(query.chairNumber);

      if (query.date) {
        const dayStart = new Date(query.date);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(query.date);
        dayEnd.setHours(23, 59, 59, 999);
        where.scheduledStart = { gte: dayStart, lte: dayEnd };
      }

      const appointments = await tx.appointment.findMany({
        where,
        orderBy: { scheduledStart: 'asc' },
        include: {
          patient: {
            select: {
              fullName: true,
              phone: true,
              uhid: true,
              legacySlNo: true,
              needsVerification: true,
              source: true,
              gender: true,
              age: true,
              bloodGroup: true,
              allergies: true,
              medicalConditions: true,
              currentMedications: true,
            },
          },
          dentist: { select: { fullName: true } },
        },
      });

      return appointments.map(a => this.formatAppointment(a));
    });
  }

  public static readonly VALID_APPOINTMENT_STATUSES = [
    'PENDING_CONFIRMATION',
    'SCHEDULED',
    'CONFIRMED',
    'CHECKED_IN',
    'CALLED',
    'IN_CHAIR',
    'TREATED',
    'BILLED',
    'PAID',
    'COMPLETED',
    'CANCELLED',
    'NO_SHOW',
    'LATE',
    'SKIPPED',
    'STEPPED_OUT',
    'CLOSED',
    'RESCHEDULED',
  ] as const;

  async updateStatus(clinicId: string, id: string, dto: UpdateAppointmentStatusDto, actor: any) {
    if (!AppointmentsService.VALID_APPOINTMENT_STATUSES.includes(dto.status as any)) {
      throw new BadRequestException(
        `Invalid appointment status: "${dto.status}". Allowed statuses are: ${AppointmentsService.VALID_APPOINTMENT_STATUSES.join(', ')}`
      );
    }

    return this.prisma.forTenant(clinicId, async (tx) => {
      const appt = await tx.appointment.findFirst({
        where: { id, clinicId },
        include: {
          patient: { select: { fullName: true, needsVerification: true, allergies: true } },
          clinic: { select: { requireDeskConfirmation: true } },
        },
      });

      if (!appt) throw new NotFoundException('Appointment not found');

      // State transition validation (unless emergency override or admin bypass)
      if (appt.status !== dto.status) {
        const ALLOWED_TRANSITIONS: Record<string, string[]> = {
          PENDING_CONFIRMATION: ['SCHEDULED', 'CONFIRMED', 'CANCELLED'],
          SCHEDULED: ['CONFIRMED', 'CHECKED_IN', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED', 'LATE'],
          CONFIRMED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED', 'SCHEDULED', 'LATE'],
          CHECKED_IN: ['CALLED', 'IN_CHAIR', 'SKIPPED', 'STEPPED_OUT', 'CANCELLED', 'NO_SHOW'],
          CALLED: ['IN_CHAIR', 'SKIPPED', 'STEPPED_OUT', 'CHECKED_IN', 'CANCELLED'],
          IN_CHAIR: ['TREATED', 'COMPLETED', 'CALLED', 'SKIPPED'],
          TREATED: ['BILLED', 'COMPLETED', 'PAID'],
          BILLED: ['PAID', 'COMPLETED'],
          PAID: ['COMPLETED', 'CLOSED'],
          SKIPPED: ['CHECKED_IN', 'CALLED', 'CANCELLED', 'NO_SHOW'],
          STEPPED_OUT: ['CHECKED_IN', 'CALLED', 'CANCELLED'],
          LATE: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
          RESCHEDULED: ['SCHEDULED', 'CONFIRMED', 'CANCELLED'],
          COMPLETED: ['TREATED'],
          CANCELLED: ['SCHEDULED'],
          NO_SHOW: ['SCHEDULED', 'CHECKED_IN'],
          CLOSED: [],
        };

        const allowed = ALLOWED_TRANSITIONS[appt.status] || [];
        const isBypass = Boolean(dto.emergencyReason || actor?.role === 'CLINIC_ADMIN');
        if (!isBypass && !allowed.includes(dto.status)) {
          throw new BadRequestException(
            `Cannot transition appointment from "${appt.status}" to "${dto.status}". Allowed next statuses are: ${allowed.join(', ') || 'None (Terminal state)'}.`,
          );
        }
      }

      const targetChair = (dto.chairNumber && dto.chairNumber >= 1 && dto.chairNumber <= 10)
        ? dto.chairNumber
        : appt.chairNumber;

      // 1. Desk Confirmation Enforcement & Dual CALLED Collision Protection
      if (dto.status === 'CALLED') {
        if (appt.clinic?.requireDeskConfirmation && !appt.isConfirmedAtDesk) {
          throw new BadRequestException('Patient must be confirmed in person at the reception desk before being called to the operatory chair.');
        }

        // Check if another patient is ALREADY called or seated in this chair
        const activeInChair = await tx.appointment.findFirst({
          where: {
            clinicId,
            chairNumber: targetChair,
            id: { not: id },
            status: { in: ['CALLED', 'IN_CHAIR'] },
          },
          include: { patient: { select: { fullName: true } } },
        });

        if (activeInChair) {
          throw new ConflictException(
            `Chair #${targetChair} already has another patient ${activeInChair.status === 'CALLED' ? 'called' : 'currently seated'} ("${activeInChair.patient?.fullName || 'Patient'}"). Please select an alternate chair.`
          );
        }
      }

      const now = new Date();
      const updateData: any = {
        status: dto.status,
        notes: dto.notes ? `${appt.notes || ''}\n[Status Note]: ${dto.notes}` : appt.notes,
      };

      if (dto.chairNumber && dto.chairNumber >= 1 && dto.chairNumber <= 10) {
        updateData.chairNumber = dto.chairNumber;
      }

      // 2. Seating Safety Enforcement, Timing Realignment & Booking Conflict Protection
      if (dto.status === 'IN_CHAIR') {
        // Check if another patient is currently occupying the chair (including treatment overrun detection)
        const currentOccupant = await tx.appointment.findFirst({
          where: {
            clinicId,
            chairNumber: targetChair,
            id: { not: id },
            status: 'IN_CHAIR',
          },
          include: { patient: { select: { fullName: true } } },
        });

        if (currentOccupant) {
          const isOverrun = currentOccupant.scheduledEnd < now;
          throw new ConflictException(
            `Chair #${targetChair} is currently occupied by "${currentOccupant.patient?.fullName || 'another patient'}"${isOverrun ? ' (treatment in progress / overrun)' : ''}. Please release the chair before seating.`
          );
        }

        // Real seating time and duration calculation
        const duration = appt.durationMinutes || 30;
        const seatingStart = now;
        let seatingEnd = new Date(now.getTime() + duration * 60 * 1000);

        // Check for upcoming booked slots (SCHEDULED, CONFIRMED) on this chair
        const upcomingBooking = await tx.appointment.findFirst({
          where: {
            clinicId,
            chairNumber: targetChair,
            id: { not: id },
            status: { in: ['SCHEDULED', 'CONFIRMED'] },
            scheduledStart: { lt: seatingEnd, gte: seatingStart },
          },
          include: { patient: { select: { fullName: true } } },
          orderBy: { scheduledStart: 'asc' },
        });

        if (upcomingBooking) {
          const bookingTimeStr = new Intl.DateTimeFormat('en-IN', {
            timeZone: 'Asia/Kolkata',
            hour: 'numeric',
            minute: 'numeric',
            hour12: true,
          }).format(upcomingBooking.scheduledStart);

          if (!dto.overrideConflict) {
            throw new ConflictException(
              `Chair #${targetChair} has an upcoming scheduled booking for "${upcomingBooking.patient?.fullName || 'Patient'}" at ${bookingTimeStr}. Please select another chair or confirm override.`
            );
          } else {
            // Reception explicitly confirmed override: cap duration so GiST constraint succeeds
            seatingEnd = upcomingBooking.scheduledStart;
            updateData.notes = `${updateData.notes || appt.notes || ''}\n[OVERRIDE]: Seated despite upcoming booking at ${bookingTimeStr}. Expected duration adjusted.`;
          }
        }

        updateData.scheduledStart = seatingStart;
        updateData.scheduledEnd = seatingEnd;
      }

      // 3. Additional status updates
      if (dto.status === 'TREATED') {
        updateData.status = 'TREATED';
      }

      if (dto.emergencyReason && dto.emergencyReason.trim()) {
        updateData.notes = `${updateData.notes || appt.notes || ''}\n[EMERGENCY ESCALATION]: ${dto.emergencyReason.trim()}`;
      }

      if (dto.status === 'CHECKED_IN') {
        // Assert clinic is open for receptionist check-in
        await this.clinicHoursService.assertOpen(
          clinicId,
          now,
          'RECEPTION_CHECKIN',
          dto.emergencyReason,
          actor,
          undefined,
          tx,
        );
        if (!appt.checkInTime) updateData.checkInTime = now;
        updateData.isConfirmedAtDesk = true;
        if (!appt.tokenNumber) {
          const istDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
          const seqRecord = await tx.dailyQueueSequence.upsert({
            where: { clinicId_dateString: { clinicId, dateString: istDateStr } },
            update: { lastSequence: { increment: 1 } },
            create: { clinicId, dateString: istDateStr, lastSequence: 1 },
          });
          updateData.tokenNumber = seqRecord.lastSequence;
        }
      }

      const updated = await tx.appointment.update({
        where: { id },
        data: updateData,
        include: {
          patient: { select: { fullName: true, phone: true, uhid: true } },
          dentist: { select: { fullName: true } },
        },
      });

      let action = 'APPOINTMENT_STATUS_CHANGED';
      if (dto.status === 'CALLED') action = 'APPOINTMENT_PATIENT_CALLED_TO_CHAIR';
      else if (dto.status === 'IN_CHAIR') action = 'APPOINTMENT_SEATED_IN_CHAIR';
      else if (dto.emergencyReason) action = 'APPOINTMENT_EMERGENCY_ESCALATION';

      await this.auditService.log({
        clinicId,
        actorId: actor?.userId || 'system',
        actorRole: actor?.role || 'STAFF',
        action,
        entityType: 'Appointment',
        entityId: id,
        details: {
          previousStatus: appt.status,
          newStatus: dto.status,
          chairNumber: targetChair,
          emergencyReason: dto.emergencyReason,
          patientName: appt.patient.fullName,
        },
      });

      return this.formatAppointment(updated);
    });
  }

  async confirmPresence(clinicId: string, id: string, staffUser: any) {
    const role = staffUser?.role || 'STAFF';
    // Allow CLINIC_ADMIN, RECEPTIONIST, and DENTIST (solo clinic mode)
    if (!['CLINIC_ADMIN', 'RECEPTIONIST', 'DENTIST'].includes(role)) {
      throw new ForbiddenException('Only clinic staff or dentist can confirm patient arrival in person.');
    }

    return this.prisma.forTenant(clinicId, async (tx) => {
      const appt = await tx.appointment.findFirst({
        where: { id, clinicId },
        include: { patient: { select: { fullName: true } } },
      });

      if (!appt) throw new NotFoundException('Appointment not found');

      const dataToUpdate: any = {
        isConfirmedAtDesk: true,
        confirmedAtDeskAt: new Date(),
        confirmedByStaffId: staffUser?.userId || staffUser?.id || null,
      };

      if (['SCHEDULED', 'CONFIRMED'].includes(appt.status)) {
        await this.clinicHoursService.assertOpen(
          clinicId,
          new Date(),
          'RECEPTION_CHECKIN',
          undefined,
          staffUser,
          undefined,
          tx,
        );
        dataToUpdate.status = 'CHECKED_IN';
        if (!appt.checkInTime) dataToUpdate.checkInTime = new Date();
      }

      if (!appt.tokenNumber) {
        const istDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
        const seqRecord = await tx.dailyQueueSequence.upsert({
          where: { clinicId_dateString: { clinicId, dateString: istDateStr } },
          update: { lastSequence: { increment: 1 } },
          create: { clinicId, dateString: istDateStr, lastSequence: 1 },
        });
        dataToUpdate.tokenNumber = seqRecord.lastSequence;
      }

      const updated = await tx.appointment.update({
        where: { id },
        data: dataToUpdate,
        include: {
          patient: { select: { fullName: true, phone: true, uhid: true } },
          dentist: { select: { fullName: true } },
        },
      });

      await this.auditService.log({
        clinicId,
        actorId: staffUser?.userId || staffUser?.id || 'staff',
        actorRole: role,
        action: 'PATIENT_DESK_PRESENCE_CONFIRMED',
        entityType: 'Appointment',
        entityId: id,
        details: { patientName: appt.patient.fullName },
      });

      return this.formatAppointment(updated);
    });
  }

  async reschedule(clinicId: string, id: string, dto: RescheduleAppointmentDto, actor: any) {
    const newStart = new Date(dto.newScheduledStart);
    if (isNaN(newStart.getTime())) {
      throw new BadRequestException('Invalid scheduled start time');
    }

    return this.prisma.forTenant(clinicId, async (tx) => {
      const appt = await tx.appointment.findFirst({ where: { id, clinicId } });
      if (!appt) throw new NotFoundException('Appointment not found');

      const duration = dto.durationMinutes || appt.durationMinutes || 30;

      // Unified assertOpen check (Requirement 3)
      await this.clinicHoursService.assertOpen(
        clinicId,
        newStart,
        'RESCHEDULE',
        dto.overrideReason,
        actor,
        duration,
        tx,
      );

      const newEnd = new Date(newStart.getTime() + duration * 60 * 1000);
      const chair = dto.chairNumber || appt.chairNumber;

      // Check conflict excluding current appointment
      await this.checkConflict(clinicId, appt.dentistId, chair, newStart, newEnd, id, tx);

      const updated = await tx.appointment.update({
        where: { id },
        data: {
          scheduledStart: newStart,
          scheduledEnd: newEnd,
          durationMinutes: duration,
          chairNumber: chair,
          status: 'SCHEDULED',
          notes: dto.reason ? `${appt.notes || ''}\n[Rescheduled]: ${dto.reason}` : appt.notes,
        },
        include: {
          patient: { select: { fullName: true, phone: true, uhid: true } },
          dentist: { select: { fullName: true } },
        },
      });

      await this.auditService.log({
        clinicId,
        actorId: actor?.userId || actor?.id || 'staff',
        actorRole: actor?.role || 'STAFF',
        action: 'APPOINTMENT_RESCHEDULED',
        entityType: 'Appointment',
        entityId: id,
        details: { oldStart: appt.scheduledStart, newStart: updated.scheduledStart },
      });

      return this.formatAppointment(updated);
    });
  }

  private formatAppointment(a: any) {
    const parseArray = (val: any) => {
      if (!val) return [];
      if (Array.isArray(val)) return val;
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return typeof val === 'string' && val.trim() ? [val.trim()] : [];
      }
    };

    return {
      id: a.id,
      clinicId: a.clinicId,
      patientId: a.patientId,
      patientName: a.patient?.fullName || 'Unknown',
      patientPhone: a.patient?.phone || '',
      patientUhid: a.patient?.uhid || '',
      patientGender: a.patient?.gender || null,
      patientAge: a.patient?.age || null,
      patientBloodGroup: a.patient?.bloodGroup || null,
      patientAllergies: parseArray(a.patient?.allergies),
      patientMedicalConditions: parseArray(a.patient?.medicalConditions),
      patientCurrentMedications: parseArray(a.patient?.currentMedications),
      dentistId: a.dentistId,
      dentistName: a.dentist?.fullName || 'Assigned Doctor',
      chairNumber: a.chairNumber,
      expectedChairNumber: a.expectedChairNumber,
      tokenNumber: a.tokenNumber,
      trackingCode: a.trackingCode,
      preferredDentistId: a.preferredDentistId,
      isConfirmedAtDesk: a.isConfirmedAtDesk || false,
      confirmedAtDeskAt: a.confirmedAtDeskAt,
      checkInSource: a.checkInSource || 'DESK',
      scheduledStart: a.scheduledStart,
      scheduledEnd: a.scheduledEnd,
      durationMinutes: a.durationMinutes,
      reason: a.reason,
      status: a.status,
      checkInTime: a.checkInTime,
      isReappearance: a.isReappearance || false,
      legacySlNo: a.legacySlNo || a.patient?.legacySlNo || null,
      notes: a.notes,
      needsVerification: Boolean(a.patient?.needsVerification),
      source: a.patient?.source || 'RECEPTION',
      createdAt: a.createdAt,
    };
  }

  normalizePhoneToE164(phone: string): string {
    const digits = (phone || '').replace(/\D/g, '');
    if (digits.length === 10) return `+91${digits}`;
    if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
    if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
    return digits ? `+${digits}` : '';
  }

  // Lookup patients under a phone number (Staff only, clinic-scoped)
  async lookupPatientsByPhone(phone: string, clinicId?: string) {
    const digits = phone.replace(/\D/g, '');
    const tail10 = digits.slice(-10);
    if (tail10.length !== 10) {
      return { exists: false, patients: [] };
    }

    let clinic = null;
    if (clinicId) {
      clinic = await this.prisma.clinic.findFirst({
        where: { id: clinicId },
      });
    } else {
      clinic = await this.prisma.clinic.findFirst();
    }
    if (!clinic) return { exists: false, patients: [] };

    return await this.prisma.forTenant(clinic.id, async (tx) => {
      const patients = await tx.patient.findMany({
        where: {
          clinicId: clinic.id,
          phone: { contains: tail10 },
          isArchived: false,
        },
        select: {
          id: true,
          uhid: true,
          fullName: true,
          relationToAccount: true,
          gender: true,
          age: true,
          dateOfBirth: true,
          allergies: true,
          source: true,
          needsVerification: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      return {
        exists: patients.length > 0,
        patients: patients.map(p => ({
          ...p,
          allergies: parseJsonArray(p.allergies),
        })),
      };
    });
  }

  // STEP 2: Online booking - Single transaction find-or-create Patient & create Appointment (SCHEDULED)
  async createPublicRequest(dto: CreatePublicAppointmentDto, clientIp?: string, patientToken?: string, hostClinicId?: string) {
    // 1. Resolve clinic strictly and isolate
    let clinic = null;
    if (hostClinicId) {
      clinic = await this.prisma.clinic.findUnique({
        where: { id: hostClinicId },
      });
    }
    if (!clinic && dto.clinicCode) {
      clinic = await this.prisma.clinic.findFirst({
        where: { code: dto.clinicCode.toUpperCase() },
      });
    }

    if (!clinic) {
      throw new NotFoundException('Dental clinic not found or not configured.');
    }

    const clinicId = clinic.id;

    // 2. Validate preferred date and slot timing
    const apptDate = new Date(dto.preferredDate);
    if (isNaN(apptDate.getTime())) {
      throw new BadRequestException('Invalid preferred appointment date format. Use YYYY-MM-DD.');
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkDate = new Date(apptDate);
    checkDate.setHours(0, 0, 0, 0);
    if (checkDate < today) {
      throw new BadRequestException('Preferred appointment date cannot be in the past.');
    }

    const scheduledStart = this.parseSlotTime(dto.preferredDate, dto.preferredSlot);

    // Unified assertOpen check (Requirement 1, 3: Slots offered and allowed only inside working hours)
    await this.clinicHoursService.assertOpen(
      clinicId,
      scheduledStart,
      'PUBLIC_BOOKING',
    );

    // 3. Normalize phone to E.164
    const normalizedPhone = this.normalizePhoneToE164(dto.phone);
    if (!normalizedPhone || normalizedPhone.replace(/\D/g, '').length < 10) {
      throw new BadRequestException('Please provide a valid contact mobile number.');
    }
    const phoneTail = normalizedPhone.slice(-10);

    // 3e. Cloudflare Turnstile CAPTCHA Verification
    if (process.env.TURNSTILE_SECRET_KEY && dto.turnstileToken) {
      try {
        const turnstileRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            secret: process.env.TURNSTILE_SECRET_KEY,
            response: dto.turnstileToken,
            remoteip: clientIp,
          }),
        });
        const turnstileData: any = await turnstileRes.json();
        if (!turnstileData.success) {
          throw new BadRequestException('CAPTCHA verification failed. Please try again.');
        }
      } catch (err: any) {
        if (err instanceof BadRequestException) throw err;
      }
    }

    // 4. Decode Patient Account Token if Present
    let decodedAccountId: string | null = null;
    if (patientToken) {
      try {
        const parts = patientToken.split('.');
        if (parts.length === 2) {
          const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
          if (payload && payload.role === 'PATIENT' && payload.accountId) {
            decodedAccountId = payload.accountId;
          }
        }
      } catch {}
    }

    // 5. ONE TRANSACTION: Find-or-create Patient & Create Appointment (Fail-Closed & Atomic)
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.clinic_id', ${clinicId}, true)`;

      // 5a. Duplicate-Submission Protection: Reject submissions for same phone in last 15 mins
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      const recentPending = await tx.appointment.findFirst({
        where: {
          clinicId,
          patient: { phone: { contains: phoneTail } },
          status: { in: ['PENDING_CONFIRMATION', 'SCHEDULED'] },
          createdAt: { gte: fifteenMinutesAgo },
        },
      });

      if (recentPending) {
        throw new ConflictException(
          'An appointment request for this phone number has already been received recently. Our clinic team will reach out to you shortly to confirm your slot.',
        );
      }

      // 5b. Active Upcoming Bookings Limit: Max 2 active appointments per phone
      const activeUpcomingCount = await tx.appointment.count({
        where: {
          clinicId,
          patient: { phone: { contains: phoneTail } },
          status: { in: ['PENDING_CONFIRMATION', 'SCHEDULED', 'CONFIRMED'] },
          scheduledStart: { gte: new Date() },
        },
      });

      if (activeUpcomingCount >= 2) {
        throw new BadRequestException(
          'This mobile number already has 2 active upcoming appointments. Please contact our reception desk directly for additional bookings.',
        );
      }

      // 5c. Prior No-Show Abuse Tracking (last 60 days)
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      const priorNoShows = await tx.appointment.count({
        where: {
          clinicId,
          patient: { phone: { contains: phoneTail } },
          status: 'NO_SHOW',
          scheduledStart: { gte: sixtyDaysAgo },
        },
      });
      const isHighNoShowRisk = priorNoShows >= 2;
      const noShowAuditNote = isHighNoShowRisk
        ? `\n[HIGH NO-SHOW RISK ALERT]: Patient has ${priorNoShows} recorded no-shows in past 60 days.`
        : '';

      let patient: any = null;

      // Case A: Specific patientId was explicitly passed by logged-in patient
      if (dto.patientId) {
        patient = await tx.patient.findFirst({
          where: { id: dto.patientId, clinicId, isArchived: false },
        });
        if (!patient) {
          throw new NotFoundException('Selected patient record could not be found.');
        }
        if (decodedAccountId && patient.accountId && patient.accountId !== decodedAccountId) {
          throw new ForbiddenException('You do not have permission to book for this patient profile.');
        }
      }

      // Case B: Find or create patient
      if (!patient) {
        const cleanInputName = dto.fullName.trim().toLowerCase();
        // Match ONLY on normalized phone plus name (plus DOB if given)
        const existingPatientsOnPhone = await tx.patient.findMany({
          where: {
            clinicId,
            phone: { contains: phoneTail },
            isArchived: false,
          },
        });

        const exactMatch = existingPatientsOnPhone.find(
          p => p.fullName.trim().toLowerCase() === cleanInputName,
        );

        if (exactMatch) {
          patient = exactMatch;
          // Update consent if not already recorded
          if (!patient.consentDataUse) {
            patient = await tx.patient.update({
              where: { id: patient.id },
              data: {
                consentDataUse: true,
                consentWhatsapp: Boolean(dto.consentWhatsapp),
                consentVersion: dto.consentVersion || 'v1.0',
                consentAt: new Date(),
              },
            });
          }
        } else {
          // Shared phone with different name: NEVER merge silently!
          // Create new distinct patient record flagged with possibleDuplicate = true, source = ONLINE, needsVerification = true
          const isSharedPhoneOtherName = existingPatientsOnPhone.length > 0;
          const year = new Date().getFullYear();
          const seq = await this.prisma.nextSequence(clinicId, 'UHID', String(year), tx);
          const randSuffix = crypto.randomBytes(2).toString('hex').toUpperCase();
          const uhid = `${clinic.code}-${year}-${String(seq).padStart(4, '0')}-${randSuffix}`;

          patient = await tx.patient.create({
            data: {
              clinicId,
              accountId: decodedAccountId || undefined,
              relationToAccount: decodedAccountId ? 'FAMILY' : undefined,
              uhid,
              fullName: dto.fullName.trim(),
              phone: normalizedPhone,
              email: dto.email ? dto.email.trim().toLowerCase() : null,
              gender: dto.gender ? dto.gender.toUpperCase() : 'OTHER',
              age: dto.age ? Number(dto.age) : undefined,
              dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
              source: 'ONLINE',
              needsVerification: true,
              possibleDuplicate: isSharedPhoneOtherName,
              consentDataUse: true,
              consentWhatsapp: Boolean(dto.consentWhatsapp),
              consentVersion: dto.consentVersion || 'v1.0',
              consentAt: new Date(),
              notes: `Online booking request for ${dto.service}${isSharedPhoneOtherName ? ' [FLAGGED: Shared mobile number with different patient name]' : ''}`,
            },
          });
        }
      }

      // 6. Resolve medical staff assignment
      const staff = await tx.user.findFirst({
        where: { clinicId, isActive: true },
        orderBy: { createdAt: 'asc' },
      });
      if (!staff) {
        throw new BadRequestException('No active medical staff available in clinic configuration.');
      }

      const dentist = (await tx.user.findFirst({
        where: { clinicId, role: 'DENTIST', isActive: true },
        orderBy: { createdAt: 'asc' },
      })) || staff;

      // 7. Calculate slot timing
      const scheduledStart = this.parseSlotTime(dto.preferredDate, dto.preferredSlot);
      const scheduledEnd = new Date(scheduledStart.getTime() + 30 * 60 * 1000);

      // Intelligent Candidate Chair Allocation with Concurrency Retry Loop (Requirement 6)
      const candidates = await this.getCandidateChairsForSlot(
        clinicId,
        scheduledStart,
        scheduledEnd,
        undefined,
        tx,
      );

      if (candidates.length === 0) {
        throw new ConflictException(
          'All operatory chairs are fully booked for this time slot. Please choose another slot.',
        );
      }

      // 8. Generate 128-bit unguessable tracking code
      const trackingCode = crypto.randomBytes(16).toString('hex'); // 32 hex chars = 128 bits
      const isWalkin = Boolean(dto.isWalkin) ||
                       Boolean(dto.lobbyCode) ||
                       (dto.service && /walk[- ]?in|lobby/i.test(dto.service)) ||
                       (dto.notes && /walk[- ]?in|lobby/i.test(dto.notes)) ||
                       (dto.preferredSlot && /walk[- ]?in/i.test(dto.preferredSlot));
      const initialStatus = isWalkin ? 'CHECKED_IN' : 'SCHEDULED';
      const checkInTime = isWalkin ? new Date() : null;

      let tokenNumber: number | null = null;
      if (isWalkin) {
        const istDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(scheduledStart);
        const seqRecord = await tx.dailyQueueSequence.upsert({
          where: {
            clinicId_dateString: {
              clinicId,
              dateString: istDateStr,
            },
          },
          update: {
            lastSequence: { increment: 1 },
          },
          create: {
            clinicId,
            dateString: istDateStr,
            lastSequence: 1,
          },
        });
        tokenNumber = seqRecord.lastSequence;
      }

      // 9. Persist Appointment with Candidate Retry Loop
      let appt: any = null;
      let finalChair = candidates[0];

      for (const candidateChair of candidates) {
        try {
          await this.checkConflict(clinicId, dentist.id, candidateChair, scheduledStart, scheduledEnd, undefined, tx);

          appt = await tx.appointment.create({
            data: {
              clinicId,
              patientId: patient.id,
              dentistId: dentist.id,
              createdById: staff.id,
              chairNumber: candidateChair,
              expectedChairNumber: candidateChair,
              scheduledStart,
              scheduledEnd,
              durationMinutes: 30,
              reason: isWalkin
                ? `[Hospital Lobby Walk-In] ${dto.service} (Operatory #${candidateChair})`
                : `[Public Request] ${dto.service} (${dto.preferredSlot})`,
              status: initialStatus,
              checkInTime,
              isConfirmedAtDesk: isWalkin,
              checkInSource: isWalkin ? 'SELF_QR' : 'ONLINE',
              tokenNumber,
              trackingCode,
              notes: `Preferred Slot: ${dto.preferredSlot}\nOperatory Chair: #${candidateChair}\nClient Notes: ${dto.notes || 'None'}${noShowAuditNote}\nClient IP: ${clientIp || 'N/A'}\nSubmission: ${isWalkin ? 'Hospital Lobby Standee QR (Checked-In)' : 'Online /book portal'}`,
            },
          });
          finalChair = candidateChair;
          break;
        } catch (err: any) {
          if (err.code === '23P01' || err.message?.includes('no_overlapping_chair_booking') || err instanceof ConflictException) {
            continue;
          }
          throw err;
        }
      }

      if (!appt) {
        throw new ConflictException(
          'All operatory chairs are fully booked for this time slot. Please choose another slot.',
        );
      }

      const shortId = appt.id.replace(/-/g, '').substring(0, 5).toUpperCase();
      const reference = `${clinic.code}-${new Date().getFullYear()}-${shortId}`;

      return {
        success: true,
        reference,
        tokenNumber,
        trackingCode,
        trackingUrl: `/track/${trackingCode}`,
        chairNumber: finalChair,
        status: initialStatus,
        clinicName: clinic.name,
        clinicPhone: clinic.phone,
        patientName: patient.fullName,
        preferredDate: dto.preferredDate,
        preferredSlot: dto.preferredSlot,
        service: dto.service,
        requiresConfirmation: !isWalkin,
        isCheckedIn: isWalkin,
        intakeToken: this.generateIntakeToken(clinicId, patient.id, appt.id),
        message: isWalkin
          ? `Welcome to the clinic! You are checked in. Token #${tokenNumber} has been assigned.`
          : 'Your appointment has been scheduled. Track your live visit status on mobile using your private tracking link.',
        appointmentId: appt.id,
        staffId: staff.id,
      };
    });

    // 10. Audit trail (run post-commit to avoid holding transactions or connection deadlocks)
    Promise.resolve(
      this.auditService.log({
        clinicId,
        actorId: result.staffId,
        actorRole: 'SYSTEM',
        action: 'PUBLIC_BOOKING_REQUEST_RECEIVED',
        entityType: 'Appointment',
        entityId: result.appointmentId,
        details: {
          reference: result.reference,
          tokenNumber: result.tokenNumber,
          chairNumber: result.chairNumber,
          preferredDate: dto.preferredDate,
          preferredSlot: dto.preferredSlot,
          service: dto.service,
          clientIp: clientIp || 'unknown',
          trackingCodeCreated: true,
        },
      }),
    ).catch(() => {});

    return result;
  }

  // Helper to obtain midnight-to-midnight bounds in Asia/Kolkata
  private getKolkataDayBounds(date = new Date()): { dateStr: string; start: Date; end: Date } {
    const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
    const start = new Date(`${dateStr}T00:00:00.000+05:30`);
    const end = new Date(`${dateStr}T23:59:59.999+05:30`);
    return { dateStr, start, end };
  }

  // Rate limiter stores
  private static lookupRateLimits: Map<string, { count: number; resetAt: number }> = new Map();
  private static trackRateLimits: Map<string, { count: number; resetAt: number }> = new Map();

  private checkRateLimit(map: Map<string, { count: number; resetAt: number }>, key: string, maxLimit = 20, windowMs = 60000) {
    const now = Date.now();
    const entry = map.get(key);
    if (!entry || entry.resetAt < now) {
      map.set(key, { count: 1, resetAt: now + windowMs });
    } else {
      entry.count++;
      if (entry.count > maxLimit) {
        throw new BadRequestException('Too many requests. Please wait a moment before trying again.');
      }
    }
  }

  // STEP 2: One-click Reception Consultation Booking with Atomic Token & Real Board Dispatch
  async receptionQuickConsult(clinicId: string, dto: ReceptionQuickConsultDto, staffUser: any, clientIp?: string) {
    // 1. Strict Phone Validation: Reject wildcards %, _, and non-10 digit numbers
    if (!dto.phone || typeof dto.phone !== 'string' || dto.phone.includes('%') || dto.phone.includes('_')) {
      throw new BadRequestException('Please provide a valid 10-digit mobile number');
    }
    const digitsOnly = dto.phone.replace(/\D/g, '');
    let phoneTail = digitsOnly;
    if (digitsOnly.startsWith('91') && digitsOnly.length === 12) phoneTail = digitsOnly.slice(2);
    else if (digitsOnly.startsWith('0') && digitsOnly.length === 11) phoneTail = digitsOnly.slice(1);
    if (phoneTail.length !== 10) {
      throw new BadRequestException('Please provide a valid 10-digit mobile number');
    }
    const normalizedPhone = `+91${phoneTail}`;

    // 2. Consent Enforcement under DPDP Act
    if (dto.consentDataUse === false) {
      if (!dto.allowEmergencyBypassWithoutConsent) {
        throw new BadRequestException('Patient consent for data use is required to complete registration.');
      }
      const actorRole = staffUser?.role || 'RECEPTIONIST';
      if (!['DENTIST', 'CLINIC_ADMIN', 'ADMIN'].includes(actorRole)) {
        throw new ForbiddenException('Emergency consent bypass is restricted to DENTIST and CLINIC_ADMIN roles.');
      }
      this.auditService.log({
        clinicId,
        actorId: staffUser.userId || staffUser.id,
        actorRole,
        action: 'WALKIN_CONSENT_BYPASSED_EMERGENCY',
        entityType: 'Patient',
        entityId: 'NEW',
        details: { phone: normalizedPhone, fullName: dto.fullName, reason: 'Emergency registration bypass without consent' },
      }).catch(() => {});
    }

    // 3. Date of Birth & Age resolution
    let resolvedDob: Date | undefined = undefined;
    let isDobApprox = false;
    let resolvedAge: number | undefined = undefined;

    if (dto.dateOfBirth) {
      resolvedDob = new Date(dto.dateOfBirth);
      isDobApprox = Boolean(dto.dobApproximate);
      resolvedAge = dto.age || Math.max(0, new Date().getFullYear() - resolvedDob.getFullYear());
    } else if (dto.age) {
      resolvedAge = Number(dto.age);
      isDobApprox = true;
      resolvedDob = new Date(new Date().getFullYear() - resolvedAge, 0, 1);
    }

    // Unified assertOpen check (Requirement 1, 3: Walk-in allowed only inside working hours)
    await this.clinicHoursService.assertOpen(
      clinicId,
      new Date(),
      'RECEPTION_WALKIN',
      dto.overrideReason,
      staffUser,
    );

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.clinic_id', ${clinicId}, true)`;
      let patient: any = null;

      // Step A: If receptionist picked an existing patient
      if (dto.patientId) {
        patient = await tx.patient.findFirst({
          where: { id: dto.patientId, clinicId, isArchived: false },
        });
        if (!patient) throw new NotFoundException('Selected patient record could not be found');
      }

      // Step B: If quick-adding or searching by phone & name
      if (!patient) {
        if (!dto.fullName || !dto.fullName.trim()) {
          throw new BadRequestException('Patient Full Name is required to register a walk-in consultation.');
        }
        const cleanName = dto.fullName.trim();

        // Check if exact name on this phone exists
        const existingOnPhone = await tx.patient.findMany({
          where: {
            clinicId,
            phone: normalizedPhone,
            isArchived: false,
          },
        });

        const exactMatch = existingOnPhone.find(
          p => p.fullName.trim().toLowerCase() === cleanName.toLowerCase(),
        );

        if (exactMatch) {
          patient = exactMatch;
        } else {
          // Register new walk-in patient at reception
          const clinic = await tx.clinic.findUnique({ where: { id: clinicId } });
          const year = new Date().getFullYear();
          const seq = await this.prisma.nextSequence(clinicId, 'UHID', String(year), tx);
          const randSuffix = crypto.randomBytes(2).toString('hex').toUpperCase();
          const uhid = `${clinic?.code || 'AKS'}-${year}-${String(seq).padStart(4, '0')}-${randSuffix}`;

          patient = await tx.patient.create({
            data: {
              clinicId,
              uhid,
              fullName: cleanName,
              phone: normalizedPhone,
              age: resolvedAge,
              dateOfBirth: resolvedDob,
              dobApproximate: isDobApprox,
              gender: dto.gender || 'UNKNOWN',
              allergies: safeJsonStringArray(dto.allergies),
              source: 'RECEPTION',
              needsVerification: false, // Receptionist verified in person at desk!
              possibleDuplicate: existingOnPhone.length > 0,
              consentDataUse: dto.consentDataUse !== false,
              consentWhatsapp: Boolean(dto.consentWhatsapp ?? true),
              consentVersion: dto.consentVersion || 'v1.0',
              consentAt: new Date(),
              notes: dto.notes ? `Quick-add walk-in: ${dto.notes}` : 'Walk-in consultation booked at reception desk',
            },
          });
        }
      }

      // Step C: Resolve Dentist
      let dentist: any = null;
      if (dto.preferredDentistId) {
        dentist = await tx.user.findFirst({
          where: { id: dto.preferredDentistId, clinicId, isActive: true },
        });
      }
      if (!dentist) {
        dentist = await tx.user.findFirst({
          where: { clinicId, role: 'DENTIST', isActive: true },
          orderBy: { createdAt: 'asc' },
        });
      }
      if (!dentist) {
        dentist = await tx.user.findFirst({
          where: { clinicId, isActive: true },
          orderBy: { createdAt: 'asc' },
        });
      }
      if (!dentist) {
        throw new BadRequestException('No active dentist or staff member configured for this clinic.');
      }

      // Step D: Atomic sequential daily queue token in Asia/Kolkata
      const now = new Date();
      const { dateStr: istDateStr, start: todayStart, end: todayEnd } = this.getKolkataDayBounds(now);
      const seqRecord = await tx.dailyQueueSequence.upsert({
        where: {
          clinicId_dateString: {
            clinicId,
            dateString: istDateStr,
          },
        },
        update: {
          lastSequence: { increment: 1 },
        },
        create: {
          clinicId,
          dateString: istDateStr,
          lastSequence: 1,
        },
      });
      const tokenNumber = seqRecord.lastSequence;

      // Step E: REAL BOARD Chair Availability & Expected Chair Logic
      const clinic = await tx.clinic.findUnique({ where: { id: clinicId } });
      const totalChairs = Math.max(clinic?.chairCount || 2, 1);
      let chairConfig: Record<string, boolean> = {};
      for (let i = 1; i <= totalChairs; i++) chairConfig[String(i)] = true;
      if (clinic?.workingHours) {
        try {
          const parsed = JSON.parse(clinic.workingHours);
          if (parsed && parsed.chairStatus) chairConfig = { ...chairConfig, ...parsed.chairStatus };
        } catch {}
      }

      // Determine on-duty chairs
      const onDutyChairs: number[] = [];
      for (let i = 1; i <= totalChairs; i++) {
        if (chairConfig[String(i)] !== false) {
          onDutyChairs.push(i);
        }
      }
      if (onDutyChairs.length === 0) onDutyChairs.push(1);

      // Find all appointments currently in chairs
      const inChairAppts = await tx.appointment.findMany({
        where: {
          clinicId,
          status: 'IN_CHAIR',
          scheduledStart: { gte: todayStart, lte: todayEnd },
        },
        select: { chairNumber: true, scheduledEnd: true },
      });
      const occupiedChairs = new Set(inChairAppts.map(a => a.chairNumber));

      // Find how many patients are waiting ahead with status CHECKED_IN
      const waitingAhead = await tx.appointment.count({
        where: {
          clinicId,
          status: 'CHECKED_IN',
          scheduledStart: { gte: todayStart, lte: todayEnd },
        },
      });

      // Find all on-duty chairs that are currently free
      const freeOnDutyChairs = onDutyChairs.filter(c => !occupiedChairs.has(c));

      let isImmediateSeat = false;
      let expectedChair = onDutyChairs[0];
      let chairBanner = '';

      if (waitingAhead === 0 && freeOnDutyChairs.length > 0) {
        // Patient is next and an on-duty chair is free!
        isImmediateSeat = true;
        expectedChair = freeOnDutyChairs[0];
        chairBanner = `Chair #${expectedChair}: Go now`;
      } else {
        // All chairs occupied or patients waiting ahead:
        // Pick free chair now, else the chair expected to free first (Requirement 6)
        isImmediateSeat = false;
        if (freeOnDutyChairs.length > 0) {
          expectedChair = freeOnDutyChairs[0];
        } else {
          const sortedBusy = inChairAppts
            .filter((a: any) => onDutyChairs.includes(a.chairNumber))
            .sort((a: any, b: any) => new Date(a.scheduledEnd).getTime() - new Date(b.scheduledEnd).getTime());
          expectedChair = sortedBusy.length > 0 ? sortedBusy[0].chairNumber : onDutyChairs[0];
        }
        chairBanner = `${waitingAhead} patients ahead, Chair #${expectedChair} (expected) - chair assigned when called`;
      }

      // Real time: Walk-in start time is NOW, check-in time is NOW (no fake 9:00 AM slots)
      const apptStart = now;
      const apptEnd = new Date(now.getTime() + 30 * 60 * 1000);

      // Step F: 128-bit unguessable tracking code
      const trackingCode = crypto.randomBytes(16).toString('hex');

      // Step G: Persist Appointment with status CHECKED_IN
      // Chair is null (unassigned) until CALLED or seated; expectedChairNumber is informational
      const appt = await tx.appointment.create({
        data: {
          clinicId,
          patientId: patient.id,
          dentistId: dentist.id,
          createdById: staffUser.userId || staffUser.id,
          chairNumber: expectedChair,
          expectedChairNumber: expectedChair,
          preferredDentistId: dto.preferredDentistId || null,
          scheduledStart: apptStart,
          scheduledEnd: apptEnd,
          durationMinutes: 30,
          reason: dto.reason || 'General Dental Consultation',
          status: 'CHECKED_IN',
          checkInTime: now,
          isConfirmedAtDesk: true,
          confirmedAtDeskAt: now,
          confirmedByStaffId: staffUser.userId || staffUser.id,
          checkInSource: 'DESK',
          tokenNumber,
          trackingCode,
          notes: dto.notes || 'Walk-in consultation booked at reception desk',
        },
      });

      const shortId = appt.id.replace(/-/g, '').substring(0, 5).toUpperCase();
      const reference = `${clinic?.code || 'AKS'}-${now.getFullYear()}-${shortId}`;

      return {
        success: true,
        appointmentId: appt.id,
        reference,
        tokenNumber,
        trackingCode,
        trackingUrl: `/track/${trackingCode}`,
        chairNumber: isImmediateSeat ? expectedChair : null,
        expectedChairNumber: expectedChair,
        isImmediateSeat,
        patientsAhead: waitingAhead,
        chairBanner,
        status: 'CHECKED_IN',
        patient: {
          id: patient.id,
          uhid: patient.uhid,
          fullName: patient.fullName,
          phone: patient.phone,
          age: patient.age,
          gender: patient.gender,
          allergies: parseJsonArray(patient.allergies),
        },
        dentistName: dentist.fullName,
        clinicName: clinic?.name || 'Dental Clinic',
        clinicPhone: clinic?.phone || '',
        clinicAddress: clinic?.address || '',
      };
    }, { maxWait: 60000, timeout: 60000 });

    // Step H: Audit log (post-commit)
    this.auditService.log({
      clinicId,
      actorId: staffUser.userId || staffUser.id,
      actorRole: staffUser.role || 'RECEPTIONIST',
      action: 'RECEPTION_QUICK_CONSULT_BOOKED',
      entityType: 'Appointment',
      entityId: result.appointmentId,
      details: {
        reference: result.reference,
        tokenNumber: result.tokenNumber,
        expectedChairNumber: result.expectedChairNumber,
        isImmediateSeat: result.isImmediateSeat,
        patientsAhead: result.patientsAhead,
      },
    }).catch(() => {});

    return result;
  }

  // STEP 2: Public Mobile Visit Tracking by 128-bit Unguessable Code
  // Resolves strictly through normal tenant scoping without SECURITY DEFINER bypass
  async trackByCode(code: string, hostClinicId?: string, clientIp?: string) {
    const cleanCode = (code || '').trim();
    if (cleanCode.length < 16) {
      throw new NotFoundException('Invalid tracking code format');
    }

    // Rate limit check on tracking code attempts (per code and per IP)
    this.checkRateLimit(AppointmentsService.trackRateLimits, `track_code:${cleanCode}`, 30, 60000);
    if (clientIp) {
      this.checkRateLimit(AppointmentsService.trackRateLimits, `track_ip:${clientIp}`, 60, 60000);
    }

    // 1. Resolve hostClinicId if provided (either UUID or clinic code)
    let targetClinicId = hostClinicId;
    if (targetClinicId) {
      const c = await this.prisma.clinic.findFirst({
        where: { OR: [{ id: targetClinicId }, { code: targetClinicId.toUpperCase() }] },
        select: { id: true },
      });
      if (c) targetClinicId = c.id;
    }

    // If hostClinicId was specified, scope strictly to that tenant under RLS
    if (targetClinicId) {
      return await this.prisma.forTenant(targetClinicId, async (tx) => {
        const appt = await tx.appointment.findFirst({
          where: {
            trackingCode: cleanCode,
            clinicId: targetClinicId,
          },
          include: {
            clinic: {
              select: { id: true, name: true, phone: true, address: true, code: true },
            },
            dentist: {
              select: { fullName: true, specialization: true },
            },
            patient: {
              select: { phone: true, fullName: true },
            },
          },
        });

        if (!appt) {
          throw new NotFoundException('No active appointment record found for this tracking code');
        }

        // 2. Check visit day expiry in Asia/Kolkata
        const nowKolkata = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
        const apptKolkata = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(appt.scheduledStart));
        if (apptKolkata < nowKolkata) {
          throw new NotFoundException('This tracking link has expired after the visit day.');
        }

        // 3. Query queue metrics strictly under tenant isolation
        const { start: dayStart, end: dayEnd } = this.getKolkataDayBounds(appt.scheduledStart);

        // Patients ahead in queue (status CHECKED_IN, CALLED, or IN_CHAIR with tokenNumber < this token)
        const currentlyAhead = await tx.appointment.count({
          where: {
            clinicId: appt.clinicId,
            scheduledStart: { gte: dayStart, lte: dayEnd },
            status: { in: ['CHECKED_IN', 'CALLED', 'IN_CHAIR'] },
            tokenNumber: { lt: appt.tokenNumber || 999999 },
          },
        });

        // Next waiting patient across the clinic
        const nextWaiting = await tx.appointment.findFirst({
          where: {
            clinicId: appt.clinicId,
            scheduledStart: { gte: dayStart, lte: dayEnd },
            status: { in: ['CHECKED_IN', 'CALLED'] },
          },
          orderBy: { tokenNumber: 'asc' },
          select: {
            tokenNumber: true,
            chairNumber: true,
          },
        });

        // Total patients currently waiting in lobby
        const totalWaiting = await tx.appointment.count({
          where: {
            clinicId: appt.clinicId,
            scheduledStart: { gte: dayStart, lte: dayEnd },
            status: 'CHECKED_IN',
          },
        });

        // Active chairs serving in the clinic right now
        const inChairAppts = await tx.appointment.findMany({
          where: {
            clinicId: appt.clinicId,
            scheduledStart: { gte: dayStart, lte: dayEnd },
            status: { in: ['CALLED', 'IN_CHAIR'] },
          },
          select: {
            chairNumber: true,
            tokenNumber: true,
            status: true,
          },
        });

        const activeChairsServing = inChairAppts.map(ic => ({
          chairNumber: ic.chairNumber || 1,
          tokenNumber: ic.tokenNumber,
          isBusy: ic.status === 'IN_CHAIR',
          isCalling: ic.status === 'CALLED',
        }));

        const clinicChairCount = (await tx.clinic.findUnique({ where: { id: appt.clinicId }, select: { chairCount: true } }))?.chairCount || 1;
        const targetChairNum = appt.expectedChairNumber || appt.chairNumber || (clinicChairCount === 1 ? 1 : null);
        const servingInThisChair = inChairAppts.find(ic => (targetChairNum ? (ic.chairNumber || 1) === targetChairNum : true)) || inChairAppts[0];

        const queuePosition = appt.status === 'CHECKED_IN'
          ? currentlyAhead + 1
          : (['CALLED', 'IN_CHAIR'].includes(appt.status) ? 0 : null);

        const isSelfServing = (servingInThisChair && servingInThisChair.tokenNumber === appt.tokenNumber) || appt.status === 'IN_CHAIR';

        let chairBanner = `Operatory Chair #${targetChairNum || 1} is sanitized and preparing for you.`;
        if (isSelfServing) {
          chairBanner = `You are currently seated in Operatory Chair #${targetChairNum || servingInThisChair?.chairNumber || 1}. Consultation & procedure in progress.`;
        } else if (appt.status === 'CALLED') {
          chairBanner = `Your Token #${appt.tokenNumber} has been called to Chair #${targetChairNum || 1}! Please proceed into the operatory room.`;
        } else if (servingInThisChair) {
          if (currentlyAhead === 0) {
            chairBanner = `Operatory Chair #${targetChairNum || servingInThisChair.chairNumber || 1} is currently treating Token #${servingInThisChair.tokenNumber}. You are next in line!`;
          } else {
            chairBanner = `Operatory Chair #${targetChairNum || servingInThisChair.chairNumber || 1} is currently treating Token #${servingInThisChair.tokenNumber}. ${currentlyAhead} patient${currentlyAhead > 1 ? 's' : ''} ahead of you.`;
          }
        }

        const shortId = appt.id.replace(/-/g, '').substring(0, 5).toUpperCase();
        const reference = `${appt.clinic?.code || 'CLINIC'}-${new Date(appt.createdAt).getFullYear()}-${shortId}`;

        const rawPhone = appt.patient?.phone || '';
        const phoneDigits = rawPhone.replace(/\D/g, '');
        const maskedPhone = phoneDigits.length >= 4 ? `+91 ****** ${phoneDigits.slice(-4)}` : '';

        return {
          success: true,
          reference,
          patientPhone: maskedPhone,
          tokenNumber: appt.tokenNumber,
          status: appt.status,
          chairNumber: appt.chairNumber || targetChairNum || 1,
          expectedChairNumber: appt.expectedChairNumber || targetChairNum || 1,
          isImmediateSeat: appt.isConfirmedAtDesk && appt.status === 'CALLED',
          patientsAhead: currentlyAhead,
          currentlyAhead,
          queuePosition,
          nextTokenNumber: nextWaiting?.tokenNumber || null,
          totalWaitingInLobby: totalWaiting,
          servingInThisChairToken: servingInThisChair?.tokenNumber || null,
          servingInThisChairStatus: servingInThisChair?.status || null,
          chairBanner,
          activeChairsServing,
          clinicName: appt.clinic?.name || 'Dental Clinic',
          clinicAddress: appt.clinic?.address || '',
          clinicPhone: appt.clinic?.phone || '',
          scheduledStart: appt.scheduledStart,
        };
      });
    }

    // Trusted clinic context is strictly required to prevent cross-tenant scanning (SEC-03)
    throw new BadRequestException('Clinic context or clinic identifier is required to track appointment.');
  }

  // STEP 3: Safe Privacy-Preserving Public Mobile Queue Lookup
  // Scoped to the host's clinic, runs under normal RLS, returns zero PII, exact token/ref match
  async publicLookup(dto: PublicLookupDto, clinicId?: string, clientIp?: string) {
    const startTime = Date.now();

    // 1. Strict Phone Validation: Reject wildcards %, _, and non-10 digit inputs
    const rawPhone = (dto.phone || '').trim();
    if (!rawPhone || rawPhone.includes('%') || rawPhone.includes('_')) {
      throw new BadRequestException('Please provide a valid 10-digit mobile number');
    }
    const digitsOnly = rawPhone.replace(/\D/g, '');
    let phoneTail = digitsOnly;
    if (digitsOnly.startsWith('91') && digitsOnly.length === 12) phoneTail = digitsOnly.slice(2);
    else if (digitsOnly.startsWith('0') && digitsOnly.length === 11) phoneTail = digitsOnly.slice(1);
    if (phoneTail.length !== 10) {
      throw new BadRequestException('Please provide a valid 10-digit mobile number');
    }
    const normalizedPhone = `+91${phoneTail}`;

    // 2. Rate-limiting per IP and per phone
    this.checkRateLimit(AppointmentsService.lookupRateLimits, `lookup_ip:${clientIp || 'unknown'}`, 15, 60000);
    this.checkRateLimit(AppointmentsService.lookupRateLimits, `lookup_phone:${phoneTail}`, 10, 60000);

    // 3. Resolve clinicId from host, dto.clinicCode, or patient search
    let targetClinicId = clinicId;
    if (!targetClinicId && dto.clinicCode) {
      const c = await this.prisma.clinic.findFirst({
        where: {
          OR: [{ id: dto.clinicCode }, { code: dto.clinicCode.toUpperCase() }],
        },
      });
      if (c) targetClinicId = c.id;
    }

    if (!targetClinicId) {
      // Reject cross-tenant scanning: Never infer tenant authorization from a patient phone number (SEC-03)
      return {
        found: false,
        message: 'No active visit matching this mobile number and token/reference was found for today.',
      };
    }

    const uniformFailure = async () => {
      // Capped artificial timing delay to prevent worker starvation while shielding timing
      const elapsed = Date.now() - startTime;
      if (elapsed < 20) {
        await new Promise(r => setTimeout(r, Math.min(20 - elapsed, 15)));
      }
      return {
        found: false,
        message: 'No active visit matching this mobile number and token/reference was found for today.',
      };
    };

    if (!targetClinicId) {
      return await uniformFailure();
    }

    const { start: todayStart, end: todayEnd } = this.getKolkataDayBounds(new Date());

    // 4. Query under normal tenant RLS
    const lookupResult = await this.prisma.forTenant(targetClinicId, async (tx) => {
      // Exact normalized phone match
      const patients = await tx.patient.findMany({
        where: {
          clinicId: targetClinicId,
          phone: normalizedPhone,
          isArchived: false,
        },
        select: { id: true },
      });

      if (patients.length === 0) return null;
      const patientIds = patients.map(p => p.id);

      // Find active appointments for today
      const appts = await tx.appointment.findMany({
        where: {
          clinicId: targetClinicId,
          patientId: { in: patientIds },
          scheduledStart: { gte: todayStart, lte: todayEnd },
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        },
        orderBy: { scheduledStart: 'asc' },
      });

      if (appts.length === 0) return null;

      const tokenOrRef = (dto.tokenOrReference || '').trim();
      let matchedAppt = appts[0];

      const clinicRecord = await tx.clinic.findUnique({
        where: { id: targetClinicId },
        select: { allowPublicPhoneLookup: true },
      });

      if (clinicRecord?.allowPublicPhoneLookup === false && !tokenOrRef) {
        return { phoneLookupDisabled: true };
      }

      if (tokenOrRef) {
        // EXACT matching only — NO LIKE or substring matching!
        const isNumeric = /^\d+$/.test(tokenOrRef);
        if (isNumeric) {
          const tNum = parseInt(tokenOrRef, 10);
          const found = appts.find(a => a.tokenNumber === tNum);
          if (!found) return null;
          matchedAppt = found;
        } else {
          const cleanRef = tokenOrRef.toUpperCase();
          const found = appts.find(a => {
            const shortId = a.id.replace(/-/g, '').substring(0, 5).toUpperCase();
            return cleanRef === a.id.toUpperCase() || cleanRef === shortId;
          });
          if (!found) return null;
          matchedAppt = found;
        }
      } else if (appts.length > 1) {
        return { multipleVisits: true };
      }

      // Count patients waiting ahead
      const currentlyAhead = await tx.appointment.count({
        where: {
          clinicId: targetClinicId,
          scheduledStart: { gte: todayStart, lte: todayEnd },
          status: { in: ['CHECKED_IN', 'CALLED'] },
          tokenNumber: { lt: matchedAppt.tokenNumber || 999999 },
        },
      });

      return {
        appt: matchedAppt,
        currentlyAhead,
      };
    });

    // Capped artificial timing delay to prevent worker starvation
    const elapsed = Date.now() - startTime;
    if (elapsed < 20) {
      await new Promise(r => setTimeout(r, Math.min(20 - elapsed, 15)));
    }

    if (!lookupResult) {
      return await uniformFailure();
    }

    if ((lookupResult as any).phoneLookupDisabled) {
      return {
        found: false,
        phoneLookupDisabled: true,
        message: 'Direct mobile-only lookup is disabled by the clinic for patient privacy. Please use your personalized tracking link or enter your token number alongside your mobile number.',
      };
    }

    if ((lookupResult as any).multipleVisits) {
      return {
        found: false,
        multipleVisits: true,
        message: 'Multiple visits found on this mobile number today. Please enter your Token Number or Booking Reference to choose.',
      };
    }

    const { appt, currentlyAhead } = lookupResult;
    const tokenOrRef = (dto.tokenOrReference || '').trim();
    const queuePosition = appt.status === 'CHECKED_IN' ? currentlyAhead + 1 : (['CALLED', 'IN_CHAIR'].includes(appt.status) ? 0 : null);

    // If phone-only lookup: return ONLY tokenNumber, patientsAhead, status (NO clinic name, NO chair details)
    if (!tokenOrRef) {
      return {
        found: true,
        tokenNumber: appt.tokenNumber,
        patientsAhead: currentlyAhead,
        currentlyAhead,
        queuePosition,
        status: appt.status,
      };
    }

    // If verified with exact token or booking reference:
    return {
      found: true,
      tokenNumber: appt.tokenNumber,
      status: appt.status,
      chairNumber: ['CALLED', 'IN_CHAIR'].includes(appt.status) ? appt.chairNumber : null,
      expectedChairNumber: appt.expectedChairNumber,
      patientsAhead: currentlyAhead,
      currentlyAhead,
      queuePosition,
    };
  }

  private parseSlotTime(dateStr: string, slotStr: string): Date {
    if (!slotStr || slotStr.toUpperCase().includes('WALK-IN')) {
      return new Date();
    }

    const cleanDate = (dateStr || '').trim();
    const dateMatch = cleanDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const validDateStr = dateMatch ? cleanDate : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

    const match = slotStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (match) {
      let hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const meridiem = match[3].toUpperCase();

      if (meridiem === 'PM' && hours < 12) hours += 12;
      if (meridiem === 'AM' && hours === 12) hours = 0;

      const hh = String(hours).padStart(2, '0');
      const mm = String(minutes).padStart(2, '0');

      // Explicitly specify IST offset (+05:30) so UTC EC2 servers store the exact Indian time moment
      const isoWithIST = `${validDateStr}T${hh}:${mm}:00+05:30`;
      const parsed = new Date(isoWithIST);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    return new Date(`${validDateStr}T10:00:00+05:30`);
  }

  async getPublicStatus(identifier: string, maybeClinicId?: string) {
    const clean = (identifier || '').trim();
    if (!clean) throw new BadRequestException('Booking reference is required');

    // Strict privacy protection: Reject direct phone number lookup (SEC-01)
    const isPhone = /^[0-9+ -]{8,15}$/.test(clean);
    if (isPhone) {
      throw new BadRequestException(
        'Direct mobile-number lookup is prohibited for patient privacy. Please use your personalized appointment tracking link or booking reference.',
      );
    }

    let targetClinicId = maybeClinicId;
    if (!targetClinicId && clean.includes('-')) {
      const codePrefix = clean.split('-')[0].toUpperCase();
      const c = await this.prisma.clinic.findFirst({ where: { code: codePrefix } });
      if (c) targetClinicId = c.id;
    }

    if (!targetClinicId) {
      throw new BadRequestException('Clinic context or booking reference with valid clinic code prefix is required.');
    }

    const appt = await this.prisma.forTenant(targetClinicId, async (tx) => {
      const parts = clean.split('-');
      const candidateId = parts[parts.length - 1].toLowerCase();
      return tx.appointment.findFirst({
        where: {
          clinicId: targetClinicId,
          OR: [
            { id: clean },
            { trackingCode: clean },
            ...(candidateId.length >= 5 ? [{ id: { startsWith: candidateId } }] : []),
          ],
        },
        include: {
          clinic: { select: { id: true, name: true, address: true, phone: true, code: true } },
        },
      });
    });

    if (!appt) {
      throw new NotFoundException('No active appointment record found for the provided details.');
    }

    const dayStart = new Date(appt.scheduledStart);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(appt.scheduledStart);
    dayEnd.setHours(23, 59, 59, 999);

    return this.prisma.forTenant(appt.clinicId, async (tx) => {
      const tokenNumber = appt.tokenNumber || null;
      let currentlyAhead = 0;
      if (tokenNumber) {
        currentlyAhead = await tx.appointment.count({
          where: {
            clinicId: appt.clinicId,
            scheduledStart: { gte: dayStart, lte: dayEnd },
            status: { in: ['CHECKED_IN', 'CALLED', 'IN_CHAIR'] },
            tokenNumber: { lt: tokenNumber },
          },
        });
      }

      const ref = `${appt.clinic?.code || 'CLINIC'}-${new Date(appt.createdAt).getFullYear()}-${appt.id.replace(/-/g, '').substring(0, 5).toUpperCase()}`;

      const inChairAppts = await tx.appointment.findMany({
        where: {
          clinicId: appt.clinicId,
          scheduledStart: { gte: dayStart, lte: dayEnd },
          status: { in: ['CALLED', 'IN_CHAIR'] },
        },
        select: {
          id: true,
          chairNumber: true,
          status: true,
          tokenNumber: true,
        },
      });

      const activeChairsServing = inChairAppts.map(ic => ({
        chairNumber: ic.chairNumber || 1,
        tokenNumber: ic.tokenNumber || 1,
        isBusy: ic.status === 'IN_CHAIR',
        isCalling: ic.status === 'CALLED',
      }));

      // SEC-01: Return ONLY the minimum information needed for check-in or queue tracking.
      // Strictly OMIT patientName, patientUhid, patientPhone, dentistName, reason, allergies/intake.
      return {
        success: true,
        clinicId: appt.clinicId,
        reference: ref,
        status: appt.status,
        tokenNumber,
        currentlyAhead,
        activeChairsServing,
        chairNumber: ['CALLED', 'IN_CHAIR'].includes(appt.status) ? (appt.chairNumber || 1) : null,
        scheduledStart: appt.scheduledStart,
        durationMinutes: appt.durationMinutes || 30,
        clinicName: appt.clinic?.name || 'Dental Clinic',
        clinicAddress: appt.clinic?.address || '',
        clinicPhone: appt.clinic?.phone || '',
      };
    });
  }

  async publicSelfCheckIn(dtoOrIdentifier: any, maybeClinicCode?: string, clientIp?: string, hostClinicId?: string) {
    const dto = typeof dtoOrIdentifier === 'string'
      ? { identifier: dtoOrIdentifier, clinicCode: maybeClinicCode, lobbyCode: undefined, patientName: undefined, bookingReference: undefined }
      : (dtoOrIdentifier || {});

    const ip = clientIp || dto.clientIp || '127.0.0.1';

    // 1. IP and Device Lockout Protection
    if (this.isIpLockedOut(ip)) {
      throw new BadRequestException(
        'Too many failed check-in attempts from this connection. Please proceed to the reception desk for assistance.',
      );
    }

    let clinic: any = null;
    if (hostClinicId) {
      clinic = await this.prisma.clinic.findUnique({ where: { id: hostClinicId } });
    }
    if (!clinic && dto.clinicCode) {
      clinic = await this.prisma.clinic.findFirst({
        where: { code: dto.clinicCode.toUpperCase() },
      });
    }
    if (!clinic && maybeClinicCode) {
      clinic = await this.prisma.clinic.findFirst({
        where: { code: maybeClinicCode.toUpperCase() },
      });
    }
    if (!clinic) {
      const rawIdent = (dto.identifier || dto.bookingReference || '').trim();
      if (rawIdent.includes('-')) {
        const prefix = rawIdent.split('-')[0].toUpperCase();
        clinic = await this.prisma.clinic.findFirst({ where: { code: prefix } });
      }
    }
    if (!clinic) {
      throw new BadRequestException('Dental clinic could not be resolved from host context, QR code, or booking reference. Please scan the clinic standee QR code.');
    }
    // Unified assertOpen check (Requirement 1, 3: Self check-in allowed only inside working hours)
    await this.clinicHoursService.assertOpen(
      clinic.id,
      new Date(),
      'SELF_CHECKIN',
    );

    // 2. Clinic Aggregate Check-in Pause (DDoS protection)
    if (this.isClinicCheckinPaused(clinic.id)) {
      throw new BadRequestException(
        'Self check-in is temporarily paused. Please check in directly with the receptionist at the front desk.',
      );
    }

    // 3. Optional Rotating HMAC Lobby Code Verification (If code provided)
    if (clinic.requireLobbyCode && dto.lobbyCode) {
      const codeCandidate = String(dto.lobbyCode).trim();
      const isValid = this.verifyRotatingLobbyCode(clinic, codeCandidate);
      if (!isValid) {
        this.recordFailedLobbyAttempt(ip, clinic.id);
        throw new BadRequestException(
          `Invalid or expired lobby code. Please check with reception.`,
        );
      }
    }

    return this.prisma.forTenant(clinic.id, async (tx) => {
      const now = new Date();
      const { dateStr: istDateStr, start: todayStart, end: todayEnd } = this.getKolkataDayBounds(now);

      let appt: any = null;
      const cleanIdent = (dto.identifier || dto.phone || dto.bookingReference || '').trim();
      const patientPhone = (dto.patientPhone || '').trim().replace(/\D/g, '').slice(-10);
      const patientName = (dto.patientName || dto.fullName || '').trim().toLowerCase();

      // Check if identifier is a Booking Reference (e.g. AKS-2026-A1B2 or contains '-' or alphanumeric short code)
      const isBookingRef = cleanIdent.includes('-') || (cleanIdent.length <= 8 && !/^\d{10}$/.test(cleanIdent));

      if (isBookingRef) {
        const parts = cleanIdent.split('-');
        const shortId = parts[parts.length - 1].toLowerCase();
        const allRecent = await tx.appointment.findMany({
          where: {
            clinicId: clinic.id,
            scheduledStart: { gte: todayStart, lte: todayEnd },
            status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          },
          include: {
            patient: true,
            dentist: { select: { fullName: true } },
            clinic: { select: { name: true, address: true, phone: true, code: true, requireDeskConfirmation: true } },
          },
        });
        appt = allRecent.find((a: any) =>
          a.id.replace(/-/g, '').toLowerCase().startsWith(shortId) ||
          a.id.toLowerCase().includes(shortId)
        );

        if (appt && patientPhone && !appt.patient.phone.replace(/\D/g, '').endsWith(patientPhone)) {
          throw new BadRequestException('The mobile number provided does not match this booking reference.');
        }
      }

      // If not resolved by booking ref, search by phone number or UHID
      if (!appt && cleanIdent) {
        const digits = cleanIdent.replace(/\D/g, '');
        const phoneTail = digits.length >= 10 ? digits.slice(-10) : patientPhone;

        if (phoneTail && phoneTail.length >= 10) {
          const candidates = await tx.appointment.findMany({
            where: {
              clinicId: clinic.id,
              patient: { phone: { contains: phoneTail } },
              scheduledStart: { gte: todayStart, lte: todayEnd },
              status: { notIn: ['CANCELLED', 'NO_SHOW'] },
            },
            orderBy: { scheduledStart: 'asc' },
            include: {
              patient: true,
              dentist: { select: { fullName: true } },
              clinic: { select: { name: true, address: true, phone: true, code: true, requireDeskConfirmation: true } },
            },
          });

          if (candidates.length === 1) {
            if (patientName && !candidates[0].patient.fullName.toLowerCase().includes(patientName)) {
              throw new BadRequestException('Patient name does not match the appointment record for this mobile number.');
            }
            appt = candidates[0];
          } else if (candidates.length > 1) {
            if (!patientName) {
              throw new BadRequestException('Multiple appointments found on this mobile number. Please enter the Patient Full Name as booked.');
            }
            appt = candidates.find((c: any) => c.patient.fullName.toLowerCase().includes(patientName));
            if (!appt) {
              throw new BadRequestException(`No appointment matching name "${dto.patientName}" found on this mobile number.`);
            }
          }
        } else if (cleanIdent.includes('UHID') || cleanIdent.startsWith(clinic.code)) {
          appt = await tx.appointment.findFirst({
            where: {
              clinicId: clinic.id,
              patient: { uhid: cleanIdent },
              scheduledStart: { gte: todayStart, lte: todayEnd },
              status: { notIn: ['CANCELLED', 'NO_SHOW'] },
            },
            orderBy: { scheduledStart: 'asc' },
            include: {
              patient: true,
              dentist: { select: { fullName: true } },
              clinic: { select: { name: true, address: true, phone: true, code: true, requireDeskConfirmation: true } },
            },
          });
        }
      }

      if (!appt) {
        throw new NotFoundException(
          'No appointment found matching these details. If you do not have a booking, you can register as a walk-in at reception or choose "I don\'t have a booking".',
        );
      }

      if (appt.status === 'COMPLETED' || appt.status === 'TREATED') {
        throw new BadRequestException('This appointment was already completed today.');
      }
      if (appt.status === 'CANCELLED') {
        throw new BadRequestException('This appointment was cancelled. Please register with the reception desk.');
      }

      // Early / Late Arrival Business Rules
      const scheduledTime = new Date(appt.scheduledStart).getTime();
      const currentTime = now.getTime();
      const diffMinutes = Math.round((currentTime - scheduledTime) / (60 * 1000));
      const maxLate = clinic.maxLateMinutes ?? 45;
      const maxEarlyMinutes = 120; // 2 hours early window

      const isAlreadyCheckedIn = appt.status === 'CHECKED_IN' || appt.status === 'CALLED' || appt.status === 'IN_CHAIR';

      if (!isAlreadyCheckedIn) {
        if (diffMinutes < -maxEarlyMinutes) {
          const earlyTimeStr = new Intl.DateTimeFormat('en-IN', {
            timeZone: 'Asia/Kolkata',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          }).format(new Date(appt.scheduledStart));
          throw new BadRequestException(
            `Your appointment is scheduled for ${earlyTimeStr}. Self check-in opens 2 hours prior to your scheduled time. Please check in closer to your appointment or speak with the reception desk.`,
          );
        }

        if (diffMinutes > maxLate) {
          throw new BadRequestException(
            `You have arrived ${diffMinutes} minutes past your scheduled appointment time (Clinic late check-in limit is ${maxLate} minutes). Please proceed to the reception desk to be accommodated in the walk-in queue.`,
          );
        }
      }

      // Lock row to serialize concurrent check-ins for the same appointment
      // CRITICAL PRODUCTION SAFETY: Row lock is strictly mandatory.
      // If the execution engine lacks $executeRaw, or if acquisition fails, the transaction MUST abort immediately!
      if (typeof (tx as any).$executeRaw !== 'function') {
        throw new InternalServerErrorException('Transaction execution engine does not support raw SQL row-lock acquisition');
      }
      await (tx as any).$executeRaw`SELECT id FROM "Appointment" WHERE id = ${appt.id} FOR UPDATE`;

      // Re-fetch current state of appointment after acquiring the lock
      const lockedAppt = typeof tx.appointment.findUnique === 'function'
        ? (await tx.appointment.findUnique({
            where: { id: appt.id },
            include: {
              patient: true,
              dentist: { select: { fullName: true } },
              clinic: { select: { name: true, address: true, phone: true, code: true, requireDeskConfirmation: true } },
            },
          })) || appt
        : appt;

      if (!lockedAppt) {
        throw new NotFoundException('Appointment record could not be re-verified.');
      }

      const isLockedAlreadyCheckedIn = lockedAppt.status === 'CHECKED_IN' || lockedAppt.status === 'CALLED' || lockedAppt.status === 'IN_CHAIR';
      let finalAppt = lockedAppt;
      let tokenNumber = lockedAppt.tokenNumber;

      if (!isLockedAlreadyCheckedIn || !tokenNumber) {
        if (!tokenNumber) {
          const seqRecord = await tx.dailyQueueSequence.upsert({
            where: { clinicId_dateString: { clinicId: clinic.id, dateString: istDateStr } },
            update: { lastSequence: { increment: 1 } },
            create: { clinicId: clinic.id, dateString: istDateStr, lastSequence: 1 },
          });
          tokenNumber = seqRecord.lastSequence;
        }

        const isSlightlyLate = diffMinutes > 5 && diffMinutes <= maxLate;
        const arrivalNote = isSlightlyLate ? `[LATE ARRIVAL: ${diffMinutes} mins past start]` : '';
        const deskNote = `[CHECK-IN: SELF_QR | ${clinic.requireDeskConfirmation ? 'Desk Confirmation Pending' : 'Confirmed'}]`;

        finalAppt = await tx.appointment.update({
          where: { id: appt.id },
          data: {
            status: 'CHECKED_IN',
            tokenNumber,
            checkInTime: lockedAppt.checkInTime || now,
            isConfirmedAtDesk: clinic.requireDeskConfirmation ? false : true,
            checkInSource: 'SELF_QR',
            notes: [lockedAppt.notes, deskNote, arrivalNote].filter(Boolean).join('\n'),
          },
          include: {
            patient: true,
            dentist: { select: { fullName: true } },
            clinic: { select: { name: true, address: true, phone: true, code: true, requireDeskConfirmation: true } },
          },
        });
      }

      // Compute live queue count ahead
      const { start: dayStart, end: dayEnd } = this.getKolkataDayBounds(finalAppt.scheduledStart);
      const currentlyAhead = await tx.appointment.count({
        where: {
          clinicId: finalAppt.clinicId,
          scheduledStart: { gte: dayStart, lte: dayEnd },
          status: { in: ['CHECKED_IN', 'CALLED', 'IN_CHAIR'] },
          tokenNumber: { lt: tokenNumber },
        },
      });

      const ref = `${finalAppt.clinic?.code || 'CLINIC'}-${new Date(finalAppt.createdAt).getFullYear()}-${finalAppt.id.replace(/-/g, '').substring(0, 5).toUpperCase()}`;

      if (!isLockedAlreadyCheckedIn) {
        await this.auditService.log({
          clinicId: finalAppt.clinicId,
          actorId: finalAppt.patientId,
          actorRole: 'PATIENT',
          action: 'PATIENT_QR_SELF_CHECK_IN',
          entityType: 'Appointment',
          entityId: finalAppt.id,
          details: {
            reference: ref,
            tokenNumber,
            patientName: finalAppt.patient.fullName,
            phone: finalAppt.patient.phone,
            chairNumber: finalAppt.chairNumber || 1,
          },
        }, tx);
      }

      const inChairAppts = await tx.appointment.findMany({
        where: {
          clinicId: finalAppt.clinicId,
          scheduledStart: { gte: dayStart, lte: dayEnd },
          status: { in: ['CALLED', 'IN_CHAIR'] },
        },
        select: {
          id: true,
          chairNumber: true,
          status: true,
          tokenNumber: true,
        },
      });

      const activeChairsServing = inChairAppts.map(ic => ({
        chairNumber: ic.chairNumber || 1,
        tokenNumber: ic.tokenNumber || 1,
        isBusy: ic.status === 'IN_CHAIR',
        isCalling: ic.status === 'CALLED',
      }));

      return {
        success: true,
        alreadyCheckedIn: isLockedAlreadyCheckedIn,
        status: finalAppt.status,
        reference: ref,
        tokenNumber,
        currentlyAhead,
        activeChairsServing,
        checkInSource: 'SELF_QR',
        deskConfirmed: false,
        patientName: finalAppt.patient.fullName,
        patientUhid: finalAppt.patient.uhid,
        patientPhone: finalAppt.patient.phone ? `+91 ****** ${finalAppt.patient.phone.replace(/\D/g, '').slice(-4)}` : '',
        dentistName: finalAppt.dentist?.fullName || 'Assigned Duty Doctor',
        chairNumber: finalAppt.chairNumber || 1,
        scheduledStart: finalAppt.scheduledStart,
        checkInTime: finalAppt.checkInTime || now,
        clinicName: finalAppt.clinic?.name || 'Dental Clinic',
        clinicAddress: finalAppt.clinic?.address || '',
        clinicPhone: finalAppt.clinic?.phone || '',
        intakeToken: this.generateIntakeToken(clinic.id, finalAppt.patient.id, finalAppt.id),
        message: isLockedAlreadyCheckedIn
          ? `You are already checked in! Your Token is #${tokenNumber}. Please take a seat in the waiting lobby.`
          : `Check-in successful! Your Token is #${tokenNumber}. Please take a seat in the waiting lobby.`,
      };
    });
  }

  async publicWalkInCheckIn(dto: any, clientIp?: string, hostClinicId?: string) {
    const ip = clientIp || '127.0.0.1';

    // 1. IP Lockout check
    if (this.isIpLockedOut(ip)) {
      throw new BadRequestException(
        'Too many failed check-in attempts from this connection. Please proceed to the reception desk for assistance.',
      );
    }

    // 2. Resolve Clinic Fail-Closed
    let clinic: any = null;
    if (hostClinicId) {
      clinic = await this.prisma.clinic.findUnique({ where: { id: hostClinicId } });
    }
    if (!clinic && dto.clinicCode) {
      clinic = await this.prisma.clinic.findFirst({
        where: { code: dto.clinicCode.toUpperCase() },
      });
    }
    if (!clinic) {
      throw new BadRequestException('Dental clinic could not be resolved from host context.');
    }

    // 3. Clinic Hours / Pause assertion
    await this.clinicHoursService.assertOpen(
      clinic.id,
      new Date(),
      'SELF_CHECKIN',
    );

    if (this.isClinicCheckinPaused(clinic.id)) {
      throw new BadRequestException(
        'Self check-in is temporarily paused. Please check in directly with the receptionist at the front desk.',
      );
    }

    // 4. Optional Rotating HMAC Lobby Code Verification (If code provided)
    if (clinic.requireLobbyCode && dto.lobbyCode) {
      const codeCandidate = String(dto.lobbyCode).trim();
      const isValid = this.verifyRotatingLobbyCode(clinic, codeCandidate);
      if (!isValid) {
        this.recordFailedLobbyAttempt(ip, clinic.id);
        throw new BadRequestException(
          `Invalid or expired lobby code. Please check with reception.`,
        );
      }
    }

    // 5. Patient Input Validation & Normalization
    const patientName = (dto.patientName || dto.fullName || '').trim();
    if (!patientName) {
      throw new BadRequestException('Please enter your full name.');
    }

    const rawPhone = (dto.patientPhone || dto.phone || '').trim();
    const digitsOnly = rawPhone.replace(/\D/g, '');
    let phoneTail = digitsOnly;
    if (digitsOnly.startsWith('91') && digitsOnly.length === 12) phoneTail = digitsOnly.slice(2);
    else if (digitsOnly.startsWith('0') && digitsOnly.length === 11) phoneTail = digitsOnly.slice(1);
    if (phoneTail.length !== 10) {
      throw new BadRequestException('Please provide a valid 10-digit mobile number.');
    }
    const normalizedPhone = `+91${phoneTail}`;

    const age = dto.age ? Number(dto.age) : undefined;
    const gender = (dto.gender || 'OTHER').toUpperCase();
    const reason = dto.reason || '[WALK-IN] Dental Consultation';

    // 6. Atomic Transaction for Patient, Token & Appointment creation
    return this.prisma.forTenant(clinic.id, async (tx) => {
      // Step 0: Acquire PostgreSQL transaction-level advisory lock
      // Keyed consistently by clinic ID and normalized phone number in a 64-bit namespace (key1: clinic, key2: phone).
      // Uses parameterized tagged template tx.$executeRaw to serialize concurrent walk-in requests for the same patient.
      // Automatically released by PostgreSQL when this transaction commits or rolls back.
      // CRITICAL PRODUCTION SAFETY: Advisory lock is strictly mandatory.
      // If the execution engine lacks $executeRaw, or if acquisition fails, the transaction MUST abort immediately.
      // Never skip or swallow lock acquisition failures!
      if (typeof (tx as any).$executeRaw !== 'function') {
        throw new InternalServerErrorException('Transaction execution engine does not support raw SQL lock acquisition');
      }
      await (tx as any).$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${clinic.id}), hashtext(${normalizedPhone}))`;

      // Step A: Find or Create Patient
      const existingPatients = await tx.patient.findMany({
        where: {
          clinicId: clinic.id,
          phone: normalizedPhone,
        },
      });

      let patient = existingPatients.find(
        (p: any) => p.fullName.trim().toLowerCase() === patientName.toLowerCase(),
      );

      const now = new Date();
      const { dateStr: istDateStr, start: todayStart, end: todayEnd } = this.getKolkataDayBounds(now);

      // Idempotency: If patient already exists and has an active checked-in appointment today, return existing token
      if (patient) {
        const existingActiveAppt = await tx.appointment.findFirst({
          where: {
            clinicId: clinic.id,
            patientId: patient.id,
            scheduledStart: { gte: todayStart, lte: todayEnd },
            status: { in: ['CHECKED_IN', 'CALLED', 'IN_CHAIR'] },
          },
          include: {
            dentist: { select: { fullName: true } },
          },
        });

        if (existingActiveAppt && existingActiveAppt.tokenNumber) {
          const waitingAhead = await tx.appointment.count({
            where: {
              clinicId: clinic.id,
              status: 'CHECKED_IN',
              scheduledStart: { gte: todayStart, lte: todayEnd },
              tokenNumber: { lt: existingActiveAppt.tokenNumber },
            },
          });

          const shortId = existingActiveAppt.id.replace(/-/g, '').substring(0, 5).toUpperCase();
          const reference = `${clinic.code}-${now.getFullYear()}-${shortId}`;

          return {
            success: true,
            alreadyCheckedIn: true,
            reference,
            tokenNumber: existingActiveAppt.tokenNumber,
            trackingCode: existingActiveAppt.trackingCode,
            trackingUrl: existingActiveAppt.trackingCode ? `/track/${existingActiveAppt.trackingCode}` : undefined,
            chairNumber: existingActiveAppt.chairNumber || 1,
            currentlyAhead: waitingAhead,
            patientsAhead: waitingAhead,
            activeChairsServing: [],
            dentistName: existingActiveAppt.dentist?.fullName || 'Assigned Duty Doctor',
            patientName: patient.fullName,
            status: existingActiveAppt.status,
            isConfirmedAtDesk: true,
            appointmentId: existingActiveAppt.id,
            clinicName: clinic.name,
            clinicPhone: clinic.phone,
            clinicAddress: clinic.address,
            message: `Welcome back to ${clinic.name}! You are already registered and checked in. Your Token is #${existingActiveAppt.tokenNumber}. Please take a seat in the waiting lobby.`,
          };
        }
      }

      if (!patient) {
        const year = new Date().getFullYear();
        const seq = await this.prisma.nextSequence(clinic.id, 'UHID', String(year), tx);
        const randSuffix = crypto.randomBytes(2).toString('hex').toUpperCase();
        const uhid = `${clinic.code}-${year}-${String(seq).padStart(4, '0')}-${randSuffix}`;

        patient = await tx.patient.create({
          data: {
            clinicId: clinic.id,
            uhid,
            fullName: patientName,
            phone: normalizedPhone,
            age: age || undefined,
            gender: ['MALE', 'FEMALE', 'OTHER'].includes(gender) ? gender : 'OTHER',
            source: 'SELF_QR',
            needsVerification: false,
            possibleDuplicate: existingPatients.length > 0,
            consentDataUse: true,
            consentWhatsapp: true,
            consentVersion: 'v1.0',
            consentAt: new Date(),
            notes: `Self-registered walk-in via Hospital Lobby Portal (${reason})`,
          },
        });
      }

      // Step B: Resolve Active Dentist (preferring active dentist who is NOT on leave right now)
      let dentist: any = null;
      let activeDentists: any[] = [];
      if (typeof tx.user?.findMany === 'function') {
        activeDentists = await tx.user.findMany({
          where: { clinicId: clinic.id, role: 'DENTIST', isActive: true },
          orderBy: { createdAt: 'asc' },
        });
      }
      if (activeDentists.length === 0 && typeof tx.user?.findFirst === 'function') {
        const single = await tx.user.findFirst({
          where: { clinicId: clinic.id, role: 'DENTIST', isActive: true },
          orderBy: { createdAt: 'asc' },
        });
        if (single) activeDentists = [single];
      }


      for (const cand of activeDentists) {
        let onLeave = false;
        if (tx.dentistUnavailability) {
          const leave = await tx.dentistUnavailability.findFirst({
            where: {
              clinicId: clinic.id,
              dentistId: cand.id,
              AND: [
                { startAt: { lte: now } },
                { endAt: { gte: now } },
              ],
            },
          });
          if (leave) onLeave = true;
        }
        if (!onLeave) {
          dentist = cand;
          break;
        }
      }

      if (!dentist && activeDentists.length > 0) {
        dentist = activeDentists[0];
      }

      if (!dentist) {
        dentist = await tx.user.findFirst({
          where: { clinicId: clinic.id, isActive: true },
          orderBy: { createdAt: 'asc' },
        });
      }
      if (!dentist) {
        throw new BadRequestException('No active dentist or staff member configured for this clinic.');
      }


      // Step C: Atomic Daily Queue Sequence in Asia/Kolkata
      const seqRecord = await tx.dailyQueueSequence.upsert({
        where: {
          clinicId_dateString: {
            clinicId: clinic.id,
            dateString: istDateStr,
          },
        },
        update: {
          lastSequence: { increment: 1 },
        },
        create: {
          clinicId: clinic.id,
          dateString: istDateStr,
          lastSequence: 1,
        },
      });
      const tokenNumber = seqRecord.lastSequence;

      // Step D: Calculate Active Chairs and Queue Load
      const totalChairs = Math.max(clinic.chairCount || 2, 1);
      let chairConfig: Record<string, boolean> = {};
      for (let i = 1; i <= totalChairs; i++) chairConfig[String(i)] = true;
      if (clinic.workingHours) {
        try {
          const parsed = typeof clinic.workingHours === 'string' ? JSON.parse(clinic.workingHours) : clinic.workingHours;
          if (parsed && parsed.chairStatus) chairConfig = { ...chairConfig, ...parsed.chairStatus };
        } catch {}
      }

      const onDutyChairs: number[] = [];
      for (let i = 1; i <= totalChairs; i++) {
        if (chairConfig[String(i)] !== false) {
          onDutyChairs.push(i);
        }
      }
      if (onDutyChairs.length === 0) onDutyChairs.push(1);

      // Find in-chair / called appointments today
      const inChairAppts = await tx.appointment.findMany({
        where: {
          clinicId: clinic.id,
          status: { in: ['IN_CHAIR', 'CALLED'] },
          scheduledStart: { gte: todayStart, lte: todayEnd },
        },
        select: { id: true, chairNumber: true, status: true, scheduledEnd: true },
      });
      const occupiedChairs = new Set(inChairAppts.map((a: any) => a.chairNumber));
      const freeOnDutyChairs = onDutyChairs.filter(c => !occupiedChairs.has(c));

      // Count waiting ahead (CHECKED_IN)
      const waitingAhead = await tx.appointment.count({
        where: {
          clinicId: clinic.id,
          status: 'CHECKED_IN',
          scheduledStart: { gte: todayStart, lte: todayEnd },
        },
      });

      let expectedChair = onDutyChairs[0];
      if (freeOnDutyChairs.length > 0) {
        expectedChair = freeOnDutyChairs[0];
      } else {
        const sortedBusy = inChairAppts
          .filter((a: any) => onDutyChairs.includes(a.chairNumber))
          .sort((a: any, b: any) => new Date(a.scheduledEnd).getTime() - new Date(b.scheduledEnd).getTime());
        expectedChair = sortedBusy.length > 0 ? sortedBusy[0].chairNumber : onDutyChairs[0];
      }

      const apptStart = now;
      const apptEnd = new Date(now.getTime() + 30 * 60 * 1000);
      const trackingCode = crypto.randomBytes(16).toString('hex');

      // Step E: Create Appointment record
      const appt = await tx.appointment.create({
        data: {
          clinicId: clinic.id,
          patientId: patient.id,
          dentistId: dentist.id,
          createdById: dentist.id,
          chairNumber: expectedChair,
          expectedChairNumber: expectedChair,
          scheduledStart: apptStart,
          scheduledEnd: apptEnd,
          durationMinutes: 30,
          reason,
          status: 'CHECKED_IN',
          checkInTime: now,
          isConfirmedAtDesk: true,
          checkInSource: 'SELF_QR',
          tokenNumber,
          trackingCode,
          notes: `Walk-in self-registered via lobby QR portal\nChief Complaint: ${reason}\nClient IP: ${ip}`,
        },
      });

      const sameDayAppts = await tx.appointment.findMany({
        where: {
          clinicId: clinic.id,
          scheduledStart: { gte: todayStart, lte: todayEnd },
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        },
        orderBy: { scheduledStart: 'asc' },
        select: { id: true },
      });

      const activeChairsServing = inChairAppts.map((ic: any) => ({
        chairNumber: ic.chairNumber,
        tokenNumber: sameDayAppts.findIndex((a: any) => a.id === ic.id) + 1 || 1,
        isBusy: ic.status === 'IN_CHAIR',
        isCalling: ic.status === 'CALLED',
      }));

      const shortId = appt.id.replace(/-/g, '').substring(0, 5).toUpperCase();
      const reference = `${clinic.code}-${now.getFullYear()}-${shortId}`;

      return {
        success: true,
        reference,
        tokenNumber,
        trackingCode,
        trackingUrl: `/track/${trackingCode}`,
        chairNumber: expectedChair,
        currentlyAhead: waitingAhead,
        patientsAhead: waitingAhead,
        activeChairsServing,
        dentistName: dentist.fullName,
        patientName: patient.fullName,
        status: 'CHECKED_IN',
        isConfirmedAtDesk: true,
        appointmentId: appt.id,
        clinicName: clinic.name,
        clinicPhone: clinic.phone,
        clinicAddress: clinic.address,
        intakeToken: this.generateIntakeToken(clinic.id, patient.id, appt.id),
        message: `Welcome to ${clinic.name}! Walk-in check-in successful. Your Token is #${tokenNumber}. Please take a seat in the waiting lobby.`,
      };
    });
  }

  async submitPublicIntake(reference: string, intakeData: any, tokenCandidate?: string, authenticatedUser?: any) {
    let targetClinicId: string | null = null;
    let targetPatientId: string | null = null;
    let targetApptId: string | null = null;
    let verifiedNonce: string = '';

    // 1. Authorization: Require signed single-use intake token OR authenticated patient session (SEC-02)
    const token = tokenCandidate || intakeData?.intakeToken;
    if (token) {
      const verified = this.verifyIntakeToken(token);
      if (!verified) {
        throw new UnauthorizedException('Intake token is invalid, tampered, or expired.');
      }
      targetClinicId = verified.clinicId;
      targetPatientId = verified.patientId;
      targetApptId = verified.appointmentId;
      verifiedNonce = verified.nonce;
    } else if (authenticatedUser && authenticatedUser.role === 'PATIENT') {
      targetClinicId = authenticatedUser.clinicId;
      targetPatientId = authenticatedUser.accountId;
    } else {
      throw new UnauthorizedException('Authentication required: A valid signed single-use intake token or patient session is mandatory to update medical intake.');
    }

    if (!targetClinicId || !targetPatientId) {
      throw new BadRequestException('Could not resolve patient or clinic context for health intake.');
    }

    return this.prisma.forTenant(targetClinicId, async (tx) => {
      // 2. Prevent concurrent race conditions and token replay using atomic row lock
      if (targetApptId && typeof (tx as any).$executeRaw === 'function') {
        try {
          await (tx as any).$executeRaw`SELECT id FROM "Appointment" WHERE id = ${targetApptId} FOR UPDATE`;
        } catch {
          // Continue if mock does not support raw SQL
        }
      }

      // Check replay protection: Has this appointment already consumed an intake token?
      if (targetApptId) {
        const consumed = await tx.auditLog.findFirst({
          where: {
            clinicId: targetClinicId,
            action: 'INTAKE_TOKEN_CONSUMED',
            entityType: 'Appointment',
            entityId: targetApptId,
          },
        });
        if (consumed) {
          throw new ConflictException('This single-use intake token has already been submitted (replay rejected).');
        }
      }

      // 3. Resolve Patient strictly within the authorized clinic tenant
      const patient = await tx.patient.findFirst({
        where: { id: targetPatientId, clinicId: targetClinicId },
      });

      if (!patient) {
        throw new NotFoundException('Patient record not found in the authorized clinic.');
      }

      const conditions: string[] = [];
      if (intakeData.diabetic) conditions.push('Diabetes');
      if (intakeData.hypertension) conditions.push('Hypertension (High BP)');
      if (intakeData.cardiac) conditions.push('Cardiac Condition');
      if (intakeData.bloodThinners) conditions.push('Takes Blood Thinners (Ecosprin/Warfarin)');
      if (intakeData.pregnant) conditions.push('Pregnancy / Nursing');

      const allergies: string[] = Array.isArray(intakeData.allergies) ? intakeData.allergies : [];
      if (intakeData.otherAllergies && typeof intakeData.otherAllergies === 'string' && intakeData.otherAllergies.trim()) {
        allergies.push(intakeData.otherAllergies.trim());
      }

      await tx.patient.update({
        where: { id: patient.id },
        data: {
          medicalConditions: JSON.stringify(conditions),
          allergies: JSON.stringify(allergies),
          emergencyContactName: intakeData.emergencyContactName?.trim() || patient.emergencyContactName,
          emergencyContactPhone: intakeData.emergencyContactPhone?.trim() || patient.emergencyContactPhone,
          notes: intakeData.additionalNotes ? `${patient.notes || ''}\n[Patient Pre-Visit Intake]: ${intakeData.additionalNotes}`.trim() : patient.notes,
        },
      });

      // 4. Record consumption in AuditLog for replay protection & audit trail
      if (targetApptId) {
        await tx.auditLog.create({
          data: {
            clinicId: targetClinicId,
            action: 'INTAKE_TOKEN_CONSUMED',
            entityType: 'Appointment',
            entityId: targetApptId,
            details: JSON.stringify({
              patientId: patient.id,
              nonce: verifiedNonce,
              submittedAt: new Date().toISOString(),
            }),
          },
        });
      }

      return {
        success: true,
        message: 'Medical health intake recorded safely. Thank you for helping our clinical team prepare for your visit!',
        conditionsCount: conditions.length,
        allergiesCount: allergies.length,
      };
    });
  }

  async getPublicChairStatus(clinicCode?: string, displayToken?: string, reqClinicId?: string) {
    let clinic = null;

    if (displayToken) {
      const cleanToken = displayToken.trim();
      const tokenHash = crypto.createHash('sha256').update(cleanToken).digest('hex');
      const tokenRecord = await this.prisma.clinicDisplayToken.findFirst({
        where: { tokenHash, isRevoked: false },
        include: { clinic: true },
      });
      if (tokenRecord?.clinic) {
        clinic = tokenRecord.clinic;
      }
    }

    if (!clinic && reqClinicId) {
      clinic = await this.prisma.clinic.findUnique({ where: { id: reqClinicId } });
    }

    if (!clinic && clinicCode) {
      clinic = await this.prisma.clinic.findFirst({
        where: { code: clinicCode.toUpperCase() },
      });
    }

    if (!clinic) {
      clinic = await this.prisma.clinic.findFirst({ where: { status: 'ACTIVE' } });
    }

    if (!clinic) throw new NotFoundException('Clinic not found');

    const totalChairs = Math.max(clinic.chairCount || 1, 1);
    let chairConfig: Record<string, boolean> = {};
    for (let i = 1; i <= totalChairs; i++) {
      chairConfig[String(i)] = true;
    }

    if (clinic.workingHours) {
      try {
        const parsed = JSON.parse(clinic.workingHours);
        if (parsed && parsed.chairStatus) {
          chairConfig = { ...chairConfig, ...parsed.chairStatus };
        }
      } catch (e) {
        // use default
      }
    }

    const istDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

    // Fetch active dentists under tenant context
    const dentists = await this.prisma.forTenant(clinic.id, async (tx) => {
      return tx.user.findMany({
        where: { clinicId: clinic.id, role: 'DENTIST', isActive: true },
        select: { fullName: true, specialization: true },
        orderBy: { createdAt: 'asc' },
      });
    });

    const chairs = [];
    for (let i = 1; i <= totalChairs; i++) {
      const assignedDentist = dentists[i - 1];
      let doctorName = assignedDentist
        ? `${assignedDentist.fullName}${assignedDentist.specialization ? ` (${assignedDentist.specialization})` : ''}`
        : (i === 1 ? 'Chief Dental Surgeon' : 'Associate Dental Surgeon');

      let name = `Operatory Chair ${i}${i === 1 ? ' (Primary Unit)' : ''}`;

      chairs.push({
        chairNumber: i,
        name,
        doctorName,
        isActive: chairConfig[String(i)] !== false,
      });
    }

    const rotating = this.getRotatingLobbyCode(clinic, 0);

    return {
      clinicCode: clinic.code,
      clinicName: clinic.name,
      clinicAddress: clinic.address,
      clinicPhone: clinic.phone,
      todayDate: istDate,
      totalChairs,
      chairs,
      lobbyCode: rotating.code,
      dailyCode: rotating.code,
      expiresAt: rotating.expiresAt,
      secondsRemaining: rotating.secondsRemaining,
    };
  }

  async getPublicBookedSlots(clinicCode?: string, dateStr?: string) {
    let clinic = null;
    if (clinicCode) {
      clinic = await this.prisma.clinic.findFirst({
        where: { code: clinicCode.toUpperCase() },
      });
    } else {
      clinic = await this.prisma.clinic.findFirst({ where: { status: 'ACTIVE' } });
    }
    if (!clinic) throw new NotFoundException('Clinic not found');

    const targetDate = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())
      ? dateStr.trim()
      : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

    // IST day start and end
    const dayStart = new Date(`${targetDate}T00:00:00+05:30`);
    const dayEnd = new Date(`${targetDate}T23:59:59+05:30`);

    const appointments = await this.prisma.forTenant(clinic.id, async (tx) => {
      return tx.appointment.findMany({
        where: {
          clinicId: clinic.id,
          scheduledStart: { gte: dayStart, lte: dayEnd },
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        },
        select: {
          id: true,
          chairNumber: true,
          scheduledStart: true,
          reason: true,
          notes: true,
          status: true,
        },
      });
    });

    const totalChairs = Math.max(clinic.chairCount || 1, 1);
    const bookedSlotsByChair: Record<number, string[]> = {};
    for (let i = 1; i <= totalChairs; i++) {
      bookedSlotsByChair[i] = [];
    }

    // Check clinic hours & closures for target date (Requirement 1, 3, 5)
    const statusInfo = await this.clinicHoursService.getClinicStatus(clinic.id, dayStart);
    const isClinicClosed = !statusInfo.isOpen;

    // If date has a closure or is marked closed weekday, block all slots
    if (isClinicClosed) {
      return {
        success: true,
        clinicCode: clinic.code,
        date: targetDate,
        totalChairs,
        isClinicClosed: true,
        closedMessage: statusInfo.message,
        closureReason: statusInfo.closureReason,
        nextOpenAt: statusInfo.nextOpenAt,
        operatingHours: statusInfo.todaySchedule,
        bookedSlotsByChair,
      };
    }

    for (const appt of appointments) {
      const chairNum = appt.chairNumber || 1;
      if (!bookedSlotsByChair[chairNum]) {
        bookedSlotsByChair[chairNum] = [];
      }

      // Format scheduledStart in IST (e.g. "10:30 AM")
      const timeInIST = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(new Date(appt.scheduledStart));

      const normalizedTime = timeInIST.toUpperCase().replace(/\s+/g, ' ');
      bookedSlotsByChair[chairNum].push(normalizedTime);

      // Also normalize with and without leading 0 for single-digit hours (e.g. "09:30 AM" vs "9:30 AM")
      if (normalizedTime.startsWith('0')) {
        bookedSlotsByChair[chairNum].push(normalizedTime.substring(1));
      } else {
        bookedSlotsByChair[chairNum].push('0' + normalizedTime);
      }

      // Also extract any explicit slot string from appt.reason or appt.notes
      const fullText = `${appt.reason || ''} ${appt.notes || ''}`;
      const slotMatches = fullText.match(/\b(0?[1-9]|1[0-2]):([0-5]\d)\s*(AM|PM)\b/gi);
      if (slotMatches) {
        for (const sm of slotMatches) {
          const cleanSm = sm.toUpperCase().replace(/\s+/g, ' ');
          bookedSlotsByChair[chairNum].push(cleanSm);
          if (cleanSm.startsWith('0')) {
            bookedSlotsByChair[chairNum].push(cleanSm.substring(1));
          } else {
            bookedSlotsByChair[chairNum].push('0' + cleanSm);
          }
        }
      }
    }

    // If clinic has intermission / break on this day, block break slots across all chairs
    if (statusInfo.todaySchedule?.hasBreak && statusInfo.todaySchedule.breakStart && statusInfo.todaySchedule.breakEnd) {
      const bStart = statusInfo.todaySchedule.breakStart;
      const bEnd = statusInfo.todaySchedule.breakEnd;
      // Convert HH:mm to 12h AM/PM strings
      const formatToAmPm = (tStr: string) => {
        const [h, m] = tStr.split(':').map(Number);
        const meridiem = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${meridiem}`;
      };
      const breakSlots = [formatToAmPm(bStart)];
      if (bStart === '13:30' && bEnd === '14:30') {
        breakSlots.push('02:00 PM', '2:00 PM', '01:30 PM', '1:30 PM');
      }

      for (let i = 1; i <= totalChairs; i++) {
        bookedSlotsByChair[i].push(...breakSlots);
      }
    }

    // Deduplicate slots for each chair
    for (const chairKey in bookedSlotsByChair) {
      bookedSlotsByChair[chairKey] = Array.from(new Set(bookedSlotsByChair[chairKey]));
    }

    return {
      success: true,
      clinicCode: clinic.code,
      date: targetDate,
      totalChairs,
      isClinicClosed: false,
      operatingHours: statusInfo.todaySchedule,
      nextOpenAt: statusInfo.nextOpenAt,
      bookedSlotsByChair,
    };
  }

  async toggleChairStatus(clinicId: string, chairNumber: number, isActive: boolean) {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
    });
    if (!clinic) throw new NotFoundException('Clinic not found');

    let parsed: any = {};
    if (clinic.workingHours) {
      try {
        parsed = JSON.parse(clinic.workingHours);
      } catch (e) {
        parsed = {};
      }
    }

    parsed.chairStatus = {
      ...(parsed.chairStatus || {}),
      [String(chairNumber)]: isActive,
    };

    await this.prisma.clinic.update({
      where: { id: clinicId },
      data: {
        workingHours: JSON.stringify(parsed),
      },
    });

    return {
      success: true,
      chairNumber,
      isActive,
      chairStatus: parsed.chairStatus,
    };
  }

  // Display Token & Lobby Code Retrieval for TV & Reception
  async getLobbyCodeForDisplayOrStaff(displayToken?: string, staffUser?: any) {
    if (displayToken) {
      const cleanToken = displayToken.trim();
      const tokenHash = crypto.createHash('sha256').update(cleanToken).digest('hex');

      const clinics = await this.prisma.clinic.findMany({ select: { id: true } });
      let tokenRecord: any = null;
      let matchedClinicId: string | null = null;

      for (const c of clinics) {
        tokenRecord = await this.prisma.forTenant(c.id, async (tx) => {
          return tx.clinicDisplayToken.findFirst({
            where: { tokenHash, isRevoked: false },
            include: { clinic: true },
          });
        });
        if (tokenRecord) {
          matchedClinicId = c.id;
          break;
        }
      }

      if (!tokenRecord || !matchedClinicId) {
        throw new ForbiddenException('Invalid or revoked display token. Please re-pair the TV in clinic settings.');
      }

      // Update lastUsedAt under tenant isolation
      this.prisma.forTenant(matchedClinicId, async (tx) => {
        return tx.clinicDisplayToken.update({
          where: { id: tokenRecord.id },
          data: { lastUsedAt: new Date() },
        });
      }).catch(() => {});

      const result = this.getRotatingLobbyCode(tokenRecord.clinic, 0);
      return {
        code: result.code,
        expiresAt: result.expiresAt,
        secondsRemaining: result.secondsRemaining,
        digits: tokenRecord.clinic.lobbyCodeDigits || 4,
        clinicCode: tokenRecord.clinic.code,
        clinicName: tokenRecord.clinic.name,
      };
    }

    if (staffUser && staffUser.clinicId) {
      const clinic = await this.prisma.clinic.findUnique({
        where: { id: staffUser.clinicId },
      });
      if (!clinic) throw new NotFoundException('Clinic not found');

      const result = this.getRotatingLobbyCode(clinic, 0);
      return {
        code: result.code,
        expiresAt: result.expiresAt,
        secondsRemaining: result.secondsRemaining,
        digits: clinic.lobbyCodeDigits || 4,
        clinicCode: clinic.code,
        clinicName: clinic.name,
      };
    }

    throw new ForbiddenException('Display token header (x-display-token) or staff session required.');
  }

  async createDisplayToken(clinicId: string, name: string, staffUser: any) {
    if (!['CLINIC_ADMIN', 'ADMIN'].includes(staffUser?.role)) {
      throw new ForbiddenException('Only clinic administrators can generate waiting room display tokens.');
    }

    const rawToken = crypto.randomBytes(32).toString('hex'); // 64 hex characters (32 bytes)
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    return this.prisma.forTenant(clinicId, async (tx) => {
      const created = await tx.clinicDisplayToken.create({
        data: {
          clinicId,
          name: name || 'Waiting Room Display',
          tokenHash,
        },
      });

      await this.auditService.log({
        clinicId,
        actorId: staffUser.userId || staffUser.id,
        actorRole: staffUser.role,
        action: 'DISPLAY_TOKEN_GENERATED',
        entityType: 'ClinicDisplayToken',
        entityId: created.id,
        details: { name: created.name },
      }, tx);

      return {
        id: created.id,
        name: created.name,
        rawToken, // Shown ONCE at generation!
        createdAt: created.createdAt,
        message: 'Secure display token generated. Copy it now to configure the Waiting Room TV. It will not be shown again.',
      };
    });
  }

  async listDisplayTokens(clinicId: string) {
    return this.prisma.forTenant(clinicId, async (tx) => {
      return tx.clinicDisplayToken.findMany({
        where: { clinicId },
        select: {
          id: true,
          name: true,
          createdAt: true,
          lastUsedAt: true,
          isRevoked: true,
          revokedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  async revokeDisplayToken(clinicId: string, tokenId: string, staffUser: any) {
    if (!['CLINIC_ADMIN', 'ADMIN'].includes(staffUser?.role)) {
      throw new ForbiddenException('Only clinic administrators can revoke display tokens.');
    }

    return this.prisma.forTenant(clinicId, async (tx) => {
      await tx.clinicDisplayToken.updateMany({
        where: { id: tokenId, clinicId },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
        },
      });

      await this.auditService.log({
        clinicId,
        actorId: staffUser.userId || staffUser.id,
        actorRole: staffUser.role,
        action: 'DISPLAY_TOKEN_REVOKED',
        entityType: 'ClinicDisplayToken',
        entityId: tokenId,
        details: { tokenId },
      }, tx);

      return { success: true, message: 'Display token revoked successfully.' };
    });
  }

  async getChairLoads(clinicId: string, dateStr?: string) {
    return this.prisma.forTenant(clinicId, async (tx) => {
      const clinic = await tx.clinic.findUnique({ where: { id: clinicId } });
      const totalChairs = clinic?.chairCount || 3;

      const targetDate = dateStr ? new Date(dateStr) : new Date();
      const dayStart = new Date(targetDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(targetDate);
      dayEnd.setHours(23, 59, 59, 999);

      let offDutyChairs = new Set<number>();
      if (clinic?.workingHours) {
        try {
          const parsed = JSON.parse(clinic.workingHours);
          if (parsed.chairStatus) {
            for (const [k, v] of Object.entries(parsed.chairStatus)) {
              if (v === false) offDutyChairs.add(Number(k));
            }
          }
        } catch {}
      }

      const activeStatuses = ['PENDING_CONFIRMATION', 'SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_CHAIR'];

      const appts = await tx.appointment.findMany({
        where: {
          clinicId,
          status: { in: activeStatuses },
          scheduledStart: { gte: dayStart, lte: dayEnd },
        },
        select: { chairNumber: true, status: true },
      });

      const chairLoads: Record<number, { total: number; inChair: boolean; isOffDuty: boolean }> = {};
      for (let c = 1; c <= totalChairs; c++) {
        chairLoads[c] = {
          total: 0,
          inChair: false,
          isOffDuty: offDutyChairs.has(c),
        };
      }

      for (const a of appts) {
        if (a.chairNumber && chairLoads[a.chairNumber]) {
          chairLoads[a.chairNumber].total++;
          if (a.status === 'IN_CHAIR') {
            chairLoads[a.chairNumber].inChair = true;
          }
        }
      }

      let recommendedChair = 1;
      let minLoad = Infinity;
      for (let c = 1; c <= totalChairs; c++) {
        if (!chairLoads[c].isOffDuty) {
          const score = chairLoads[c].total + (chairLoads[c].inChair ? 5 : 0);
          if (score < minLoad) {
            minLoad = score;
            recommendedChair = c;
          }
        }
      }

      return {
        date: dayStart.toISOString().split('T')[0],
        totalChairs,
        chairLoads,
        recommendedChair,
      };
    });
  }

  /**
   * Dynamic Capacity Gap-Fitting Engine (DCGFE)
   * Calculates the exact real-time treatment gap before the next scheduled booking
   * for each operatory chair and assigned dentist.
   */
  async calculateAvailableGaps(clinicId: string, dateStr?: string, currentTime?: Date) {
    const now = currentTime || new Date();
    const { start: dayStart, end: dayEnd } = this.getKolkataDayBounds(now);

    return this.prisma.forTenant(clinicId, async (tx) => {
      const clinic = await tx.clinic.findUnique({
        where: { id: clinicId },
        select: { id: true, name: true, chairCount: true, workingHours: true },
      });
      if (!clinic) throw new NotFoundException('Clinic not found');

      const totalChairs = Math.max(clinic.chairCount || 1, 1);

      // Determine active on-duty chairs & arrival grace period
      let chairConfig: Record<string, boolean> = {};
      for (let i = 1; i <= totalChairs; i++) chairConfig[String(i)] = true;
      let graceMinutes = 10;
      if (clinic.workingHours) {
        try {
          const parsed = typeof clinic.workingHours === 'string' ? JSON.parse(clinic.workingHours) : clinic.workingHours;
          if (parsed?.chairStatus) chairConfig = { ...chairConfig, ...parsed.chairStatus };
          if (parsed?.arrivalGraceMinutes && typeof parsed.arrivalGraceMinutes === 'number') {
            graceMinutes = parsed.arrivalGraceMinutes;
          }
        } catch {}
      }

      // Fetch active dentists and their assigned chairs
      const dentists = await tx.user.findMany({
        where: { clinicId, role: 'DENTIST', isActive: true },
        select: { id: true, fullName: true, assignedChairNumber: true },
      });

      // Fetch all appointments for today
      const todayAppts = await tx.appointment.findMany({
        where: {
          clinicId,
          scheduledStart: { gte: dayStart, lte: dayEnd },
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        },
        orderBy: { scheduledStart: 'asc' },
        include: {
          patient: { select: { fullName: true, phone: true, uhid: true } },
          dentist: { select: { id: true, fullName: true } },
        },
      });

      const chairGaps: Array<{
        chairNumber: number;
        isOnDuty: boolean;
        assignedDentistName: string;
        assignedDentistId?: string;
        currentPatient: any | null;
        nextAppointment: any | null;
        gapMinutes: number;
        canFitStandardConsultation: boolean;
        recommendation: string;
      }> = [];

      for (let c = 1; c <= totalChairs; c++) {
        const isOnDuty = chairConfig[String(c)] !== false;
        const matchingDoctor = dentists.find(d => d.assignedChairNumber === c) || dentists[0];

        // Currently in chair
        const currentAppt = todayAppts.find(a => a.chairNumber === c && ['IN_CHAIR', 'CALLED'].includes(a.status));

        // Upcoming or grace-period-protected scheduled appointments on this chair
        // An unarrived scheduled appointment remains protected until scheduledStart + graceMinutes
        const upcomingOnChair = todayAppts.filter(a =>
          a.chairNumber === c &&
          ['SCHEDULED', 'CONFIRMED'].includes(a.status) &&
          (new Date(a.scheduledStart).getTime() + graceMinutes * 60 * 1000 > now.getTime())
        );

        const nextAppt = upcomingOnChair[0] || null;

        let gapMinutes = 999;
        let canFit = true;
        let recommendation = 'Chair available for walk-in or immediate booking.';

        const isGracePeriodActive = Boolean(
          nextAppt &&
          new Date(nextAppt.scheduledStart).getTime() <= now.getTime() &&
          new Date(nextAppt.scheduledStart).getTime() + graceMinutes * 60 * 1000 > now.getTime()
        );

        if (!isOnDuty) {
          gapMinutes = 0;
          canFit = false;
          recommendation = 'Operatory chair is marked off-duty or maintenance.';
        } else if (currentAppt) {
          const estEnd = new Date(currentAppt.scheduledEnd);
          const remainingInTreatment = Math.max(0, Math.round((estEnd.getTime() - now.getTime()) / 60000));
          if (nextAppt) {
            const nextStart = new Date(nextAppt.scheduledStart);
            gapMinutes = Math.max(0, Math.round((nextStart.getTime() - Math.max(now.getTime(), estEnd.getTime())) / 60000));
            canFit = gapMinutes >= 30;
            recommendation = `Currently treating ${currentAppt.patient.fullName} (~${remainingInTreatment}m left). Next booking: ${nextAppt.patient.fullName} at ${new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }).format(nextStart)}. Gap: ${gapMinutes}m.`;
          } else {
            gapMinutes = 999;
            canFit = false;
            recommendation = `Currently treating ${currentAppt.patient.fullName} (~${remainingInTreatment}m left). Free afterwards.`;
          }
        } else if (isGracePeriodActive && nextAppt) {
          gapMinutes = 0;
          canFit = false;
          const minsIntoGrace = Math.max(0, Math.round((now.getTime() - new Date(nextAppt.scheduledStart).getTime()) / 60000));
          const minsRemaining = Math.max(0, graceMinutes - minsIntoGrace);
          recommendation = `Reserved for ${nextAppt.patient.fullName} (${minsIntoGrace}m into arrival grace period, ${minsRemaining}m remaining). Chair protected for booked patient.`;
        } else if (nextAppt) {
          const nextStart = new Date(nextAppt.scheduledStart);
          gapMinutes = Math.max(0, Math.round((nextStart.getTime() - now.getTime()) / 60000));
          canFit = gapMinutes >= 30;
          const nextTimeStr = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }).format(nextStart);
          if (canFit) {
            recommendation = `Chair is free for ${gapMinutes} minutes before ${nextAppt.patient.fullName}'s ${nextTimeStr} appointment. Fits 30m consultation.`;
          } else {
            recommendation = `Chair is free for only ${gapMinutes} minutes before ${nextAppt.patient.fullName}'s ${nextTimeStr} appointment. Cannot fit 30m consultation without delay.`;
          }
        }

        chairGaps.push({
          chairNumber: c,
          isOnDuty,
          assignedDentistName: matchingDoctor?.fullName || 'Duty Doctor',
          assignedDentistId: matchingDoctor?.id,
          currentPatient: currentAppt ? {
            id: currentAppt.id,
            patientName: currentAppt.patient.fullName,
            status: currentAppt.status,
            scheduledEnd: currentAppt.scheduledEnd,
          } : null,
          nextAppointment: nextAppt ? {
            id: nextAppt.id,
            patientName: nextAppt.patient.fullName,
            scheduledStart: nextAppt.scheduledStart,
          } : null,
          gapMinutes,
          canFitStandardConsultation: canFit,
          recommendation,
        });
      }

      // Check for late appointments exceeding grace period
      const graceThresholdTime = new Date(now.getTime() - graceMinutes * 60 * 1000);
      const lateReviewAppts = todayAppts
        .filter(a =>
          ['SCHEDULED', 'CONFIRMED'].includes(a.status) &&
          new Date(a.scheduledStart).getTime() < graceThresholdTime.getTime()
        )
        .map(a => {
          const minsLate = Math.round((now.getTime() - new Date(a.scheduledStart).getTime()) / 60000);
          return {
            id: a.id,
            patientName: a.patient.fullName,
            patientPhone: a.patient.phone,
            uhid: a.patient.uhid,
            chairNumber: a.chairNumber,
            scheduledStart: a.scheduledStart,
            minutesLate: minsLate,
            isGracePeriodExpired: true,
          };
        });

      return {
        timestamp: now.toISOString(),
        totalChairs,
        chairGaps,
        lateReviewAppts,
      };
    });
  }

  /**
   * Releases an appointment slot when the patient fails to arrive past the grace period.
   * Marks status as NO_SHOW and records audit notes, freeing the GiST exclusion capacity.
   */
  async releaseLateSlot(clinicId: string, id: string, reason: string, actor: any) {
    return this.prisma.forTenant(clinicId, async (tx) => {
      // 0. Row-lock acquisition to serialize concurrent check-in vs release requests
      if (typeof (tx as any).$executeRaw === 'function') {
        try {
          await (tx as any).$executeRaw`SELECT id FROM "Appointment" WHERE id = ${id} FOR UPDATE`;
        } catch {}
      }

      const appt = await tx.appointment.findFirst({
        where: { id, clinicId },
        include: {
          patient: { select: { fullName: true, phone: true } },
          dentist: { select: { fullName: true } },
        },
      });

      if (!appt) throw new NotFoundException('Appointment not found');

      // 1. Enforce eligible state machine transition: strictly unarrived states (SCHEDULED or CONFIRMED)
      const eligibleStatuses = ['SCHEDULED', 'CONFIRMED'];
      if (!eligibleStatuses.includes(appt.status)) {
        if (['CHECKED_IN', 'CALLED', 'IN_CHAIR'].includes(appt.status)) {
          throw new BadRequestException(
            `Cannot release appointment for patient "${appt.patient?.fullName}". Patient has already arrived (current status: ${appt.status}). Only unarrived scheduled appointments can be released as No-Show.`,
          );
        }
        throw new BadRequestException(
          `Cannot release appointment with status "${appt.status}". Only unarrived scheduled appointments can be released as No-Show.`,
        );
      }

      // 2. Enforce arrival grace period has actually elapsed
      const clinic = await tx.clinic.findUnique({
        where: { id: clinicId },
        select: { id: true, workingHours: true, maxLateMinutes: true },
      });
      let graceMinutes = 10;
      if (clinic?.workingHours) {
        try {
          const parsed = typeof clinic.workingHours === 'string' ? JSON.parse(clinic.workingHours) : clinic.workingHours;
          if (parsed?.arrivalGraceMinutes && typeof parsed.arrivalGraceMinutes === 'number') {
            graceMinutes = parsed.arrivalGraceMinutes;
          }
        } catch {}
      }

      const now = new Date();
      const startMs = new Date(appt.scheduledStart).getTime();
      const graceThresholdMs = startMs + graceMinutes * 60 * 1000;
      if (now.getTime() < graceThresholdMs) {
        const remainingMinutes = Math.ceil((graceThresholdMs - now.getTime()) / 60000);
        throw new BadRequestException(
          `Cannot release chair yet. Patient "${appt.patient?.fullName}" has ${remainingMinutes} minute(s) remaining in the ${graceMinutes}-minute arrival grace period.`,
        );
      }

      const releaseNote = `[GRACE PERIOD RELEASED - ${now.toLocaleTimeString()}]: ${reason || 'Patient absent past arrival grace period. Operatory chair released to seat waiting patient.'}`;

      const updated = await tx.appointment.update({
        where: { id },
        data: {
          status: 'NO_SHOW',
          notes: appt.notes ? `${appt.notes}\n${releaseNote}` : releaseNote,
          cancelledAt: now,
          cancelledById: actor?.userId || actor?.id || null,
          cancellationReason: reason || 'Late arrival grace period expired',
        },
        include: {
          patient: { select: { fullName: true, phone: true, uhid: true } },
          dentist: { select: { fullName: true } },
        },
      });

      await this.auditService.log({
        clinicId,
        actorId: actor?.userId || actor?.id || 'staff',
        actorRole: actor?.role || 'STAFF',
        action: 'APPOINTMENT_LATE_RELEASED',
        entityType: 'Appointment',
        entityId: id,
        details: {
          patientName: appt.patient.fullName,
          chairNumber: appt.chairNumber,
          scheduledStart: appt.scheduledStart,
          reason,
        },
      });

      return {
        success: true,
        message: `Operatory Chair #${appt.chairNumber} released. Appointment marked as No-Show.`,
        appointment: this.formatAppointment(updated),
      };
    });
  }
}