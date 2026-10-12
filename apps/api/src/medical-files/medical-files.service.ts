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
  'CASE_SHEET_SCAN',
  'VOICE_NOTE',
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

  async saveFileBuffer(
    clinicId: string,
    patientId: string,
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    meta: { category?: string; notes?: string; toothNumber?: number; consultationId?: string },
    actor: any,
  ) {
    return this.prisma.forTenant(clinicId, async (tx) => {
      // Verify patient belongs to this clinic
      const patient = await tx.patient.findFirst({
        where: { id: patientId, clinicId },
      });
      if (!patient) {
        throw new NotFoundException('Patient record not found');
      }

      const category = meta.category && MEDICAL_CATEGORIES.includes(meta.category as any)
        ? meta.category
        : 'OTHER';

      const isImage = mimeType.startsWith('image/');
      const fileExt = path.extname(originalName).toLowerCase() || (mimeType.startsWith('audio/') ? '.webm' : '.bin');
      const originalSize = buffer.length;

      let processedBuffer = buffer;
      let finalMimeType = mimeType;
      let finalExt = fileExt;

      // Advanced Clinical Compression Pipeline using Sharp (only for images)
      if (isImage) {
        try {
          const image = getSharp(buffer);
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
            `Compressed ${originalName}: ${originalSize} bytes -> ${processedBuffer.length} bytes (${Math.round(
              (1 - processedBuffer.length / originalSize) * 100,
            )}% saved)`,
          );
        } catch (err: any) {
          this.logger.warn(`Sharp image processing failed, storing original buffer: ${err.message}`);
          processedBuffer = buffer;
        }
      }

      // Generate unique storage key and SHA256 hash for forensic integrity
      const hash = crypto.createHash('sha256').update(processedBuffer).digest('hex');
      const storageKey = `${patientId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${finalExt}`;
      const filePath = path.join(this.uploadDir, storageKey);

      // Save to server SSD
      await fs.promises.writeFile(filePath, processedBuffer);

      // Persist record to database
      const fileRecord = await tx.medicalFile.create({
        data: {
          clinicId,
          patientId,
          consultationId: meta.consultationId || null,
          category,
          fileName: originalName,
          storageKey,
          mimeType: finalMimeType,
          sizeBytes: processedBuffer.length,
          sha256Hash: hash,
          uploadedById: actor?.userId || actor?.id || 'system',
        },
      });

      // Audit log if actor provided
      if (actor && (actor.userId || actor.id)) {
        await this.auditService.log({
          clinicId,
          actorId: actor.userId || actor.id,
          actorRole: actor.role || 'DENTIST',
          action: 'MEDICAL_FILE_UPLOADED',
          entityType: 'MedicalFile',
          entityId: fileRecord.id,
          details: { category, fileName: originalName, sizeBytes: processedBuffer.length },
        }, tx);
      }

      return fileRecord;
    });
  }

  async saveBase64(
    clinicId: string,
    patientId: string,
    base64Data: string,
    fallbackFileName: string,
    meta: { category?: string; notes?: string; consultationId?: string },
    actor: any,
  ) {
    const matches = base64Data.match(/^data:([a-zA-Z0-9\/+-]+);base64,(.+)$/);
    let mimeType = 'application/octet-stream';
    let base64Body = base64Data;
    if (matches) {
      mimeType = matches[1];
      base64Body = matches[2];
    }
    const buffer = Buffer.from(base64Body, 'base64');
    let ext = '.bin';
    if (mimeType.includes('webp')) ext = '.webp';
    else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = '.jpg';
    else if (mimeType.includes('png')) ext = '.png';
    else if (mimeType.includes('webm')) ext = '.webm';
    else if (mimeType.includes('mp4') || mimeType.includes('m4a')) ext = '.m4a';
    else if (mimeType.includes('wav')) ext = '.wav';
    else if (mimeType.includes('ogg')) ext = '.ogg';
    else if (mimeType.includes('mpeg') || mimeType.includes('mp3')) ext = '.mp3';

    const fileName = fallbackFileName.includes('.') ? fallbackFileName : `${fallbackFileName}${ext}`;
    return this.saveFileBuffer(clinicId, patientId, buffer, fileName, mimeType, meta, actor);
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

    return this.saveFileBuffer(
      clinicId,
      patientId,
      file.buffer,
      file.originalname,
      file.mimetype,
      meta,
      actor,
    );
  }

  async getPatientFiles(clinicId: string, patientId: string) {
    return this.prisma.forTenant(clinicId, async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: patientId, clinicId },
      });
      if (!patient) throw new NotFoundException('Patient record not found');

      return tx.medicalFile.findMany({
        where: { patientId, clinicId },
        include: { annotations: { orderBy: { pinNumber: 'asc' } } },
        orderBy: { uploadedAt: 'desc' },
      });
    });
  }

  async getAnnotations(clinicId: string, fileId: string) {
    return this.prisma.forTenant(clinicId, async (tx) => {
      const { record } = await this.getFileByIdWithTx(tx, clinicId, fileId);
      return tx.fileAnnotation.findMany({
        where: { medicalFileId: record.id, clinicId },
        orderBy: { pinNumber: 'asc' },
      });
    });
  }

  async addAnnotation(
    clinicId: string,
    fileId: string,
    dto: { pinNumber: number; xPercent: number; yPercent: number; noteText: string },
    actor: any,
  ) {
    return this.prisma.forTenant(clinicId, async (tx) => {
      const { record } = await this.getFileByIdWithTx(tx, clinicId, fileId);
      return tx.fileAnnotation.create({
        data: {
          clinicId,
          medicalFileId: record.id,
          pinNumber: dto.pinNumber,
          xPercent: dto.xPercent,
          yPercent: dto.yPercent,
          noteText: dto.noteText.trim(),
          authorName: actor?.fullName || 'Doctor',
        },
      });
    });
  }

  async removeAnnotation(clinicId: string, fileId: string, annotationId: string) {
    return this.prisma.forTenant(clinicId, async (tx) => {
      await this.getFileByIdWithTx(tx, clinicId, fileId);
      await tx.fileAnnotation.deleteMany({
        where: { id: annotationId, medicalFileId: fileId, clinicId },
      });
      return { success: true };
    });
  }

  private async getFileByIdWithTx(tx: any, clinicId: string, id: string) {
    const record = await tx.medicalFile.findUnique({
      where: { id },
      include: { patient: { select: { clinicId: true, fullName: true, uhid: true } } },
    });

    if (!record || record.clinicId !== clinicId) {
      throw new NotFoundException('Medical record not found');
    }

    const filePath = path.join(this.uploadDir, record.storageKey);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Physical file missing from storage');
    }

    return { record, filePath };
  }

  async getFileById(clinicId: string, id: string) {
    return this.prisma.forTenant(clinicId, async (tx) => {
      return this.getFileByIdWithTx(tx, clinicId, id);
    });
  }

  async deleteFile(clinicId: string, id: string, actor: any) {
    return this.prisma.forTenant(clinicId, async (tx) => {
      const { record, filePath } = await this.getFileByIdWithTx(tx, clinicId, id);

      // Delete physical file from disk
      if (fs.existsSync(filePath)) {
        try {
          await fs.promises.unlink(filePath);
        } catch (err: any) {
          this.logger.error(`Error deleting physical file: ${err.message}`);
        }
      }

      // Delete database record
      await tx.medicalFile.delete({
        where: { id },
      });

      await this.auditService.log({
        clinicId,
        actorId: actor.userId || actor.id,
        actorRole: actor.role || 'STAFF',
        action: 'MEDICAL_FILE_DELETED',
        entityType: 'MedicalFile',
        entityId: id,
        details: {
          fileName: record.fileName,
          storageKey: record.storageKey,
        },
      }, tx);

      return { message: 'File deleted successfully' };
    });
  }
}
