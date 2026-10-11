import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../../common/decorators/permissions.decorator';
import { resolveUserPermissions } from '@aks/shared-types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no roles or permissions specified, route is open to authenticated users
    if (
      (!requiredRoles || requiredRoles.length === 0) &&
      (!requiredPermissions || requiredPermissions.length === 0)
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.role) {
      throw new ForbiddenException('User context missing or unauthenticated');
    }

    // CLINIC_ADMIN has unrestricted overarching clinic access
    if (user.role === 'CLINIC_ADMIN') {
      return true;
    }

    const userPermissions: string[] =
      user.permissions || resolveUserPermissions(user.role);

    // If explicit permissions are required on the endpoint
    if (requiredPermissions && requiredPermissions.length > 0) {
      const hasPermission = requiredPermissions.some(perm =>
        userPermissions.includes(perm),
      );
      if (!hasPermission) {
        throw new ForbiddenException(
          `Insufficient permissions. Required permission: ${requiredPermissions.join(', ')}`,
        );
      }
      return true;
    }

    // Role check
    if (requiredRoles && requiredRoles.length > 0) {
      if (requiredRoles.includes(user.role)) {
        return true;
      }

      // Check if OTHER_STAFF or user has module permissions mapping to the requested role
      // For instance, if endpoint requires RECEPTIONIST or ACCOUNTANT, check billing/appointment permissions
      if (
        requiredRoles.includes('RECEPTIONIST') &&
        (userPermissions.includes('appointments.view') ||
          userPermissions.includes('patients.view'))
      ) {
        return true;
      }

      if (
        requiredRoles.includes('ACCOUNTANT') &&
        (userPermissions.includes('billing.invoices.view') ||
          userPermissions.includes('billing.payments.record'))
      ) {
        return true;
      }

      if (
        requiredRoles.includes('DENTIST') &&
        (userPermissions.includes('clinical.consultations.view') ||
          userPermissions.includes('clinical.dental_chart.view'))
      ) {
        return true;
      }

      throw new ForbiddenException(
        `Insufficient permissions. Required roles: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}