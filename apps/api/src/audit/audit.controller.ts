import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Audit Logs')
@Controller('api/audit-logs')
@UseGuards(AuthGuard, RolesGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles('CLINIC_ADMIN')
  @ApiOperation({ summary: 'Get paginated audit logs (Admin only)' })
  async getLogs(
    @CurrentUser() user: any,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
  ) {
    return this.auditService.getLogs(
      user.clinicId,
      parseInt(page, 10) || 1,
      parseInt(limit, 10) || 20,
      action,
      entityType,
    );
  }
}