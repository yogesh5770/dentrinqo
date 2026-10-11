import { IsNotEmpty, IsString, IsInt, IsOptional, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RecordToothConditionDto {
  @ApiProperty({ example: 'patient-uuid' })
  @IsString()
  @IsNotEmpty()
  patientId: string;

  @ApiProperty({ example: 46, description: 'FDI tooth number: 11-48 for permanent, 51-85 for primary' })
  @IsInt()
  @Min(11)
  @Max(85)
  toothNumber: number;

  @ApiProperty({ example: 'OCCLUSAL', description: 'WHOLE_TOOTH, OCCLUSAL, MESIAL, DISTAL, BUCCAL, LINGUAL, INCISAL, PALATAL' })
  @IsString()
  @IsNotEmpty()
  surface: string;

  @ApiProperty({
    example: 'CARIES',
    description: 'HEALTHY, CARIES, FILLED_AMALGAM, FILLED_COMPOSITE, ROOT_CANAL, CROWN, MISSING, IMPLANT, FRACTURED, IMPACTED, MOBILITY',
  })
  @IsString()
  @IsNotEmpty()
  condition: string;

  @ApiPropertyOptional({ example: 'Deep pit caries tender to probe' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: 'consultation-uuid' })
  @IsOptional()
  @IsString()
  consultationId?: string;
}

export class BulkToothConditionDto {
  @ApiProperty({ example: 'patient-uuid' })
  @IsString()
  @IsNotEmpty()
  patientId: string;

  @ApiProperty({ type: [RecordToothConditionDto] })
  entries: RecordToothConditionDto[];
}
