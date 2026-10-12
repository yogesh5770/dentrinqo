import { Controller, Get, Put, Body, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ClinicService } from './clinic.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Clinic Settings')
@Controller('api/clinic')
export class ClinicController {
  constructor(private readonly clinicService: ClinicService) {}

  @Get('public-info')
  @ApiOperation({ summary: 'Get public clinic information for booking and public kiosks' })
  async getPublicInfo(@Query('code') code?: string, @Req() req?: any) {
    const identifier = code || req?.clinicId || req?.headers?.['x-clinic-id'] || req?.headers?.['x-clinic-code'];
    return this.clinicService.getPublicInfo(identifier);
  }

  @Get('resolve')
  @ApiOperation({ summary: 'Resolve tenant clinic info by host/header' })
  async resolveClinic(@Req() req: any, @Query('code') code?: string) {
    const identifier = code || req?.clinicId || req?.headers?.['x-clinic-id'] || req?.headers?.['x-clinic-code'];
    return this.clinicService.getPublicInfo(identifier);
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
}