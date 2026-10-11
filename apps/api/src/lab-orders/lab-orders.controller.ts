import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { LabOrdersService } from './lab-orders.service';
import { CreateLabOrderDto, UpdateLabOrderDto } from './lab-orders.dto';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Dental Lab Orders')
@Controller('api/lab-orders')
@UseGuards(AuthGuard, RolesGuard)
export class LabOrdersController {
  constructor(private readonly labOrdersService: LabOrdersService) {}

  @Get()
  @ApiOperation({ summary: 'List all dental lab orders for the clinic' })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'patientId', required: false, type: String })
  async findAll(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('patientId') patientId?: string,
  ) {
    return this.labOrdersService.findAll(user.clinicId, status, patientId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a specific lab order' })
  async findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.labOrdersService.findOne(user.clinicId, id);
  }

  @Post()
  @Roles('CLINIC_ADMIN', 'DENTIST', 'RECEPTIONIST')
  @ApiOperation({ summary: 'Create a new dental lab work order' })
  async create(@CurrentUser() user: any, @Body() dto: CreateLabOrderDto) {
    return this.labOrdersService.create(user.clinicId, dto, user);
  }

  @Patch(':id')
  @Roles('CLINIC_ADMIN', 'DENTIST', 'RECEPTIONIST')
  @ApiOperation({ summary: 'Update lab order status, delivery date or details' })
  async update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateLabOrderDto,
  ) {
    return this.labOrdersService.update(user.clinicId, id, dto, user);
  }

  @Delete(':id')
  @Roles('CLINIC_ADMIN', 'DENTIST')
  @ApiOperation({ summary: 'Cancel/delete a lab order' })
  async remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.labOrdersService.remove(user.clinicId, id, user);
  }
}
