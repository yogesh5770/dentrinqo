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

  @ApiProperty({ example: 'FEMALE', enum: ['MALE', 'FEMALE', 'OTHER'] })
  @IsString()
  @IsNotEmpty()
  gender: string;

  @ApiProperty({ example: '9876543210' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[6-9]\d{9}$/, { message: 'Please provide a valid 10-digit Indian phone number' })
  phone: string;

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
}

export class UpdatePatientDto extends CreatePatientDto {}