import { Module } from '@nestjs/common';
import { PatientAuthController } from './patient-auth.controller';
import { PatientAuthService } from './patient-auth.service';
import { PatientAuthGuard } from './guards/patient-auth.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuditModule, AuthModule],
  controllers: [PatientAuthController],
  providers: [PatientAuthService, PatientAuthGuard],
  exports: [PatientAuthService, PatientAuthGuard],
})
export class PatientAuthModule {}
