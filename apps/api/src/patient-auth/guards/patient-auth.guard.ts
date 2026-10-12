import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { PatientAuthService } from '../patient-auth.service';
import { Request } from 'express';

@Injectable()
export class PatientAuthGuard implements CanActivate {
  constructor(private readonly patientAuthService: PatientAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // 1. Check dedicated patient session cookie first, then Bearer header
    let token = request.cookies ? request.cookies['aks_patient_session'] : undefined;
    if (!token && request.headers.authorization) {
      const parts = request.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        token = parts[1];
      }
    }

    if (!token) {
      throw new UnauthorizedException('Patient authentication required. Please log in.');
    }

    const payload = this.patientAuthService.verifyPatientToken(token);
    if (!payload || payload.role !== 'PATIENT') {
      throw new UnauthorizedException('Patient session expired or invalid. Please log in again.');
    }

    // Attach patient account payload to request
    (request as any).patientAccount = payload;
    return true;
  }
}
