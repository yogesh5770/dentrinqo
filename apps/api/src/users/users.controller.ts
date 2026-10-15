import { Controller, Get, Post, Put, Patch, Body, Param, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Staff & User Management')
@Controller('api/users')
@UseGuards(AuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List clinic staff members with optional search, role and active filters' })
  async findAll(
    @CurrentUser() user: any,
    @Query('role') role?: string,
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
  ) {
    // Allow non-admins only to fetch list of dentists for appointment booking
    if (user.role !== 'CLINIC_ADMIN' && role !== 'DENTIST') {
      throw new ForbiddenException('Staff management is restricted to Clinic Administrator');
    }
    return this.usersService.findAll(user.clinicId, { role, search, isActive });
  }

  @Get(':id')
  @Roles('CLINIC_ADMIN')
  @ApiOperation({ summary: 'Get details of a specific staff member' })
  async findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.usersService.findOne(user.clinicId, id);
  }

  @Post()
  @Roles('CLINIC_ADMIN')
  @ApiOperation({ summary: 'Register a new clinic staff member with auto-generated credentials and WhatsApp share (Admin only)' })
  async create(@CurrentUser() user: any, @Body() body: any) {
    return this.usersService.create(user.clinicId, body, user);
  }

  @Put(':id')
  @Roles('CLINIC_ADMIN')
  @ApiOperation({ summary: 'Update staff member profile (Admin only)' })
  async update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.usersService.update(user.clinicId, id, body, user);
  }

  @Patch(':id/status')
  @Roles('CLINIC_ADMIN')
  @ApiOperation({ summary: 'Activate or deactivate a staff member account (Admin only)' })
  async toggleStatus(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body('isActive') isActive: boolean,
  ) {
    return this.usersService.toggleActiveStatus(user.clinicId, id, isActive, user);
  }

  @Post(':id/reset-password')
  @Roles('CLINIC_ADMIN')
  @ApiOperation({ summary: 'Reset staff password with a new temporary password and WhatsApp share (Admin only)' })
  async resetPassword(@CurrentUser() user: any, @Param('id') id: string) {
    return this.usersService.resetStaffPassword(user.clinicId, id, user);
  }

  @Patch(':id/chair')
  @Roles('CLINIC_ADMIN', 'RECEPTIONIST')
  @ApiOperation({ summary: 'Assign or clear default operatory chair for a clinical dentist (Admin or Receptionist)' })
  async assignChair(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body('assignedChairNumber') assignedChairNumber: number | null,
  ) {
    return this.usersService.assignChair(user.clinicId, id, assignedChairNumber, user);
  }
}