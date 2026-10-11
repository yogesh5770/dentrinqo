import { Controller, Post, Get, Body, Res, UseGuards, HttpCode, HttpStatus, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto-login';
import { AuthGuard } from './guards/auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { resolveUserPermissions } from '@aks/shared-types';

@ApiTags('Authentication')
@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email or username + password' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const identifier = dto.emailOrUsername || dto.email || dto.username;
    if (!identifier) {
      throw new BadRequestException('Please provide an email or username');
    }

    const user = await this.authService.validateUserCredentials(identifier, dto.password);
    const token = this.authService.createToken(user);

    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('aks_session', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
      path: '/',
    });
    const effectivePermissions = resolveUserPermissions(user.role, (user as any).permissions);

    return {
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        clinicId: user.clinicId,
        email: user.email,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        permissions: effectivePermissions,
        designation: user.designation,
        department: user.department,
        employeeId: user.employeeId,
        mustChangePassword: user.mustChangePassword,
        licenseNumber: user.licenseNumber,
        specialization: user.specialization,
        clinic: {
          name: user.clinic.name,
          code: user.clinic.code,
          city: user.clinic.city,
        },
      },
    };
  }

  @Post('change-password')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change password for currently authenticated user' })
  async changePassword(
    @CurrentUser() user: any,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    if (!body.currentPassword || !body.newPassword) {
      throw new BadRequestException('Both current password and new password are required');
    }
    return this.authService.changePassword(user.userId, body.currentPassword, body.newPassword);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset token via registered email' })
  async forgotPassword(@Body('email') email: string) {
    if (!email) throw new BadRequestException('Email is required');
    return this.authService.forgotPassword(email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using token' })
  async resetPassword(
    @Body('token') token: string,
    @Body('newPassword') newPassword: string,
  ) {
    return this.authService.resetPasswordWithToken(token, newPassword);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log out staff session and clear cookie' })
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('aks_session', { path: '/' });
    return { message: 'Logged out successfully' };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get currently authenticated user profile and clinic details' })
  async getProfile(@CurrentUser() userPayload: any) {
    return this.authService.getCurrentProfile(userPayload.userId);
  }
}