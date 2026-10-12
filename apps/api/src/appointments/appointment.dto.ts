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
  @Min(0)
  @Max(10)
  chairNumber?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  overrideLeave?: boolean;

  @ApiPropertyOptional({ example: 'Urgent emergency surgery authorized by Chief Doctor' })
  @IsOptional()
  @IsString()
  overrideReason?: string;

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
  @ApiProperty({
    example: 'CONFIRMED',
    enum: [
      'PENDING_CONFIRMATION',
      'SCHEDULED',
      'CONFIRMED',
      'CHECKED_IN',
      'CALLED',
      'IN_CHAIR',
      'TREATED',
      'BILLED',
      'PAID',
      'COMPLETED',
      'CANCELLED',
      'NO_SHOW',
      'LATE',
      'SKIPPED',
      'STEPPED_OUT',
      'CLOSED',
      'RESCHEDULED',
    ],
  })
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

  @ApiPropertyOptional({ description: 'Explicit reception confirmation to override upcoming booking on chair' })
  @IsOptional()
  overrideConflict?: boolean;

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

  @ApiPropertyOptional({ example: 'Emergency procedure override authorized by Dr. Josy' })
  @IsOptional()
  @IsString()
  overrideReason?: string;
}

export class ReceptionQuickConsultDto {
  @ApiPropertyOptional({ example: 'patient-uuid', description: 'Selected existing patient ID under this phone' })
  @IsOptional()
  @IsString()
  patientId?: string;

  @ApiPropertyOptional({ example: 'Emergency walk-in override approved by Dr. Khan' })
  @IsOptional()
  @IsString()
  overrideReason?: string;

  @ApiProperty({ example: '+919876543210' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiPropertyOptional({ example: 'Karthik Raja' })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional({ example: 34 })
  @IsOptional()
  @IsInt()
  age?: number;

  @ApiPropertyOptional({ example: '1990-05-15' })
  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: 'MALE' })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ example: ['Penicillin'] })
  @IsOptional()
  allergies?: string[];

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  consentDataUse?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  consentWhatsapp?: boolean;

  @ApiPropertyOptional({ example: false, description: 'True if age was entered instead of exact DOB' })
  @IsOptional()
  dobApproximate?: boolean;

  @ApiPropertyOptional({ example: 'v1.0' })
  @IsOptional()
  @IsString()
  consentVersion?: string;

  @ApiPropertyOptional({ example: false, description: 'Emergency registration bypass if patient unable to consent' })
  @IsOptional()
  allowEmergencyBypassWithoutConsent?: boolean;

  @ApiPropertyOptional({ example: 'dentist-uuid' })
  @IsOptional()
  @IsString()
  preferredDentistId?: string;

  @ApiPropertyOptional({ example: 'Routine Consultation' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  overrideLeave?: boolean;
}

export class PublicLookupDto {
  @ApiProperty({ example: '+919876543210' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiPropertyOptional({ example: 'AKS-2026-AB123 or 5' })
  @IsOptional()
  @IsString()
  tokenOrReference?: string;

  @ApiPropertyOptional({ example: 'AED or clinic UUID', description: 'Clinic code or UUID identifier' })
  @IsOptional()
  @IsString()
  clinicCode?: string;
}