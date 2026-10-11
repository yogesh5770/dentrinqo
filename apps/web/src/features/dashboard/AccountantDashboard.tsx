import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api';
import { useNavigate } from 'react-router-dom';
import { useClinicSync } from '../../lib/sync';
import {
  Receipt,
  IndianRupee,
  Clock,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  CreditCard,
  ArrowRight,
  RefreshCw,
  PlusCircle,
  FileSpreadsheet,
  AlertTriangle,
  Printer,
  Search,
} from 'lucide-react';
import { PaymentModal } from '../billing/PaymentModal';
import { InvoicePrintModal } from '../billing/InvoicePrintModal';
import { InvoiceModal } from '../billing/InvoiceModal';

export const AccountantDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any | null>(null);
  const [invoices, setInvoices] = useState<any[]>([]);

  // Modals
  const [createInvoiceOpen, setCreateInvoiceOpen] = useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState<any | null>(null);
  const [printInvoice, setPrintInvoice] = useState<any | null>(null);

  const fetchFinancials = async (silent?: boolean | unknown) => {
    const isSilent = silent === true;
    if (!isSilent) setLoading(true);
    try {
      const [sumData, invData] = await Promise.all([
        apiRequest<any>('/billing/summary').catch(() => null),
        apiRequest<any[]>('/billing/invoices').catch(() => []),
      ]);
      setSummary(sumData);
      setInvoices(invData || []);
    } catch (err) {
      console.error('Failed to load accounting telemetry', err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchFinancials();
  }, []);

  useClinicSync(() => fetchFinancials(true));

  const todayCollectionRs = Math.round((summary?.todayCollectionPaise || 0) / 100);
  const totalBilledRs = Math.round((summary?.totalBilledPaise || 0) / 100);
  const totalCollectedRs = Math.round((summary?.totalCollectedPaise || 0) / 100);
  const totalOutstandingRs = Math.round((summary?.totalOutstandingPaise || 0) / 100);

  // Unpaid or partially paid invoices
  const pendingInvoices = invoices.filter(inv => ['ISSUED', 'PARTIAL', 'DRAFT'].includes(inv.status));
  const recentPaidInvoices = invoices.filter(inv => inv.status === 'PAID').slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="clinic-card bg-linear-to-r from-emerald-950 via-slate-900 to-slate-950 p-5 sm:p-6 rounded-2xl text-white shadow-md border border-emerald-900 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Financial & Billing Operations
            </span>
            <span className="text-xs text-slate-400 font-medium">• Clinic Accounts Desk</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Accountant Financial Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 font-medium mt-0.5">
            Monitor daily collections, tax invoice generation, partial payments, and outstanding balances.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => fetchFinancials()}
            title="Refresh"
            className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
          <button
            onClick={() => setCreateInvoiceOpen(true)}
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
          >
            <PlusCircle className="w-4 h-4" />
            <span>+ Generate Invoice</span>
          </button>
          <button
            onClick={() => navigate('/reports')}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1.5 border border-slate-700 cursor-pointer"
          >
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span>Financial Reports</span>
          </button>
        </div>
      </div>

      {/* 4 Financial KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Today's Collections</span>
            <IndianRupee className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-700">₹{todayCollectionRs.toLocaleString('en-IN')}</div>
          <div className="text-[11px] text-slate-500 font-semibold mt-1">
            {summary?.todayPaymentsCount || 0} payments settled today
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Outstanding Balance</span>
            <AlertCircle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-black text-rose-600">₹{totalOutstandingRs.toLocaleString('en-IN')}</div>
          <div className="text-[11px] text-slate-500 font-semibold mt-1">Across all clinic patients</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Total Invoiced</span>
            <Receipt className="w-4 h-4 text-slate-700" />
          </div>
          <div className="text-2xl font-black text-slate-900">₹{totalBilledRs.toLocaleString('en-IN')}</div>
          <div className="text-[11px] text-slate-500 font-semibold mt-1">
            {summary?.totalInvoicesCount || 0} total invoices
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Cumulative Collected</span>
            <TrendingUp className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-2xl font-black text-teal-700">₹{totalCollectedRs.toLocaleString('en-IN')}</div>
          <div className="text-[11px] text-slate-500 font-semibold mt-1">Recorded revenue to date</div>
        </div>
      </div>

      {/* Main Financial Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 cols): Unpaid / Partially Paid Invoices */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-rose-600" />
                  Invoices Awaiting Payment / Partial Balance
                </h2>
                <p className="text-xs text-slate-500 font-medium">Follow up with patients or record payments</p>
              </div>
              <span className="text-xs font-bold text-rose-700">{pendingInvoices.length} pending</span>
            </div>

            {pendingInvoices.length === 0 ? (
              <div className="py-10 text-center text-slate-400">
                <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 mb-2 stroke-[1.5]" />
                <p className="text-sm font-bold text-slate-700">All invoices are settled!</p>
                <p className="text-xs text-slate-400 mt-1">No outstanding balances currently overdue</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 mt-2">
                {pendingInvoices.map(inv => {
                  const balanceRs = Math.round(inv.balancePaise / 100);
                  const totalRs = Math.round(inv.totalPaise / 100);

                  return (
                    <div
                      key={inv.id}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 px-2 rounded-xl transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-sm text-slate-900">
                            {inv.patient?.fullName || 'Patient'}
                          </span>
                          <span className="font-mono text-xs font-bold text-teal-800 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200">
                            {inv.invoiceNumber}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                          <span>UHID: {inv.patient?.uhid}</span>
                          <span>•</span>
                          <span>Phone: {inv.patient?.phone}</span>
                          <span>•</span>
                          <span className="font-bold text-slate-700">Total: ₹{totalRs.toLocaleString('en-IN')}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 self-end sm:self-center">
                        <div className="text-right">
                          <span className="text-xs text-slate-500 block">Balance Due</span>
                          <span className="text-sm font-black text-rose-600">₹{balanceRs.toLocaleString('en-IN')}</span>
                        </div>

                        <button
                          onClick={() => setPaymentInvoice(inv)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl cursor-pointer shadow-xs flex items-center gap-1"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>Record Payment</span>
                        </button>

                        <button
                          onClick={() => setPrintInvoice(inv)}
                          className="p-1.5 text-slate-400 hover:text-slate-800 rounded-lg hover:bg-slate-200 cursor-pointer"
                          title="Print Invoice"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Financial Actions & Refunds Awaiting Review */}
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <h3 className="text-sm font-extrabold text-slate-900 mb-3 uppercase tracking-wider">
              Accounting Navigation
            </h3>
            <div className="space-y-2 text-xs font-bold">
              <button
                onClick={() => navigate('/billing')}
                className="w-full p-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-950 border border-emerald-200 flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <Receipt className="w-4 h-4 text-emerald-700" />
                  <span>All Invoices & Receipts</span>
                </div>
                <ArrowRight className="w-4 h-4 text-emerald-700" />
              </button>

              <button
                onClick={() => navigate('/reports')}
                className="w-full p-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-900 border border-slate-200 flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <TrendingUp className="w-4 h-4 text-indigo-600" />
                  <span>Revenue & Tax Reports</span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                onClick={() => setCreateInvoiceOpen(true)}
                className="w-full p-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-900 border border-slate-200 flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <PlusCircle className="w-4 h-4 text-teal-600" />
                  <span>Draft New Dental Bill</span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </button>
            </div>
          </div>

          {/* Refunds & Adjustments Widget */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-extrabold text-slate-900">Refunds & Adjustments</h3>
              </div>
              <span className="text-xs font-bold text-slate-500">Audit Regulated</span>
            </div>
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs leading-relaxed">
              <strong>Clinic Policy:</strong> All refunds and financial adjustments require verified Admin authorization and retain an unalterable audit trail.
            </div>
          </div>
        </div>
      </div>

      {/* Global Billing Modals */}
      <InvoiceModal
        isOpen={createInvoiceOpen}
        onClose={() => setCreateInvoiceOpen(false)}
        onInvoiceCreated={() => {
          fetchFinancials();
        }}
      />

      <PaymentModal
        isOpen={!!paymentInvoice}
        invoice={paymentInvoice}
        onClose={() => setPaymentInvoice(null)}
        onPaymentSuccess={() => {
          fetchFinancials();
        }}
      />

      <InvoicePrintModal
        isOpen={!!printInvoice}
        invoice={printInvoice}
        onClose={() => setPrintInvoice(null)}
      />
    </div>
  );
};
