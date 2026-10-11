import { IsNotEmpty, IsString, IsInt, IsOptional, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PrescriptionItemDto {
  @ApiProperty({ example: 'Augmentin 625mg' })
  @IsString()
  @IsNotEmpty()
  medicineName: string;

  @ApiProperty({ example: '625 mg' })
  @IsString()
  @IsNotEmpty()
  dosage: string;

  @ApiProperty({ example: 'Tablet' })
  @IsString()
  @IsNotEmpty()
  form: string;

  @ApiProperty({ example: '1-0-1 (Twice daily)' })
  @IsString()
  @IsNotEmpty()
  frequency: string;

  @ApiProperty({ example: 5 })
  @IsInt()
  @Min(1)
  durationDays: number;

  @ApiProperty({ example: 'After food' })
  @IsString()
  @IsNotEmpty()
  timing: string;

  @ApiPropertyOptional({ example: 'Complete entire 5-day course without skipping' })
  @IsOptional()
  @IsString()
  instructions?: string;
}

export class CreatePrescriptionDto {
  @ApiProperty({ example: 'patient-uuid' })
  @IsString()
  @IsNotEmpty()
  patientId: string;

  @ApiPropertyOptional({ example: 'consultation-uuid' })
  @IsOptional()
  @IsString()
  consultationId?: string;

  @ApiPropertyOptional({ example: 'Maintain strict oral hygiene; warm saline rinses 4 times daily starting 24h post-op' })
  @IsOptional()
  @IsString()
  instructions?: string;

  @ApiPropertyOptional({ example: 'Soft diet, avoid hot and spicy foods, avoid chewing on right side for 48 hours' })
  @IsOptional()
  @IsString()
  dietAdvice?: string;

  @ApiProperty({ type: [PrescriptionItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  items: PrescriptionItemDto[];
}
