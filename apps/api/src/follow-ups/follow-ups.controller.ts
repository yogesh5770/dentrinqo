import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { FollowUpsService } from './follow-ups.service';
import { CreateFollowUpDto, UpdateFollowUpDto } from './follow-ups.dto';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Follow-Up Reminders & Recalls')
@Controller('api/follow-ups')
@UseGuards(AuthGuard, RolesGuard)
export class FollowUpsController {
  constructor(private readonly followUpsService: FollowUpsService) {}

  @Get()
  @ApiOperation({ summary: 'List clinic follow-up and recall reminders' })
  async getFollowUps(@CurrentUser() user: any, @Query('status') status?: string) {
    return this.followUpsService.getFollowUps(user.clinicId, status);
  }

  @Get('recalls')
  @ApiOperation({ summary: 'Get smart recall campaigns and treatment dropout recovery lists' })
  async getRecallCampaigns(@CurrentUser() user: any) {
    return this.followUpsService.getRecallCampaigns(user.clinicId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a custom follow-up reminder' })
  async createFollowUp(@CurrentUser() user: any, @Body() dto: CreateFollowUpDto) {
    return this.followUpsService.createFollowUp(user.clinicId, dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update follow-up status, notes, or reschedule' })
  async updateFollowUp(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateFollowUpDto,
  ) {
    return this.followUpsService.updateFollowUp(user.clinicId, id, dto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a follow-up reminder' })
  async deleteFollowUp(@CurrentUser() user: any, @Param('id') id: string) {
    return this.followUpsService.deleteFollowUp(user.clinicId, id, user);
  }
}
