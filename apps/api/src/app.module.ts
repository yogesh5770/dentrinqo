import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { ClinicModule } from './clinic/clinic.module';
import { PatientsModule } from './patients/patients.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { ConsultationsModule } from './consultations/consultations.module';
import { UsersModule } from './users/users.module';
import { DentalChartModule } from './dental-chart/dental-chart.module';
import { TreatmentPlansModule } from './treatment-plans/treatment-plans.module';
import { ProceduresModule } from './procedures/procedures.module';
import { PrescriptionsModule } from './prescriptions/prescriptions.module';
import { BillingModule } from './billing/billing.module';
import { MedicalFilesModule } from './medical-files/medical-files.module';
import { FollowUpsModule } from './follow-ups/follow-ups.module';
import { LabOrdersModule } from './lab-orders/lab-orders.module';
import { ConsentModule } from './consent/consent.module';
import { PatientAuthModule } from './patient-auth/patient-auth.module';
import { TenantContextMiddleware } from './common/middleware/tenant-context.middleware';

import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 120,
      },
    ]),
    PrismaModule,
    AuditModule,
    AuthModule,
    PatientAuthModule,
    ClinicModule,
    PatientsModule,
    AppointmentsModule,
    ConsultationsModule,
    UsersModule,
    DentalChartModule,
    TreatmentPlansModule,
    ProceduresModule,
    PrescriptionsModule,
    BillingModule,
    MedicalFilesModule,
    FollowUpsModule,
    LabOrdersModule,
    ConsentModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantContextMiddleware)
      .forRoutes('*');
  }
}