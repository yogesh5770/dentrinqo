import { IsNotEmpty, IsString, IsOptional, IsArray, IsInt, Min, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePatientDto {
  @ApiProperty({ example: 'Kavitha Murugan' })
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @ApiPropertyOptional({ example: 34 })
  @IsOptional()
  age?: number;

  @ApiPropertyOptional({ example: '1992-05-14' })
  @IsOptional()
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: 'FEMALE', enum: ['MALE', 'FEMALE', 'OTHER', 'UNKNOWN'] })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ example: '9876543210' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'kavitha@example.com' })
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: '14, Anna Nagar 3rd Street, K.Pudur, Madurai' })
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ example: 'Murugan S.' })
  @IsOptional()
  emergencyContactName?: string;

  @ApiPropertyOptional({ example: '9876543211' })
  @IsOptional()
  emergencyContactPhone?: string;

  @ApiPropertyOptional({ example: 'B+' })
  @IsOptional()
  bloodGroup?: string;

  @ApiPropertyOptional({ example: 'Penicillin, Latex' })
  @IsOptional()
  allergies?: any;

  @ApiPropertyOptional({ example: 'Mild Hypertension' })
  @IsOptional()
  medicalConditions?: any;

  @ApiPropertyOptional({ example: 'Amlodipine 5mg' })
  @IsOptional()
  currentMedications?: any;

  @ApiPropertyOptional({ example: 'Prefers topical anaesthesia' })
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ example: '18470' })
  @IsOptional()
  legacySlNo?: string;

  @ApiPropertyOptional({ example: 'c/o K. Palani' })
  @IsOptional()
  guardianName?: string;

  @ApiPropertyOptional({ example: 'Student (X-std)' })
  @IsOptional()
  occupation?: string;

  @ApiPropertyOptional({ example: '2016-09-26' })
  @IsOptional()
  legacyRegistrationDate?: string;

  @ApiPropertyOptional({ example: 'Pain in lower right teeth' })
  @IsOptional()
  legacyChiefComplaint?: string;

  @ApiPropertyOptional({ example: 'No systemic medical history' })
  @IsOptional()
  legacyPastHistory?: string;

  @ApiPropertyOptional({ example: 'RCT #46 followed by ceramic crown' })
  @IsOptional()
  legacyTreatmentPlan?: string;

  @ApiPropertyOptional()
  @IsOptional()
  voiceNoteUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  cardPhotoUrl?: string;
}

export class UpdatePatientDto extends CreatePatientDto {}