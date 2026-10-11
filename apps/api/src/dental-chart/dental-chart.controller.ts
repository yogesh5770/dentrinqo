import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { DentalChartService } from './dental-chart.service';
import { RecordToothConditionDto } from './dental-chart.dto';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Dental Chart')
@Controller('api/dental-chart')
@UseGuards(AuthGuard, RolesGuard)
export class DentalChartController {
  constructor(private readonly dentalChartService: DentalChartService) {}

  @Get('patient/:patientId')
  @ApiOperation({ summary: 'Retrieve full interactive FDI dental chart findings for a patient' })
  async getPatientChart(@CurrentUser() user: any, @Param('patientId') patientId: string) {
    return this.dentalChartService.getPatientChart(user.clinicId, patientId);
  }

  @Post()
  @Roles('DENTIST', 'CLINIC_ADMIN')
  @ApiOperation({ summary: 'Record or update an anatomical tooth/surface condition' })
  async recordCondition(@CurrentUser() user: any, @Body() dto: RecordToothConditionDto) {
    return this.dentalChartService.recordCondition(user.clinicId, dto, user);
  }

  @Delete(':id')
  @Roles('DENTIST', 'CLINIC_ADMIN')
  @ApiOperation({ summary: 'Delete a dental chart finding' })
  async removeEntry(@CurrentUser() user: any, @Param('id') id: string) {
    return this.dentalChartService.removeEntry(user.clinicId, id, user);
  }
}
