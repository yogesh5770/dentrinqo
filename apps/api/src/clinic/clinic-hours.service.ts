import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantContextMiddleware } from '../common/middleware/tenant-context.middleware';

export interface KolkataTimeInfo {
  year: number;
  month: number;
  day: number;
  dayOfWeek: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
  hour: number;
  minute: number;
  timeStr: string; // "HH:mm" 24h
  dateStr: string; // "YYYY-MM-DD"
}

export interface AssertOpenResult {
  isOpen: boolean;
  overridden?: boolean;
  code?: string;
  message?: string;
  closureReason?: string;
  closedUntil?: string;
  nextOpenAt?: string;
}

@Injectable()
export class ClinicHoursService {
  private readonly logger = new Logger(ClinicHoursService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Helper to execute within tenant transaction context for strict PostgreSQL RLS enforcement.
   */
  private async runInTenant<T>(
    clinicId: string,
    txClient: any | undefined,
    operation: (tx: any) => Promise<T>,
  ): Promise<T> {
    if (txClient) {
      return operation(txClient);
    }
    return this.prisma.forTenant(clinicId, operation as any);
  }

  /**
   * Decomposes any UTC/local date into exact Asia/Kolkata date and time components.
   */
  getKolkataTimeInfo(date: Date = new Date()): KolkataTimeInfo {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    let year = 2026;
    let month = 1;
    let day = 1;
    let hour = 0;
    let minute = 0;

    for (const p of parts) {
      if (p.type === 'year') year = parseInt(p.value, 10);
      if (p.type === 'month') month = parseInt(p.value, 10);
      if (p.type === 'day') day = parseInt(p.value, 10);
      if (p.type === 'hour') hour = parseInt(p.value, 10);
      if (p.type === 'minute') minute = parseInt(p.value, 10);
    }

    const istMs = date.getTime() + (5 * 60 + 30) * 60 * 1000;
    const istDate = new Date(istMs);
    const dayOfWeek = istDate.getUTCDay();

    const hh = String(hour).padStart(2, '0');
    const mm = String(minute).padStart(2, '0');
    const mo = String(month).padStart(2, '0');
    const da = String(day).padStart(2, '0');

    return {
      year,
      month,
      day,
      dayOfWeek,
      hour,
      minute,
      timeStr: `${hh}:${mm}`,
      dateStr: `${year}-${mo}-${da}`,
    };
  }

  /**
   * Returns current open/closed status for a clinic, including active closure,
   * today's working hours, and next open date/time in Asia/Kolkata.
   */
  async getClinicStatus(clinicId: string, instant: Date = new Date(), txClient?: any) {
    return this.runInTenant(clinicId, txClient, async (tx) => {
      const clinic = await tx.clinic.findUnique({
        where: { id: clinicId },
        select: {
          id: true,
          name: true,
          code: true,
          phone: true,
          chairCount: true,
          workingHours: true,
        },
      });

      if (!clinic) throw new NotFoundException('Clinic not found');

      const istNow = this.getKolkataTimeInfo(instant);

      // 1. Check active closures
      const activeClosure = await tx.clinicClosure.findFirst({
        where: {
          clinicId,
          startAt: { lte: instant },
          endAt: { gt: instant },
          endedAt: null,
        },
        include: {
          createdBy: { select: { fullName: true, role: true } },
        },
        orderBy: { endAt: 'desc' },
      });

      // 2. Fetch all 7 days working hours
      let hours = await tx.clinicWorkingHour.findMany({
        where: { clinicId },
        orderBy: { dayOfWeek: 'asc' },
      });

      if (hours.length === 0) {
        hours = await this.initializeDefaultWorkingHours(clinicId, tx);
      }

      const todaySchedule = hours.find((h: any) => h.dayOfWeek === istNow.dayOfWeek);

      let isOpen = true;
      let statusText: 'OPEN' | 'CLOSED' | 'BREAK' = 'OPEN';
      let message = 'Clinic is currently open and accepting appointments.';
      let nextOpenAt: string | null = null;
      let closureReason: string | null = null;

      if (activeClosure) {
        isOpen = false;
        statusText = 'CLOSED';
        closureReason = activeClosure.reason;
        message = `Clinic is closed for: ${activeClosure.reason}`;
        nextOpenAt = activeClosure.endAt.toISOString();
      } else if (!todaySchedule || !todaySchedule.isOpen) {
        isOpen = false;
        statusText = 'CLOSED';
        message = 'Clinic is closed today.';
        nextOpenAt = this.findNextOpenInstant(hours, istNow);
      } else if (
        istNow.timeStr < todaySchedule.openTime ||
        istNow.timeStr >= todaySchedule.closeTime
      ) {
        isOpen = false;
        statusText = 'CLOSED';
        message = `Clinic is currently outside operating hours (${todaySchedule.openTime} - ${todaySchedule.closeTime} IST).`;
        nextOpenAt = this.findNextOpenInstant(hours, istNow);
      } else if (
        todaySchedule.hasBreak &&
        todaySchedule.breakStart &&
        todaySchedule.breakEnd &&
        istNow.timeStr >= todaySchedule.breakStart &&
        istNow.timeStr < todaySchedule.breakEnd
      ) {
        isOpen = false;
        statusText = 'BREAK';
        message = `Clinic is on intermission / break until ${todaySchedule.breakEnd} IST.`;
        nextOpenAt = `${istNow.dateStr}T${todaySchedule.breakEnd}:00+05:30`;
      }

      return {
        clinicId: clinic.id,
        clinicCode: clinic.code,
        clinicName: clinic.name,
        clinicPhone: clinic.phone,
        isOpen,
        status: statusText,
        message,
        closureReason,
        activeClosure: activeClosure
          ? {
              id: activeClosure.id,
              reason: activeClosure.reason,
              startAt: activeClosure.startAt,
              endAt: activeClosure.endAt,
              createdByName: activeClosure.createdBy?.fullName || 'Staff',
            }
          : null,
        todaySchedule: todaySchedule
          ? {
              dayOfWeek: todaySchedule.dayOfWeek,
              isOpen: todaySchedule.isOpen,
              openTime: todaySchedule.openTime,
              closeTime: todaySchedule.closeTime,
              hasBreak: todaySchedule.hasBreak,
              breakStart: todaySchedule.breakStart,
              breakEnd: todaySchedule.breakEnd,
            }
          : null,
        nextOpenAt,
        serverTimeIst: `${istNow.dateStr} ${istNow.timeStr} IST`,
      };
    });
  }

  /**
   * Helper to find the next open instant starting from the current day.
   */
  private findNextOpenInstant(
    hours: Array<any>,
    nowIst: KolkataTimeInfo,
  ): string {
    const todaySched = hours.find((h) => h.dayOfWeek === nowIst.dayOfWeek);

    if (todaySched && todaySched.isOpen && nowIst.timeStr < todaySched.openTime) {
      return `${nowIst.dateStr}T${todaySched.openTime}:00+05:30`;
    }

    for (let offset = 1; offset <= 7; offset++) {
      const nextDayOfWeek = (nowIst.dayOfWeek + offset) % 7;
      const sched = hours.find((h) => h.dayOfWeek === nextDayOfWeek);
      if (sched && sched.isOpen) {
        const base = new Date(`${nowIst.dateStr}T12:00:00+05:30`);
        base.setDate(base.getDate() + offset);
        const nextDateStr = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Kolkata',
        }).format(base);
        return `${nextDateStr}T${sched.openTime}:00+05:30`;
      }
    }

    return `${nowIst.dateStr}T09:30:00+05:30`;
  }

  /**
   * Initialize standard operating hours for a clinic if missing.
   */
  async initializeDefaultWorkingHours(clinicId: string, txClient?: any) {
    return this.runInTenant(clinicId, txClient, async (tx) => {
      const days = [0, 1, 2, 3, 4, 5, 6];
      const records: any[] = [];

      for (const d of days) {
        const isSun = d === 0;
        const rec = await tx.clinicWorkingHour.upsert({
          where: {
            clinicId_dayOfWeek: { clinicId, dayOfWeek: d },
          },
          update: {},
          create: {
            clinicId,
            dayOfWeek: d,
            isOpen: true,
            openTime: isSun ? '10:30' : '09:30',
            closeTime: isSun ? '14:00' : '20:30',
            hasBreak: !isSun,
            breakStart: !isSun ? '13:30' : null,
            breakEnd: !isSun ? '14:30' : null,
          },
        });
        records.push(rec);
      }
      return records;
    });
  }

  /**
   * Get all 7 days working hours for a clinic.
   */
  async getWorkingHours(clinicId: string, txClient?: any) {
    return this.runInTenant(clinicId, txClient, async (tx) => {
      let list = await tx.clinicWorkingHour.findMany({
        where: { clinicId },
        orderBy: { dayOfWeek: 'asc' },
      });

      if (list.length === 0) {
        list = await this.initializeDefaultWorkingHours(clinicId, tx);
      }

      return list;
    });
  }

  /**
   * Update working hours schedule for a clinic.
   */
  async updateWorkingHours(
    clinicId: string,
    schedules: Array<{
      dayOfWeek: number;
      isOpen: boolean;
      openTime: string;
      closeTime: string;
      hasBreak?: boolean;
      breakStart?: string | null;
      breakEnd?: string | null;
    }>,
    actor: any,
    txClient?: any,
  ) {
    for (const s of schedules) {
      if (s.isOpen) {
        if (!s.openTime || !s.closeTime || s.openTime >= s.closeTime) {
          throw new BadRequestException(
            `Invalid hours for day ${s.dayOfWeek}: Open time (${s.openTime}) must be earlier than Close time (${s.closeTime}).`,
          );
        }
        if (s.hasBreak && s.breakStart && s.breakEnd) {
          if (s.breakStart >= s.breakEnd) {
            throw new BadRequestException(
              `Invalid break for day ${s.dayOfWeek}: Break start (${s.breakStart}) must be earlier than Break end (${s.breakEnd}).`,
            );
          }
          if (s.breakStart <= s.openTime || s.breakEnd >= s.closeTime) {
            throw new BadRequestException(
              `Invalid break for day ${s.dayOfWeek}: Break (${s.breakStart}-${s.breakEnd}) must fall strictly inside operating hours (${s.openTime}-${s.closeTime}).`,
            );
          }
        }
      }
    }

    return this.runInTenant(clinicId, txClient, async (tx) => {
      for (const s of schedules) {
        await tx.clinicWorkingHour.upsert({
          where: { clinicId_dayOfWeek: { clinicId, dayOfWeek: s.dayOfWeek } },
          update: {
            isOpen: s.isOpen,
            openTime: s.openTime,
            closeTime: s.closeTime,
            hasBreak: Boolean(s.hasBreak),
            breakStart: s.hasBreak ? s.breakStart : null,
            breakEnd: s.hasBreak ? s.breakEnd : null,
          },
          create: {
            clinicId,
            dayOfWeek: s.dayOfWeek,
            isOpen: s.isOpen,
            openTime: s.openTime,
            closeTime: s.closeTime,
            hasBreak: Boolean(s.hasBreak),
            breakStart: s.hasBreak ? s.breakStart : null,
            breakEnd: s.hasBreak ? s.breakEnd : null,
          },
        });
      }

      // Immediately invalidate in-memory clinic cache!
      TenantContextMiddleware.clearClinicCache(clinicId);

      await this.auditService.log({
        clinicId,
        actorId: actor?.userId || actor?.id || 'admin',
        actorRole: actor?.role || 'CLINIC_ADMIN',
        action: 'CLINIC_WORKING_HOURS_UPDATED',
        entityType: 'ClinicWorkingHour',
        entityId: clinicId,
        details: { daysUpdated: schedules.length },
      }, tx);

      return await this.getWorkingHours(clinicId, tx);
    });
  }

  /**
   * Unified assertOpen Service:
   * Used by public booking, public check-in, reception booking, reception quick consult,
   * and rescheduling.
   *
   * Rejects when clinic is closed with clear code and message.
   * DENTIST or CLINIC_ADMIN may override with a typed reason >= 10 characters.
   */
  async assertOpen(
    clinicId: string,
    instant: Date,
    source:
      | 'PUBLIC_BOOKING'
      | 'SELF_CHECKIN'
      | 'RECEPTION_BOOKING'
      | 'RECEPTION_WALKIN'
      | 'RESCHEDULE',
    overrideReason?: string,
    actor?: any,
    txClient?: any,
  ): Promise<AssertOpenResult> {
    return this.runInTenant(clinicId, txClient, async (tx) => {
      const istTarget = this.getKolkataTimeInfo(instant);

      // 1. Check Active Closures covering this target instant directly from DB
      const closure = await tx.clinicClosure.findFirst({
        where: {
          clinicId,
          startAt: { lte: instant },
          endAt: { gt: instant },
          endedAt: null,
        },
        orderBy: { endAt: 'desc' },
      });

      if (closure) {
        if (this.canOverride(actor, overrideReason)) {
          await this.logOverride(clinicId, instant, source, overrideReason!, actor, `Closure: ${closure.reason}`, tx);
          return { isOpen: true, overridden: true };
        }

        const closedUntilStr = new Intl.DateTimeFormat('en-IN', {
          timeZone: 'Asia/Kolkata',
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(closure.endAt);

        throw new BadRequestException({
          code: 'CLINIC_CLOSED',
          message: `The clinic is temporarily closed (${closure.reason}) until ${closedUntilStr}.`,
          closureReason: closure.reason,
          closedUntil: closure.endAt.toISOString(),
          nextOpenAt: closure.endAt.toISOString(),
        });
      }

      // 2. Check Weekday Schedule & Breaks directly from DB
      let schedule = await tx.clinicWorkingHour.findUnique({
        where: { clinicId_dayOfWeek: { clinicId, dayOfWeek: istTarget.dayOfWeek } },
      });

      if (!schedule) {
        const all = await this.initializeDefaultWorkingHours(clinicId, tx);
        schedule = all.find((h: any) => h.dayOfWeek === istTarget.dayOfWeek) || null;
      }

      if (!schedule || !schedule.isOpen) {
        if (this.canOverride(actor, overrideReason)) {
          await this.logOverride(clinicId, instant, source, overrideReason!, actor, 'Closed weekday', tx);
          return { isOpen: true, overridden: true };
        }

        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        throw new BadRequestException({
          code: 'CLINIC_OUTSIDE_HOURS',
          message: `The clinic is not open on ${dayNames[istTarget.dayOfWeek]}s.`,
          closedUntil: `${istTarget.dateStr} 23:59:59`,
        });
      }

      // Check Operating Hours
      if (
        istTarget.timeStr < schedule.openTime ||
        istTarget.timeStr >= schedule.closeTime
      ) {
        if (this.canOverride(actor, overrideReason)) {
          await this.logOverride(clinicId, instant, source, overrideReason!, actor, `Outside hours (${istTarget.timeStr} vs ${schedule.openTime}-${schedule.closeTime})`, tx);
          return { isOpen: true, overridden: true };
        }

        throw new BadRequestException({
          code: 'CLINIC_OUTSIDE_HOURS',
          message: `Selected time (${istTarget.timeStr} IST) is outside clinic operating hours (${schedule.openTime} - ${schedule.closeTime} IST).`,
          closedUntil: schedule.openTime,
        });
      }

      // Check Intermission Break
      if (
        schedule.hasBreak &&
        schedule.breakStart &&
        schedule.breakEnd &&
        istTarget.timeStr >= schedule.breakStart &&
        istTarget.timeStr < schedule.breakEnd
      ) {
        if (this.canOverride(actor, overrideReason)) {
          await this.logOverride(clinicId, instant, source, overrideReason!, actor, `Break intermission (${schedule.breakStart}-${schedule.breakEnd})`, tx);
          return { isOpen: true, overridden: true };
        }

        throw new BadRequestException({
          code: 'CLINIC_ON_BREAK',
          message: `Clinic is on intermission / break from ${schedule.breakStart} to ${schedule.breakEnd} IST. Appointments cannot be scheduled during this interval.`,
          closedUntil: schedule.breakEnd,
          nextOpenAt: `${istTarget.dateStr}T${schedule.breakEnd}:00+05:30`,
        });
      }

      return { isOpen: true };
    });
  }

  private canOverride(actor: any, overrideReason?: string): boolean {
    if (!actor || !overrideReason) return false;
    const role = actor.role || '';
    const hasRole = ['CLINIC_ADMIN', 'ADMIN', 'DENTIST'].includes(role);
    const hasValidReason = overrideReason.trim().length >= 10;
    return hasRole && hasValidReason;
  }

  private async logOverride(
    clinicId: string,
    instant: Date,
    source: string,
    overrideReason: string,
    actor: any,
    closedContext: string,
    txClient?: any,
  ) {
    this.logger.warn(
      `Clinic open assertion OVERRIDDEN by ${actor?.role} ${actor?.userId || actor?.id}: "${overrideReason}" (Context: ${closedContext})`,
    );

    await this.auditService.log({
      clinicId,
      actorId: actor?.userId || actor?.id || 'staff',
      actorRole: actor?.role || 'STAFF',
      action: 'CLINIC_OPEN_ASSERTION_OVERRIDDEN',
      entityType: 'Clinic',
      entityId: clinicId,
      details: {
        source,
        instant: instant.toISOString(),
        overrideReason,
        closedContext,
      },
    }, txClient);
  }

  /**
   * Create a Clinic Closure.
   * CLINIC_ADMIN can create any closure.
   * RECEPTIONIST can only create one for today or tomorrow in Asia/Kolkata.
   * All changes are audit-logged.
   */
  async createClosure(
    clinicId: string,
    dto: { startAt: string | Date; endAt: string | Date; reason: string },
    actor: any,
    txClient?: any,
  ) {
    const start = new Date(dto.startAt);
    const end = new Date(dto.endAt);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Valid startAt and endAt timestamps are required.');
    }

    if (end <= start) {
      throw new BadRequestException(
        'Closure end date/time must be strictly after the start date/time (auto-resume end time is mandatory).',
      );
    }

    if (!dto.reason || dto.reason.trim().length < 3) {
      throw new BadRequestException('A descriptive reason for the clinic closure is required.');
    }

    const role = actor?.role || 'RECEPTIONIST';

    // Role Enforcement: Receptionist can create only for today or tomorrow in Asia/Kolkata!
    if (role === 'RECEPTIONIST') {
      const now = new Date();
      const istNow = this.getKolkataTimeInfo(now);
      const tomorrowEnd = new Date(`${istNow.dateStr}T23:59:59+05:30`);
      tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

      if (end > tomorrowEnd) {
        throw new ForbiddenException(
          'Front desk receptionists can only record clinic closures for today or tomorrow. Please contact a Clinic Administrator for future date closures.',
        );
      }
    }

    return this.runInTenant(clinicId, txClient, async (tx) => {
      // Persist closure record
      const closure = await tx.clinicClosure.create({
        data: {
          clinicId,
          startAt: start,
          endAt: end,
          reason: dto.reason.trim(),
          createdById: actor?.userId || actor?.id,
        },
        include: {
          createdBy: { select: { fullName: true, role: true } },
        },
      });

      // Invalidate in-memory cache
      TenantContextMiddleware.clearClinicCache(clinicId);

      const isReceptionistAlert = role === 'RECEPTIONIST';

      await this.auditService.log({
        clinicId,
        actorId: actor?.userId || actor?.id,
        actorRole: role,
        action: isReceptionistAlert ? 'CLINIC_CLOSURE_CREATED_BY_STAFF' : 'CLINIC_CLOSURE_CREATED',
        entityType: 'ClinicClosure',
        entityId: closure.id,
        details: {
          reason: closure.reason,
          startAt: closure.startAt.toISOString(),
          endAt: closure.endAt.toISOString(),
          receptionistAlert: isReceptionistAlert,
          alertAdmin: isReceptionistAlert,
        },
      }, tx);

      // Query impacted bookings
      const impacted = await this.getImpactedBookings(clinicId, start, end, tx);

      return {
        closure,
        impactedCount: impacted.length,
        impactedBookings: impacted,
      };
    });
  }

  /**
   * End an active closure early.
   */
  async endClosure(clinicId: string, closureId: string, actor: any, txClient?: any) {
    return this.runInTenant(clinicId, txClient, async (tx) => {
      const closure = await tx.clinicClosure.findFirst({
        where: { id: closureId, clinicId },
      });

      if (!closure) throw new NotFoundException('Closure record not found.');

      const now = new Date();
      const updated = await tx.clinicClosure.update({
        where: { id: closureId },
        data: {
          endedAt: now,
          endedById: actor?.userId || actor?.id,
        },
        include: {
          endedBy: { select: { fullName: true, role: true } },
        },
      });

      TenantContextMiddleware.clearClinicCache(clinicId);

      await this.auditService.log({
        clinicId,
        actorId: actor?.userId || actor?.id,
        actorRole: actor?.role || 'STAFF',
        action: 'CLINIC_CLOSURE_ENDED',
        entityType: 'ClinicClosure',
        entityId: closureId,
        details: {
          endedAt: now.toISOString(),
          originalEndAt: closure.endAt.toISOString(),
        },
      }, tx);

      return updated;
    });
  }

  /**
   * List closures for a clinic.
   */
  async listClosures(clinicId: string, activeOnly: boolean = false, txClient?: any) {
    return this.runInTenant(clinicId, txClient, async (tx) => {
      const where: any = { clinicId };
      if (activeOnly) {
        const now = new Date();
        where.startAt = { lte: now };
        where.endAt = { gt: now };
        where.endedAt = null;
      }

      return await tx.clinicClosure.findMany({
        where,
        orderBy: { startAt: 'desc' },
        include: {
          createdBy: { select: { fullName: true, role: true } },
          endedBy: { select: { fullName: true, role: true } },
        },
        take: 50,
      });
    });
  }

  /**
   * Finds existing bookings in a closed period.
   * Precomputes WhatsApp click-to-chat links with polite rescheduling message.
   */
  async getImpactedBookings(clinicId: string, startAt: Date, endAt: Date, txClient?: any) {
    return this.runInTenant(clinicId, txClient, async (tx) => {
      const clinic = await tx.clinic.findUnique({
        where: { id: clinicId },
        select: { name: true, phone: true },
      });

      const activeStatuses = ['PENDING_CONFIRMATION', 'SCHEDULED', 'CONFIRMED'];

      const bookings = await tx.appointment.findMany({
        where: {
          clinicId,
          scheduledStart: { gte: startAt, lt: endAt },
          status: { in: activeStatuses },
        },
        include: {
          patient: { select: { id: true, fullName: true, phone: true, uhid: true } },
          dentist: { select: { fullName: true } },
        },
        orderBy: { scheduledStart: 'asc' },
      });

      const clinicName = clinic?.name || "AK's Elite Dental";
      const clinicPhone = clinic?.phone || '';

      return bookings.map((b: any) => {
        const timeStr = new Intl.DateTimeFormat('en-IN', {
          timeZone: 'Asia/Kolkata',
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(b.scheduledStart);

        const patientPhoneDigits = (b.patient.phone || '').replace(/\D/g, '');
        const waNumber = patientPhoneDigits.length === 10 ? `91${patientPhoneDigits}` : patientPhoneDigits;

        const rawMsg = `Dear ${b.patient.fullName}, this is from ${clinicName}. Due to an unavoidable clinic closure, your appointment scheduled for ${timeStr} needs to be rescheduled. We sincerely apologize for any inconvenience. Please reply to this message or call ${clinicPhone} to select your preferred new time.`;
        const whatsappUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(rawMsg)}`;

        return {
          id: b.id,
          patientName: b.patient.fullName,
          patientPhone: b.patient.phone,
          patientUhid: b.patient.uhid,
          scheduledStart: b.scheduledStart,
          scheduledStartFormatted: timeStr,
          chairNumber: b.chairNumber,
          dentistName: b.dentist?.fullName || 'Doctor',
          status: b.status,
          reason: b.reason,
          whatsappUrl,
        };
      });
    });
  }

  /**
   * Cancel an appointment specifically due to clinic closure.
   * Cancellation reason is set to 'CLINIC_CLOSED'.
   * Never counts as a patient no-show strike.
   */
  async cancelDueToClosure(
    clinicId: string,
    appointmentId: string,
    closureReason: string = 'CLINIC_CLOSED',
    actor: any,
    txClient?: any,
  ) {
    return this.runInTenant(clinicId, txClient, async (tx) => {
      const appt = await tx.appointment.findFirst({
        where: { id: appointmentId, clinicId },
        include: { patient: { select: { fullName: true, phone: true } } },
      });

      if (!appt) throw new NotFoundException('Appointment record not found');

      const updated = await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          status: 'CANCELLED',
          cancellationReason: 'CLINIC_CLOSED',
          cancelledAt: new Date(),
          cancelledById: actor?.userId || actor?.id,
          notes: `${appt.notes || ''}\n[CANCELLED DUE TO CLINIC CLOSURE]: ${closureReason}`.trim(),
        },
      });

      await this.auditService.log({
        clinicId,
        actorId: actor?.userId || actor?.id,
        actorRole: actor?.role || 'STAFF',
        action: 'APPOINTMENT_CANCELLED_CLINIC_CLOSED',
        entityType: 'Appointment',
        entityId: appointmentId,
        details: {
          patientName: appt.patient.fullName,
          previousStatus: appt.status,
          cancellationReason: 'CLINIC_CLOSED',
          closureReason,
        },
      }, tx);

      return {
        success: true,
        appointmentId,
        status: 'CANCELLED',
        cancellationReason: 'CLINIC_CLOSED',
        patientName: appt.patient.fullName,
        strikeCounted: false,
      };
    });
  }
}
