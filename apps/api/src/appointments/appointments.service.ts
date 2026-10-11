import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
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
    const activeStatuses = ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_CHAIR'];

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

    // Verify patient and dentist exist
    const [patient, dentist] = await Promise.all([
      this.prisma.patient.findFirst({ where: { id: dto.patientId, clinicId } }),
      this.prisma.user.findFirst({ where: { id: dto.dentistId, clinicId, isActive: true } }),
    ]);

    if (!patient) throw new NotFoundException('Patient record not found');
    if (!dentist) throw new NotFoundException('Dentist record not found or dentist is inactive');

    // Run concurrency & overlap check
    await this.checkConflict(clinicId, dto.dentistId, chair, start, end);

    let appt: any;
    try {
      appt = await this.prisma.appointment.create({
        data: {
          clinicId,
          patientId: dto.patientId,
          dentistId: dto.dentistId,
          createdById: actor.userId,
          chairNumber: chair,
          scheduledStart: start,
          scheduledEnd: end,
          durationMinutes: duration,
          reason: dto.reason.trim(),
          status: 'SCHEDULED',
          notes: dto.notes,
        },
        include: {
          patient: { select: { fullName: true, phone: true, uhid: true } },
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
        patient: { select: { fullName: true, phone: true, uhid: true } },
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

    await this.auditService.log({
      clinicId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'APPOINTMENT_STATUS_CHANGED',
      entityType: 'Appointment',
      entityId: id,
      details: { previousStatus: appt.status, newStatus: dto.status, patientName: appt.patient.fullName },
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
      notes: a.notes,
      createdAt: a.createdAt,
    };
  }

  async createPublicRequest(dto: CreatePublicAppointmentDto, clientIp?: string) {
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
    const isWalkin = (dto.service && dto.service.toLowerCase().includes('walk-in')) ||
                     (dto.notes && dto.notes.toLowerCase().includes('walk-in')) ||
                     Boolean(dto.lobbyCode);

    if (isWalkin && dto.lobbyCode) {
      const scheduledStartForCode = this.parseSlotTime(dto.preferredDate, dto.preferredSlot);
      const expectedCode = this.getDailyLobbyCode(clinicId, scheduledStartForCode);
      if (dto.lobbyCode.trim().toUpperCase() !== expectedCode) {
        throw new BadRequestException(
          'The lobby walk-in QR code has expired or is invalid. Please scan the current code displayed at the reception desk.',
        );
      }
    }

    // 4. Isolated Patient Matching or Self-Registration within this clinic
    let patient = await this.prisma.patient.findFirst({
      where: {
        clinicId,
        phone: { contains: phoneTail },
        isArchived: false,
      },
    });

    if (!patient) {
      const year = new Date().getFullYear();
      const patientCount = await this.prisma.patient.count({ where: { clinicId } });
      const uhid = `${clinic.code}-${year}-${String(patientCount + 1).padStart(4, '0')}`;

      patient = await this.prisma.patient.create({
        data: {
          clinicId,
          uhid,
          fullName: dto.fullName.trim(),
          phone: dto.phone.trim(),
          email: dto.email ? dto.email.trim() : null,
          gender: dto.gender ? dto.gender.toUpperCase() : 'OTHER',
          age: dto.age ? Number(dto.age) : undefined,
          notes: `Public online booking request for ${dto.service}`,
        },
      });
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

    // 7. Persist Appointment in PENDING_CONFIRMATION status with DB Exclusion Constraint catch
    const chairNum = dto.chairNumber && dto.chairNumber >= 1 && dto.chairNumber <= 10 ? dto.chairNumber : 1;
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
          reason: `[Public Request] ${dto.service} (Operatory #${chairNum} - ${dto.preferredSlot})`,
          status: 'PENDING_CONFIRMATION',
          notes: `Preferred Slot: ${dto.preferredSlot}\nOperatory Chair: #${chairNum}\nClient Notes: ${dto.notes || 'None'}${noShowAuditNote}\nClient IP: ${clientIp || 'N/A'}\nSubmission: Online /book portal`,
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
      const seqResult: any = await this.prisma.$queryRawUnsafe(`
        INSERT INTO "DailyQueueSequence" ("id", "clinicId", "dateString", "lastSequence", "updatedAt")
        VALUES (gen_random_uuid(), '${clinicId}', '${istDateStr}', 1, NOW())
        ON CONFLICT ("clinicId", "dateString")
        DO UPDATE SET "lastSequence" = "DailyQueueSequence"."lastSequence" + 1, "updatedAt" = NOW()
        RETURNING "lastSequence";
      `);
      if (seqResult && seqResult[0] && seqResult[0].lastSequence) {
        tokenNumber = Number(seqResult[0].lastSequence);
      }
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
    return {
      success: true,
      reference,
      tokenNumber,
      chairNumber: chairNum,
      status: 'PENDING_CONFIRMATION',
      clinicName: clinic.name,
      clinicPhone: clinic.phone,
      patientName: patient.fullName,
      preferredDate: dto.preferredDate,
      preferredSlot: dto.preferredSlot,
      service: dto.service,
      message: 'Your appointment request has been recorded. Please complete WhatsApp confirmation to finalize your slot.',
      requiresConfirmation: true,
    };
  }

  private parseSlotTime(dateStr: string, slotStr: string): Date {
    const baseDate = new Date(dateStr);
    if (isNaN(baseDate.getTime())) {
      return new Date();
    }

    const match = slotStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (match) {
      let hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const meridiem = match[3].toUpperCase();

      if (meridiem === 'PM' && hours < 12) hours += 12;
      if (meridiem === 'AM' && hours === 12) hours = 0;

      baseDate.setHours(hours, minutes, 0, 0);
      return baseDate;
    }

    baseDate.setHours(10, 0, 0, 0);
    return baseDate;
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

    return {
      success: true,
      reference: ref,
      status: appt.status,
      tokenNumber,
      currentlyAhead,
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

    let chairConfig: Record<string, boolean> = {
      '1': true,
      '2': true,
    };

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

    return {
      clinicCode: clinic.code,
      lobbyCode,
      todayDate: istDate,
      chairs: [
        {
          chairNumber: 1,
          name: 'Operatory Chair 1 (Chief Dentist)',
          doctorName: clinic.code === 'JDC' ? 'Dr. Josy Jacob (MDS)' : 'Dr. Khalidh Khan (BDS, MDS)',
          isActive: chairConfig['1'] !== false,
        },
        {
          chairNumber: 2,
          name: 'Operatory Chair 2 (Associate Room)',
          doctorName: 'Associate Dental Surgeon',
          isActive: chairConfig['2'] !== false,
        },
      ],
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
      ...(parsed.chairStatus || { '1': true, '2': true }),
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