import { IsNotEmpty, IsString, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateConsultationDto {
  @ApiProperty({ example: 'patient-uuid' })
  @IsString()
  @IsNotEmpty()
  patientId: string;

  @ApiPropertyOptional({ example: 'appointment-uuid' })
  @IsOptional()
  @IsString()
  appointmentId?: string;

  @ApiProperty({ example: 'Severe nocturnal pain in tooth 46, sensitivity to hot and cold' })
  @IsString()
  @IsNotEmpty()
  chiefComplaint: string;

  @ApiProperty({ example: 'Deep disto-occlusal caries on tooth 46 with pulpal penetration, tender to vertical percussion' })
  @IsString()
  @IsNotEmpty()
  clinicalExamination: string;

  @ApiProperty({ example: 'Symptomatic Irreversible Pulpitis with Acute Apical Periodontitis (FDI Tooth 46)' })
  @IsString()
  @IsNotEmpty()
  diagnosis: string;

  @ApiPropertyOptional({ example: 'Recommended single-sitting rotary RCT with bioceramic sealer and monolithic zirconia crown.' })
  @IsOptional()
  @IsString()
  clinicalNotes?: string;
}

export class AmendConsultationDto {
  @ApiProperty({ example: 'Added differential diagnosis notes following radiographic re-evaluation' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiProperty()
  @IsNotEmpty()
  newContent: {
    chiefComplaint?: string;
    clinicalExamination?: string;
    diagnosis?: string;
    clinicalNotes?: string;
  };
}