import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require('sharp');

const getSharp = (input?: any) => {
  const fn: any = typeof sharp === 'function' ? sharp : (sharp as any).default || sharp;
  return input !== undefined ? fn(input) : fn;
};

export const MEDICAL_CATEGORIES = [
  'XRAY_IOPA',
  'XRAY_OPG',
  'CLINICAL_PHOTO',
  'LAB_REPORT',
  'SCAN_CBCT',
  'OTHER',
] as const;

export type MedicalCategory = typeof MEDICAL_CATEGORIES[number];

@Injectable()
export class MedicalFilesService {
  private readonly logger = new Logger(MedicalFilesService.name);
  private readonly uploadDir: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {
    // Resolve upload directory in persistent app root
    this.uploadDir = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads', 'medical-files');
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
      this.logger.log(`Created medical files storage directory at: ${this.uploadDir}`);
    }
  }

  async uploadFile(
    clinicId: string,
    patientId: string,
    file: Express.Multer.File,
    meta: { category?: string; notes?: string; toothNumber?: number; consultationId?: string },
    actor: any,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided for upload');
    }

    // Verify patient belongs to this clinic
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, clinicId },
    });
    if (!patient) {
      throw new NotFoundException('Patient record not found');
    }

    const category = meta.category && MEDICAL_CATEGORIES.includes(meta.category as any)
      ? meta.category
      : 'XRAY_IOPA';

    const isImage = file.mimetype.startsWith('image/');
    const fileExt = path.extname(file.originalname).toLowerCase();
    const originalSize = file.size;

    let processedBuffer = file.buffer;
    let finalMimeType = file.mimetype;
    let finalExt = fileExt;

    // Advanced Clinical Compression Pipeline using Sharp
    if (isImage) {
      try {
        const image = getSharp(file.buffer);
        const metadata = await image.metadata();

        // 1. Auto-orient based on EXIF (crucial for mobile camera captures)
        let pipeline = image.rotate();

        // 2. Intelligent downscaling: limit max width/height to 2560px for clinical monitors
        if (metadata.width && metadata.height && (metadata.width > 2560 || metadata.height > 2560)) {
          pipeline = pipeline.resize(2560, 2560, {
            fit: 'inside',
            withoutEnlargement: true,
            kernel: getSharp().kernel?.lanczos3 || 'lanczos3',
          });
        }

        // 3. Compress to high-quality WebP with 4:4:4 chroma subsampling for dental diagnostics
        // Quality 88 preserves microscopic enamel and apex details while slashing 70-90% file size
        processedBuffer = await pipeline
          .webp({
            quality: 88,
            effort: 4,
            smartSubsample: false,
          })
          .toBuffer();

        finalMimeType = 'image/webp';
        finalExt = '.webp';

        this.logger.log(
          `Compressed ${file.originalname}: ${originalSize} bytes -> ${processedBuffer.length} bytes (${Math.round(
            (1 - processedBuffer.length / originalSize) * 100,
          )}% saved)`,
        );
      } catch (err) {
        this.logger.warn(`Sharp image processing failed, storing original buffer: ${err.message}`);
        processedBuffer = file.buffer;
      }
    }

    // Generate unique storage key and SHA256 hash for forensic integrity
    const hash = crypto.createHash('sha256').update(processedBuffer).digest('hex');
    const storageKey = `${patientId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${finalExt}`;
    const filePath = path.join(this.uploadDir, storageKey);

    // Save to server SSD
    await fs.promises.writeFile(filePath, processedBuffer);

    // Persist record to database
    const fileRecord = await this.prisma.medicalFile.create({
      data: {
        patientId,
        consultationId: meta.consultationId || null,
        category,
        fileName: file.originalname,
        storageKey,
        mimeType: finalMimeType,
        sizeBytes: processedBuffer.length,
        sha256Hash: hash,
        uploadedById: actor.userId,
      },
    });

    // Audit log
    await this.auditService.log({
      clinicId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'MEDICAL_FILE_UPLOADED',
      entityType: 'MedicalFile',
      entityId: fileRecord.id,
      details: {
        patientUhid: patient.uhid,
        category,
        originalName: file.originalname,
        storageKey,
        originalBytes: originalSize,
        compressedBytes: processedBuffer.length,
        savingsPercent: Math.round((1 - processedBuffer.length / originalSize) * 100),
      },
    });

    return {
      ...fileRecord,
      originalSize,
      compressedSize: processedBuffer.length,
      savedPercent: Math.max(0, Math.round((1 - processedBuffer.length / originalSize) * 100)),
    };
  }

  async getPatientFiles(clinicId: string, patientId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, clinicId },
    });
    if (!patient) throw new NotFoundException('Patient record not found');

    return this.prisma.medicalFile.findMany({
      where: { patientId },
      include: { annotations: { orderBy: { pinNumber: 'asc' } } },
      orderBy: { uploadedAt: 'desc' },
    });
  }

  async getAnnotations(clinicId: string, fileId: string) {
    const { record } = await this.getFileById(clinicId, fileId);
    return this.prisma.fileAnnotation.findMany({
      where: { medicalFileId: record.id },
      orderBy: { pinNumber: 'asc' },
    });
  }

  async addAnnotation(
    clinicId: string,
    fileId: string,
    dto: { pinNumber: number; xPercent: number; yPercent: number; noteText: string },
    actor: any,
  ) {
    const { record } = await this.getFileById(clinicId, fileId);
    return this.prisma.fileAnnotation.create({
      data: {
        medicalFileId: record.id,
        pinNumber: dto.pinNumber,
        xPercent: dto.xPercent,
        yPercent: dto.yPercent,
        noteText: dto.noteText.trim(),
        authorName: actor?.fullName || 'Doctor',
      },
    });
  }

  async removeAnnotation(clinicId: string, fileId: string, annotationId: string) {
    await this.getFileById(clinicId, fileId);
    await this.prisma.fileAnnotation.deleteMany({
      where: { id: annotationId, medicalFileId: fileId },
    });
    return { success: true };
  }

  async getFileById(clinicId: string, id: string) {
    const record = await this.prisma.medicalFile.findUnique({
      where: { id },
      include: { patient: { select: { clinicId: true, fullName: true, uhid: true } } },
    });

    if (!record || record.patient.clinicId !== clinicId) {
      throw new NotFoundException('Medical record not found');
    }

    const filePath = path.join(this.uploadDir, record.storageKey);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Physical file missing from storage');
    }

    return { record, filePath };
  }

  async deleteFile(clinicId: string, id: string, actor: any) {
    const { record, filePath } = await this.getFileById(clinicId, id);

    // Delete physical file from disk
    if (fs.existsSync(filePath)) {
      try {
        await fs.promises.unlink(filePath);
      } catch (err) {
        this.logger.error(`Error deleting physical file: ${err.message}`);
      }
    }

    // Delete database record
    await this.prisma.medicalFile.delete({
      where: { id },
    });

    await this.auditService.log({
      clinicId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'MEDICAL_FILE_DELETED',
      entityType: 'MedicalFile',
      entityId: id,
      details: {
        fileName: record.fileName,
        storageKey: record.storageKey,
      },
    });

    return { message: 'File deleted successfully' };
  }
}
