import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ClinicService } from './clinic.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Clinic Settings')
@Controller('api/clinic')
@UseGuards(AuthGuard, RolesGuard)
export class ClinicController {
  constructor(private readonly clinicService: ClinicService) {}

  @Get('settings')
  @ApiOperation({ summary: 'Get clinic settings and operational hours' })
  async getSettings(@CurrentUser() user: any) {
    return this.clinicService.getSettings(user.clinicId);
  }

  @Put('settings')
  @Roles('CLINIC_ADMIN')
  @ApiOperation({ summary: 'Update clinic settings (Admin only)' })
  async updateSettings(@CurrentUser() user: any, @Body() body: any) {
    return this.clinicService.updateSettings(user.clinicId, body, user);
  }
}