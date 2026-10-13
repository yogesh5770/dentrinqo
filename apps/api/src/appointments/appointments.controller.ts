import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Req, Headers, Header } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto, UpdateAppointmentStatusDto, RescheduleAppointmentDto, ReceptionQuickConsultDto, PublicLookupDto } from './appointment.dto';
import { CreatePublicAppointmentDto, PublicCheckInDto } from './public-booking.dto';
import { AuthService } from '../auth/auth.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Appointment Scheduling')
@Controller('api/appointments')
export class AppointmentsController {
  constructor(
    private readonly appointmentsService: AppointmentsService,
    private readonly authService: AuthService,
  ) {}

  @Post('public-request')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Submit public appointment booking request (Unauthenticated, Rate-limited, Duplicate-protected)' })
  @ApiResponse({ status: 201, description: 'Appointment request received in PENDING_CONFIRMATION status' })
  @ApiResponse({ status: 400, description: 'Invalid fields or past appointment date' })
  @ApiResponse({ status: 409, description: 'Duplicate submission within 15 minutes' })
  async publicRequest(@Body() dto: CreatePublicAppointmentDto, @Req() req: Request) {
    const forwarded = req.headers['x-forwarded-for'];
    const clientIp = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : (req.ip || req.socket.remoteAddress);

    let patientToken = req.cookies ? req.cookies['aks_patient_session'] : undefined;
    if (!patientToken && req.headers.authorization?.startsWith('Bearer ')) {
      patientToken = req.headers.authorization.split(' ')[1];
    }

    const hostClinicId = (req as any).clinicId || ((req as any).tenantClinic && (req as any).tenantClinic.id);
    return this.appointmentsService.createPublicRequest(dto, clientIp, patientToken, hostClinicId);
  }

  @Post('public-checkin')
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @ApiOperation({ summary: 'Self check-in for arriving patient via permanent standee QR scan' })
  @ApiResponse({ status: 200, description: 'Check-in processed and queue token returned' })
  async publicCheckIn(@Body() dto: PublicCheckInDto, @Req() req: Request) {
    const forwarded = req.headers['x-forwarded-for'];
    const clientIp = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : (req.ip || req.socket.remoteAddress);
    const hostClinicId = (req as any).clinicId || ((req as any).tenantClinic && (req as any).tenantClinic.id);
    return this.appointmentsService.publicSelfCheckIn(dto, dto.clinicCode, clientIp, hostClinicId);
  }

  @Get('lobby-code')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Get current rotating lobby code for Waiting Room TV display or Reception Desk' })
  async getLobbyCode(
    @Headers('x-display-token') displayToken?: string,
    @Req() req?: any,
  ) {
    let staffUser = req?.user;
    if (!displayToken && !staffUser) {
      let token = req?.cookies ? req?.cookies['aks_session'] : undefined;
      if (!token && req?.headers?.authorization) {
        const parts = req.headers.authorization.split(' ');
        if (parts.length === 2 && parts[0] === 'Bearer') {
          token = parts[1];
        }
      }
      if (token) {
        staffUser = this.authService.verifyToken(token);
      }
    }
    return this.appointmentsService.getLobbyCodeForDisplayOrStaff(displayToken, staffUser);
  }

  @Get('live-lobby-code')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get live 4-digit TV arrival code for reception staff' })
  async getLiveLobbyCode(@CurrentUser() user: any) {
    return this.appointmentsService.getLobbyCodeForDisplayOrStaff(undefined, user);
  }

  @Patch(':id/confirm-presence')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('CLINIC_ADMIN', 'RECEPTIONIST', 'DENTIST')
  @ApiOperation({ summary: 'Confirm patient presence at reception desk (Required before calling to chair)' })
  async confirmPresence(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.appointmentsService.confirmPresence(user.clinicId, id, user);
  }

  @Post('display-tokens')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('CLINIC_ADMIN')
  @ApiOperation({ summary: 'Generate a new persistent waiting room TV display token (Shown once)' })
  async createDisplayToken(
    @CurrentUser() user: any,
    @Body() body: { name: string },
  ) {
    return this.appointmentsService.createDisplayToken(user.clinicId, body.name, user);
  }

  @Get('display-tokens')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('CLINIC_ADMIN')
  @ApiOperation({ summary: 'List all configured waiting room TV display tokens' })
  async listDisplayTokens(@CurrentUser() user: any) {
    return this.appointmentsService.listDisplayTokens(user.clinicId);
  }

  @Delete('display-tokens/:id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('CLINIC_ADMIN')
  @ApiOperation({ summary: 'Revoke an active waiting room TV display token' })
  async revokeDisplayToken(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.appointmentsService.revokeDisplayToken(user.clinicId, id, user);
  }

  @Post('reception-quick-consult')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('CLINIC_ADMIN', 'RECEPTIONIST', 'DENTIST')
  @ApiOperation({ summary: 'One-click reception consultation booking with atomic token and chair dispatch' })
  async receptionQuickConsult(
    @CurrentUser() user: any,
    @Body() dto: ReceptionQuickConsultDto,
    @Req() req: Request,
  ) {
    const forwarded = req.headers['x-forwarded-for'];
    const clientIp = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : (req.ip || req.socket.remoteAddress);
    return this.appointmentsService.receptionQuickConsult(user.clinicId, dto, user, clientIp);
  }

  @Get('track/:code')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Header('Referrer-Policy', 'no-referrer')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  @ApiOperation({ summary: 'Public tracking of queue position and assigned chair by 128-bit unguessable code' })
  async trackByCode(@Param('code') code: string, @Req() req: any) {
    const hostClinicId = req.clinicId || (req.tenantClinic && req.tenantClinic.id);
    const forwarded = req.headers ? req.headers['x-forwarded-for'] : undefined;
    const clientIp = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : (req.ip || (req.socket && req.socket.remoteAddress) || '127.0.0.1');
    return this.appointmentsService.trackByCode(code, hostClinicId, clientIp);
  }

  @Post('public-lookup')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Header('Referrer-Policy', 'no-referrer')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  @ApiOperation({ summary: 'Safe rate-limited public queue lookup by mobile number and optional token' })
  async publicLookup(@Body() dto: PublicLookupDto, @Req() req: any) {
    const forwarded = req.headers['x-forwarded-for'];
    const clientIp = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : (req.ip || req.socket.remoteAddress || '127.0.0.1');
    const clinicId = req.clinicId || (req.tenantClinic && req.tenantClinic.id) || dto.clinicCode;
    return this.appointmentsService.publicLookup(dto, clinicId, clientIp);
  }

  @Get('lookup-phone')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('CLINIC_ADMIN', 'RECEPTIONIST', 'DENTIST')
  @ApiOperation({ summary: 'Lookup existing patient profiles on a phone number for family booking selection (Staff only)' })
  async lookupPhone(
    @CurrentUser() user: any,
    @Query('phone') phone: string,
  ) {
    return this.appointmentsService.lookupPatientsByPhone(phone, user.clinicId);
  }

  @Get('public-status/:identifier')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Query appointment status and queue token by public reference' })
  async publicStatus(@Param('identifier') identifier: string, @Req() req: any) {
    const clinicId = req.clinicId || (req.tenantClinic && req.tenantClinic.id);
    return this.appointmentsService.getPublicStatus(identifier, clinicId);
  }

  @Get('public-chair-status')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Query active operatory chair status and availability' })
  async publicChairStatus(
    @Query('clinicCode') clinicCode?: string,
    @Headers('x-display-token') displayToken?: string,
    @Req() req?: any,
  ) {
    return this.appointmentsService.getPublicChairStatus(clinicCode, displayToken, (req as any)?.clinicId);
  }

  @Get('public-booked-slots')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Query occupied / booked slots for a given clinic, date and operatory' })
  async publicBookedSlots(
    @Query('clinicCode') clinicCode?: string,
    @Query('date') date?: string,
  ) {
    return this.appointmentsService.getPublicBookedSlots(clinicCode, date);
  }

  @Get('chair-loads')
  @UseGuards(AuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Get appointment load count per operatory chair for a date' })
  async getChairLoads(
    @CurrentUser() user: any,
    @Query('date') date?: string,
  ) {
    return this.appointmentsService.getChairLoads(user.clinicId, date);
  }

  @Patch('chair-toggle')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('CLINIC_ADMIN', 'RECEPTIONIST', 'DENTIST')
  @ApiOperation({ summary: 'Toggle operatory chair active/off duty status' })
  async toggleChair(
    @CurrentUser() user: any,
    @Body() body: { chairNumber: number; isActive: boolean },
  ) {
    return this.appointmentsService.toggleChairStatus(user.clinicId, body.chairNumber, body.isActive);
  }

  @Post('public-intake/:reference')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Submit pre-visit digital medical intake form' })
  async publicIntake(@Param('reference') reference: string, @Body() body: any) {
    return this.appointmentsService.submitPublicIntake(reference, body);
  }

  @Post()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('CLINIC_ADMIN', 'RECEPTIONIST', 'DENTIST')
  @ApiOperation({ summary: 'Book an appointment with dentist & chair conflict detection' })
  async create(@CurrentUser() user: any, @Body() dto: CreateAppointmentDto) {
    return this.appointmentsService.create(user.clinicId, dto, user);
  }

  @Get()
  @UseGuards(AuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Query appointment calendar with date, chair and dentist filters' })
  async findAll(
    @CurrentUser() user: any,
    @Query('date') date?: string,
    @Query('dentistId') dentistId?: string,
    @Query('status') status?: string,
    @Query('chairNumber') chairNumber?: number,
  ) {
    return this.appointmentsService.findAll(user.clinicId, {
      date,
      dentistId,
      status,
      chairNumber,
    });
  }

  @Patch(':id/status')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('CLINIC_ADMIN', 'RECEPTIONIST', 'DENTIST')
  @ApiOperation({ summary: 'Update appointment lifecycle status (Check-in, in-chair, completed, cancelled)' })
  async updateStatus(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentStatusDto,
  ) {
    return this.appointmentsService.updateStatus(user.clinicId, id, dto, user);
  }

  @Post(':id/reschedule')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('CLINIC_ADMIN', 'RECEPTIONIST', 'DENTIST')
  @ApiOperation({ summary: 'Reschedule appointment to a new slot with concurrency checks' })
  async reschedule(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: RescheduleAppointmentDto,
  ) {
    return this.appointmentsService.reschedule(user.clinicId, id, dto, user);
  }
}