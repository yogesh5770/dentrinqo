import { Module } from '@nestjs/common';
import { ConsultationsService } from './consultations.service';
import { ConsultationsController } from './consultations.controller';

@Module({
  providers: [ConsultationsService],
  controllers: [ConsultationsController],
  exports: [ConsultationsService],
})
export class ConsultationsModule {}