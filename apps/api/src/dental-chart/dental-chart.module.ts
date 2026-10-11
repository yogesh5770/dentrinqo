import { Module } from '@nestjs/common';
import { DentalChartController } from './dental-chart.controller';
import { DentalChartService } from './dental-chart.service';

@Module({
  controllers: [DentalChartController],
  providers: [DentalChartService],
  exports: [DentalChartService],
})
export class DentalChartModule {}
