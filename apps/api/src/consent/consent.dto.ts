import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateConsentDto {
  @IsString()
  @IsNotEmpty()
  patientId: string;

  @IsString()
  @IsNotEmpty()
  consentType: string; // GENERAL_DENTAL, ROOT_CANAL, EXTRACTION_SURGICAL, DENTAL_IMPLANT, ORTHODONTIC, WHATSAPP_DATA

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  termsText: string;

  @IsString()
  @IsNotEmpty()
  signerName: string;

  @IsString()
  @IsOptional()
  signerRelationship?: string; // SELF, PARENT, SPOUSE, GUARDIAN

  @IsString()
  @IsOptional()
  signerPhone?: string;

  @IsString()
  @IsNotEmpty()
  signatureBase64: string; // Data URL format

  @IsString()
  @IsOptional()
  doctorName?: string;
}
