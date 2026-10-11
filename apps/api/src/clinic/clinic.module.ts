import { Module } from '@nestjs/common';
import { ClinicService } from './clinic.service';
import { ClinicController } from './clinic.controller';

@Module({
  providers: [ClinicService],
  controllers: [ClinicController],
  exports: [ClinicService],
})
export class ClinicModule {}