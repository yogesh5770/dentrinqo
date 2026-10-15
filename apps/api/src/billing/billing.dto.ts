import { IsNotEmpty, IsString, IsInt, IsOptional, IsArray, ValidateNested, Min, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateInvoiceItemDto {
  @ApiPropertyOptional({ example: 'completed-procedure-uuid' })
  @IsOptional()
  @IsString()
  completedProcedureId?: string;

  @ApiProperty({ example: 'Molar Rotary Root Canal Treatment (Bioceramic)' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({ example: 46 })
  @IsOptional()
  @IsInt()
  toothNumber?: number;

  @ApiProperty({ example: 1, default: 1 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ example: 450000, description: 'Unit price in integer paise (₹4,500 = 450,000 paise)' })
  @IsInt()
  @Min(0)
  unitPricePaise: number;

  @ApiPropertyOptional({ example: false, description: 'True if deliberately provided at no charge' })
  @IsOptional()
  isComplimentary?: boolean;

  @ApiPropertyOptional({ example: 'Post-op courtesy follow-up', description: 'Mandatory reason if unitPricePaise is 0' })
  @IsOptional()
  @IsString()
  zeroFeeReason?: string;
}

export class CreateInvoiceDto {
  @ApiProperty({ example: 'patient-uuid' })
  @IsString()
  @IsNotEmpty()
  patientId: string;

  @ApiPropertyOptional({ example: '2026-10-15' })
  @IsOptional()
  @IsString()
  dueDate?: string;

  @ApiPropertyOptional({ example: 'Single-visit RCT + Crown restoration protocol' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: 0, description: 'Discount in integer paise' })
  @IsOptional()
  @IsInt()
  @Min(0)
  discountPaise?: number;

  @ApiPropertyOptional({ example: 0, description: 'Tax in integer paise' })
  @IsOptional()
  @IsInt()
  @Min(0)
  taxPaise?: number;

  @ApiProperty({ type: [CreateInvoiceItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  items: CreateInvoiceItemDto[];
}

export class RecordPaymentDto {
  @ApiProperty({ example: 'invoice-uuid' })
  @IsString()
  @IsNotEmpty()
  invoiceId: string;

  @ApiProperty({ example: 'patient-uuid' })
  @IsString()
  @IsNotEmpty()
  patientId: string;

  @ApiProperty({ example: 450000, description: 'Payment amount in integer paise' })
  @IsInt()
  @Min(1)
  amountPaise: number;

  @ApiProperty({ example: 'UPI', enum: ['CASH', 'UPI', 'CARD', 'NETBANKING'] })
  @IsString()
  @IsIn(['CASH', 'UPI', 'CARD', 'NETBANKING'])
  paymentMethod: string;

  @ApiPropertyOptional({ example: 'UPI-UTR-908234710123' })
  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @ApiPropertyOptional({ example: 'Advance received via GPay' })
  @IsOptional()
  @IsString()
  notes?: string;
}
