import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { Request } from 'express';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    
    // Check session cookie first, then fallback to Authorization header
    let token = request.cookies ? request.cookies['aks_session'] : undefined;
    if (!token && request.headers.authorization) {
      const parts = request.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        token = parts[1];
      }
    }

    if (!token) {
      throw new UnauthorizedException('Authentication required. No session found.');
    }

    const payload = this.authService.verifyToken(token);
    if (!payload) {
      throw new UnauthorizedException('Session expired or invalid. Please log in again.');
    }

    // Attach user payload to request
    (request as any).user = payload;

    // Verify account active status to prevent deactivated staff retaining access until JWT expiration (SEC-07)
    const isUserActive = await this.authService.isAccountActive(payload.userId, payload.clinicId);
    if (!isUserActive) {
      throw new UnauthorizedException('Account deactivated or disabled. Session revoked.');
    }

    // Tenant mismatch check: Ensure user session clinic matches host-resolved tenant
    const hostClinicId = (request as any).clinicId || ((request as any).tenantClinic && (request as any).tenantClinic.id);
    if (hostClinicId && payload.clinicId && hostClinicId !== payload.clinicId) {
      if (payload.role !== 'SUPER_ADMIN') {
        throw new ForbiddenException('Access denied: Authenticated session clinic does not match the tenant resolved from host.');
      }
    }

    return true;
  }
}