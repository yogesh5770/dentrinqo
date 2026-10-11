import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  Res,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { Response } from 'express';
import * as fs from 'fs';
import { MedicalFilesService } from './medical-files.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Medical Files & Dental Imaging')
@Controller('api/medical-files')
@UseGuards(AuthGuard, RolesGuard)
export class MedicalFilesController {
  constructor(private readonly filesService: MedicalFilesService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max upload limit
    }),
  )
  @ApiOperation({ summary: 'Upload dental X-ray, RVG, OPG or clinical photo with automatic high-fidelity compression' })
  @ApiConsumes('multipart/form-data')
  async upload(
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { patientId: string; category?: string; notes?: string; toothNumber?: string; consultationId?: string },
  ) {
    if (!body.patientId) {
      throw new BadRequestException('patientId is required');
    }
    return this.filesService.uploadFile(
      user.clinicId,
      body.patientId,
      file,
      {
        category: body.category,
        notes: body.notes,
        toothNumber: body.toothNumber ? Number(body.toothNumber) : undefined,
        consultationId: body.consultationId,
      },
      user,
    );
  }

  @Get('patient/:patientId')
  @ApiOperation({ summary: 'List all digital imaging and medical files for a patient' })
  async getPatientFiles(
    @CurrentUser() user: any,
    @Param('patientId') patientId: string,
  ) {
    return this.filesService.getPatientFiles(user.clinicId, patientId);
  }

  @Get(':id/view')
  @ApiOperation({ summary: 'View or stream medical file / X-ray inline' })
  async viewFile(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { record, filePath } = await this.filesService.getFileById(user.clinicId, id);

    res.setHeader('Content-Type', record.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(record.fileName)}"`);
    res.setHeader('Cache-Control', 'private, max-age=86400'); // Cache for 24h

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download original medical file / X-ray' })
  async downloadFile(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { record, filePath } = await this.filesService.getFileById(user.clinicId, id);

    res.setHeader('Content-Type', record.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(record.fileName)}"`);

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  }

  @Get(':id/annotations')
  @ApiOperation({ summary: 'Get numbered pin annotations for a medical radiograph' })
  async getAnnotations(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.filesService.getAnnotations(user.clinicId, id);
  }

  @Post(':id/annotations')
  @ApiOperation({ summary: 'Add a numbered pin annotation on a radiograph' })
  async addAnnotation(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { pinNumber: number; xPercent: number; yPercent: number; noteText: string },
  ) {
    return this.filesService.addAnnotation(user.clinicId, id, body, user);
  }

  @Delete(':id/annotations/:annotationId')
  @ApiOperation({ summary: 'Delete a pin annotation from a radiograph' })
  async removeAnnotation(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('annotationId') annotationId: string,
  ) {
    return this.filesService.removeAnnotation(user.clinicId, id, annotationId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a medical file / X-ray' })
  async deleteFile(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.filesService.deleteFile(user.clinicId, id, user);
  }
}

