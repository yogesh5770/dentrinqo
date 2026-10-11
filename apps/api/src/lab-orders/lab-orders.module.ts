import { Module } from '@nestjs/common';
import { LabOrdersController } from './lab-orders.controller';
import { LabOrdersService } from './lab-orders.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [LabOrdersController],
  providers: [LabOrdersService],
  exports: [LabOrdersService],
})
export class LabOrdersModule {}
