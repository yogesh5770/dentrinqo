import { Controller, Get, Post, Put, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PatientsService } from './patients.service';
import { CreatePatientDto, UpdatePatientDto } from './patient.dto';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Patient Management')
@Controller('api/patients')
@UseGuards(AuthGuard, RolesGuard)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get('check-duplicate')
  @ApiOperation({ summary: 'Check if phone or email matches an existing patient' })
  async checkDuplicate(
    @CurrentUser() user: any,
    @Query('phone') phone: string,
    @Query('email') email?: string,
  ) {
    return this.patientsService.checkDuplicate(user.clinicId, phone, email);
  }

  @Get('serial/:serialNo')
  @ApiOperation({ summary: 'Lookup patient by card serial number or UHID' })
  async getBySerial(@CurrentUser() user: any, @Param('serialNo') serialNo: string) {
    return this.patientsService.findBySerial(user.clinicId, serialNo);
  }

  @Get('possible-duplicates')
  @Roles('CLINIC_ADMIN', 'RECEPTIONIST')
  @ApiOperation({ summary: 'List possible duplicate patients flagged for front desk merge review' })
  async getPossibleDuplicates(@CurrentUser() user: any) {
    return this.patientsService.getPossibleDuplicates(user.clinicId);
  }

  @Post('merge')
  @Roles('CLINIC_ADMIN', 'RECEPTIONIST')
  @ApiOperation({ summary: 'Merge duplicate patient into survivor with full record migration and audit trail' })
  async mergePatients(
    @CurrentUser() user: any,
    @Body() body: { survivorId: string; duplicateId: string; reason: string },
  ) {
    return this.patientsService.mergePatients(
      user.clinicId,
      body.survivorId,
      body.duplicateId,
      body.reason,
      user,
    );
  }

  @Post()
  @Roles('CLINIC_ADMIN', 'RECEPTIONIST', 'DENTIST')
  @ApiOperation({ summary: 'Register a new patient with medical history' })
  async create(@CurrentUser() user: any, @Body() dto: CreatePatientDto) {
    return this.patientsService.create(user.clinicId, dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'Search and list patients with pagination' })
  async findAll(
    @CurrentUser() user: any,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('search') search?: string,
  ) {
    return this.patientsService.findAll(
      user.clinicId,
      parseInt(page, 10) || 1,
      parseInt(limit, 10) || 20,
      search,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get full patient 360 profile with clinical history' })
  async findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.patientsService.findOne(user.clinicId, id);
  }

  @Put(':id')
  @Roles('CLINIC_ADMIN', 'RECEPTIONIST', 'DENTIST')
  @ApiOperation({ summary: 'Update patient demographic and medical information' })
  async update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdatePatientDto,
  ) {
    return this.patientsService.update(user.clinicId, id, dto, user);
  }

  @Put(':id/case-sheet')
  @Patch(':id/archive-info')
  @Roles('CLINIC_ADMIN', 'RECEPTIONIST', 'DENTIST')
  @ApiOperation({ summary: 'Update physical archive case sheet info, voice notes, and photo scans' })
  async updateCaseSheet(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.patientsService.updateCaseSheet(user.clinicId, id, body, user);
  }

  @Post(':id/reappear')
  @Roles('CLINIC_ADMIN', 'RECEPTIONIST', 'DENTIST')
  @ApiOperation({ summary: 'Instant check-in for returning archived patient with legacy card banner' })
  async checkInReappearance(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.patientsService.checkInReappearance(user.clinicId, id, body, user);
  }

  @Patch(':id/verify-first-visit')
  @Roles('CLINIC_ADMIN', 'RECEPTIONIST', 'DENTIST')
  @ApiOperation({ summary: 'Verify demographic and allergy details for first-visit online/walk-in patient' })
  async verifyFirstVisit(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { phone?: string; dateOfBirth?: string; address?: string; allergies?: string[] },
  ) {
    return this.patientsService.verifyFirstVisit(user.clinicId, id, body, user);
  }
}