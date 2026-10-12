import { Injectable, ConflictException, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateAppointmentDto, UpdateAppointmentStatusDto, RescheduleAppointmentDto } from './appointment.dto';
import { CreatePublicAppointmentDto } from './public-booking.dto';

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // Generate rotating daily HMAC salt code for Hospital Lobby Walk-in QR
  getDailyLobbyCode(clinicId: string, date: Date = new Date()): string {
    const istDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
    const secret = process.env.JWT_SECRET || 'aks-lobby-salt-key-2026';
    return crypto.createHmac('sha256', secret).update(`${clinicId}:${istDateStr}`).digest('hex').slice(0, 6).toUpperCase();
  }

  // Check for scheduling conflicts (same dentist OR same chair at overlapping time)
  private async checkConflict(
    clinicId: string,
    dentistId: string,
    chairNumber: number,
    start: Date,
    end: Date,
    excludeApptId?: string,
  ) {
    const activeStatuses = ['PENDING_CONFIRMATION', 'SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_CHAIR'];

    // 1. Dentist conflict
    const dentistConflict = await this.prisma.appointment.findFirst({
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
    const chairConflict = await this.prisma.appointment.findFirst({
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

  async create(clinicId: string, dto: CreateAppointmentDto, actor: any) {
    const start = new Date(dto.scheduledStart);
    if (isNaN(start.getTime())) {
      throw new BadRequestException('Invalid scheduled start time');
    }

    const duration = dto.durationMinutes || 30;
    const end = new Date(start.getTime() + duration * 60 * 1000);
    const chair = dto.chairNumber || 1;

    // Verify patient and resolve dentist (allow auto-resolving to on-duty dentist if not specified)
    const patient = await this.prisma.patient.findFirst({ where: { id: dto.patientId, clinicId } });
    if (!patient) throw new NotFoundException('Patient record not found');

    let dentist = null;
    if (dto.dentistId) {
      dentist = await this.prisma.user.findFirst({ where: { id: dto.dentistId, clinicId, isActive: true } });
    } else {
      dentist = await this.prisma.user.findFirst({
        where: { clinicId, role: { in: ['DENTIST', 'CLINIC_ADMIN'] }, isActive: true },
        orderBy: { role: 'asc' },
      });
    }
    if (!dentist) throw new NotFoundException('Dentist record not found or no active dentist available in clinic');

    // Run concurrency & overlap check (skip chair blocking for lobby check-ins where patients are waiting in reception)
    if (dto.status !== 'CHECKED_IN') {
      await this.checkConflict(clinicId, dentist.id, chair, start, end);
    }

    let appt: any;
    try {
      appt = await this.prisma.appointment.create({
        data: {
          clinicId,
          patientId: dto.patientId,
          dentistId: dentist.id,
          createdById: actor.userId,
          chairNumber: chair,
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
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'APPOINTMENT_BOOKED',
      entityType: 'Appointment',
      entityId: appt.id,
      details: {
        patientName: appt.patient.fullName,
        dentistName: appt.dentist.fullName,
        scheduledStart: appt.scheduledStart,
        chairNumber: appt.chairNumber,
      },
    });

    return this.formatAppointment(appt);
  }

  async findAll(clinicId: string, query: { date?: string; dentistId?: string; status?: string; chairNumber?: number }) {
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

    const appointments = await this.prisma.appointment.findMany({
      where,
      orderBy: { scheduledStart: 'asc' },
      include: {
        patient: { select: { fullName: true, phone: true, uhid: true, legacySlNo: true } },
        dentist: { select: { fullName: true } },
      },
    });

    return appointments.map(a => this.formatAppointment(a));
  }

  async updateStatus(clinicId: string, id: string, dto: UpdateAppointmentStatusDto, actor: any) {
    const appt = await this.prisma.appointment.findFirst({
      where: { id, clinicId },
      include: { patient: { select: { fullName: true } } },
    });

    if (!appt) throw new NotFoundException('Appointment not found');

    const updateData: any = {
      status: dto.status,
      notes: dto.notes ? `${appt.notes || ''}\n[Status Note]: ${dto.notes}` : appt.notes,
    };

    if (dto.chairNumber && dto.chairNumber >= 1 && dto.chairNumber <= 10) {
      updateData.chairNumber = dto.chairNumber;
    }

    if (dto.emergencyReason && dto.emergencyReason.trim()) {
      updateData.notes = `${updateData.notes || appt.notes || ''}\n[EMERGENCY ESCALATION]: ${dto.emergencyReason.trim()}`;
    }

    if (dto.status === 'CHECKED_IN' && !appt.checkInTime) {
      updateData.checkInTime = new Date();
    }

    const updated = await this.prisma.appointment.update({
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
        chairNumber: dto.chairNumber || appt.chairNumber,
        emergencyReason: dto.emergencyReason,
        patientName: appt.patient.fullName,
      },
    });

    return this.formatAppointment(updated);
  }

  async reschedule(clinicId: string, id: string, dto: RescheduleAppointmentDto, actor: any) {
    const appt = await this.prisma.appointment.findFirst({ where: { id, clinicId } });
    if (!appt) throw new NotFoundException('Appointment not found');

    const newStart = new Date(dto.newScheduledStart);
    const duration = dto.durationMinutes || appt.durationMinutes;
    const newEnd = new Date(newStart.getTime() + duration * 60 * 1000);
    const chair = dto.chairNumber || appt.chairNumber;

    // Check conflict excluding current appointment
    await this.checkConflict(clinicId, appt.dentistId, chair, newStart, newEnd, id);

    const updated = await this.prisma.appointment.update({
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
      scheduledStart: a.scheduledStart,
      scheduledEnd: a.scheduledEnd,
      durationMinutes: a.durationMinutes,
      reason: a.reason,
      status: a.status,
      checkInTime: a.checkInTime,
      isReappearance: a.isReappearance || false,
      legacySlNo: a.legacySlNo || a.patient?.legacySlNo || null,
      notes: a.notes,
      createdAt: a.createdAt,
    };
  }

  // Lookup patients under a phone number for family member booking selection
  async lookupPatientsByPhone(phone: string, clinicCode?: string) {
    const digits = phone.replace(/\D/g, '');
    const tail10 = digits.slice(-10);
    if (tail10.length !== 10) {
      return { exists: false, patients: [] };
    }

    let clinic = null;
    if (clinicCode) {
      clinic = await this.prisma.clinic.findFirst({
        where: { code: clinicCode.toUpperCase() },
      });
    } else {
      clinic = await this.prisma.clinic.findFirst();
    }
    if (!clinic) return { exists: false, patients: [] };

    const patients = await this.prisma.patient.findMany({
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
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      exists: patients.length > 0,
      patients,
    };
  }

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

    // 3. Duplicate-Submission Protection:
    // Reject submissions for the same phone number in the last 15 minutes to prevent spam
    const cleanPhone = dto.phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      throw new BadRequestException('Please provide a valid contact mobile number.');
    }
    const phoneTail = cleanPhone.slice(-10);
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    const recentPending = await this.prisma.appointment.findFirst({
      where: {
        clinicId,
        patient: { phone: { contains: phoneTail } },
        status: 'PENDING_CONFIRMATION',
        createdAt: { gte: fifteenMinutesAgo },
      },
      include: { patient: true },
    });

    if (recentPending) {
      throw new ConflictException(
        'An appointment request for this phone number has already been received recently. Our clinic team will reach out to you shortly to confirm your slot.',
      );
    }

    // 3b. Active Upcoming Bookings Limit: Max 2 active appointments per phone number
    const activeUpcomingCount = await this.prisma.appointment.count({
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

    // 3c. Prior No-Show Abuse Tracking (last 60 days)
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const priorNoShows = await this.prisma.appointment.count({
      where: {
        clinicId,
        patient: { phone: { contains: phoneTail } },
        status: 'NO_SHOW',
        scheduledStart: { gte: sixtyDaysAgo },
      },
    });

    const isHighNoShowRisk = priorNoShows >= 2;
    const noShowAuditNote = isHighNoShowRisk
      ? `\n[HIGH NO-SHOW RISK ALERT]: Patient has ${priorNoShows} recorded no-shows in past 60 days. Front desk telephone re-confirmation mandatory.`
      : '';

    // 3d. Lobby Walk-in QR Code Validation (if provided or walk-in mode)
    const isWalkin = Boolean(dto.isWalkin) ||
                     Boolean(dto.lobbyCode) ||
                     (dto.service && /walk[- ]?in|lobby/i.test(dto.service)) ||
                     (dto.notes && /walk[- ]?in|lobby/i.test(dto.notes)) ||
                     (dto.preferredSlot && /walk[- ]?in/i.test(dto.preferredSlot));

    if (isWalkin && dto.lobbyCode) {
      const scheduledStartForCode = this.parseSlotTime(dto.preferredDate, dto.preferredSlot);
      const expectedCode = this.getDailyLobbyCode(clinicId, scheduledStartForCode);
      if (dto.lobbyCode.trim().toUpperCase() !== expectedCode) {
        throw new BadRequestException(
          'The lobby walk-in QR code has expired or is invalid. Please scan the current code displayed at the reception desk.',
        );
      }
    }

    // 3e. Cloudflare Turnstile CAPTCHA Verification Hook
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

    // 5. Patient & Family Member Resolution (Guaranteed No Overwrite & No Duplicate Person)
    let patient: any = null;

    // Case A: Specific patientId was explicitly passed by user
    if (dto.patientId) {
      patient = await this.prisma.patient.findFirst({
        where: {
          id: dto.patientId,
          clinicId,
          isArchived: false,
        },
      });
      if (!patient) {
        throw new NotFoundException('Selected patient record could not be found.');
      }
      // IDOR security check: if user is logged in, ensure patient belongs to their account
      if (decodedAccountId && patient.accountId && patient.accountId !== decodedAccountId) {
        throw new ForbiddenException('You do not have permission to book for this patient profile.');
      }
    }

    // Case B: No patientId passed -> Check exact name on this phone, or create new family patient
    if (!patient) {
      const cleanInputName = dto.fullName.trim().toLowerCase();
      const existingPatientsOnPhone = await this.prisma.patient.findMany({
        where: {
          clinicId,
          phone: { contains: phoneTail },
          isArchived: false,
        },
      });

      // Match existing person with same name
      const exactMatch = existingPatientsOnPhone.find(
        p => p.fullName.trim().toLowerCase() === cleanInputName,
      );

      if (exactMatch) {
        patient = exactMatch;
      } else {
        // Register new distinct patient record under this phone number
        const year = new Date().getFullYear();
        const patientCount = await this.prisma.patient.count({ where: { clinicId } });
        const uhid = `${clinic.code}-${year}-${String(patientCount + 1).padStart(4, '0')}`;

        patient = await this.prisma.patient.create({
          data: {
            clinicId,
            accountId: decodedAccountId || undefined,
            relationToAccount: decodedAccountId ? 'FAMILY' : undefined,
            uhid,
            fullName: dto.fullName.trim(),
            phone: `+91${phoneTail}`,
            email: dto.email ? dto.email.trim() : null,
            gender: dto.gender ? dto.gender.toUpperCase() : 'OTHER',
            age: dto.age ? Number(dto.age) : undefined,
            notes: `Public booking request for ${dto.service}`,
          },
        });
      }
    }

    // 5. Resolve staff assignment (assigned dentist & creator)
    const staff = await this.prisma.user.findFirst({
      where: { clinicId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!staff) {
      throw new BadRequestException('No active medical staff available in clinic configuration.');
    }

    const dentist = (await this.prisma.user.findFirst({
      where: { clinicId, role: 'DENTIST', isActive: true },
    })) || staff;

    // 6. Calculate slot timing
    const scheduledStart = this.parseSlotTime(dto.preferredDate, dto.preferredSlot);
    const scheduledEnd = new Date(scheduledStart.getTime() + 30 * 60 * 1000);
    const chairNum = dto.chairNumber && dto.chairNumber >= 1 && dto.chairNumber <= 10 ? dto.chairNumber : 1;

    // 6b. Check for slot conflict across operatory chair and dentist (guarantees 1 user booking blocks next user)
    if (!isWalkin) {
      await this.checkConflict(clinicId, dentist.id, chairNum, scheduledStart, scheduledEnd);
    }

    // 7. Persist Appointment (Hospital walk-in / inside lobby bookings are CHECKED_IN always; online advance bookings are PENDING_CONFIRMATION)
    const initialStatus = isWalkin ? 'CHECKED_IN' : 'PENDING_CONFIRMATION';
    const checkInTime = isWalkin ? new Date() : null;

    let appt: any;
    try {
      appt = await this.prisma.appointment.create({
        data: {
          clinicId,
          patientId: patient.id,
          dentistId: dentist.id,
          createdById: staff.id,
          chairNumber: chairNum,
          scheduledStart,
          scheduledEnd,
          durationMinutes: 30,
          reason: isWalkin
            ? `[Hospital Lobby Walk-In] ${dto.service} (Operatory #${chairNum})`
            : `[Public Request] ${dto.service} (Operatory #${chairNum} - ${dto.preferredSlot})`,
          status: initialStatus,
          checkInTime,
          notes: `Preferred Slot: ${dto.preferredSlot}\nOperatory Chair: #${chairNum}\nClient Notes: ${dto.notes || 'None'}${noShowAuditNote}\nClient IP: ${clientIp || 'N/A'}\nSubmission: ${isWalkin ? 'Hospital Lobby Standee QR (Checked-In)' : 'Online /book portal'}`,
        },
      });
    } catch (err: any) {
      if (err.message?.includes('no_overlapping_chair_booking') || err.code === '23P01') {
        throw new ConflictException(
          `Operatory Chair ${chairNum} has just been reserved by another patient for this slot. Please choose another time or operatory room.`,
        );
      }
      throw err;
    }

    // 8. Generate safe, high-entropy reference code & atomic sequential daily token
    const istDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(scheduledStart);
    let tokenNumber = 1;
    try {
      const seqRecord = await this.prisma.dailyQueueSequence.upsert({
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
    } catch (seqErr) {
      const dayStart = new Date(scheduledStart);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(scheduledStart);
      dayEnd.setHours(23, 59, 59, 999);
      const sameDayCount = await this.prisma.appointment.count({
        where: {
          clinicId,
          scheduledStart: { gte: dayStart, lte: dayEnd },
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        },
      });
      tokenNumber = sameDayCount || 1;
    }

    const shortId = appt.id.replace(/-/g, '').substring(0, 5).toUpperCase();
    const reference = `${clinic.code}-${new Date().getFullYear()}-${shortId}`;

    // 9. Audit trail
    await this.auditService.log({
      clinicId,
      actorId: staff.id,
      actorRole: 'SYSTEM',
      action: 'PUBLIC_BOOKING_REQUEST_RECEIVED',
      entityType: 'Appointment',
      entityId: appt.id,
      details: {
        reference,
        tokenNumber,
        chairNumber: chairNum,
        patientName: patient.fullName,
        patientPhone: patient.phone,
        preferredDate: dto.preferredDate,
        preferredSlot: dto.preferredSlot,
        service: dto.service,
        clientIp: clientIp || 'unknown',
      },
    });

    // 10. Return strictly sanitized public response (zero internal leaks)
    let currentlyAhead = 0;
    let activeChairsServing: any[] = [];
    if (isWalkin) {
      const dayStart = new Date(scheduledStart);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(scheduledStart);
      dayEnd.setHours(23, 59, 59, 999);

      const sameDayAppts = await this.prisma.appointment.findMany({
        where: {
          clinicId,
          scheduledStart: { gte: dayStart, lte: dayEnd },
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        },
        orderBy: { scheduledStart: 'asc' },
        select: { id: true, status: true },
      });
      const completedBefore = sameDayAppts.filter((a: any, idx: number) => idx < tokenNumber - 1 && a.status === 'COMPLETED').length;
      currentlyAhead = Math.max(0, (tokenNumber - 1) - completedBefore);

      const inChairAppts = await this.prisma.appointment.findMany({
        where: {
          clinicId,
          scheduledStart: { gte: dayStart, lte: dayEnd },
          status: 'IN_CHAIR',
        },
        select: {
          id: true,
          chairNumber: true,
        },
      });
      activeChairsServing = inChairAppts.map(ic => ({
        chairNumber: ic.chairNumber,
        tokenNumber: sameDayAppts.findIndex((a: any) => a.id === ic.id) + 1 || 1,
      }));
    }

    return {
      success: true,
      reference,
      tokenNumber,
      chairNumber: chairNum,
      currentlyAhead,
      activeChairsServing,
      status: initialStatus,
      clinicName: clinic.name,
      clinicPhone: clinic.phone,
      patientName: patient.fullName,
      preferredDate: dto.preferredDate,
      preferredSlot: dto.preferredSlot,
      service: dto.service,
      message: isWalkin
        ? `Welcome to the clinic! You are checked in. Token #${tokenNumber} has been assigned. Please take a seat in the waiting lobby.`
        : 'Your appointment request has been recorded. Please complete WhatsApp confirmation to finalize your slot.',
      requiresConfirmation: !isWalkin,
      isCheckedIn: isWalkin,
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

  async getPublicStatus(identifier: string) {
    const clean = (identifier || '').trim();
    if (!clean) throw new BadRequestException('Reference or phone number required');

    let appt: any = null;
    const isPhone = /^[0-9+ -]{8,15}$/.test(clean);

    if (isPhone) {
      const phoneTail = clean.replace(/\D/g, '').slice(-10);
      appt = await this.prisma.appointment.findFirst({
        where: {
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
      const allRecent = await this.prisma.appointment.findMany({
        take: 60,
        orderBy: { createdAt: 'desc' },
        include: {
          patient: true,
          dentist: { select: { fullName: true } },
          clinic: { select: { name: true, address: true, phone: true, code: true } },
        },
      });
      appt = allRecent.find((a: any) =>
        a.id.replace(/-/g, '').toLowerCase().startsWith(shortId) ||
        a.id.toLowerCase().includes(shortId)
      );
    }

    if (!appt) {
      throw new NotFoundException('No active appointment record found for the provided details.');
    }

    const dayStart = new Date(appt.scheduledStart);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(appt.scheduledStart);
    dayEnd.setHours(23, 59, 59, 999);

    const sameDayAppts = await this.prisma.appointment.findMany({
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

    const inChairAppts = await this.prisma.appointment.findMany({
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
  }

  async publicSelfCheckIn(dtoOrIdentifier: any, maybeClinicCode?: string) {
    const dto = typeof dtoOrIdentifier === 'string'
      ? { identifier: dtoOrIdentifier, clinicCode: maybeClinicCode, lobbyCode: undefined, patientName: undefined }
      : (dtoOrIdentifier || {});

    const clean = (dto.identifier || '').trim();
    if (!clean) {
      throw new BadRequestException('Please provide your phone number, last 4 digits, or booking reference code.');
    }

    let clinic: any = null;
    if (dto.clinicCode) {
      clinic = await this.prisma.clinic.findFirst({
        where: { code: dto.clinicCode.toUpperCase() },
      });
    }
    if (!clinic) {
      clinic = await this.prisma.clinic.findFirst();
    }
    if (!clinic) throw new NotFoundException('Clinic not found');

    // Verify daily rotating lobby code if submitted (ghost prevention)
    if (dto.lobbyCode) {
      const expectedCode = this.getDailyLobbyCode(clinic.id);
      if (dto.lobbyCode.trim().toUpperCase() !== expectedCode) {
        throw new ForbiddenException('Invalid or expired lobby check-in code. Please scan the QR code located at the reception counter.');
      }
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    let appt: any = null;
    const isDigitsOnly = /^\d+$/.test(clean);

    if (isDigitsOnly && clean.length === 4) {
      // 1. Last 4 digits of phone lookup
      const candidates = await this.prisma.appointment.findMany({
        where: {
          clinicId: clinic.id,
          patient: { phone: { endsWith: clean } },
          scheduledStart: { gte: todayStart, lte: todayEnd },
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        },
        orderBy: { scheduledStart: 'asc' },
        include: {
          patient: true,
          dentist: { select: { fullName: true } },
          clinic: { select: { name: true, address: true, phone: true, code: true } },
        },
      });

      if (candidates.length === 1) {
        appt = candidates[0];
      } else if (candidates.length > 1) {
        if (dto.patientName && dto.patientName.trim()) {
          const matchName = dto.patientName.trim().toLowerCase();
          appt = candidates.find((c: any) => c.patient.fullName.toLowerCase().includes(matchName)) || candidates[0];
        } else {
          appt = candidates[0];
        }
      }
    } else if (/^[0-9+() -]{7,20}$/.test(clean)) {
      // 2. Full phone lookup
      const phoneTail = clean.replace(/\D/g, '').slice(-10);

      appt = await this.prisma.appointment.findFirst({
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
          clinic: { select: { name: true, address: true, phone: true, code: true } },
        },
      });

      if (!appt) {
        appt = await this.prisma.appointment.findFirst({
          where: {
            clinicId: clinic.id,
            patient: { phone: { contains: phoneTail } },
            status: { notIn: ['CANCELLED', 'NO_SHOW', 'COMPLETED'] },
          },
          orderBy: { scheduledStart: 'desc' },
          include: {
            patient: true,
            dentist: { select: { fullName: true } },
            clinic: { select: { name: true, address: true, phone: true, code: true } },
          },
        });
      }
    } else {
      // 3. Booking reference or ID lookup
      const parts = clean.split('-');
      const shortId = parts[parts.length - 1].toLowerCase();
      const allRecent = await this.prisma.appointment.findMany({
        where: { clinicId: clinic.id },
        take: 100,
        orderBy: { createdAt: 'desc' },
        include: {
          patient: true,
          dentist: { select: { fullName: true } },
          clinic: { select: { name: true, address: true, phone: true, code: true } },
        },
      });
      appt = allRecent.find((a: any) =>
        a.id.replace(/-/g, '').toLowerCase().startsWith(shortId) ||
        a.id.toLowerCase().includes(shortId)
      );
    }

    if (!appt) {
      throw new NotFoundException(
        'No appointment found for this phone number or reference. If you do not have an appointment, you can register as a walk-in at reception or scan the lobby standee QR code.',
      );
    }

    if (appt.status === 'COMPLETED') {
      throw new BadRequestException('This appointment was already completed today.');
    }
    if (appt.status === 'CANCELLED') {
      throw new BadRequestException('This appointment was cancelled. Please register at reception.');
    }

    const isAlreadyCheckedIn = appt.status === 'CHECKED_IN' || appt.status === 'CALLED' || appt.status === 'IN_CHAIR';

    let finalAppt = appt;
    if (!isAlreadyCheckedIn) {
      finalAppt = await this.prisma.appointment.update({
        where: { id: appt.id },
        data: {
          status: 'CHECKED_IN',
          checkInTime: new Date(),
          notes: [appt.notes, '[CHECK-IN: SELF_QR | Desk Confirmation Pending]'].filter(Boolean).join('\n'),
        },
        include: {
          patient: true,
          dentist: { select: { fullName: true } },
          clinic: { select: { name: true, address: true, phone: true, code: true } },
        },
      });
    }

    // Compute token number and queue count
    const dayStart = new Date(finalAppt.scheduledStart);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(finalAppt.scheduledStart);
    dayEnd.setHours(23, 59, 59, 999);

    const sameDayAppts = await this.prisma.appointment.findMany({
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
      });
    }

    const inChairAppts = await this.prisma.appointment.findMany({
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
  }

  async submitPublicIntake(reference: string, intakeData: any) {
    const statusData = await this.getPublicStatus(reference);
    if (!statusData || !statusData.patientUhid) {
      throw new NotFoundException('Could not resolve patient for health intake.');
    }

    const patient = await this.prisma.patient.findFirst({
      where: { uhid: statusData.patientUhid },
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

    await this.prisma.patient.update({
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
  }

  async getPublicChairStatus(clinicCode?: string) {
    let clinic = null;
    if (clinicCode) {
      clinic = await this.prisma.clinic.findFirst({
        where: { code: clinicCode.toUpperCase() },
      });
    } else {
      clinic = await this.prisma.clinic.findFirst();
    }
    if (!clinic) throw new NotFoundException('Clinic not found');

    const totalChairs = Math.max(clinic.chairCount || 3, 3);
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

    const lobbyCode = this.getDailyLobbyCode(clinic.id);
    const istDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

    const chairs = [];
    for (let i = 1; i <= totalChairs; i++) {
      let name = `Operatory Chair ${i}`;
      let doctorName = 'Attending Dental Specialist';
      if (i === 1) {
        name = 'Operatory Chair 1 (Chief Dentist)';
        doctorName = clinic.code === 'JDC' ? 'Dr. Josy Jacob (MDS)' : 'Dr. Khalidh Khan (BDS, MDS)';
      } else if (i === 2) {
        name = 'Operatory Chair 2 (Associate Room)';
        doctorName = 'Associate Dental Surgeon';
      } else if (i === 3) {
        name = 'Operatory Chair 3 (Specialist & Ortho Room)';
        doctorName = 'Consultant Dental Surgeon';
      }

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
      lobbyCode,
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
      clinic = await this.prisma.clinic.findFirst();
    }
    if (!clinic) throw new NotFoundException('Clinic not found');

    const targetDate = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())
      ? dateStr.trim()
      : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

    // IST day start and end
    const dayStart = new Date(`${targetDate}T00:00:00+05:30`);
    const dayEnd = new Date(`${targetDate}T23:59:59+05:30`);

    const appointments = await this.prisma.appointment.findMany({
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

    const totalChairs = Math.max(clinic.chairCount || 3, 3);
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
}