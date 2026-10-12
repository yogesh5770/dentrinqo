import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Execute an operation inside a PostgreSQL transaction with SET LOCAL app.clinic_id.
   * Guarantees Row-Level Security isolation across pooled database connections.
   */
  async forTenant<T>(clinicId: string, operation: (tx: PrismaClient) => Promise<T>): Promise<T> {
    if (!clinicId) {
      throw new Error('Tenant context (clinicId) is required for tenant-scoped operations');
    }

    const isPostgres = Boolean(process.env.DATABASE_URL?.includes('postgres'));
    return this.$transaction(async (tx) => {
      if (isPostgres) {
        await tx.$executeRaw`SELECT set_config('app.clinic_id', ${clinicId}, true)`;
      }
      return operation(tx as unknown as PrismaClient);
    }, { maxWait: 20000, timeout: 20000 });
  }
}