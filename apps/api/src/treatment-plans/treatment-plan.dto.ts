import { IsNotEmpty, IsString, IsInt, IsOptional, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TreatmentPlanItemDto {
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

  @ApiProperty({ example: 450000, description: 'Cost in integer paise (₹4,500 = 450,000 paise)' })
  @IsInt()
  @Min(0)
  estimatedCostPaise: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  sequenceOrder?: number;

  @ApiPropertyOptional({ example: 'Access cavity, glide path, bioceramic obturation' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateTreatmentPlanDto {
  @ApiProperty({ example: 'patient-uuid' })
  @IsString()
  @IsNotEmpty()
  patientId: string;

  @ApiPropertyOptional({ example: 'consultation-uuid' })
  @IsOptional()
  @IsString()
  consultationId?: string;

  @ApiProperty({ example: 'Comprehensive Rehabilitation: Tooth 46 RCT & Zirconia Crown' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ example: 'Discussed with patient; consent obtained for single-visit RCT.' })
  @IsOptional()
  @IsString()
  dentistNotes?: string;

  @ApiProperty({ type: [TreatmentPlanItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TreatmentPlanItemDto)
  items: TreatmentPlanItemDto[];
}

export class UpdateTreatmentPlanStatusDto {
  @ApiProperty({ example: 'ACCEPTED', description: 'PROPOSED, ACCEPTED, IN_PROGRESS, COMPLETED, DECLINED' })
  @IsString()
  @IsNotEmpty()
  status: string;
}

export class AddTreatmentPlanItemDto {
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

  @ApiProperty({ example: 450000, description: 'Cost in integer paise (₹4,500 = 450,000 paise)' })
  @IsInt()
  @Min(0)
  estimatedCostPaise: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  sequenceOrder?: number;

  @ApiPropertyOptional({ example: 'Access cavity, glide path, bioceramic obturation' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateTreatmentPlanItemDto {
  @ApiPropertyOptional({ example: 46 })
  @IsOptional()
  @IsInt()
  toothNumber?: number;

  @ApiPropertyOptional({ example: 'Molar Rotary Root Canal Treatment' })
  @IsOptional()
  @IsString()
  procedureName?: string;

  @ApiPropertyOptional({ example: 450000, description: 'Updated fee in paise' })
  @IsOptional()
  @IsInt()
  @Min(0)
  estimatedCostPaise?: number;

  @ApiPropertyOptional({ example: 'COMPLETED' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 'Completed in single visit' })
  @IsOptional()
  @IsString()
  notes?: string;
}

