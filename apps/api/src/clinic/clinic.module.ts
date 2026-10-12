import { Module } from '@nestjs/common';
import { ClinicService } from './clinic.service';
import { ClinicHoursService } from './clinic-hours.service';
import { ClinicController } from './clinic.controller';

@Module({
  providers: [ClinicService, ClinicHoursService],
  controllers: [ClinicController],
  exports: [ClinicService, ClinicHoursService],
})
export class ClinicModule {}