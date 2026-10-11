import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrescriptionsService } from './prescriptions.service';
import { CreatePrescriptionDto } from './prescription.dto';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Prescriptions')
@Controller('api/prescriptions')
@UseGuards(AuthGuard, RolesGuard)
export class PrescriptionsController {
  constructor(private readonly prescriptionsService: PrescriptionsService) {}

  @Get('templates')
  @ApiOperation({ summary: 'Get standard evidence-based dental drug regimens' })
  getTemplates() {
    return this.prescriptionsService.getTemplates();
  }

  @Post()
  @Roles('DENTIST', 'CLINIC_ADMIN')
  @ApiOperation({ summary: 'Create and issue a digital dental prescription' })
  async create(@CurrentUser() user: any, @Body() dto: CreatePrescriptionDto) {
    return this.prescriptionsService.create(user.clinicId, dto, user);
  }

  @Get('patient/:patientId')
  @ApiOperation({ summary: 'List all prescriptions issued to a patient' })
  async findByPatient(@CurrentUser() user: any, @Param('patientId') patientId: string) {
    return this.prescriptionsService.findByPatient(user.clinicId, patientId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single prescription with clinic and doctor credentials for printing' })
  async getById(@CurrentUser() user: any, @Param('id') id: string) {
    return this.prescriptionsService.getById(user.clinicId, id);
  }
}
