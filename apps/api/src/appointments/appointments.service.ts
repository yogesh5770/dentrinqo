import { Injectable, ConflictException, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateAppointmentDto, UpdateAppointmentStatusDto, RescheduleAppointmentDto, ReceptionQuickConsultDto, PublicLookupDto } from './appointment.dto';
import { CreatePublicAppointmentDto } from './public-booking.dto';

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
  ) {}

  private static ipFailures: Map<string, { count: number; resetAt: number }> = new Map();
  private static clinicFailures: Map<string, { count: number; resetAt: number }> = new Map();

  /**
   * Generates a deterministic time-bucket HMAC lobby code (4 or 6 digits)
   * using the clinic's 32-byte secret.
   */
  getRotatingLobbyCode(clinic: { id: string; lobbySecret?: string | null; lobbyCodeDigits?: number; lobbyCodeWindowSeconds?: number }, timeOffsetBuckets = 0): { code: string; expiresAt: number; secondsRemaining: number } {
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

  verifyRotatingLobbyCode(clinic: { id: string; lobbySecret?: string | null; lobbyCodeDigits?: number; lobbyCodeWindowSeconds?: number; requireLobbyCode?: boolean }, candidateCode: string): boolean {
    if (!clinic.requireLobbyCode) return true;
    if (!candidateCode) return false;
    const clean = candidateCode.trim();
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
  }

  // Smart Chair Auto-Allocation: Allocates free chair or chair with least load
  async autoAllocateChair(clinicId: string, start: Date, end: Date, tx: any): Promise<{ chairNumber: number; isFreeSlot: boolean; chairLoads: Record<number, number> }> {
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
    if (onDutyChairs.length === 0) onDutyChairs.push(1);

    const activeStatuses = ['PENDING_CONFIRMATION', 'SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_CHAIR'];

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
    const freeChairsInSlot = onDutyChairs.filter(c => !busyChairsInSlot.has(c));

    const dayStart = new Date(start);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(start);
    dayEnd.setHours(23, 59, 59, 999);

    const dayAppts = await tx.appointment.findMany({
      where: {
        clinicId,
        chairNumber: { in: onDutyChairs },
        status: { in: activeStatuses },
        scheduledStart: { gte: dayStart, lte: dayEnd },
      },
      select: { chairNumber: true },
    });

    const chairLoads: Record<number, number> = {};
    for (const c of onDutyChairs) chairLoads[c] = 0;
    for (const a of dayAppts) {
      if (a.chairNumber && chairLoads[a.chairNumber] !== undefined) {
        chairLoads[a.chairNumber]++;
      }
    }

    if (freeChairsInSlot.length > 0) {
      freeChairsInSlot.sort((a, b) => (chairLoads[a] || 0) - (chairLoads[b] || 0));
      return { chairNumber: freeChairsInSlot[0], isFreeSlot: true, chairLoads };
    }

    const sortedByLoad = [...onDutyChairs].sort((a, b) => (chairLoads[a] || 0) - (chairLoads[b] || 0));
    return { chairNumber: sortedByLoad[0], isFreeSlot: false, chairLoads };
  }

  async create(clinicId: string, dto: CreateAppointmentDto, actor: any) {
    const start = new Date(dto.scheduledStart);
    if (isNaN(start.getTime())) {
      throw new BadRequestException('Invalid scheduled start time');
    }

    const duration = dto.durationMinutes || 30;
    const end = new Date(start.getTime() + duration * 60 * 1000);

    return this.prisma.forTenant(clinicId, async (tx) => {
      const clinic = await tx.clinic.findUnique({ where: { id: clinicId } });
      if (clinic?.isOnLeave && !(dto as any).overrideLeave) {
        throw new BadRequestException(
          `Hospital is currently closed for Holiday / Leave (${clinic.leaveReason || 'Holiday'}). Please turn Hospital Status to OPEN before scheduling appointments.`,
        );
      }

      // Verify patient and resolve dentist (allow auto-resolving to on-duty dentist if not specified)
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

      // Smart Chair Auto-Allocation:
      // If chairNumber is not specified or 0, find the free chair or the chair with the fewest appointments!
      let chair = dto.chairNumber;
      if (!chair || chair === 0) {
        const alloc = await this.autoAllocateChair(clinicId, start, end, tx);
        chair = alloc.chairNumber;
      }

      // Run concurrency & overlap check (skip chair blocking for lobby check-ins where patients are waiting in reception)
      if (dto.status !== 'CHECKED_IN') {
        await this.checkConflict(clinicId, dentist.id, chair, start, end, undefined, tx);
      }

      const todayStart = new Date(start);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(start);
      todayEnd.setHours(23, 59, 59, 999);
      const countToday = await tx.appointment.count({
        where: { clinicId, scheduledStart: { gte: todayStart, lte: todayEnd } },
      });
      const tokenNumber = (dto as any).tokenNumber || (countToday + 1);
      const trackingCode = (dto as any).trackingCode || crypto.randomBytes(16).toString('hex');

      let appt: any;
      try {
        appt = await tx.appointment.create({
          data: {
            clinicId,
            patientId: dto.patientId,
            dentistId: dentist.id,
            createdById: actor.userId || actor.id,
            chairNumber: chair,
            expectedChairNumber: chair,
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
        if (err.message?.includes('no_overlapping_chair_booking') || err.code === '23P01') {
          throw new ConflictException(
            `Dental Operatory Chair ${chair} is already occupied during this time window by another confirmed patient.`,
          );
        }
        throw err;
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
          patient: { select: { fullName: true, phone: true, uhid: true, legacySlNo: true, needsVerification: true, source: true } },
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
        if (appt.patient?.needsVerification) {
          throw new BadRequestException(
            'Cannot seat patient in chair: First-visit identity and allergies must be verified at reception desk before seating.'
          );
        }

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

      if (dto.status === 'CHECKED_IN' && !appt.checkInTime) {
        updateData.checkInTime = now;
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

      const updated = await tx.appointment.update({
        where: { id },
        data: {
          isConfirmedAtDesk: true,
          confirmedAtDeskAt: new Date(),
          confirmedByStaffId: staffUser?.userId || staffUser?.id || null,
        },
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
    return this.prisma.forTenant(clinicId, async (tx) => {
      const appt = await tx.appointment.findFirst({ where: { id, clinicId } });
      if (!appt) throw new NotFoundException('Appointment not found');

      const newStart = new Date(dto.newScheduledStart);
      const duration = dto.durationMinutes || appt.durationMinutes;
      const newEnd = new Date(newStart.getTime() + duration * 60 * 1000);
      const chair = dto.chairNumber || appt.chairNumber;

      // Check conflict excluding current appointment
      await this.checkConflict(clinicId, appt.dentistId, chair, newStart, newEnd, id);

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
        actorId: actor.userId,
        actorRole: actor.role,
        action: 'APPOINTMENT_RESCHEDULED',
        entityType: 'Appointment',
        entityId: id,
        details: { oldStart: appt.scheduledStart, newStart: updated.scheduledStart },
      });

      return this.formatAppointment(updated);
    });
  }

  private formatAppointment(a: any) {
    return {
      id: a.id,
      clinicId: a.clinicId,
      patientId: a.patientId,
      patientName: a.patient?.fullName || 'Unknown',
      patientPhone: a.patient?.phone || '',
      patientUhid: a.patient?.uhid || '',
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
  async createPublicRequest(dto: CreatePublicAppointmentDto, clientIp?: string, patientToken?: string) {
    // 1. Resolve clinic strictly and isolate
    let clinic = null;
    if (dto.clinicCode) {
      clinic = await this.prisma.clinic.findFirst({
        where: { code: dto.clinicCode.toUpperCase() },
      });
    } else {
      clinic = await this.prisma.clinic.findFirst();
    }

    if (!clinic) {
      throw new NotFoundException('Dental clinic not found or not configured.');
    }

    if ((clinic as any).isOnLeave) {
      throw new BadRequestException(
        `The clinic is currently closed (${(clinic as any).leaveReason || 'Holiday / Leave'}). Online appointment requests are temporarily suspended.`,
      );
    }

    const clinicId = clinic.id;

    // 2. Validate preferred date is not in the past
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
          const patientCount = await tx.patient.count({ where: { clinicId } });
          const randSuffix = crypto.randomBytes(2).toString('hex').toUpperCase();
          const uhid = `${clinic.code}-${year}-${String(patientCount + 1).padStart(4, '0')}-${randSuffix}`;

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

      const totalChairs = Math.max(clinic?.chairCount || 2, 1);
      let chairNum = dto.chairNumber && dto.chairNumber >= 1 && dto.chairNumber <= 10 ? dto.chairNumber : null;
      if (!chairNum) {
        for (let c = 1; c <= totalChairs; c++) {
          const conflict = await tx.appointment.findFirst({
            where: {
              clinicId,
              chairNumber: c,
              status: { in: ['PENDING_CONFIRMATION', 'SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_CHAIR'] },
              AND: [
                { scheduledStart: { lt: scheduledEnd } },
                { scheduledEnd: { gt: scheduledStart } },
              ],
            },
          });
          if (!conflict) {
            chairNum = c;
            break;
          }
        }
      }
      if (!chairNum) chairNum = 1;

      // Conflict check
      await this.checkConflict(clinicId, dentist.id, chairNum, scheduledStart, scheduledEnd, undefined, tx);

      // 8. Generate 128-bit unguessable tracking code & atomic sequential daily queue token
      const trackingCode = crypto.randomBytes(16).toString('hex'); // 32 hex chars = 128 bits
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
      const tokenNumber = seqRecord.lastSequence;

      const isWalkin = Boolean(dto.isWalkin) ||
                       Boolean(dto.lobbyCode) ||
                       (dto.service && /walk[- ]?in|lobby/i.test(dto.service)) ||
                       (dto.notes && /walk[- ]?in|lobby/i.test(dto.notes)) ||
                       (dto.preferredSlot && /walk[- ]?in/i.test(dto.preferredSlot));
      const initialStatus = isWalkin ? 'CHECKED_IN' : 'SCHEDULED';
      const checkInTime = isWalkin ? new Date() : null;

      // 9. Persist Appointment
      const appt = await tx.appointment.create({
        data: {
          clinicId,
          patientId: patient.id,
          dentistId: dentist.id,
          createdById: staff.id,
          chairNumber: chairNum,
          expectedChairNumber: chairNum,
          scheduledStart,
          scheduledEnd,
          durationMinutes: 30,
          reason: isWalkin
            ? `[Hospital Lobby Walk-In] ${dto.service} (Operatory #${chairNum})`
            : `[Public Request] ${dto.service} (${dto.preferredSlot})`,
          status: initialStatus,
          checkInTime,
          isConfirmedAtDesk: isWalkin,
          checkInSource: isWalkin ? 'SELF_QR' : 'ONLINE',
          tokenNumber,
          trackingCode,
          notes: `Preferred Slot: ${dto.preferredSlot}\nOperatory Chair: #${chairNum}\nClient Notes: ${dto.notes || 'None'}${noShowAuditNote}\nClient IP: ${clientIp || 'N/A'}\nSubmission: ${isWalkin ? 'Hospital Lobby Standee QR (Checked-In)' : 'Online /book portal'}`,
        },
      });

      const shortId = appt.id.replace(/-/g, '').substring(0, 5).toUpperCase();
      const reference = `${clinic.code}-${new Date().getFullYear()}-${shortId}`;

      return {
        success: true,
        reference,
        tokenNumber,
        trackingCode,
        trackingUrl: `/track/${trackingCode}`,
        chairNumber: chairNum,
        status: initialStatus,
        clinicName: clinic.name,
        clinicPhone: clinic.phone,
        patientName: patient.fullName,
        preferredDate: dto.preferredDate,
        preferredSlot: dto.preferredSlot,
        service: dto.service,
        requiresConfirmation: !isWalkin,
        isCheckedIn: isWalkin,
        message: isWalkin
          ? `Welcome to the clinic! You are checked in. Token #${tokenNumber} has been assigned.`
          : 'Your appointment has been scheduled. Track your live visit status on mobile using your private tracking link.',
        appointmentId: appt.id,
        staffId: staff.id,
      };
    });

    // 10. Audit trail (run post-commit to avoid holding transactions or connection deadlocks)
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
    }).catch(() => {});

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

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.clinic_id', ${clinicId}, true)`;
      const tenantClinic = await tx.clinic.findUnique({ where: { id: clinicId } });
      if ((tenantClinic as any)?.isOnLeave && !dto.overrideLeave) {
        throw new BadRequestException(
          `Hospital is currently marked ON LEAVE / CLOSED (${(tenantClinic as any)?.leaveReason || 'Holiday'}). Please turn Hospital Status to OPEN before booking walk-ins.`,
        );
      }
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
          const patientCount = await tx.patient.count({ where: { clinicId } });
          const randSuffix = crypto.randomBytes(2).toString('hex').toUpperCase();
          const uhid = `${clinic?.code || 'AKS'}-${year}-${String(patientCount + 1).padStart(4, '0')}-${randSuffix}`;

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
        select: { chairNumber: true },
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
        // All chairs occupied or patients waiting ahead
        isImmediateSeat = false;
        expectedChair = freeOnDutyChairs[0] || onDutyChairs[(tokenNumber - 1) % onDutyChairs.length];
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

        // Patients ahead in queue (status CHECKED_IN with tokenNumber < this token)
        const currentlyAhead = await tx.appointment.count({
          where: {
            clinicId: appt.clinicId,
            scheduledStart: { gte: dayStart, lte: dayEnd },
            status: 'CHECKED_IN',
            tokenNumber: { lt: appt.tokenNumber || 999999 },
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
          chairNumber: ic.chairNumber,
          tokenNumber: ic.tokenNumber,
          isBusy: ic.status === 'IN_CHAIR',
          isCalling: ic.status === 'CALLED',
        }));

        return {
          success: true,
          tokenNumber: appt.tokenNumber,
          status: appt.status,
          chairNumber: appt.chairNumber,
          expectedChairNumber: appt.expectedChairNumber,
          isImmediateSeat: appt.isConfirmedAtDesk && appt.status === 'CALLED',
          currentlyAhead,
          activeChairsServing,
          clinicName: appt.clinic?.name || 'Dental Clinic',
          clinicAddress: appt.clinic?.address || '',
          clinicPhone: appt.clinic?.phone || '',
          scheduledStart: appt.scheduledStart,
        };
      });
    }

    // If hostClinicId was not provided, safely search active clinics under RLS
    const clinics = await this.prisma.clinic.findMany({ select: { id: true } });
    for (const c of clinics) {
      try {
        const found = await this.prisma.forTenant(c.id, async (tx) => {
          return await tx.appointment.findFirst({
            where: { trackingCode: cleanCode, clinicId: c.id },
            select: { clinicId: true },
          });
        });
        if (found) {
          return this.trackByCode(cleanCode, c.id, clientIp);
        }
      } catch (e) {
        // Continue searching
      }
    }

    throw new NotFoundException('No active appointment record found for this tracking code');
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
      // If no clinic specified, locate the patient's clinic safely across active clinics
      const allClinics = await this.prisma.clinic.findMany({ select: { id: true } });
      for (const c of allClinics) {
        try {
          const ptMatch = await this.prisma.forTenant(c.id, async (tx) => {
            return await tx.patient.findFirst({
              where: { phone: normalizedPhone, isArchived: false },
              select: { clinicId: true },
            });
          });
          if (ptMatch) {
            targetClinicId = ptMatch.clinicId;
            break;
          }
        } catch (e) {
          // Continue searching
        }
      }
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
          status: 'CHECKED_IN',
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

    // If phone-only lookup: return ONLY tokenNumber, patientsAhead, status (NO clinic name, NO chair details)
    if (!tokenOrRef) {
      return {
        found: true,
        tokenNumber: appt.tokenNumber,
        patientsAhead: currentlyAhead,
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
    if (!clean) throw new BadRequestException('Reference or phone number required');

    let appt: any = null;
    const isPhone = /^[0-9+ -]{8,15}$/.test(clean);

    let targetClinicId = maybeClinicId;
    if (!targetClinicId && clean.includes('-')) {
      const codePrefix = clean.split('-')[0].toUpperCase();
      const c = await this.prisma.clinic.findFirst({ where: { code: codePrefix } });
      if (c) targetClinicId = c.id;
    }

    const findInClinic = async (cId: string) => {
      return this.prisma.forTenant(cId, async (tx) => {
        if (isPhone) {
          const phoneTail = clean.replace(/\D/g, '').slice(-10);
          return tx.appointment.findFirst({
            where: {
              clinicId: cId,
              patient: { phone: { contains: phoneTail } },
            },
            orderBy: { scheduledStart: 'desc' },
            include: {
              patient: true,
              dentist: { select: { fullName: true } },
              clinic: { select: { name: true, address: true, phone: true, code: true } },
            },
          });
        } else {
          const parts = clean.split('-');
          const shortId = parts[parts.length - 1].toLowerCase();
          const allRecent = await tx.appointment.findMany({
            where: { clinicId: cId },
            take: 60,
            orderBy: { createdAt: 'desc' },
            include: {
              patient: true,
              dentist: { select: { fullName: true } },
              clinic: { select: { name: true, address: true, phone: true, code: true } },
            },
          });
          return allRecent.find((a: any) =>
            a.id.replace(/-/g, '').toLowerCase().startsWith(shortId) ||
            a.id.toLowerCase().includes(shortId)
          ) || null;
        }
      });
    };

    if (targetClinicId) {
      appt = await findInClinic(targetClinicId);
    } else {
      const clinics = await this.prisma.clinic.findMany({ select: { id: true } });
      for (const c of clinics) {
        appt = await findInClinic(c.id);
        if (appt) break;
      }
    }

    if (!appt) {
      throw new NotFoundException('No active appointment record found for the provided details.');
    }

    const dayStart = new Date(appt.scheduledStart);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(appt.scheduledStart);
    dayEnd.setHours(23, 59, 59, 999);

    return this.prisma.forTenant(appt.clinicId, async (tx) => {
      const sameDayAppts = await tx.appointment.findMany({
        where: {
          clinicId: appt.clinicId,
          scheduledStart: { gte: dayStart, lte: dayEnd },
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        },
        orderBy: { scheduledStart: 'asc' },
        select: { id: true, status: true },
      });

      const tokenNumber = sameDayAppts.findIndex((a: any) => a.id === appt.id) + 1 || 1;
      const completedBefore = sameDayAppts.filter((a: any, idx: number) => idx < tokenNumber - 1 && a.status === 'COMPLETED').length;
      const currentlyAhead = Math.max(0, (tokenNumber - 1) - completedBefore);

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
        },
      });

      const activeChairsServing = inChairAppts.map(ic => ({
        chairNumber: ic.chairNumber,
        tokenNumber: sameDayAppts.findIndex((a: any) => a.id === ic.id) + 1 || 1,
        isBusy: ic.status === 'IN_CHAIR',
        isCalling: ic.status === 'CALLED',
      }));

      return {
        success: true,
        clinicId: appt.clinicId,
        reference: ref,
        status: appt.status,
        tokenNumber,
        currentlyAhead,
        activeChairsServing,
        patientName: appt.patient.fullName,
        patientUhid: appt.patient.uhid,
        patientPhone: appt.patient.phone,
        dentistName: appt.dentist?.fullName || 'Assigned Duty Dentist',
        chairNumber: appt.chairNumber || 1,
        scheduledStart: appt.scheduledStart,
        durationMinutes: appt.durationMinutes || 30,
        reason: appt.reason,
        clinicName: appt.clinic?.name || 'Dental Clinic',
        clinicAddress: appt.clinic?.address || '',
        clinicPhone: appt.clinic?.phone || '',
        hasIntakeCompleted: (appt.patient.allergies && appt.patient.allergies !== '[]') || (appt.patient.medicalConditions && appt.patient.medicalConditions !== '[]'),
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
    if (!clinic && dto.bookingReference && dto.bookingReference.includes('-')) {
      const codePrefix = dto.bookingReference.split('-')[0].toUpperCase();
      clinic = await this.prisma.clinic.findFirst({ where: { code: codePrefix } });
    }
    if (!clinic) {
      clinic = await this.prisma.clinic.findFirst({ where: { status: 'ACTIVE' } });
    }
    if (!clinic) throw new NotFoundException('Dental clinic not configured');

    if ((clinic as any).isOnLeave) {
      throw new BadRequestException(
        `The clinic is currently closed (${(clinic as any).leaveReason || 'Holiday / Leave'}). Walk-in check-in is unavailable today.`,
      );
    }

    // 2. Clinic Aggregate Check-in Pause (DDoS protection)
    if (this.isClinicCheckinPaused(clinic.id)) {
      throw new BadRequestException(
        'Self check-in is temporarily paused. Please check in directly with the receptionist at the front desk.',
      );
    }

    // 3. Rotating HMAC Lobby Code Verification
    if (clinic.requireLobbyCode) {
      const codeCandidate = dto.lobbyCode ? String(dto.lobbyCode).trim() : '';
      const isValid = this.verifyRotatingLobbyCode(clinic, codeCandidate);
      if (!isValid) {
        this.recordFailedLobbyAttempt(ip, clinic.id);
        throw new BadRequestException(
          `Invalid or expired lobby code. Please enter the ${clinic.lobbyCodeDigits || 4}-digit code currently displayed on the waiting room TV or reception screen.`,
        );
      }
    }

    return this.prisma.forTenant(clinic.id, async (tx) => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      let appt: any = null;
      const clean = (dto.identifier || dto.phone || '').trim();
      const bookingRef = (dto.bookingReference || '').trim();
      const patientName = (dto.patientName || dto.fullName || '').trim().toLowerCase();

      if (bookingRef) {
        const parts = bookingRef.split('-');
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
      }

      if (!appt && clean) {
        const phoneTail = clean.replace(/\D/g, '').slice(-10);
        if (phoneTail.length >= 10) {
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

      const isAlreadyCheckedIn = appt.status === 'CHECKED_IN' || appt.status === 'CALLED' || appt.status === 'IN_CHAIR';

      let finalAppt = appt;
      if (!isAlreadyCheckedIn) {
        finalAppt = await tx.appointment.update({
          where: { id: appt.id },
          data: {
            status: 'CHECKED_IN',
            checkInTime: new Date(),
            isConfirmedAtDesk: clinic.requireDeskConfirmation ? false : true,
            checkInSource: 'SELF_QR',
            notes: [appt.notes, `[CHECK-IN: SELF_QR | ${clinic.requireDeskConfirmation ? 'Desk Confirmation Pending' : 'Confirmed'}]`].filter(Boolean).join('\n'),
          },
          include: {
            patient: true,
            dentist: { select: { fullName: true } },
            clinic: { select: { name: true, address: true, phone: true, code: true, requireDeskConfirmation: true } },
          },
        });
      }

      // Compute token number and queue count
      const dayStart = new Date(finalAppt.scheduledStart);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(finalAppt.scheduledStart);
      dayEnd.setHours(23, 59, 59, 999);

      const sameDayAppts = await tx.appointment.findMany({
        where: {
          clinicId: finalAppt.clinicId,
          scheduledStart: { gte: dayStart, lte: dayEnd },
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        },
        orderBy: { scheduledStart: 'asc' },
        select: { id: true, status: true },
      });

      const tokenNumber = sameDayAppts.findIndex((a: any) => a.id === finalAppt.id) + 1 || 1;
      const completedBefore = sameDayAppts.filter((a: any, idx: number) => idx < tokenNumber - 1 && a.status === 'COMPLETED').length;
      const currentlyAhead = Math.max(0, (tokenNumber - 1) - completedBefore);

      const ref = `${finalAppt.clinic?.code || 'CLINIC'}-${new Date(finalAppt.createdAt).getFullYear()}-${finalAppt.id.replace(/-/g, '').substring(0, 5).toUpperCase()}`;

      if (!isAlreadyCheckedIn) {
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
        },
      });

      const activeChairsServing = inChairAppts.map(ic => ({
        chairNumber: ic.chairNumber,
        tokenNumber: sameDayAppts.findIndex((a: any) => a.id === ic.id) + 1 || 1,
        isBusy: ic.status === 'IN_CHAIR',
        isCalling: ic.status === 'CALLED',
      }));

      return {
        success: true,
        alreadyCheckedIn: isAlreadyCheckedIn,
        status: finalAppt.status,
        reference: ref,
        tokenNumber,
        currentlyAhead,
        activeChairsServing,
        checkInSource: 'SELF_QR',
        deskConfirmed: false,
        patientName: finalAppt.patient.fullName,
        patientUhid: finalAppt.patient.uhid,
        patientPhone: finalAppt.patient.phone,
        dentistName: finalAppt.dentist?.fullName || 'Assigned Duty Doctor',
        chairNumber: finalAppt.chairNumber || 1,
        scheduledStart: finalAppt.scheduledStart,
        checkInTime: finalAppt.checkInTime || new Date(),
        clinicName: finalAppt.clinic?.name || 'Dental Clinic',
        clinicAddress: finalAppt.clinic?.address || '',
        clinicPhone: finalAppt.clinic?.phone || '',
        message: isAlreadyCheckedIn
          ? `You are already checked in! Your Token is #${tokenNumber}. Please take a seat in the waiting lobby.`
          : `Check-in successful! Your Token is #${tokenNumber}. Please take a seat in the waiting lobby.`,
      };
    });
  }

  async submitPublicIntake(reference: string, intakeData: any, maybeClinicId?: string) {
    const statusData = await this.getPublicStatus(reference, maybeClinicId);
    if (!statusData || !statusData.patientUhid || !(statusData as any).clinicId) {
      throw new NotFoundException('Could not resolve patient for health intake.');
    }
    const targetClinicId = (statusData as any).clinicId;

    return this.prisma.forTenant(targetClinicId, async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { uhid: statusData.patientUhid, clinicId: targetClinicId },
      });

      if (!patient) {
        throw new NotFoundException('Patient record not found.');
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

      return {
        success: true,
        message: 'Medical health intake recorded. Thank you for helping our clinical team prepare for your visit!',
        conditionsCount: conditions.length,
        allergiesCount: allergies.length,
      };
    });
  }

  async getPublicChairStatus(clinicCode?: string) {
    let clinic = null;
    if (clinicCode) {
      clinic = await this.prisma.clinic.findFirst({
        where: { code: clinicCode.toUpperCase() },
      });
    } else {
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

    return {
      clinicCode: clinic.code,
      clinicName: clinic.name,
      clinicAddress: clinic.address,
      clinicPhone: clinic.phone,
      todayDate: istDate,
      totalChairs,
      chairs,
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

    // Deduplicate slots for each chair
    for (const chairKey in bookedSlotsByChair) {
      bookedSlotsByChair[chairKey] = Array.from(new Set(bookedSlotsByChair[chairKey]));
    }

    return {
      success: true,
      clinicCode: clinic.code,
      date: targetDate,
      totalChairs,
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
}