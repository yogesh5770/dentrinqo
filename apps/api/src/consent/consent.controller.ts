import { Controller, Get, Post, Body, Param, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConsentService } from './consent.service';
import { CreateConsentDto } from './consent.dto';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Patient Consent')
@Controller('api/consent')
@UseGuards(AuthGuard, RolesGuard)
export class ConsentController {
  constructor(private readonly consentService: ConsentService) {}

  @Get('templates')
  @ApiOperation({ summary: 'Get standard clinical informed consent templates' })
  getTemplates() {
    return this.consentService.getTemplates();
  }

  @Get('patient/:patientId')
  @ApiOperation({ summary: 'Get all signed consent records for a patient' })
  async findByPatient(
    @CurrentUser() user: any,
    @Param('patientId') patientId: string,
  ) {
    return this.consentService.findByPatient(user.clinicId, patientId);
  }

  @Post()
  @ApiOperation({ summary: 'Save a digitally signed patient consent record' })
  async create(
    @CurrentUser() user: any,
    @Body() dto: CreateConsentDto,
    @Req() req: any,
  ) {
    const ip = req.ip || req.connection?.remoteAddress;
    return this.consentService.create(user.clinicId, dto, user, ip);
  }
}
