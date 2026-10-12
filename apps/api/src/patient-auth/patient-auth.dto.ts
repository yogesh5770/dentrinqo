import { IsString, IsNotEmpty, MinLength, Matches, IsOptional, IsBoolean, IsIn } from 'class-validator';

export class PatientSignupDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'Full name must be at least 2 characters' })
  fullName!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^(\+?91)?[6-9]\d{9}$/, {
    message: 'Please provide a valid 10-digit Indian mobile number',
  })
  phone!: string;

  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @IsOptional()
  age?: number;

  @IsString()
  @IsIn(['MALE', 'FEMALE', 'OTHER'])
  gender!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password!: string;

  @IsString()
  @MinLength(8, { message: 'Confirm password must match password' })
  confirmPassword!: string;

  @IsBoolean()
  consentDataUse!: boolean;

  @IsOptional()
  @IsBoolean()
  consentWhatsapp?: boolean;

  @IsOptional()
  @IsString()
  clinicCode?: string;
}

export class PatientLoginDto {
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  @IsOptional()
  @IsString()
  clinicCode?: string;
}

export class ResetPatientPasswordDto {
  @IsString()
  @MinLength(8, { message: 'New password must be at least 8 characters long' })
  newPassword!: string;

  @IsString()
  @MinLength(10, { message: 'A detailed reason (min 10 characters) is required for staff password reset' })
  reason!: string;
}

export class AddFamilyMemberDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  fullName!: string;

  @IsString()
  @IsIn(['SELF', 'SPOUSE', 'CHILD', 'PARENT', 'OTHER'])
  relationToAccount!: string;

  @IsString()
  @IsIn(['MALE', 'FEMALE', 'OTHER'])
  gender!: string;

  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @IsOptional()
  age?: number;

  @IsOptional()
  @IsBoolean()
  dobApproximate?: boolean;

  @IsOptional()
  @IsString()
  allergies?: string;

  @IsOptional()
  @IsString()
  medicalConditions?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
