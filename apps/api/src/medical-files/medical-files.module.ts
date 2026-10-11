import { Module } from '@nestjs/common';
import { MedicalFilesController } from './medical-files.controller';
import { MedicalFilesService } from './medical-files.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [MedicalFilesController],
  providers: [MedicalFilesService],
  exports: [MedicalFilesService],
})
export class MedicalFilesModule {}
