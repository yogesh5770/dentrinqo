import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TreatmentPlansService } from './treatment-plans.service';
import {
  CreateTreatmentPlanDto,
  UpdateTreatmentPlanStatusDto,
  AddTreatmentPlanItemDto,
  UpdateTreatmentPlanItemDto,
} from './treatment-plan.dto';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Treatment Plans')
@Controller('api/treatment-plans')
@UseGuards(AuthGuard, RolesGuard)
export class TreatmentPlansController {
  constructor(private readonly treatmentPlansService: TreatmentPlansService) {}

  @Post()
  @Roles('DENTIST', 'CLINIC_ADMIN')
  @ApiOperation({ summary: 'Create a staged dental treatment plan' })
  async create(@CurrentUser() user: any, @Body() dto: CreateTreatmentPlanDto) {
    return this.treatmentPlansService.create(user.clinicId, dto, user);
  }

  @Get('patient/:patientId')
  @ApiOperation({ summary: 'Get all treatment plans for a patient' })
  async findByPatient(@CurrentUser() user: any, @Param('patientId') patientId: string) {
    return this.treatmentPlansService.findByPatient(user.clinicId, patientId);
  }

  @Patch(':id/status')
  @Roles('DENTIST', 'CLINIC_ADMIN')
  @ApiOperation({ summary: 'Update treatment plan status (ACCEPTED, IN_PROGRESS, COMPLETED)' })
  async updateStatus(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateTreatmentPlanStatusDto,
  ) {
    return this.treatmentPlansService.updateStatus(user.clinicId, id, dto, user);
  }

  @Post(':id/items')
  @Roles('DENTIST', 'CLINIC_ADMIN')
  @ApiOperation({ summary: 'Add a new procedure item with fee to an existing treatment plan' })
  async addItem(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: AddTreatmentPlanItemDto,
  ) {
    return this.treatmentPlansService.addItem(user.clinicId, id, dto, user);
  }

  @Patch('items/:itemId')
  @Roles('DENTIST', 'CLINIC_ADMIN')
  @ApiOperation({ summary: 'Update fee or details of an existing treatment plan item' })
  async updateItem(
    @CurrentUser() user: any,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateTreatmentPlanItemDto,
  ) {
    return this.treatmentPlansService.updateItem(user.clinicId, itemId, dto, user);
  }

  @Delete('items/:itemId')
  @Roles('DENTIST', 'CLINIC_ADMIN')
  @ApiOperation({ summary: 'Delete an uncompleted item from a treatment plan' })
  async deleteItem(
    @CurrentUser() user: any,
    @Param('itemId') itemId: string,
  ) {
    return this.treatmentPlansService.deleteItem(user.clinicId, itemId, user);
  }
}
