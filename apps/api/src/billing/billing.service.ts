import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateInvoiceDto, RecordPaymentDto } from './billing.dto';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async createInvoice(clinicId: string, dto: CreateInvoiceDto, actor: any) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, clinicId },
    });
    if (!patient) throw new NotFoundException('Patient record not found');

    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('At least one billable item is required');
    }

    const subtotalPaise = dto.items.reduce(
      (sum, item) => sum + (item.unitPricePaise * (item.quantity || 1)),
      0,
    );
    const discountPaise = dto.discountPaise || 0;
    const taxPaise = dto.taxPaise || 0;
    const totalPaise = Math.max(0, subtotalPaise - discountPaise + taxPaise);
    const balancePaise = totalPaise;

    // Check if any procedure items are already billed to prevent duplicate claims
    const procedureIds = dto.items
      .map(item => item.completedProcedureId)
      .filter((id): id is string => Boolean(id));

    if (procedureIds.length > 0) {
      const alreadyBilled = await this.prisma.completedProcedure.findFirst({
        where: { id: { in: procedureIds }, isBilled: true },
      });
      if (alreadyBilled) {
        throw new BadRequestException(
          `Procedure "${alreadyBilled.procedureName}" has already been billed on an existing invoice. Duplicate prevented.`,
        );
      }
    }

    // 15-second rapid double-click duplicate invoice prevention
    const recentDuplicate = await this.prisma.invoice.findFirst({
      where: {
        clinicId,
        patientId: dto.patientId,
        totalPaise,
        createdAt: { gte: new Date(Date.now() - 15000) },
      },
      include: {
        items: true,
        patient: { select: { fullName: true, uhid: true } },
      },
    });
    if (recentDuplicate) {
      return recentDuplicate;
    }

    // Generate Invoice Number: ${clinicCode}-INV-YYYY-XXXX (collision-proof against multi-clinic and concurrency)
    const currentYear = new Date().getFullYear();
    const clinic = await this.prisma.clinic.findUnique({ where: { id: clinicId } });
    const clinicPrefix = clinic?.code ? `${clinic.code}-INV` : 'INV';
    let invoice: any = null;
    let lastError: any = null;

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const count = await this.prisma.invoice.count({ where: { clinicId } });
        let seq = count + 1 + attempt;
        let invoiceNumber = `${clinicPrefix}-${currentYear}-${String(seq).padStart(4, '0')}`;
        while (await this.prisma.invoice.findUnique({ where: { invoiceNumber } })) {
          seq++;
          invoiceNumber = `${clinicPrefix}-${currentYear}-${String(seq).padStart(4, '0')}`;
        }

        invoice = await this.prisma.invoice.create({
          data: {
            clinicId,
            patientId: dto.patientId,
            invoiceNumber,
            status: 'ISSUED',
            subtotalPaise,
            discountPaise,
            taxPaise,
            totalPaise,
            paidPaise: 0,
            balancePaise,
            dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
            notes: dto.notes?.trim() || null,
            createdById: actor.userId,
            issuedAt: new Date(),
            items: {
              create: dto.items.map(item => ({
                completedProcedureId: item.completedProcedureId || null,
                description: item.description.trim(),
                toothNumber: item.toothNumber || null,
                quantity: item.quantity || 1,
                unitPricePaise: item.unitPricePaise,
                totalPaise: item.unitPricePaise * (item.quantity || 1),
              })),
            },
          },
          include: {
            items: true,
            patient: { select: { fullName: true, uhid: true } },
          },
        });
        break;
      } catch (err: any) {
        lastError = err;
        if (err?.code === 'P2002' && attempt < 4) {
          continue;
        }
        throw err;
      }
    }

    if (!invoice) {
      throw lastError || new BadRequestException('Failed to generate sequential invoice');
    }

    // Mark any included completed procedures as billed
    if (procedureIds.length > 0) {
      await this.prisma.completedProcedure.updateMany({
        where: { id: { in: procedureIds } },
        data: { isBilled: true },
      });
    }

    await this.auditService.log({
      clinicId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'INVOICE_CREATED',
      entityType: 'Invoice',
      entityId: invoice.id,
      details: {
        invoiceNumber: invoice.invoiceNumber,
        patientUhid: patient.uhid,
        totalPaise,
        itemCount: invoice.items.length,
      },
    });

    return invoice;
  }

  async recordPayment(clinicId: string, dto: RecordPaymentDto, actor: any) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: dto.invoiceId, clinicId },
      include: { patient: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    if (dto.amountPaise <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }

    if (dto.amountPaise > invoice.balancePaise) {
      throw new BadRequestException(
        `Payment amount (₹${(dto.amountPaise / 100).toFixed(2)}) exceeds invoice outstanding balance (₹${(invoice.balancePaise / 100).toFixed(2)})`,
      );
    }

    // 10-second rapid double-click duplicate payment prevention
    const recentPayment = await this.prisma.payment.findFirst({
      where: {
        clinicId,
        invoiceId: dto.invoiceId,
        amountPaise: dto.amountPaise,
        receivedAt: { gte: new Date(Date.now() - 10000) },
      },
      include: {
        invoice: {
          include: { items: true, payments: true },
        },
      },
    });
    if (recentPayment) {
      return {
        payment: recentPayment,
        invoice: recentPayment.invoice,
      };
    }

    // Generate receipt number with automatic collision retry against concurrency
    let payment: any = null;
    let updatedInvoice: any = null;
    let lastPayError: any = null;

    const clinic = await this.prisma.clinic.findUnique({ where: { id: clinicId } });
    const receiptPrefix = clinic?.code ? `${clinic.code}-RCP` : 'RCP';

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const currentYear = new Date().getFullYear();
        const count = await this.prisma.payment.count({ where: { clinicId } });
        let seq = count + 1 + attempt;
        let receiptNumber = `${receiptPrefix}-${currentYear}-${String(seq).padStart(4, '0')}`;
        while (await this.prisma.payment.findUnique({ where: { receiptNumber } })) {
          seq++;
          receiptNumber = `${receiptPrefix}-${currentYear}-${String(seq).padStart(4, '0')}`;
        }

        const [p, inv] = await this.prisma.$transaction(async (tx) => {
          // Re-fetch fresh invoice within transaction for atomic balance check
          const freshInv = await tx.invoice.findUnique({
            where: { id: dto.invoiceId },
          });
          if (!freshInv) throw new NotFoundException('Invoice not found');

          if (dto.amountPaise > freshInv.balancePaise) {
            throw new BadRequestException(
              `Payment amount (₹${(dto.amountPaise / 100).toFixed(2)}) exceeds invoice outstanding balance (₹${(freshInv.balancePaise / 100).toFixed(2)})`,
            );
          }

          const newPaidPaise = freshInv.paidPaise + dto.amountPaise;
          const newBalancePaise = freshInv.balancePaise - dto.amountPaise;
          const newStatus = newBalancePaise === 0 ? 'PAID' : 'PARTIAL';

          const createdPayment = await tx.payment.create({
            data: {
              clinicId,
              invoiceId: dto.invoiceId,
              patientId: dto.patientId,
              receiptNumber,
              amountPaise: dto.amountPaise,
              paymentMethod: dto.paymentMethod,
              referenceNumber: dto.referenceNumber?.trim() || null,
              notes: dto.notes?.trim() || null,
              recordedById: actor.userId,
              receivedAt: new Date(),
            },
          });

          const updatedInv = await tx.invoice.update({
            where: { id: dto.invoiceId },
            data: {
              paidPaise: newPaidPaise,
              balancePaise: newBalancePaise,
              status: newStatus,
            },
            include: {
              items: true,
              payments: true,
            },
          });

          return [createdPayment, updatedInv];
        });

        payment = p;
        updatedInvoice = inv;
        break;
      } catch (err: any) {
        lastPayError = err;
        if (err?.code === 'P2002' && attempt < 4) {
          continue;
        }
        throw err;
      }
    }

    if (!payment || !updatedInvoice) {
      throw lastPayError || new BadRequestException('Failed to record payment');
    }

    await this.auditService.log({
      clinicId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'PAYMENT_RECORDED',
      entityType: 'Payment',
      entityId: payment.id,
      details: {
        receiptNumber: payment.receiptNumber,
        invoiceNumber: invoice.invoiceNumber,
        patientUhid: invoice.patient.uhid,
        amountPaise: dto.amountPaise,
        paymentMethod: dto.paymentMethod,
        remainingBalancePaise: updatedInvoice.balancePaise,
      },
    });

    return {
      payment,
      invoice: updatedInvoice,
    };
  }

  async getPatientBilling(clinicId: string, patientId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, clinicId },
    });
    if (!patient) throw new NotFoundException('Patient record not found');

    const invoices = await this.prisma.invoice.findMany({
      where: { patientId, clinicId },
      include: {
        items: true,
        payments: {
          orderBy: { receivedAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const totalBilledPaise = invoices.reduce((sum, inv) => sum + inv.totalPaise, 0);
    const totalPaidPaise = invoices.reduce((sum, inv) => sum + inv.paidPaise, 0);
    const totalBalancePaise = invoices.reduce((sum, inv) => sum + inv.balancePaise, 0);

    return {
      invoices,
      summary: {
        totalBilledPaise,
        totalPaidPaise,
        totalBalancePaise,
        invoiceCount: invoices.length,
      },
    };
  }

  async getInvoices(clinicId: string, status?: string) {
    const where: any = { clinicId };
    if (status) {
      where.status = status;
    }

    return this.prisma.invoice.findMany({
      where,
      include: {
        patient: { select: { fullName: true, uhid: true, phone: true } },
        items: true,
        payments: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getBillingSummary(clinicId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayPayments, allInvoices] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          clinicId,
          receivedAt: { gte: today },
        },
      }),
      this.prisma.invoice.findMany({
        where: { clinicId },
      }),
    ]);

    const activeInvoices = allInvoices.filter(inv => inv.status !== 'VOIDED');
    const todayCollectionPaise = todayPayments.reduce((sum, p) => sum + p.amountPaise, 0);
    const totalOutstandingPaise = activeInvoices.reduce((sum, inv) => sum + inv.balancePaise, 0);
    const totalBilledPaise = activeInvoices.reduce((sum, inv) => sum + inv.totalPaise, 0);
    const totalCollectedPaise = allInvoices.reduce((sum, inv) => sum + inv.paidPaise, 0);

    return {
      todayCollectionPaise,
      todayPaymentsCount: todayPayments.length,
      totalOutstandingPaise,
      totalBilledPaise,
      totalCollectedPaise,
      totalInvoicesCount: allInvoices.length,
      activeInvoicesCount: activeInvoices.length,
    };
  }

  async getInvoiceById(clinicId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, clinicId },
      include: {
        patient: true,
        clinic: true,
        items: true,
        payments: {
          orderBy: { receivedAt: 'asc' },
        },
      },
    });

    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async getPayments(clinicId: string) {
    return this.prisma.payment.findMany({
      where: { clinicId },
      include: {
        patient: { select: { fullName: true, uhid: true, phone: true } },
        invoice: { select: { invoiceNumber: true, totalPaise: true, balancePaise: true } },
      },
      orderBy: { receivedAt: 'desc' },
    });
  }

  async getRefunds(clinicId: string) {
    return this.prisma.refundAdjustment.findMany({
      where: { invoice: { clinicId } },
      include: {
        invoice: {
          select: {
            invoiceNumber: true,
            patient: { select: { fullName: true, uhid: true } },
          },
        },
        payment: { select: { receiptNumber: true, paymentMethod: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteInvoice(clinicId: string, id: string, actor: any, reason?: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, clinicId },
      include: { items: true, payments: true, patient: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    if (invoice.status === 'VOIDED') {
      throw new BadRequestException('Invoice is already voided');
    }

    // Only Clinic Admin or Accountant can void invoices
    if (actor.role !== 'CLINIC_ADMIN' && actor.role !== 'ACCOUNTANT') {
      throw new BadRequestException('Only Clinic Administrator or Accountant can void invoices');
    }

    // Unmark any completed procedures so they can be re-billed if necessary
    const procIds = invoice.items
      .map(i => i.completedProcedureId)
      .filter((pid): pid is string => Boolean(pid));
    if (procIds.length > 0) {
      await this.prisma.completedProcedure.updateMany({
        where: { id: { in: procIds } },
        data: { isBilled: false },
      });
    }

    // VOID WORKFLOW (GST & Indian Accounting Standards Compliance):
    // Invoices and recorded payments must NEVER be permanently deleted from the database.
    // Instead, the invoice status is changed to 'VOIDED', outstanding balance is cleared to 0,
    // and all historical transaction records, payment receipts, and items are preserved.
    const voidAuditNote = `[VOIDED on ${new Date().toISOString()} by ${actor.role} (${actor.email || actor.userId})]: ${reason || 'Invoice cancelled/voided'}`;
    const updatedNotes = invoice.notes ? `${invoice.notes}\n${voidAuditNote}` : voidAuditNote;

    const voidedInvoice = await this.prisma.invoice.update({
      where: { id },
      data: {
        status: 'VOIDED',
        balancePaise: 0,
        notes: updatedNotes,
      },
      include: {
        items: true,
        payments: true,
        patient: { select: { fullName: true, uhid: true } },
      },
    });

    await this.auditService.log({
      clinicId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'INVOICE_VOIDED',
      entityType: 'Invoice',
      entityId: id,
      details: {
        invoiceNumber: invoice.invoiceNumber,
        patientName: invoice.patient.fullName,
        patientUhid: invoice.patient.uhid,
        totalPaise: invoice.totalPaise,
        paidPaise: invoice.paidPaise,
        paymentsPreservedCount: invoice.payments.length,
        reason: reason || 'Voided by administrative action',
      },
    });

    return {
      success: true,
      message: `Invoice #${invoice.invoiceNumber} has been successfully voided. Audit trail and payment receipts preserved.`,
      invoice: voidedInvoice,
    };
  }

  async getUnbilledQueue(clinicId: string) {
    // 1. Fetch unbilled completed procedures in this clinic
    const unbilledProcedures = await this.prisma.completedProcedure.findMany({
      where: {
        isBilled: false,
        patient: { clinicId, isArchived: false },
      },
      include: {
        patient: {
          select: {
            id: true,
            fullName: true,
            uhid: true,
            phone: true,
          },
        },
        dentist: {
          select: {
            id: true,
            fullName: true,
          },
        },
        treatmentPlanItem: true,
      },
      orderBy: { performedAt: 'desc' },
    });

    // 2. Fetch treatment catalogue items for fee lookup
    const catalogItems = await (this.prisma as any).treatmentCatalogItem.findMany({
      where: { clinicId, isActive: true },
    });
    const catalogMap = new Map<string, number>();
    catalogItems.forEach((c: any) => {
      if (c.code) catalogMap.set(c.code.toUpperCase(), c.standardFeePaise);
      if (c.name) catalogMap.set(c.name.toLowerCase(), c.standardFeePaise);
    });

    // 3. Fetch today's appointments that are COMPLETED, IN_CHAIR, or CHECKED_IN
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const todayAppts = await this.prisma.appointment.findMany({
      where: {
        clinicId,
        scheduledStart: { gte: todayStart, lte: todayEnd },
        status: { in: ['COMPLETED', 'IN_CHAIR', 'CHECKED_IN'] },
      },
      include: {
        patient: {
          select: {
            id: true,
            fullName: true,
            uhid: true,
            phone: true,
          },
        },
        dentist: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
      orderBy: { scheduledStart: 'desc' },
    });

    // 4. Fetch today's invoices to filter out already settled visits
    const todayInvoices = await this.prisma.invoice.findMany({
      where: {
        clinicId,
        createdAt: { gte: todayStart, lte: todayEnd },
        status: { not: 'VOIDED' },
      },
      select: { patientId: true, status: true, totalPaise: true, paidPaise: true },
    });
    const paidPatientSet = new Set<string>();
    todayInvoices.forEach(inv => {
      if (inv.status === 'PAID') {
        paidPatientSet.add(inv.patientId);
      }
    });

    // 5. Aggregate by Patient
    const patientMap = new Map<string, any>();

    for (const proc of unbilledProcedures) {
      if (!proc.patient) continue;
      const pid = proc.patient.id;
      if (!patientMap.has(pid)) {
        patientMap.set(pid, {
          patientId: pid,
          patientName: proc.patient.fullName,
          patientUhid: proc.patient.uhid,
          patientPhone: proc.patient.phone,
          dentistName: proc.dentist?.fullName || 'Assigned Doctor',
          status: 'DOCTOR_COMPLETED_WORK',
          appointmentId: null,
          chairNumber: null,
          procedures: [],
          totalEstimatedPaise: 0,
          source: 'COMPLETED_PROCEDURES',
          latestActivityAt: proc.performedAt,
        });
      }

      const pEntry = patientMap.get(pid);
      let feePaise = proc.treatmentPlanItem?.estimatedCostPaise || 0;
      if (!feePaise && proc.procedureCode) {
        feePaise = catalogMap.get(proc.procedureCode.toUpperCase()) || 0;
      }
      if (!feePaise && proc.procedureName) {
        feePaise = catalogMap.get(proc.procedureName.toLowerCase()) || 0;
      }
      if (!feePaise) {
        feePaise = 50000; // default ₹500
      }

      pEntry.procedures.push({
        id: proc.id,
        procedureCode: proc.procedureCode,
        procedureName: proc.procedureName,
        toothNumber: proc.toothNumber,
        performedAt: proc.performedAt,
        feePaise,
        notes: proc.notes,
      });
      pEntry.totalEstimatedPaise += feePaise;
    }

    // Merge in today's appointments awaiting checkout
    for (const appt of todayAppts) {
      if (!appt.patient) continue;
      const pid = appt.patient.id;

      if (paidPatientSet.has(pid) && (!patientMap.has(pid) || patientMap.get(pid).procedures.length === 0)) {
        continue;
      }

      if (!patientMap.has(pid)) {
        let feePaise = 0;
        for (const [key, fee] of catalogMap.entries()) {
          if (appt.reason && appt.reason.toLowerCase().includes(key)) {
            feePaise = fee;
            break;
          }
        }
        if (!feePaise) feePaise = 30000; // ₹300 consultation fee

        patientMap.set(pid, {
          patientId: pid,
          patientName: appt.patient.fullName,
          patientUhid: appt.patient.uhid,
          patientPhone: appt.patient.phone,
          dentistName: appt.dentist?.fullName || 'Assigned Doctor',
          status: appt.status,
          appointmentId: appt.id,
          chairNumber: appt.chairNumber,
          procedures: [
            {
              id: null,
              procedureCode: 'CONSULTATION',
              procedureName: appt.reason || 'General Dental Consultation',
              toothNumber: null,
              performedAt: appt.scheduledStart,
              feePaise,
              notes: appt.notes,
            },
          ],
          totalEstimatedPaise: feePaise,
          source: 'APPOINTMENT',
          latestActivityAt: appt.scheduledStart,
        });
      } else {
        const pEntry = patientMap.get(pid);
        pEntry.appointmentId = appt.id;
        pEntry.chairNumber = appt.chairNumber;
        if (appt.status === 'COMPLETED') {
          pEntry.status = 'COMPLETED';
        }
      }
    }

    return Array.from(patientMap.values()).sort(
      (a, b) => new Date(b.latestActivityAt).getTime() - new Date(a.latestActivityAt).getTime(),
    );
  }
}


