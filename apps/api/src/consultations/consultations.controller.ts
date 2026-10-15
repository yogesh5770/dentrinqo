import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConsultationsService } from './consultations.service';
import { CreateConsultationDto, AmendConsultationDto } from './consultation.dto';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Consultations')
@Controller('api/consultations')
@UseGuards(AuthGuard, RolesGuard)
export class ConsultationsController {
  constructor(private readonly consultationsService: ConsultationsService) {}

  @Post()
  @Roles('DENTIST', 'CLINIC_ADMIN')
  @ApiOperation({ summary: 'Record a clinical examination, diagnosis, and findings' })
  async create(@CurrentUser() user: any, @Body() dto: CreateConsultationDto) {
    return this.consultationsService.create(user.clinicId, dto, user);
  }

  @Get('patient/:patientId')
  @ApiOperation({ summary: 'Get all clinical consultations for a patient' })
  async findByPatient(@CurrentUser() user: any, @Param('patientId') patientId: string) {
    return this.consultationsService.findByPatient(user.clinicId, patientId);
  }

  @Post(':id/finalize')
  @Patch(':id/finalize')
  @Roles('DENTIST', 'CLINIC_ADMIN')
  @ApiOperation({ summary: 'Finalize and lock a consultation against direct edits' })
  async finalize(@CurrentUser() user: any, @Param('id') id: string) {
    return this.consultationsService.finalize(user.clinicId, id, user);
  }

  @Post(':id/amend')
  @Roles('DENTIST', 'CLINIC_ADMIN')
  @ApiOperation({ summary: 'Submit an auditable clinical amendment to a finalized consultation' })
  async amend(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: AmendConsultationDto) {
    return this.consultationsService.amend(user.clinicId, id, dto, user);
  }
}