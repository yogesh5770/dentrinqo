import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const TenantId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    // Return explicit tenant clinicId from middleware or from authenticated user
    return request.clinicId || request.user?.clinicId || null;
  },
);

export const TenantClinic = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.tenantClinic || null;
  },
);
