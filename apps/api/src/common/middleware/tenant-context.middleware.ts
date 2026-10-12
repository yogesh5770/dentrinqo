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

  async use(req: TenantRequest, res: Response, next: NextFunction) {
    try {
      // 1. Resolve tenant identifier from headers, subdomain, or query
      const explicitHeader = (req.headers['x-clinic-id'] || req.headers['x-tenant-id'] || req.headers['x-clinic-code']) as string;
      const queryCode = req.query.clinicCode as string;
      
      let identifier = explicitHeader || queryCode;

      // Extract from hostname / subdomain if not in header/query
      if (!identifier && req.hostname) {
        const host = req.hostname.toLowerCase();
        // Skip bare IP addresses, localhost without subdomain
        if (!/^\d+\.\d+\.\d+\.\d+$/.test(host) && host !== 'localhost') {
          const parts = host.split('.');
          if (parts.length > 2) {
            identifier = parts[0]; // e.g. "aks" from "aks.dentalflow.in"
          } else if (parts.length === 2 && parts[1] === 'localhost') {
            identifier = parts[0]; // e.g. "aks" from "aks.localhost"
          }
        }
      }

      if (identifier) {
        const clean = identifier.trim();
        const cached = TenantContextMiddleware.clinicCache.get(clean);
        let clinic = cached && cached.expiresAt > Date.now() ? cached.clinic : null;

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

        if (clinic) {
          if (clinic.status === 'SUSPENDED') {
            throw new ForbiddenException(`Clinic "${clinic.name}" is currently suspended. Please contact platform administration.`);
          }
          req.clinicId = clinic.id;
          req.tenantClinic = clinic;
          res.setHeader('X-Tenant-Clinic', clinic.code);
        }
      }

      next();
    } catch (err) {
      next(err);
    }
  }
}
