import { IsNotEmpty, IsString, IsOptional, Length, Matches, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePublicAppointmentDto {
  @ApiProperty({ example: 'Anitha Raj', description: 'Patient full name' })
  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  fullName: string;

  @ApiProperty({ example: '9876543210', description: 'Patient contact mobile number' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[0-9\s-]{10,15}$/, { message: 'Please provide a valid 10-15 digit phone number' })
  phone: string;

  @ApiPropertyOptional({ example: 'anitha@example.com' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({ example: 'SCALING', description: 'Selected clinical service or chief complaint' })
  @IsString()
  @IsNotEmpty()
  service: string;

  @ApiProperty({ example: '2026-10-15', description: 'Preferred appointment date (YYYY-MM-DD)' })
  @IsString()
  @IsNotEmpty()
  preferredDate: string;

  @ApiProperty({ example: '10:30 AM', description: 'Preferred time slot' })
  @IsString()
  @IsNotEmpty()
  preferredSlot: string;

  @ApiPropertyOptional({ example: 'FEMALE' })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ example: 28 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  age?: number;

  @ApiPropertyOptional({ example: 'Patient mentions sensitivity with cold drinks' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: 'AKS', description: 'Clinic code identifier' })
  @IsOptional()
  @IsString()
  clinicCode?: string;

  @ApiPropertyOptional({ example: 1, description: 'Preferred operatory chair number (1 or 2)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  chairNumber?: number;

  @ApiPropertyOptional({ example: 'A8B2C1', description: 'Daily rotating lobby Standee QR verification salt code' })
  @IsOptional()
  @IsString()
  lobbyCode?: string;
}
