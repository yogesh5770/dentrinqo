import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api';
import { useClinicSync } from '../../lib/sync';
import {
  TrendingUp,
  IndianRupee,
  Receipt,
  Calendar,
  CreditCard,
  Printer,
  Download,
  Filter,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  RefreshCw,
  PieChart,
  BarChart3,
} from 'lucide-react';

export const ReportsView: React.FC = () => {
  const [summary, setSummary] = useState<any | null>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'collections' | 'receivables' | 'expenses'>('collections');

  const fetchReports = async (silent?: boolean | unknown) => {
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
      console.error('Failed to load reports', err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  useClinicSync(() => fetchReports(true));

  const todayCollectionRs = Math.round((summary?.todayCollectionPaise || 0) / 100);
  const totalBilledRs = Math.round((summary?.totalBilledPaise || 0) / 100);
  const totalCollectedRs = Math.round((summary?.totalCollectedPaise || 0) / 100);
  const totalOutstandingRs = Math.round((summary?.totalOutstandingPaise || 0) / 100);

  // Calculate payment method estimates from invoice payments
  const allPayments = invoices.flatMap(inv => inv.payments || []);
  const upiPayments = allPayments.filter(p => (p.paymentMethod || p.mode) === 'UPI').reduce((sum, p) => sum + (p.amountPaise || 0), 0);
  const cashPayments = allPayments.filter(p => (p.paymentMethod || p.mode) === 'CASH').reduce((sum, p) => sum + (p.amountPaise || 0), 0);
  const cardPayments = allPayments.filter(p => (p.paymentMethod || p.mode) === 'CARD').reduce((sum, p) => sum + (p.amountPaise || 0), 0);
  const totalModePaise = upiPayments + cashPayments + cardPayments;

  const upiPct = totalModePaise > 0 ? Math.round((upiPayments / totalModePaise) * 100) : 0;
  const cashPct = totalModePaise > 0 ? Math.round((cashPayments / totalModePaise) * 100) : 0;
  const cardPct = totalModePaise > 0 ? Math.max(0, 100 - upiPct - cashPct) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="clinic-card bg-white border border-slate-200 p-5 rounded-2xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <TrendingUp className="w-6 h-6 text-teal-600" />
            Financial Reports & Clinic Analytics
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
            Audit-grade dental revenue ledger, mode breakdowns, and patient receivable balances.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchReports()}
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-teal-600' : ''}`} />
          </button>
          <button
            onClick={() => window.print()}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Printer className="w-4 h-4" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs font-bold overflow-x-auto no-scrollbar touch-scroll whitespace-nowrap">
        <button
          onClick={() => setActiveTab('collections')}
          className={`px-4 py-2 rounded-xl transition-all cursor-pointer ${
            activeTab === 'collections'
              ? 'bg-teal-600 text-white shadow-xs font-extrabold'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Daily & Monthly Collections
        </button>
        <button
          onClick={() => setActiveTab('receivables')}
          className={`px-4 py-2 rounded-xl transition-all cursor-pointer ${
            activeTab === 'receivables'
              ? 'bg-teal-600 text-white shadow-xs font-extrabold'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Outstanding Receivables
        </button>
        <button
          onClick={() => setActiveTab('expenses')}
          className={`px-4 py-2 rounded-xl transition-all cursor-pointer ${
            activeTab === 'expenses'
              ? 'bg-teal-600 text-white shadow-xs font-extrabold'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Expenses & Overheads (Optional)
        </button>
      </div>

      {/* Telemetry Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Today's Collections</span>
          <div className="text-xl sm:text-2xl font-black text-emerald-600 mt-1 truncate">₹{todayCollectionRs.toLocaleString('en-IN')}</div>
          <span className="text-[11px] text-slate-400 mt-1 block">Live cash & UPI settlements</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Total Clinic Revenue</span>
          <div className="text-xl sm:text-2xl font-black text-slate-900 mt-1 truncate">₹{totalCollectedRs.toLocaleString('en-IN')}</div>
          <span className="text-[11px] text-slate-400 mt-1 block">Cumulative collected</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Outstanding Balances</span>
          <div className="text-xl sm:text-2xl font-black text-rose-600 mt-1 truncate">₹{totalOutstandingRs.toLocaleString('en-IN')}</div>
          <span className="text-[11px] text-slate-400 mt-1 block">Pending patient dues</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Total Billed Paired</span>
          <div className="text-xl sm:text-2xl font-black text-teal-700 mt-1 truncate">₹{totalBilledRs.toLocaleString('en-IN')}</div>
          <span className="text-[11px] text-slate-400 mt-1 block">{invoices.length} invoices generated</span>
        </div>
      </div>

      {/* Collections Tab Content */}
      {activeTab === 'collections' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-teal-600" />
              Settled Invoices Ledger
            </h2>

            {/* Mobile View: High Contrast Touch Cards (< md) */}
            <div className="md:hidden divide-y divide-slate-100">
              {invoices.length === 0 ? (
                <div className="py-6 text-center text-slate-400 text-xs">No billing records found</div>
              ) : (
                invoices.map(inv => (
                  <div key={inv.id} className="py-3.5 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="font-mono text-xs font-black text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded">
                          {inv.invoiceNumber}
                        </span>
                        <h4 className="font-black text-slate-900 text-sm mt-1">{inv.patient?.fullName}</h4>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                        inv.status === 'PAID' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {inv.status}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="text-slate-500">{new Date(inv.createdAt).toLocaleDateString('en-IN')}</span>
                      <div className="text-right">
                        <span className="text-slate-500 mr-2">Billed: ₹{Math.round(inv.totalPaise / 100).toLocaleString('en-IN')}</span>
                        <span className="font-black text-emerald-700">Paid: ₹{Math.round(inv.paidPaise / 100).toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Desktop View: Full Data Table (>= md) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-700 font-extrabold uppercase border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Invoice #</th>
                    <th className="py-2.5 px-3">Patient</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3 text-right">Billed</th>
                    <th className="py-2.5 px-3 text-right">Paid</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-400">
                        No billing records found
                      </td>
                    </tr>
                  ) : (
                    invoices.map(inv => (
                      <tr key={inv.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-mono font-bold text-teal-800">{inv.invoiceNumber}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-900">{inv.patient?.fullName}</td>
                        <td className="py-2.5 px-3 text-slate-500">{new Date(inv.createdAt).toLocaleDateString('en-IN')}</td>
                        <td className="py-2.5 px-3 text-right font-semibold">₹{Math.round(inv.totalPaise / 100).toLocaleString('en-IN')}</td>
                        <td className="py-2.5 px-3 text-right font-black text-emerald-700">₹{Math.round(inv.paidPaise / 100).toLocaleString('en-IN')}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                            inv.status === 'PAID' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {inv.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Payment Method Breakdown Widget */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <PieChart className="w-4 h-4 text-teal-600" />
              Settlement Channels
            </h3>

            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                  <span>UPI / QR Code</span>
                  <span>{upiPct}%</span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-teal-500 rounded-full" style={{ width: `${upiPct}%` }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                  <span>Cash Collections</span>
                  <span>{cashPct}%</span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${cashPct}%` }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                  <span>Credit / Debit Card</span>
                  <span>{cardPct}%</span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${cardPct}%` }}></div>
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 leading-relaxed mt-4">
              💡 <strong>Instant Settlement:</strong> Daily payments are linked to official receipts and automatically update patient ledgers.
            </div>
          </div>
        </div>
      )}

      {/* Receivables Tab */}
      {activeTab === 'receivables' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <Receipt className="w-5 h-5 text-rose-600" />
            Patient Receivables & Outstanding Ledger
          </h2>

          <div className="divide-y divide-slate-100">
            {invoices.filter(i => i.balancePaise > 0).length === 0 ? (
              <div className="py-8 text-center text-slate-400">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-1" />
                <p className="font-bold text-slate-700">Zero Outstanding Balances!</p>
              </div>
            ) : (
              invoices
                .filter(i => i.balancePaise > 0)
                .map(inv => (
                  <div key={inv.id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="font-extrabold text-slate-900 text-sm">{inv.patient?.fullName}</div>
                      <div className="text-xs text-slate-500">
                        UHID: {inv.patient?.uhid} • Invoice: {inv.invoiceNumber}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-500 block">Balance Pending</span>
                      <span className="text-sm font-black text-rose-600">
                        ₹{Math.round(inv.balancePaise / 100).toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
      )}

      {/* Expenses Tab */}
      {activeTab === 'expenses' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-extrabold text-slate-900">Clinic Overheads & Expenses Tracker</h2>
              <p className="text-xs text-slate-500 font-medium">Dental consumables, laboratory charges, and utilities</p>
            </div>
            <button className="px-3.5 py-1.5 bg-teal-600 text-white font-bold text-xs rounded-xl cursor-pointer">
              + Add Expense
            </button>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600">
            Dental clinic operational expense logs can be added here to calculate net clinic profit alongside patient treatment billing.
          </div>
        </div>
      )}
    </div>
  );
};
