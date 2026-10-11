import { IsString, IsNotEmpty, IsOptional, IsInt, IsDateString, Min } from 'class-validator';

export class CreateLabOrderDto {
  @IsString()
  @IsNotEmpty()
  patientId: string;

  @IsString()
  @IsOptional()
  dentistId?: string;

  @IsString()
  @IsNotEmpty()
  labName: string;

  @IsString()
  @IsNotEmpty()
  itemType: string;

  @IsInt()
  @IsOptional()
  toothNumber?: number;

  @IsString()
  @IsOptional()
  shade?: string;

  @IsDateString()
  @IsOptional()
  sentDate?: string;

  @IsDateString()
  @IsOptional()
  expectedDueDate?: string;

  @IsDateString()
  @IsOptional()
  patientApptDate?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  costPaise?: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  technicianPhone?: string;
}

export class UpdateLabOrderDto {
  @IsString()
  @IsOptional()
  status?: string; // SENT, IN_LAB, RECEIVED, TRIAL_DONE, FITTED, CANCELLED

  @IsString()
  @IsOptional()
  labName?: string;

  @IsString()
  @IsOptional()
  itemType?: string;

  @IsInt()
  @IsOptional()
  toothNumber?: number;

  @IsString()
  @IsOptional()
  shade?: string;

  @IsDateString()
  @IsOptional()
  expectedDueDate?: string;

  @IsDateString()
  @IsOptional()
  patientApptDate?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  costPaise?: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  technicianPhone?: string;
}
