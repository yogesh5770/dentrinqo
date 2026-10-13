import { Controller, Get, Post, Put, Patch, Body, Query, Param, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ClinicService } from './clinic.service';
import { ClinicHoursService } from './clinic-hours.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Clinic Settings & Hours')
@Controller('api/clinic')
export class ClinicController {
  constructor(
    private readonly clinicService: ClinicService,
    private readonly clinicHoursService: ClinicHoursService,
  ) {}

  @Get('public-info')
  @ApiOperation({ summary: 'Get public clinic information for booking and public kiosks' })
  async getPublicInfo(@Query('code') code?: string, @Req() req?: any) {
    const rawHost = (req?.headers?.['x-forwarded-host'] || req?.headers?.['host'] || '').split(':')[0].toLowerCase();
    const identifier = code || req?.clinicId || (req?.tenantClinic && req?.tenantClinic.id) || req?.headers?.['x-clinic-id'] || req?.headers?.['x-clinic-code'] || rawHost;
    return this.clinicService.getPublicInfo(identifier);
  }

  @Get('marketing-info')
  @ApiOperation({ summary: 'Get minimal public clinic info for external marketing/landing sites' })
  async getMarketingInfo(@Query('code') code?: string, @Req() req?: any) {
    const rawHost = (req?.headers?.['x-forwarded-host'] || req?.headers?.['host'] || '').split(':')[0].toLowerCase();
    const identifier = code || req?.clinicId || (req?.tenantClinic && req?.tenantClinic.id) || req?.headers?.['x-clinic-id'] || req?.headers?.['x-clinic-code'] || rawHost;
    return this.clinicService.getMarketingInfo(identifier);
  }

  @Get('resolve')
  @ApiOperation({ summary: 'Resolve tenant clinic info by host/header' })
  async resolveClinic(@Req() req: any, @Query('code') code?: string) {
    const rawHost = (req?.headers?.['x-forwarded-host'] || req?.headers?.['host'] || '').split(':')[0].toLowerCase();
    const identifier = code || req?.clinicId || (req?.tenantClinic && req?.tenantClinic.id) || req?.headers?.['x-clinic-id'] || req?.headers?.['x-clinic-code'] || rawHost;
    return this.clinicService.getPublicInfo(identifier);
  }

  @Get('public-status')
  @ApiOperation({ summary: 'Get public clinic open/closed status, closure message, and next open date' })
  async getPublicStatus(@Query('code') code?: string, @Req() req?: any) {
    const rawHost = (req?.headers?.['x-forwarded-host'] || req?.headers?.['host'] || '').split(':')[0].toLowerCase();
    const identifier = code || req?.clinicId || (req?.tenantClinic && req?.tenantClinic.id) || req?.headers?.['x-clinic-id'] || req?.headers?.['x-clinic-code'] || rawHost;
    const publicClinic = await this.clinicService.getPublicInfo(identifier);
    return this.clinicHoursService.getClinicStatus(publicClinic.id);
  }

  @Get('status')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get current operational status (OPEN, CLOSED, BREAK) for staff dashboards' })
  async getStaffStatus(@CurrentUser() user: any) {
    return this.clinicHoursService.getClinicStatus(user.clinicId);
  }

  @Get('settings')
  @UseGuards(AuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Get clinic settings and operational hours' })
  async getSettings(@CurrentUser() user: any) {
    return this.clinicService.getSettings(user.clinicId);
  }

  @Put('settings')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('CLINIC_ADMIN')
  @ApiOperation({ summary: 'Update clinic settings (Admin only)' })
  async updateSettings(@CurrentUser() user: any, @Body() body: any) {
    return this.clinicService.updateSettings(user.clinicId, body, user);
  }

  @Post('rotate-lobby-code')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('CLINIC_ADMIN', 'RECEPTIONIST')
  @ApiOperation({ summary: 'Rotate the live TV arrival code on demand (Staff/Admin)' })
  async rotateLobbyCode(@CurrentUser() user: any) {
    return this.clinicService.rotateLobbyCode(user.clinicId, user);
  }

  @Get('hours')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get weekly operating hours with breaks for all 7 days' })
  async getWorkingHours(@CurrentUser() user: any) {
    return this.clinicHoursService.getWorkingHours(user.clinicId);
  }

  @Put('hours')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('CLINIC_ADMIN')
  @ApiOperation({ summary: 'Update weekly operating hours and breaks (Admin only)' })
  async updateWorkingHours(
    @CurrentUser() user: any,
    @Body() body: { schedules: Array<any> },
  ) {
    return this.clinicHoursService.updateWorkingHours(user.clinicId, body.schedules, user);
  }

  @Get('closures')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'List clinic closures (Staff)' })
  async listClosures(@CurrentUser() user: any, @Query('activeOnly') activeOnly?: string) {
    return this.clinicHoursService.listClosures(user.clinicId, activeOnly === 'true');
  }

  @Post('closures')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('CLINIC_ADMIN', 'RECEPTIONIST')
  @ApiOperation({ summary: 'Create a clinic closure with auto-resume time (Admin any date, Receptionist today/tomorrow)' })
  async createClosure(
    @CurrentUser() user: any,
    @Body() body: { startAt: string; endAt: string; reason: string },
  ) {
    return this.clinicHoursService.createClosure(user.clinicId, body, user);
  }

  @Patch('closures/:id/end')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('CLINIC_ADMIN', 'RECEPTIONIST')
  @ApiOperation({ summary: 'End an active clinic closure early and resume operations' })
  async endClosure(@CurrentUser() user: any, @Param('id') id: string) {
    return this.clinicHoursService.endClosure(user.clinicId, id, user);
  }

  @Get('closures/:id/impacted-bookings')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get impacted appointments for a closure with WhatsApp click-to-chat links' })
  async getImpactedBookings(@CurrentUser() user: any, @Param('id') id: string) {
    const closures = await this.clinicHoursService.listClosures(user.clinicId);
    const closure = closures.find((c) => c.id === id);
    if (!closure) return [];
    return this.clinicHoursService.getImpactedBookings(user.clinicId, closure.startAt, closure.endAt);
  }

  @Post('closures/cancel-booking/:appointmentId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('CLINIC_ADMIN', 'RECEPTIONIST')
  @ApiOperation({ summary: 'Cancel an appointment due to clinic closure (0 strikes, reason CLINIC_CLOSED)' })
  async cancelDueToClosure(
    @CurrentUser() user: any,
    @Param('appointmentId') appointmentId: string,
    @Body() body: { closureReason?: string },
  ) {
    return this.clinicHoursService.cancelDueToClosure(
      user.clinicId,
      appointmentId,
      body.closureReason || 'CLINIC_CLOSED',
      user,
    );
  }

  @Put('toggle-leave')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('CLINIC_ADMIN', 'RECEPTIONIST')
  @ApiOperation({ summary: 'Toggle legacy clinic holiday / leave status' })
  async toggleLeave(
    @CurrentUser() user: any,
    @Body() body: { isOnLeave: boolean; leaveReason?: string },
  ) {
    return this.clinicService.toggleLeave(user.clinicId, body.isOnLeave, body.leaveReason, user);
  }
}