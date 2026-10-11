import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto, UpdateAppointmentStatusDto, RescheduleAppointmentDto } from './appointment.dto';
import { CreatePublicAppointmentDto } from './public-booking.dto';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Appointment Scheduling')
@Controller('api/appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post('public-request')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Submit public appointment booking request (Unauthenticated, Rate-limited, Duplicate-protected)' })
  @ApiResponse({ status: 201, description: 'Appointment request received in PENDING_CONFIRMATION status' })
  @ApiResponse({ status: 400, description: 'Invalid fields or past appointment date' })
  @ApiResponse({ status: 409, description: 'Duplicate submission within 15 minutes' })
  async publicRequest(@Body() dto: CreatePublicAppointmentDto, @Req() req: Request) {
    const forwarded = req.headers['x-forwarded-for'];
    const clientIp = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : (req.ip || req.socket.remoteAddress);
    return this.appointmentsService.createPublicRequest(dto, clientIp);
  }

  @Get('public-status/:identifier')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Query appointment status and queue token by public reference or phone number' })
  async publicStatus(@Param('identifier') identifier: string) {
    return this.appointmentsService.getPublicStatus(identifier);
  }

  @Get('public-chair-status')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Query active operatory chair status and availability' })
  async publicChairStatus(@Query('clinicCode') clinicCode?: string) {
    return this.appointmentsService.getPublicChairStatus(clinicCode);
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