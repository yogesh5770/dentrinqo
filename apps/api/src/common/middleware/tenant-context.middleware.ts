import { Injectable, NestMiddleware, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

export interface TenantRequest extends Request {
  clinicId?: string;
  tenantClinic?: any;
}

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantContextMiddleware.name);
  private static clinicCache: Map<string, { clinic: any; expiresAt: number }> = new Map();

  constructor(private readonly prisma: PrismaService) {}

  public static clearClinicCache(clinicId?: string) {
    if (clinicId) {
      for (const [key, val] of TenantContextMiddleware.clinicCache.entries()) {
        if (val.clinic?.id === clinicId || val.clinic?.code === clinicId) {
          TenantContextMiddleware.clinicCache.delete(key);
        }
      }
    } else {
      TenantContextMiddleware.clinicCache.clear();
    }
  }

  async use(req: TenantRequest, res: Response, next: NextFunction) {
    try {
      const isDev = process.env.NODE_ENV !== 'production';
      let identifier: string | undefined;

      // In development mode only: allow explicit header testing overrides from localhost
      if (isDev) {
        identifier = ((req.headers['x-clinic-id'] || req.headers['x-tenant-id'] || req.headers['x-clinic-code']) as string);
      }

      let clinic: any = null;

      // 1. Resolve via public hostname using Express-validated hostname
      // When Express 'trust proxy' is configured, req.hostname trusts X-Forwarded-Host only from the upstream proxy
      const host = (req.hostname || (req.headers['host'] as string) || '').split(':')[0].toLowerCase();

      if (!identifier && host) {
        const cachedDomain = TenantContextMiddleware.clinicCache.get(host);
        if (cachedDomain && cachedDomain.expiresAt > Date.now()) {
          clinic = cachedDomain.clinic;
        } else {
          // Lookup strictly in ClinicDomain table
          const domainEntry = await this.prisma.clinicDomain.findUnique({
            where: { domain: host },
            include: { clinic: true },
          });

          if (domainEntry && domainEntry.clinic) {
            clinic = domainEntry.clinic;
            TenantContextMiddleware.clinicCache.set(host, {
              clinic,
              expiresAt: Date.now() + 60000, // 60s cache
            });
          }
        }

        // Tightly restricted local dev subdomains (e.g., aks.localhost, jacobs.localhost)
        if (!clinic && isDev && host.endsWith('.localhost')) {
          const parts = host.split('.');
          if (parts.length === 2) {
            identifier = parts[0];
          }
        }
      }

      // 2. Resolve via identifier (explicit code, subdomain, or id in dev or local test)
      if (!clinic && identifier) {
        const clean = identifier.trim();
        const cached = TenantContextMiddleware.clinicCache.get(clean);
        clinic = cached && cached.expiresAt > Date.now() ? cached.clinic : null;

        if (!clinic) {
          clinic = await this.prisma.clinic.findFirst({
            where: {
              OR: [
                { id: clean },
                { code: clean.toUpperCase() },
                { subdomain: clean.toLowerCase() },
              ],
            },
          });

          if (clinic) {
            TenantContextMiddleware.clinicCache.set(clean, {
              clinic,
              expiresAt: Date.now() + 60000, // 60s cache
            });
          }
        }
      }

      // 3. Attach clinic context if resolved; unknown hosts remain fail-closed (req.clinicId = undefined)
      if (clinic) {
        if (clinic.status === 'SUSPENDED') {
          throw new ForbiddenException(`Clinic "${clinic.name}" is currently suspended. Please contact platform administration.`);
        }
        req.clinicId = clinic.id;
        req.tenantClinic = clinic;
        res.setHeader('X-Tenant-Clinic', clinic.code);
      }

      next();
    } catch (err) {
      next(err);
    }
  }
}
