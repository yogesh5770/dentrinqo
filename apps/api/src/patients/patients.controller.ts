import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
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
}