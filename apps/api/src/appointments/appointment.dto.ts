import { IsNotEmpty, IsString, IsInt, IsOptional, IsDateString, Min, Max, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAppointmentDto {
  @ApiProperty({ example: 'patient-uuid' })
  @IsString()
  @IsNotEmpty()
  patientId: string;

  @ApiPropertyOptional({ example: 'dentist-uuid' })
  @IsOptional()
  @IsString()
  dentistId?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  chairNumber?: number;

  @ApiProperty({ example: '2026-10-10T10:00:00.000Z' })
  @IsDateString()
  @IsNotEmpty()
  scheduledStart: string;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(180)
  durationMinutes?: number;

  @ApiProperty({ example: 'Single-Sitting Rotary Root Canal Consultation' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiPropertyOptional({ example: 'CHECKED_IN' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 'Patient complains of severe sensitivity' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateAppointmentStatusDto {
  @ApiProperty({ example: 'CONFIRMED', enum: ['PENDING_CONFIRMATION', 'SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'CALLED', 'IN_CHAIR', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] })
  @IsString()
  @IsNotEmpty()
  status: string;

  @ApiPropertyOptional({ example: 2, description: 'Operatory chair number (1-10)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  chairNumber?: number;

  @ApiPropertyOptional({ example: 'Acute dental trauma - severe pulpitis', description: 'Clinical justification for emergency priority escalation' })
  @IsOptional()
  @IsString()
  emergencyReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RescheduleAppointmentDto {
  @ApiProperty({ example: '2026-10-12T11:00:00.000Z' })
  @IsDateString()
  @IsNotEmpty()
  newScheduledStart: string;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  durationMinutes?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  chairNumber?: number;

  @ApiPropertyOptional({ example: 'Patient requested afternoon reschedule' })
  @IsOptional()
  @IsString()
  reason?: string;
}