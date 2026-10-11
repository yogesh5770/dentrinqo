import { IsNotEmpty, IsString, IsInt, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RecordCompletedProcedureDto {
  @ApiProperty({ example: 'patient-uuid' })
  @IsString()
  @IsNotEmpty()
  patientId: string;

  @ApiPropertyOptional({ example: 46 })
  @IsOptional()
  @IsInt()
  toothNumber?: number;

  @ApiProperty({ example: 'RCT-MOLAR' })
  @IsString()
  @IsNotEmpty()
  procedureCode: string;

  @ApiProperty({ example: 'Molar Rotary Root Canal Treatment' })
  @IsString()
  @IsNotEmpty()
  procedureName: string;

  @ApiPropertyOptional({ example: 'consultation-uuid' })
  @IsOptional()
  @IsString()
  consultationId?: string;

  @ApiPropertyOptional({ example: 'treatment-plan-item-uuid' })
  @IsOptional()
  @IsString()
  treatmentPlanItemId?: string;

  @ApiPropertyOptional({ example: 'Working length 21mm, 4 canals obturated with bioceramic sealer' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: '2026-10-09T10:30:00.000Z' })
  @IsOptional()
  @IsDateString()
  performedAt?: string;
}

export class CreateCatalogueItemDto {
  @ApiPropertyOptional({ example: 'RCT_MOLAR' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({ example: 'Root Canal Treatment (Molar)' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Endodontics' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ example: 450000, description: 'Standard fee in Paise (e.g. 450000 = Rs 4500)' })
  @IsInt()
  standardFeePaise: number;

  @ApiPropertyOptional({ example: 'Includes motorized rotary instrumentation and bioceramic obturation' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateCatalogueItemDto {
  @ApiPropertyOptional({ example: 'Root Canal Treatment (Molar)' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Endodontics' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 500000 })
  @IsOptional()
  @IsInt()
  standardFeePaise?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  isActive?: boolean;
}

