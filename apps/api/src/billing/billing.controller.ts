import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { CreateInvoiceDto, RecordPaymentDto } from './billing.dto';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Billing & Payments')
@Controller('api/billing')
@UseGuards(AuthGuard, RolesGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('invoices')
  @Roles('CLINIC_ADMIN', 'RECEPTIONIST', 'ACCOUNTANT', 'DENTIST')
  @ApiOperation({ summary: 'Generate a new itemized dental tax invoice' })
  async createInvoice(@CurrentUser() user: any, @Body() dto: CreateInvoiceDto) {
    return this.billingService.createInvoice(user.clinicId, dto, user);
  }

  @Post('payments')
  @Roles('CLINIC_ADMIN', 'RECEPTIONIST', 'ACCOUNTANT')
  @ApiOperation({ summary: 'Record a patient payment (Cash, UPI, Card, NetBanking)' })
  async recordPayment(@CurrentUser() user: any, @Body() dto: RecordPaymentDto) {
    return this.billingService.recordPayment(user.clinicId, dto, user);
  }

  @Get('invoices')
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiOperation({ summary: 'List all clinic invoices with status filtering' })
  async getInvoices(@CurrentUser() user: any, @Query('status') status?: string) {
    return this.billingService.getInvoices(user.clinicId, status);
  }

  @Get('summary')
  @Roles('CLINIC_ADMIN', 'ACCOUNTANT', 'RECEPTIONIST')
  @ApiOperation({ summary: 'Retrieve daily collections and accounts receivable summary' })
  async getBillingSummary(@CurrentUser() user: any) {
    return this.billingService.getBillingSummary(user.clinicId);
  }

  @Get('unbilled-queue')
  @Roles('CLINIC_ADMIN', 'RECEPTIONIST', 'ACCOUNTANT', 'DENTIST')
  @ApiOperation({ summary: 'Retrieve queue of completed procedures and appointments ready for checkout' })
  async getUnbilledQueue(@CurrentUser() user: any) {
    return this.billingService.getUnbilledQueue(user.clinicId);
  }

  @Get('payments')
  @Roles('CLINIC_ADMIN', 'ACCOUNTANT', 'RECEPTIONIST')
  @ApiOperation({ summary: 'List all patient payments and transaction receipts' })
  async getPayments(@CurrentUser() user: any) {
    return this.billingService.getPayments(user.clinicId);
  }

  @Get('refunds')
  @Roles('CLINIC_ADMIN', 'ACCOUNTANT')
  @ApiOperation({ summary: 'List refunds and financial adjustments' })
  async getRefunds(@CurrentUser() user: any) {
    return this.billingService.getRefunds(user.clinicId);
  }

  @Get('patient/:patientId')
  @ApiOperation({ summary: 'Get full billing ledger and outstanding balance for a patient' })
  async getPatientBilling(@CurrentUser() user: any, @Param('patientId') patientId: string) {
    return this.billingService.getPatientBilling(user.clinicId, patientId);
  }

  @Get('invoices/:id')
  @ApiOperation({ summary: 'Get complete printable invoice with clinic details and receipts' })
  async getInvoiceById(@CurrentUser() user: any, @Param('id') id: string) {
    return this.billingService.getInvoiceById(user.clinicId, id);
  }

  @Delete('invoices/:id')
  @Roles('CLINIC_ADMIN', 'ACCOUNTANT')
  @ApiOperation({ summary: 'Void and cancel an invoice while preserving accounting records' })
  async deleteInvoice(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Query('reason') reason?: string,
  ) {
    return this.billingService.deleteInvoice(user.clinicId, id, user, reason);
  }
}

