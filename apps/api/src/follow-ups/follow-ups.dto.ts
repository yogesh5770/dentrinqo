import { IsString, IsNotEmpty, IsOptional, IsEnum, IsBoolean } from 'class-validator';

export class CreateFollowUpDto {
  @IsString()
  @IsNotEmpty()
  patientId: string;

  @IsString()
  @IsOptional()
  appointmentId?: string;

  @IsString()
  @IsNotEmpty()
  scheduledDate: string;

  @IsString()
  @IsNotEmpty()
  type: string; // 'POST_OP' | 'RECALL' | 'PROSTHESIS' | 'ORTHO' | 'GENERAL'

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateFollowUpDto {
  @IsString()
  @IsOptional()
  status?: string; // 'PENDING' | 'CONTACTED' | 'RESCHEDULED' | 'COMPLETED'

  @IsString()
  @IsOptional()
  scheduledDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsBoolean()
  @IsOptional()
  reminderSent?: boolean;
}
