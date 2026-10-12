import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Res,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response, Request } from 'express';
import { PatientAuthService } from './patient-auth.service';
import {
  PatientSignupDto,
  PatientLoginDto,
  ResetPatientPasswordDto,
  AddFamilyMemberDto,
} from './patient-auth.dto';
import { PatientAuthGuard } from './guards/patient-auth.guard';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Patient Portal Authentication')
@Controller('api/patient-auth')
export class PatientAuthController {
  constructor(private readonly patientAuthService: PatientAuthService) {}

  @Post('signup')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Register a new patient account with DPDP compliance' })
  async signup(
    @Body() dto: PatientSignupDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.patientAuthService.signup(dto);

    // Set dedicated patient session cookie
    res.cookie('aks_patient_session', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    return result;
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Login to patient account with lockout protection' })
  async login(
    @Body() dto: PatientLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.patientAuthService.login(dto);

    res.cookie('aks_patient_session', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return result;
  }

  @Post('logout')
  @ApiOperation({ summary: 'Log out of patient account' })
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('aks_patient_session', { path: '/' });
    return { success: true, message: 'Logged out successfully' };
  }

  @Get('me')
  @UseGuards(PatientAuthGuard)
  @ApiOperation({ summary: 'Get current patient account details and family members' })
  async getMe(@Req() req: any) {
    return this.patientAuthService.getMe(req.patientAccount.accountId, req.patientAccount.clinicId);
  }

  @Post('family')
  @UseGuards(PatientAuthGuard)
  @ApiOperation({ summary: 'Add a new family member under the patient account' })
  async addFamilyMember(
    @Req() req: any,
    @Body() dto: AddFamilyMemberDto,
  ) {
    return this.patientAuthService.addFamilyMember(req.patientAccount.accountId, dto, req.patientAccount.clinicId);
  }

  @Get('visits')
  @UseGuards(PatientAuthGuard)
  @ApiOperation({ summary: 'List visits for all family members under patient account (IDOR safe)' })
  async getMyVisits(@Req() req: any) {
    return this.patientAuthService.getMyVisits(req.patientAccount.accountId, req.patientAccount.clinicId);
  }

  @Patch('reset/:accountId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('CLINIC_ADMIN', 'RECEPTIONIST')
  @ApiOperation({ summary: 'Staff-initiated patient password reset (Audited)' })
  async resetPasswordByStaff(
    @Param('accountId') accountId: string,
    @Body() dto: ResetPatientPasswordDto,
    @CurrentUser() staffUser: any,
  ) {
    return this.patientAuthService.resetPasswordByStaff(accountId, dto, staffUser);
  }
}
