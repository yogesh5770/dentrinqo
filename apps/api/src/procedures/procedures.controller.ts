import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ProceduresService } from './procedures.service';
import { CreateCatalogueItemDto, RecordCompletedProcedureDto, UpdateCatalogueItemDto } from './procedure.dto';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Procedures')
@Controller('api/procedures')
@UseGuards(AuthGuard, RolesGuard)
export class ProceduresController {
  constructor(private readonly proceduresService: ProceduresService) {}

  @Get('catalogue')
  @ApiOperation({ summary: 'Retrieve clinic dental procedure catalog & fee schedule' })
  async getCatalogue(@CurrentUser() user: any, @Query('all') all?: string) {
    const includeInactive = all === 'true' && user?.role === 'CLINIC_ADMIN';
    return this.proceduresService.getCatalogue(user?.clinicId, includeInactive);
  }

  @Post('catalogue')
  @Roles('CLINIC_ADMIN')
  @ApiOperation({ summary: 'Add a new treatment and set standard fee' })
  async createCatalogueItem(@CurrentUser() user: any, @Body() dto: CreateCatalogueItemDto) {
    return this.proceduresService.createCatalogueItem(user.clinicId, dto, user);
  }

  @Put('catalogue/:id')
  @Roles('CLINIC_ADMIN')
  @ApiOperation({ summary: 'Update treatment details, fee schedule, or active status' })
  async updateCatalogueItem(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateCatalogueItemDto,
  ) {
    return this.proceduresService.updateCatalogueItem(user.clinicId, id, dto, user);
  }

  @Delete('catalogue/:id')
  @Roles('CLINIC_ADMIN')
  @ApiOperation({ summary: 'Deactivate treatment from active catalog' })
  async deleteCatalogueItem(@CurrentUser() user: any, @Param('id') id: string) {
    return this.proceduresService.deleteCatalogueItem(user.clinicId, id, user);
  }

  @Post()
  @Roles('DENTIST', 'CLINIC_ADMIN')
  @ApiOperation({ summary: 'Record a clinical procedure performed in operatory' })
  async recordCompleted(@CurrentUser() user: any, @Body() dto: RecordCompletedProcedureDto) {
    return this.proceduresService.recordCompleted(user.clinicId, dto, user);
  }

  @Get('patient/:patientId')
  @ApiQuery({ name: 'unbilledOnly', required: false, type: Boolean })
  @ApiOperation({ summary: 'List completed procedures for a patient' })
  async findByPatient(
    @CurrentUser() user: any,
    @Param('patientId') patientId: string,
    @Query('unbilledOnly') unbilledOnly?: string,
  ) {
    const isUnbilled = unbilledOnly === 'true';
    return this.proceduresService.findByPatient(user.clinicId, patientId, isUnbilled);
  }
}
