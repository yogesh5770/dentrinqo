import React from 'react';
import { Printer, X, Receipt, CheckCircle, ShieldCheck, ShieldAlert, MessageCircle } from 'lucide-react';
import { openWhatsApp, generateInvoiceWhatsAppText } from '../../lib/whatsapp';
import { useAuth } from '../../hooks/useAuth';
import { useTenant } from '../../hooks/useTenant';

import { ClinicLogo } from '../../components/ClinicLogo';
interface InvoicePrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: any;
}

export const InvoicePrintModal: React.FC<InvoicePrintModalProps> = ({
  isOpen,
  onClose,
  invoice,
}) => {
  const { user } = useAuth();
  const { clinic: tenantClinic } = useTenant();

  if (!isOpen || !invoice) return null;

  const handlePrint = () => {
    if (!clinic?.name || clinic.name === 'Dental Clinic') {
      alert('Cannot print invoice: Clinic details are missing from the profile. Please configure clinic profile in settings before printing.');
      return;
    }
    window.print();
  };

  const clinic = invoice.clinic || tenantClinic || user?.clinic || {
    name: 'Dental Clinic',
    tagline: 'Advanced Laser, Implant & Micro-Endodontic Center',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    postalCode: '',
    gstin: '',
  };

  const patient = invoice.patient || {};
  const isPaidInFull = invoice.balancePaise === 0;

  const handleShareWhatsApp = () => {
    const latestPayment = invoice.payments && invoice.payments.length > 0
      ? invoice.payments[invoice.payments.length - 1]
      : null;

    const text = generateInvoiceWhatsAppText({
      clinicName: clinic.name || 'Dental Clinic',
      patientName: patient.fullName || 'Patient',
      uhid: patient.uhid || 'PATIENT',
      invoiceNumber: invoice.invoiceNumber,
      receiptNumber: latestPayment?.receiptNumber,
      totalRupees: invoice.totalPaise / 100,
      paidRupees: invoice.paidPaise / 100,
      balanceRupees: invoice.balancePaise / 100,
      paymentMethod: latestPayment?.paymentMethod,
      clinicPhone: clinic.phone,
    });

    openWhatsApp(patient.phone, text);
  };

  const isBillingVerified = Boolean(clinic.isBillingVerified ?? tenantClinic?.isBillingVerified ?? user?.clinic?.isBillingVerified ?? false);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden my-8 print:m-0 print:p-0 print:shadow-none print:w-full print:max-w-none">
        {/* Controls Bar - Hidden when printing */}
        <div className="flex items-center justify-between p-4 bg-slate-900 text-white print:hidden">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">Official Dental Tax Invoice & Receipt</span>
            <span className="text-xs font-mono text-teal-400">({invoice.invoiceNumber})</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleShareWhatsApp}
              disabled={!isBillingVerified}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs py-1.5 px-3 rounded-lg cursor-pointer transition-all shadow-sm"
              title={isBillingVerified ? "Send digital receipt & invoice summary to patient via WhatsApp" : "Invoice sharing locked until clinic billing details are verified by admin"}
            >
              <MessageCircle className="w-4 h-4" />
              Share on WhatsApp
            </button>
            <button
              onClick={handlePrint}
              disabled={!isBillingVerified}
              className="flex items-center gap-1.5 bg-teal-500 hover:bg-teal-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold text-xs py-1.5 px-3 rounded-lg cursor-pointer transition-all"
              title={isBillingVerified ? "Print official tax invoice" : "Invoice printing locked until clinic billing details are verified by admin"}
            >
              <Printer className="w-4 h-4" />
              Print / Save PDF
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Lock Banner if Unverified */}
        {!isBillingVerified && (
          <div className="p-3.5 bg-rose-50 border-b border-rose-200 text-rose-950 text-xs flex items-center gap-3 print:hidden">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
            <div>
              <strong className="font-black block">🔒 Official Tax Invoice Printing & Sharing Locked</strong>
              <span className="font-medium text-rose-900">
                Clinic billing details (GSTIN, legal entity, and verified UPI payment account) have not been verified by CLINIC_ADMIN yet. Complete verification in Clinic Settings before printing tax invoices.
              </span>
            </div>
          </div>
        )}

        {/* PRINTABLE INVOICE BODY */}
        <div className="p-8 sm:p-10 font-sans text-slate-800 print:p-6" id="printable-invoice">
          {/* Header */}
          <div className="border-b-2 border-teal-600 pb-5 mb-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <ClinicLogo className="w-16 h-16 object-contain shrink-0" />
              <div>
                <h2 className="text-2xl font-black tracking-tight text-teal-900">
                  {(clinic.name || "DENTAL CLINIC").toUpperCase()}
                </h2>
                <p className="text-xs font-bold text-teal-700 tracking-wide uppercase mt-0.5">
                  {clinic.tagline}
                </p>
                <p className="text-xs text-slate-600 mt-1.5 max-w-md leading-relaxed">
                  {clinic.address}, {clinic.city}, {clinic.state} - {clinic.postalCode}
                </p>
                <p className="text-xs text-slate-600">
                  Helpline: <strong className="text-slate-800">{clinic.phone}</strong> | GSTIN: <strong className="font-mono text-slate-800">{clinic.gstin}</strong>
                </p>
              </div>
            </div>

            <div className="sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
              <span className="text-xs uppercase font-mono font-bold tracking-widest text-teal-700 block">TAX INVOICE</span>
              <h3 className="font-mono font-extrabold text-slate-900 text-lg mt-0.5">{invoice.invoiceNumber}</h3>
              <p className="text-xs text-slate-500 mt-1">
                Date: <strong>{new Date(invoice.issuedAt || invoice.createdAt).toLocaleDateString('en-IN')}</strong>
              </p>
              <div className="mt-2">
                {isPaidInFull ? (
                  <span className="inline-flex items-center gap-1 font-bold text-xs text-emerald-800 bg-emerald-100 border border-emerald-300 px-3 py-1 rounded-full uppercase">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                    PAID IN FULL
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-bold text-xs text-amber-800 bg-amber-100 border border-amber-300 px-3 py-1 rounded-full uppercase">
                    PARTIAL / BALANCE DUE
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Billed To / Patient Info */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 mb-6 text-xs grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <span className="text-slate-400 block text-[10px] font-bold uppercase">Billed To Patient</span>
              <strong className="text-slate-900 text-sm">{patient.fullName}</strong>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] font-bold uppercase">UHID No</span>
              <span className="font-mono font-bold text-teal-800">{patient.uhid}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] font-bold uppercase">Contact Phone</span>
              <span className="font-mono font-semibold text-slate-800">{patient.phone}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] font-bold uppercase">Chief Doctor</span>
              <span className="font-semibold text-slate-800">Dr. Khalidh Khan (BDS, MDS)</span>
            </div>
          </div>

          {/* Itemized Procedures Table */}
          <div className="mb-6">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2">
              Itemized Clinical Procedures & Materials
            </span>
            <div className="border border-slate-200 rounded-xl overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[500px]">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 w-8">#</th>
                    <th className="py-2.5 px-3">Description of Dental Service</th>
                    <th className="py-2.5 px-3">Tooth #</th>
                    <th className="py-2.5 px-3 text-center">Qty</th>
                    <th className="py-2.5 px-3 text-right">Unit Rate (₹)</th>
                    <th className="py-2.5 px-3 text-right">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoice.items?.map((item: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-3 px-3 font-bold text-slate-400">{idx + 1}</td>
                      <td className="py-3 px-3 font-semibold text-slate-800">{item.description}</td>
                      <td className="py-3 px-3">
                        {item.toothNumber ? (
                          <span className="font-mono font-bold text-teal-800 bg-teal-50 px-1.5 py-0.5 rounded text-[11px]">
                            #{item.toothNumber}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center font-mono">{item.quantity}</td>
                      <td className="py-3 px-3 text-right font-mono text-slate-700">
                        ₹{(item.unitPricePaise / 100).toLocaleString('en-IN')}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                        ₹{(item.totalPaise / 100).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals & Financial Breakdown */}
          <div className="flex flex-col sm:flex-row justify-between gap-6 mb-6">
            <div className="sm:max-w-xs text-xs text-slate-500 space-y-2">
              {invoice.notes && (
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <strong className="text-slate-700 block text-[10px] uppercase">Notes:</strong>
                  <p className="mt-0.5">{invoice.notes}</p>
                </div>
              )}
              <div className="text-[11px] text-slate-400 leading-relaxed">
                Thank you for choosing {clinic.name || 'the clinic'}. All procedures carry standard clinical guarantees.
              </div>
            </div>

            <div className="min-w-[260px] space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span>Subtotal Gross:</span>
                <span className="font-mono font-semibold">₹{(invoice.subtotalPaise / 100).toLocaleString('en-IN')}</span>
              </div>
              {invoice.discountPaise > 0 && (
                <div className="flex items-center justify-between text-rose-600">
                  <span>Courtesy Discount:</span>
                  <span className="font-mono font-semibold">-₹{(invoice.discountPaise / 100).toLocaleString('en-IN')}</span>
                </div>
              )}
              {invoice.taxPaise > 0 && (
                <div className="flex items-center justify-between text-slate-600">
                  <span>GST / Tax:</span>
                  <span className="font-mono font-semibold">+₹{(invoice.taxPaise / 100).toLocaleString('en-IN')}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm font-bold text-slate-900 pt-2 border-t border-slate-200">
                <span>Net Invoice Amount:</span>
                <span className="font-mono text-base text-teal-900">
                  ₹{(invoice.totalPaise / 100).toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-emerald-700 pt-1">
                <span>Total Amount Paid:</span>
                <span className="font-mono font-bold">₹{(invoice.paidPaise / 100).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex items-center justify-between text-xs font-bold pt-1 border-t border-slate-200 text-slate-900">
                <span>Balance Due:</span>
                <span className={`font-mono text-sm ${invoice.balancePaise > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                  ₹{(invoice.balancePaise / 100).toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>

          {/* Payment Receipts History */}
          {invoice.payments && invoice.payments.length > 0 && (
            <div className="mb-6 pt-4 border-t border-slate-200">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2">
                Payment Transactions & Receipts ({invoice.payments.length})
              </span>
              <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200 text-[11px]">
                    <tr>
                      <th className="py-2 px-3">Receipt No</th>
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-3">Method</th>
                      <th className="py-2 px-3">Reference / Txn ID</th>
                      <th className="py-2 px-3 text-right">Amount Received</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {invoice.payments.map((pay: any) => (
                      <tr key={pay.id}>
                        <td className="py-2 px-3 font-mono font-bold text-teal-800">{pay.receiptNumber}</td>
                        <td className="py-2 px-3 text-slate-600">{new Date(pay.receivedAt).toLocaleDateString('en-IN')}</td>
                        <td className="py-2 px-3 font-semibold text-slate-800">{pay.paymentMethod}</td>
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-500">{pay.referenceNumber || 'N/A'}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-emerald-800">
                          ₹{(pay.amountPaise / 100).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Footer Signature */}
          <div className="pt-8 mt-6 border-t border-slate-200 flex items-end justify-between text-xs">
            <div className="text-[11px] text-slate-500 space-y-1">
              <p>• This is a computer-generated official tax invoice.</p>
              <p>• Payments once received are subject to clinic adjustment policy.</p>
            </div>

            <div className="text-center min-w-[200px]">
              <div className="h-12 border-b border-dashed border-slate-400 mb-1 flex items-end justify-center pb-1 font-serif italic text-teal-900 font-bold">
                {clinic.name}
              </div>
              <p className="font-bold text-slate-900 text-xs">For {clinic.name}</p>
              <p className="text-[10px] text-slate-500">Authorized Accounts Signatory</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
