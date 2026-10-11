import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
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
    return true;
  }
}