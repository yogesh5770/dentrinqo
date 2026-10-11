import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { apiRequest } from '../../lib/api';
import {
  Receipt,
  Plus,
  CreditCard,
  Printer,
  IndianRupee,
  Clock,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Search,
  Filter,
  AlertTriangle,
  FileText,
  ShieldCheck,
  RefreshCw,
  PhoneCall,
  User,
  Phone,
  Calculator,
  MessageCircle,
  X,
  Sparkles,
  Armchair,
  ArrowRight,
  Trash2,
  BellRing,
  Zap,
} from 'lucide-react';
import { InvoiceModal } from './InvoiceModal';
import { PaymentModal } from './PaymentModal';
import { InvoicePrintModal } from './InvoicePrintModal';
import { openWhatsApp } from '../../lib/whatsapp';
import { useClinicSync, triggerClinicSync, playClinicAlertChime } from '../../lib/sync';

type BillingTab = 'ready_to_bill' | 'invoices' | 'payments' | 'receipts' | 'outstanding' | 'refunds';

export const BillingDesk: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isEodModalOpen, setIsEodModalOpen] = useState(false);

  const [invoices, setInvoices] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [refunds, setRefunds] = useState<any[]>([]);
  const [summary, setSummary] = useState<any | null>(null);
  const [todayAppointments, setTodayAppointments] = useState<any[]>([]);
  const [unbilledQueue, setUnbilledQueue] = useState<any[]>([]);
  const [prefilledProcedures, setPrefilledProcedures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Operatory Chairside Real-Time Billing Alert State
  const [chairAlert, setChairAlert] = useState<{
    patientName: string;
    patientId: string;
    patientUhid?: string;
    patientPhone?: string;
    doctorName?: string;
    procedureName?: string;
    toothNumber?: string | number;
    feeRupees?: number;
    appointmentId?: string;
    timestamp: number;
  } | null>(null);

  // Ready for billing state
  const [selectedBillingPatient, setSelectedBillingPatient] = useState<any | null>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | undefined>(undefined);
  const [readyFilter, setReadyFilter] = useState<string>('ALL');

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');

  // Modals
  const [createInvoiceOpen, setCreateInvoiceOpen] = useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState<any | null>(null);
  const [printInvoice, setPrintInvoice] = useState<any | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const canCreateInvoice = Boolean(
    hasPermission('billing.invoices.create') ||
      user?.role === 'CLINIC_ADMIN' ||
      user?.role === 'ACCOUNTANT' ||
      user?.role === 'RECEPTIONIST'
  );

  const canRecordPayment = Boolean(
    hasPermission('billing.payments.record') ||
      user?.role === 'CLINIC_ADMIN' ||
      user?.role === 'ACCOUNTANT' ||
      user?.role === 'RECEPTIONIST'
  );

  const canApproveRefunds = Boolean(
    hasPermission('billing.refunds.approve') || user?.role === 'CLINIC_ADMIN'
  );

  const fetchBillingData = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const todayStr = new Date().toISOString().split('T')[0];
      const [invData, sumData, payData, refData, apptsData, unbilledData] = await Promise.all([
        apiRequest<any[]>('/billing/invoices').catch(() => []),
        apiRequest<any>('/billing/summary').catch(() => null),
        apiRequest<any[]>('/billing/payments').catch(() => []),
        apiRequest<any[]>('/billing/refunds').catch(() => []),
        apiRequest<any[]>(`/appointments?date=${todayStr}`).catch(() => []),
        apiRequest<any[]>('/billing/unbilled-queue').catch(() => []),
      ]);

      const loadedInvoices = invData || [];
      setInvoices(loadedInvoices);
      setSummary(sumData || null);
      setRefunds(refData || []);
      setTodayAppointments(apptsData || []);
      setUnbilledQueue(unbilledData || []);

      // If dedicated payments API returned list, use it; otherwise extract from invoices
      if (payData && payData.length > 0) {
        setPayments(payData);
      } else {
        const extracted: any[] = [];
        loadedInvoices.forEach(inv => {
          if (inv.payments && Array.isArray(inv.payments)) {
            inv.payments.forEach((p: any) => {
              extracted.push({
                ...p,
                patient: inv.patient,
                invoiceNumber: inv.invoiceNumber,
                invoiceTotalPaise: inv.totalPaise,
                fullInvoice: inv,
              });
            });
          }
        });
        extracted.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
        setPayments(extracted);
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchBillingData(false);
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useClinicSync((event) => {
    fetchBillingData(true);
    if (event && (event.reason === 'treatment_completed_in_chair' || event.reason === 'doctor_completed_visit')) {
      const payload = event.payload || {};
      if (payload.patientName || payload.procedureName) {
        setChairAlert({
          patientName: payload.patientName || 'Patient',
          patientId: payload.patientId || '',
          patientUhid: payload.uhid || payload.patientUhid || '',
          patientPhone: payload.patientPhone || '',
          doctorName: payload.doctorName || 'Doctor',
          procedureName: payload.procedureName || 'Completed Procedure',
          toothNumber: payload.toothNumber || '',
          feeRupees: payload.feeRupees || (payload.feePaise ? payload.feePaise / 100 : 0),
          appointmentId: payload.appointmentId || '',
          timestamp: event.timestamp || Date.now(),
        });
        playClinicAlertChime();
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification('Operatory Chair Alert', {
              body: `${payload.patientName || 'Patient'} completed ${payload.procedureName || 'procedure'} (₹${payload.feeRupees || 0}). Ready for billing.`,
              icon: '/favicon.ico',
            });
          } catch {}
        }
      }
    }
  });

  // Check URL params for direct patient billing (e.g. redirected from ReceptionDashboard)
  useEffect(() => {
    const qPatientId = searchParams.get('patientId');
    const qApptId = searchParams.get('appointmentId');
    if (qPatientId) {
      apiRequest<any>(`/patients/${qPatientId}`)
        .then(p => {
          if (p) {
            setSelectedBillingPatient(p);
            if (qApptId) setSelectedAppointmentId(qApptId);
            setCreateInvoiceOpen(true);
          }
        })
        .catch(console.error);
    }
  }, [searchParams]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleTabChange = (newTab: BillingTab) => {
    setSearchParams({ tab: newTab });
    setSearch('');
  };

  const handleQuickPayFromAlert = (alertItem: NonNullable<typeof chairAlert>) => {
    setSelectedBillingPatient({
      id: alertItem.patientId,
      fullName: alertItem.patientName,
      uhid: alertItem.patientUhid,
      phone: alertItem.patientPhone,
    });
    setSelectedAppointmentId(alertItem.appointmentId || undefined);
    if (alertItem.procedureName) {
      setPrefilledProcedures([
        {
          procedureName: alertItem.procedureName,
          toothNumber: alertItem.toothNumber ? String(alertItem.toothNumber) : undefined,
          feePaise: (alertItem.feeRupees || 0) * 100,
          fee: alertItem.feeRupees || 0,
        },
      ]);
    } else {
      setPrefilledProcedures([]);
    }
    setCreateInvoiceOpen(true);
  };

  const handleStartBillingForPatient = (appt: any) => {
    setSelectedBillingPatient({
      id: appt.patientId,
      fullName: appt.patientName,
      uhid: appt.patientUhid,
      phone: appt.patientPhone,
    });
    setSelectedAppointmentId(appt.id?.startsWith('unbilled-') ? undefined : appt.id);
    setPrefilledProcedures(appt.procedures || []);
    setCreateInvoiceOpen(true);
  };

  const handleUpdateApptStatus = async (id: string, newStatus: string) => {
    try {
      await apiRequest(`/appointments/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      fetchBillingData(true);
      triggerClinicSync(`appt_${newStatus}`);
      showToast(`Appointment status updated to ${newStatus}.`);
    } catch (err: any) {
      alert(err?.message || 'Failed to update appointment status');
    }
  };

  const handleDeleteInvoice = async (id: string, invoiceNumber: string) => {
    if (!window.confirm(`Are you sure you want to void and delete Invoice #${invoiceNumber}? This will remove it from the ledger.`)) {
      return;
    }
    try {
      await apiRequest(`/billing/invoices/${id}`, { method: 'DELETE' });
      showToast(`Invoice #${invoiceNumber} removed from ledger.`);
      fetchBillingData(true);
      triggerClinicSync('invoice_deleted');
    } catch (err: any) {
      alert(err?.message || 'Failed to delete invoice');
    }
  };

  // Patients from operatory unbilled queue & today's appointments awaiting checkout
  const readyToBillPatients = (() => {
    const list: any[] = [];
    const patientIdsAdded = new Set<string>();

    // 1. Process unbilled queue (contains doctor-completed procedures and unbilled appointments)
    (unbilledQueue || []).forEach(item => {
      const patientInvoices = invoices.filter(inv => inv.patientId === item.patientId);
      const hasPaidToday = patientInvoices.some(inv => {
        const isToday = new Date(inv.issuedAt || inv.createdAt).toDateString() === new Date().toDateString();
        return isToday && inv.status === 'PAID';
      });

      // If patient paid earlier today but has NEW unbilled procedures, still show them!
      if (hasPaidToday && (!item.procedures || item.procedures.length === 0)) {
        return;
      }

      list.push({
        id: item.appointmentId || `unbilled-${item.patientId}`,
        patientId: item.patientId,
        patientName: item.patientName,
        patientUhid: item.patientUhid,
        patientPhone: item.patientPhone,
        dentistName: item.dentistName || 'Assigned Doctor',
        chairNumber: item.chairNumber || 1,
        status: item.status,
        reason: item.procedures && item.procedures.length > 0
          ? item.procedures.map((p: any) => `${p.procedureName}${p.toothNumber ? ` (#${p.toothNumber})` : ''}`).join(', ')
          : 'General Consultation',
        procedures: item.procedures || [],
        totalEstimatedPaise: item.totalEstimatedPaise || 0,
        scheduledStart: item.latestActivityAt || new Date().toISOString(),
        durationMinutes: 30,
        source: item.source || 'QUEUE',
      });
      patientIdsAdded.add(item.patientId);
    });

    // 2. Include any checked-in / in-chair / completed appointments from today not already in queue
    (todayAppointments || []).forEach(appt => {
      if (['CANCELLED', 'NO_SHOW'].includes(appt.status)) return;
      if (patientIdsAdded.has(appt.patientId)) return;

      const patientInvoices = invoices.filter(inv => inv.patientId === appt.patientId);
      const hasPaidToday = patientInvoices.some(inv => {
        const isToday = new Date(inv.issuedAt || inv.createdAt).toDateString() === new Date().toDateString();
        return isToday && inv.status === 'PAID';
      });
      if (hasPaidToday) return;

      list.push({
        ...appt,
        procedures: [],
        totalEstimatedPaise: 30000,
        source: 'APPOINTMENT',
      });
      patientIdsAdded.add(appt.patientId);
    });

    return list;
  })();

  const filteredReadyToBill = readyToBillPatients.filter(appt => {
    const isCompleted = appt.status === 'COMPLETED' || appt.status === 'DOCTOR_COMPLETED_WORK';
    const matchesFilter = readyFilter === 'ALL' || 
      (readyFilter === 'COMPLETED' ? isCompleted : appt.status === readyFilter);
    const matchesSearch =
      !search ||
      appt.patientName?.toLowerCase().includes(search.toLowerCase()) ||
      appt.patientUhid?.toLowerCase().includes(search.toLowerCase()) ||
      appt.patientPhone?.includes(search) ||
      appt.dentistName?.toLowerCase().includes(search.toLowerCase()) ||
      appt.reason?.toLowerCase().includes(search.toLowerCase()) ||
      (appt.procedures && appt.procedures.some((p: any) => p.procedureName?.toLowerCase().includes(search.toLowerCase())));
    return matchesFilter && matchesSearch;
  });

  const activeTab: BillingTab =
    (searchParams.get('tab') as BillingTab) ||
    (readyToBillPatients.length > 0 ? 'ready_to_bill' : 'invoices');

  // Filtered Invoices
  const filteredInvoices = invoices.filter(inv => {
    const matchesStatus = statusFilter === 'ALL' || inv.status === statusFilter;
    const matchesSearch =
      !search ||
      inv.invoiceNumber?.toLowerCase().includes(search.toLowerCase()) ||
      inv.patient?.fullName?.toLowerCase().includes(search.toLowerCase()) ||
      inv.patient?.uhid?.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  // Filtered Outstanding Invoices (balance > 0)
  const outstandingInvoices = invoices.filter(inv => {
    const hasBalance = inv.balancePaise > 0;
    const matchesSearch =
      !search ||
      inv.invoiceNumber?.toLowerCase().includes(search.toLowerCase()) ||
      inv.patient?.fullName?.toLowerCase().includes(search.toLowerCase()) ||
      inv.patient?.uhid?.toLowerCase().includes(search.toLowerCase()) ||
      inv.patient?.phone?.includes(search);
    return hasBalance && matchesSearch;
  });

  // Filtered Payments / Receipts
  const filteredPayments = payments.filter(p => {
    const matchesMethod = paymentMethodFilter === 'ALL' || p.paymentMethod === paymentMethodFilter;
    const matchesSearch =
      !search ||
      p.receiptNumber?.toLowerCase().includes(search.toLowerCase()) ||
      p.patient?.fullName?.toLowerCase().includes(search.toLowerCase()) ||
      p.patient?.uhid?.toLowerCase().includes(search.toLowerCase()) ||
      p.referenceNumber?.toLowerCase().includes(search.toLowerCase()) ||
      p.invoice?.invoiceNumber?.toLowerCase().includes(search.toLowerCase()) ||
      p.invoiceNumber?.toLowerCase().includes(search.toLowerCase());
    return matchesMethod && matchesSearch;
  });

  // Open invoice print modal for a payment transaction
  const handlePrintReceiptForPayment = (payment: any) => {
    if (payment.fullInvoice) {
      setPrintInvoice(payment.fullInvoice);
      return;
    }
    const matchedInvoice = invoices.find(inv => inv.id === payment.invoiceId);
    if (matchedInvoice) {
      setPrintInvoice(matchedInvoice);
    } else {
      apiRequest<any>(`/billing/invoices/${payment.invoiceId}`)
        .then(inv => setPrintInvoice(inv))
        .catch(() => alert('Could not load invoice receipt details'));
    }
  };

  const tabDefs = [
    { id: 'ready_to_bill', label: '⚡ Ready for Billing', count: readyToBillPatients.length, icon: Sparkles },
    { id: 'invoices', label: 'Invoices', count: invoices.length, icon: Receipt },
    { id: 'payments', label: 'Payments Ledger', count: payments.length, icon: CreditCard },
    { id: 'receipts', label: 'Receipts', count: payments.length, icon: FileText },
    { id: 'outstanding', label: 'Outstanding Balances', count: outstandingInvoices.length, icon: IndianRupee },
    { id: 'refunds', label: 'Refunds & Adjustments', count: refunds.length, icon: AlertTriangle },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="clinic-card p-4 sm:p-5 bg-white border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-teal-50 text-teal-800 border border-teal-200 font-mono">
              AKS Financial Ledger
            </span>
            <span className="text-xs text-slate-400 font-semibold">• Accounts & Billing</span>
          </div>
          <h2 className="text-lg sm:text-2xl font-black text-slate-900 flex items-center gap-2 mt-1">
            <Receipt className="w-5 h-5 sm:w-6 sm:h-6 text-teal-600 shrink-0" />
            <span>Billing & Financial Management</span>
          </h2>
          <p className="text-xs font-semibold text-slate-500 mt-0.5">
            Patient billing, accounts receivable, payments ledger, and sequential payment receipts
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => fetchBillingData()}
            title="Refresh Ledger"
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 cursor-pointer transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-teal-600' : ''}`} />
          </button>

          <button
            onClick={() => setIsEodModalOpen(true)}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs py-2.5 px-3.5 sm:px-4 rounded-xl shadow-xs transition-all cursor-pointer"
            title="View today's Cash vs UPI vs Card closing reconciliation"
          >
            <Calculator className="w-4 h-4 text-teal-400" />
            <span>Daily Reconciliation</span>
          </button>

          {canCreateInvoice && (
            <button
              onClick={() => setCreateInvoiceOpen(true)}
              className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white font-black text-xs py-2.5 px-3.5 sm:px-4 rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Generate Invoice</span>
            </button>
          )}
        </div>
      </div>

      {toastMessage && (
        <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl text-teal-900 text-xs font-bold flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Operatory Real-Time Chairside Billing Alert Banner */}
      {chairAlert && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 p-4 sm:p-5 text-white shadow-lg border-2 border-emerald-400">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="p-3 bg-white/20 backdrop-blur-xs rounded-xl shrink-0 flex items-center justify-center">
                <BellRing className="w-6 h-6 text-white animate-bounce" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-950/60 text-emerald-200 border border-emerald-300/40">
                    ⚡ Real-Time Operatory Alert
                  </span>
                  <span className="text-xs text-white/80 font-medium">
                    Completed just now by Dr. {chairAlert.doctorName}
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-black text-white">
                  {chairAlert.patientName}{' '}
                  {chairAlert.patientUhid ? (
                    <span className="text-emerald-200 font-mono text-xs">({chairAlert.patientUhid})</span>
                  ) : null}
                </h3>
                <div className="flex items-center gap-3 text-xs font-semibold text-emerald-100 flex-wrap">
                  <span className="bg-white/15 px-2.5 py-1 rounded-lg">
                    Procedure: <strong>{chairAlert.procedureName}</strong>
                    {chairAlert.toothNumber ? ` (Tooth #${chairAlert.toothNumber})` : ''}
                  </span>
                  <span className="bg-amber-400/30 text-amber-100 border border-amber-300/40 px-3 py-1 rounded-lg font-mono font-black text-sm">
                    Price: ₹{(chairAlert.feeRupees || 0).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
              <button
                type="button"
                onClick={() => handleQuickPayFromAlert(chairAlert)}
                className="px-4 py-2.5 rounded-xl bg-white text-emerald-900 hover:bg-emerald-50 font-black text-xs transition-all shadow-md cursor-pointer flex items-center gap-2 active:scale-95"
              >
                <Zap className="w-4 h-4 text-emerald-600 fill-emerald-600" />
                <span>Collect Payment (₹{(chairAlert.feeRupees || 0).toLocaleString('en-IN')})</span>
              </button>
              <button
                type="button"
                onClick={() => setChairAlert(null)}
                className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                title="Dismiss Alert"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KPI Financial Cards - Responsive Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="clinic-card p-3.5 sm:p-5 bg-teal-50/70 border border-teal-200 text-teal-950">
          <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-teal-800">
            Today's Collections
          </span>
          <div className="flex items-baseline gap-1 mt-1 sm:mt-2">
            <span className="text-lg sm:text-2xl lg:text-3xl font-black font-mono text-teal-900">
              ₹{((summary?.todayCollectionPaise || 0) / 100).toLocaleString('en-IN')}
            </span>
          </div>
          <span className="text-[10px] sm:text-xs font-semibold text-teal-700 mt-0.5 sm:mt-1 block">
            {summary?.todayPaymentsCount || 0} payment(s) settled today
          </span>
        </div>

        <div className="clinic-card p-3.5 sm:p-5 bg-rose-50/70 border border-rose-300 text-rose-950">
          <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-rose-800">
            Pending Balances Due
          </span>
          <div className="flex items-baseline gap-1 mt-1 sm:mt-2">
            <span className="text-lg sm:text-2xl lg:text-3xl font-black font-mono text-rose-900">
              ₹{((summary?.totalOutstandingPaise || 0) / 100).toLocaleString('en-IN')}
            </span>
          </div>
          <span className="text-[10px] sm:text-xs font-semibold text-rose-700 mt-0.5 sm:mt-1 block">
            Across {outstandingInvoices.length} patient account(s)
          </span>
        </div>

        <div className="clinic-card p-3.5 sm:p-5 bg-blue-50/70 border border-blue-200 text-blue-950">
          <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-blue-800">
            Total Revenue Billed
          </span>
          <div className="flex items-baseline gap-1 mt-1 sm:mt-2">
            <span className="text-lg sm:text-2xl lg:text-3xl font-black font-mono text-blue-900">
              ₹{((summary?.totalBilledPaise || 0) / 100).toLocaleString('en-IN')}
            </span>
          </div>
          <span className="text-[10px] sm:text-xs font-semibold text-blue-700 mt-0.5 sm:mt-1 block">
            Across {summary?.totalInvoicesCount || invoices.length} invoice(s)
          </span>
        </div>

        <div className="clinic-card p-3.5 sm:p-5 bg-emerald-50/70 border border-emerald-200 text-emerald-950">
          <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-emerald-800">
            Lifetime Collections
          </span>
          <div className="flex items-baseline gap-1 mt-1 sm:mt-2">
            <span className="text-lg sm:text-2xl lg:text-3xl font-black font-mono text-emerald-900">
              ₹{((summary?.totalCollectedPaise || 0) / 100).toLocaleString('en-IN')}
            </span>
          </div>
          <span className="text-[10px] sm:text-xs font-semibold text-emerald-700 mt-0.5 sm:mt-1 block">
            All settled patient payments
          </span>
        </div>
      </div>

      {/* Sub-Navigation Tabs Bar */}
      <div className="flex items-center gap-1.5 p-1.5 bg-slate-100 rounded-2xl border border-slate-200 overflow-x-auto no-scrollbar touch-scroll">
        {tabDefs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id as BillingTab)}
              className={`flex items-center gap-2 py-2 px-3 sm:px-3.5 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap active:scale-95 ${
                isActive
                  ? 'bg-white text-teal-800 shadow-xs border border-slate-200 font-extrabold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-teal-600' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                  isActive ? 'bg-teal-100 text-teal-900' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* TAB 0: READY FOR BILLING (Queue from Today's Appointments) */}
      {activeTab === 'ready_to_bill' && (
        <div className="space-y-4">
          {/* Informational Guidance Banner */}
          <div className="clinic-card p-4 bg-gradient-to-r from-teal-50 via-emerald-50 to-teal-50 border border-teal-200 text-slate-900 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-black text-teal-950 text-sm flex items-center gap-2">
                  <span>Front-Desk Patient Checkout Queue</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-black bg-teal-200 text-teal-900">
                    {readyToBillPatients.length} Waiting
                  </span>
                </h4>
                <p className="text-xs text-slate-600 font-medium mt-0.5">
                  Displays patients who have arrived or had treatments today awaiting invoices.
                  <strong className="text-teal-900 ml-1">If dentist does not use a chairside PC</strong>, front-desk staff can click <strong className="text-emerald-700">"⚡ Bill & Checkout"</strong> to create the bill and collect payment on the spot.
                </p>
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-2">
              <button
                onClick={() => setCreateInvoiceOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-xs cursor-pointer shadow-xs transition-all flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Custom Patient Invoice</span>
              </button>
            </div>
          </div>

          {/* Filters & Search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs font-black overflow-x-auto no-scrollbar touch-scroll">
              {[
                { id: 'ALL', label: 'All Patients' },
                { id: 'COMPLETED', label: 'Doctor Completed' },
                { id: 'IN_CHAIR', label: 'In Operatory Chair' },
                { id: 'CHECKED_IN', label: 'Waiting Lounge' },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setReadyFilter(f.id)}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap active:scale-95 ${
                    readyFilter === f.id
                      ? 'bg-white text-teal-800 shadow-xs border border-slate-200 font-black'
                      : 'text-slate-600 hover:text-slate-900 font-bold'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search patient, UHID, phone, doctor..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-teal-600"
              />
            </div>
          </div>

          {/* Queue List / Table */}
          {filteredReadyToBill.length === 0 ? (
            <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl shadow-xs">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <h4 className="font-black text-slate-900 text-base">All Patients Billed & Checked Out!</h4>
              <p className="text-xs text-slate-500 font-medium mt-1 max-w-md mx-auto">
                There are no unbilled patients waiting from today's operatory queue. As soon as patients check in or complete treatments, they will appear here automatically.
              </p>
            </div>
          ) : (
            <div className="clinic-card bg-white border border-slate-200 overflow-hidden shadow-xs">
              {/* Mobile View: Cards (< md) */}
              <div className="md:hidden divide-y divide-slate-100">
                {filteredReadyToBill.map(appt => {
                  const startTime = new Date(appt.scheduledStart).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div key={appt.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-black text-slate-900 text-base">{appt.patientName}</div>
                          <div className="text-xs text-slate-500 font-mono font-bold mt-0.5">
                            {appt.patientUhid} • <a href={`tel:${appt.patientPhone}`} className="text-teal-700 hover:underline">{appt.patientPhone}</a>
                          </div>
                        </div>

                        <div>
                          {appt.status === 'COMPLETED' || appt.status === 'DOCTOR_COMPLETED_WORK' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                              Doctor Completed
                            </span>
                          ) : appt.status === 'IN_CHAIR' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-teal-100 text-teal-900 border border-teal-300">
                              <Armchair className="w-3.5 h-3.5 text-teal-700" />
                              Chair {appt.chairNumber}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-900 border border-amber-300">
                              <Clock className="w-3.5 h-3.5 text-amber-700" />
                              Checked In
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs space-y-1.5">
                        <div className="text-slate-800 font-medium">
                          <strong>Doctor:</strong> {appt.dentistName}
                        </div>
                        {appt.procedures && appt.procedures.length > 0 ? (
                          <div className="space-y-1">
                            <div className="text-slate-700 font-bold text-[11px] uppercase tracking-wider">Completed Work:</div>
                            <div className="flex flex-wrap gap-1">
                              {appt.procedures.map((p: any, idx: number) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 text-teal-900 border border-teal-200 text-[11px] font-bold"
                                >
                                  {p.toothNumber ? (
                                    <span className="bg-teal-700 text-white px-1 rounded text-[10px] font-mono">
                                      #{p.toothNumber}
                                    </span>
                                  ) : null}
                                  <span>{p.procedureName}</span>
                                  <span className="text-teal-950 font-black">₹{Math.round((p.feePaise || 0) / 100)}</span>
                                </span>
                              ))}
                            </div>
                            {appt.totalEstimatedPaise > 0 && (
                              <div className="text-xs font-black text-emerald-700 mt-1">
                                Est. Bill: ₹{Math.round(appt.totalEstimatedPaise / 100).toLocaleString('en-IN')}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-slate-600">
                            <strong>Reason:</strong> {appt.reason || 'General Consultation'}
                          </div>
                        )}
                        <div className="text-slate-500 font-mono text-[11px]">
                          <strong>Scheduled:</strong> {startTime} ({appt.durationMinutes} mins)
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleStartBillingForPatient(appt)}
                          className="flex-1 py-2.5 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs transition-colors cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
                        >
                          <Receipt className="w-4 h-4" />
                          <span>
                            {appt.totalEstimatedPaise > 0
                              ? `⚡ Bill & Collect (₹${Math.round(appt.totalEstimatedPaise / 100).toLocaleString('en-IN')})`
                              : '⚡ Bill & Checkout'}
                          </span>
                        </button>

                        {appt.status !== 'COMPLETED' && (
                          <button
                            type="button"
                            onClick={() => handleUpdateApptStatus(appt.id, 'COMPLETED')}
                            className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-colors cursor-pointer border border-slate-300"
                            title="Mark completed on doctor's behalf"
                          >
                            Mark Complete
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop View: Table (>= md) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[760px]">
                  <thead className="bg-slate-100 border-b border-slate-200 text-slate-800 font-black uppercase tracking-wider text-xs">
                    <tr>
                      <th className="py-3 px-4">Patient</th>
                      <th className="py-3 px-4">Doctor & Chair</th>
                      <th className="py-3 px-4">Reason / Treatment</th>
                      <th className="py-3 px-4">Visit Time</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredReadyToBill.map(appt => {
                      const startTime = new Date(appt.scheduledStart).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      });

                      return (
                        <tr key={appt.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="font-black text-slate-900 text-sm">{appt.patientName}</div>
                            <div className="text-xs text-slate-600 font-mono font-bold mt-0.5">
                              {appt.patientUhid} • <a href={`tel:${appt.patientPhone}`} className="text-teal-700 hover:underline">{appt.patientPhone}</a>
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900">{appt.dentistName}</div>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 text-teal-900 font-bold border border-teal-200 text-[11px] mt-0.5">
                              <Armchair className="w-3 h-3 text-teal-700" />
                              Chair {appt.chairNumber}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 max-w-sm text-slate-800">
                            {appt.procedures && appt.procedures.length > 0 ? (
                              <div className="space-y-1">
                                <div className="flex flex-wrap gap-1">
                                  {appt.procedures.map((p: any, idx: number) => (
                                    <span
                                      key={idx}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 text-teal-900 border border-teal-200 text-[11px] font-bold"
                                    >
                                      {p.toothNumber ? (
                                        <span className="bg-teal-700 text-white px-1 rounded text-[10px] font-mono">
                                          #{p.toothNumber}
                                        </span>
                                      ) : null}
                                      <span>{p.procedureName}</span>
                                      <span className="text-teal-950 font-black">₹{Math.round((p.feePaise || 0) / 100)}</span>
                                    </span>
                                  ))}
                                </div>
                                {appt.totalEstimatedPaise > 0 && (
                                  <div className="text-[11px] font-black text-emerald-700 flex items-center gap-1 mt-0.5">
                                    <span>Est. Bill: ₹{Math.round(appt.totalEstimatedPaise / 100).toLocaleString('en-IN')}</span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="font-medium text-slate-700">{appt.reason || 'General Consultation'}</span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                            {startTime}
                            <div className="text-[11px] text-slate-500 font-sans font-medium">{appt.durationMinutes} mins</div>
                          </td>

                          <td className="py-3.5 px-4">
                            {appt.status === 'COMPLETED' || appt.status === 'DOCTOR_COMPLETED_WORK' ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                                Doctor Completed
                              </span>
                            ) : appt.status === 'IN_CHAIR' ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-teal-100 text-teal-900 border border-teal-300">
                                <Armchair className="w-3.5 h-3.5 text-teal-700" />
                                In Operatory
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-900 border border-amber-300">
                                <Clock className="w-3.5 h-3.5 text-amber-700" />
                                Checked In
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleStartBillingForPatient(appt)}
                                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
                                title="Open invoice modal and collect payment"
                              >
                                <Receipt className="w-3.5 h-3.5" />
                                <span>
                                  {appt.totalEstimatedPaise > 0
                                    ? `⚡ Bill & Collect (₹${Math.round(appt.totalEstimatedPaise / 100).toLocaleString('en-IN')})`
                                    : '⚡ Bill & Checkout'}
                                </span>
                              </button>

                              {appt.status !== 'COMPLETED' && (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateApptStatus(appt.id, 'COMPLETED')}
                                  className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-colors cursor-pointer border border-slate-300"
                                  title="Mark visit complete on doctor's behalf"
                                >
                                  Complete
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 1: INVOICES */}
      {activeTab === 'invoices' && (
        <div className="space-y-4">
          {/* Filters & Search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs font-black overflow-x-auto no-scrollbar touch-scroll">
              {['ALL', 'ISSUED', 'PARTIAL', 'PAID'].map(st => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap active:scale-95 ${
                    statusFilter === st
                      ? 'bg-white text-teal-800 shadow-xs border border-slate-200 font-black'
                      : 'text-slate-600 hover:text-slate-900 font-bold'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search invoice #, patient, UHID..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-teal-600"
              />
            </div>
          </div>

          {/* Invoices List / Table */}
          {loading ? (
            <div className="p-12 text-center text-xs font-bold text-slate-500">Loading invoice registers...</div>
          ) : filteredInvoices.length === 0 ? (
            <div className="clinic-card p-12 text-center text-slate-500 bg-white border border-slate-200">
              <Receipt className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-800">No invoices match the selected filter</p>
              <p className="text-xs text-slate-500 mt-1">Generate a new invoice or adjust your search.</p>
            </div>
          ) : (
            <div className="clinic-card bg-white border border-slate-200 overflow-hidden shadow-xs">
              {/* MOBILE VIEW: Touch-Friendly Invoice Cards (< md) */}
              <div className="md:hidden divide-y divide-slate-100">
                {filteredInvoices.map(inv => {
                  const isPaid = inv.balancePaise === 0;

                  return (
                    <div key={inv.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-mono font-black text-teal-800 text-xs">
                            {inv.invoiceNumber}
                          </div>
                          <h4 className="font-black text-slate-900 text-sm mt-0.5">
                            {inv.patient?.fullName}
                          </h4>
                          <span className="font-mono text-xs text-slate-500 font-semibold">
                            {inv.patient?.uhid}
                          </span>
                        </div>
                        <div className="text-right">
                          <span
                            className={`inline-block text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase ${
                              inv.status === 'PAID'
                                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                : inv.status === 'PARTIAL'
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : 'bg-slate-100 text-slate-800 border border-slate-300'
                            }`}
                          >
                            {inv.status}
                          </span>
                          <div className="text-[11px] text-slate-500 font-mono mt-1">
                            {new Date(inv.createdAt).toLocaleDateString('en-IN')}
                          </div>
                        </div>
                      </div>

                      {/* 3 Financial Pills */}
                      <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-center">
                        <div>
                          <span className="text-[10px] text-slate-500 block font-bold">Total</span>
                          <span className="font-mono font-extrabold text-slate-900 text-xs">
                            ₹{(inv.totalPaise / 100).toLocaleString('en-IN')}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-emerald-700 block font-bold">Paid</span>
                          <span className="font-mono font-extrabold text-emerald-800 text-xs">
                            ₹{(inv.paidPaise / 100).toLocaleString('en-IN')}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-rose-700 block font-bold">Balance</span>
                          <span className={`font-mono font-extrabold text-xs ${inv.balancePaise > 0 ? 'text-rose-700' : 'text-slate-400'}`}>
                            ₹{(inv.balancePaise / 100).toLocaleString('en-IN')}
                          </span>
                        </div>
                      </div>

                      {/* Touch Actions */}
                      <div className="flex items-center gap-2 pt-1">
                        {!isPaid && canRecordPayment && (
                          <button
                            onClick={() => setPaymentInvoice(inv)}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs py-2 px-3 rounded-xl transition-colors cursor-pointer text-center shadow-xs active:scale-98"
                          >
                            Collect Payment
                          </button>
                        )}
                        <button
                          onClick={() => setPrintInvoice(inv)}
                          className={`${isPaid || !canRecordPayment ? 'flex-1' : ''} bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold text-xs py-2 px-3 rounded-xl transition-colors cursor-pointer text-center active:scale-98`}
                        >
                          Print Invoice
                        </button>
                        {canApproveRefunds && (
                          <button
                            onClick={() => handleDeleteInvoice(inv.id, inv.invoiceNumber)}
                            className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs py-2 px-3 rounded-xl transition-colors cursor-pointer text-center active:scale-98"
                            title="Void / Delete invoice"
                          >
                            <Trash2 className="w-4 h-4 inline" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* DESKTOP VIEW: Data Table (>= md) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[720px]">
                  <thead className="bg-slate-100 text-slate-800 font-black text-xs uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Invoice #</th>
                      <th className="py-3 px-4">Patient / UHID</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4 text-right">Total (₹)</th>
                      <th className="py-3 px-4 text-right">Paid (₹)</th>
                      <th className="py-3 px-4 text-right">Balance Due (₹)</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredInvoices.map(inv => {
                      const isPaid = inv.balancePaise === 0;

                      return (
                        <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-teal-800 text-xs">
                            {inv.invoiceNumber}
                          </td>
                          <td className="py-3 px-4">
                            <strong className="text-slate-900 block font-black">{inv.patient?.fullName}</strong>
                            <span className="font-mono text-xs text-slate-500 font-semibold">{inv.patient?.uhid}</span>
                          </td>
                          <td className="py-3 px-4 text-slate-600 font-mono font-medium">
                            {new Date(inv.createdAt).toLocaleDateString('en-IN')}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-extrabold text-slate-900">
                            ₹{(inv.totalPaise / 100).toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-emerald-800 font-extrabold">
                            ₹{(inv.paidPaise / 100).toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-extrabold">
                            <span className={inv.balancePaise > 0 ? 'text-rose-700' : 'text-slate-400'}>
                              ₹{(inv.balancePaise / 100).toLocaleString('en-IN')}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`inline-block text-xs font-black px-2.5 py-0.5 rounded-full uppercase ${
                                inv.status === 'PAID'
                                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                  : inv.status === 'PARTIAL'
                                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                  : 'bg-slate-100 text-slate-800 border border-slate-300'
                              }`}
                            >
                              {inv.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right space-x-1.5">
                            {!isPaid && canRecordPayment && (
                              <button
                                onClick={() => setPaymentInvoice(inv)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs py-1.5 px-3 rounded-lg transition-colors cursor-pointer shadow-xs active:scale-95"
                              >
                                Collect Payment
                              </button>
                            )}
                            <button
                              onClick={() => setPrintInvoice(inv)}
                              className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold text-xs py-1.5 px-3 rounded-lg transition-colors cursor-pointer active:scale-95"
                            >
                              Print
                            </button>
                            {canApproveRefunds && (
                              <button
                                onClick={() => handleDeleteInvoice(inv.id, inv.invoiceNumber)}
                                className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs py-1.5 px-2.5 rounded-lg transition-colors cursor-pointer active:scale-95 inline-flex items-center justify-center"
                                title="Void / Delete invoice"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PAYMENTS LEDGER */}
      {activeTab === 'payments' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs font-black overflow-x-auto no-scrollbar touch-scroll">
              {['ALL', 'UPI', 'CASH', 'CARD', 'NETBANKING'].map(mode => (
                <button
                  key={mode}
                  onClick={() => setPaymentMethodFilter(mode)}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap active:scale-95 ${
                    paymentMethodFilter === mode
                      ? 'bg-white text-teal-800 shadow-xs border border-slate-200 font-black'
                      : 'text-slate-600 hover:text-slate-900 font-bold'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search receipt #, patient, UPI ref..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-teal-600"
              />
            </div>
          </div>

          {filteredPayments.length === 0 ? (
            <div className="clinic-card p-12 text-center text-slate-500 bg-white border border-slate-200">
              <CreditCard className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-800">No payment transactions found</p>
              <p className="text-xs text-slate-500 mt-1">Settled payments will appear here in chronological order.</p>
            </div>
          ) : (
            <div className="clinic-card bg-white border border-slate-200 overflow-hidden shadow-xs">
              {/* MOBILE VIEW: Touch-Friendly Payment Cards (< md) */}
              <div className="md:hidden divide-y divide-slate-100">
                {filteredPayments.map(p => (
                  <div key={p.id} className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-mono font-black text-teal-800 text-xs">
                          {p.receiptNumber}
                        </div>
                        <h4 className="font-black text-slate-900 text-sm mt-0.5">
                          {p.patient?.fullName}
                        </h4>
                        <span className="font-mono text-xs text-slate-500">
                          {p.patient?.uhid}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-black text-emerald-800 text-base block">
                          ₹{(p.amountPaise / 100).toLocaleString('en-IN')}
                        </span>
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase mt-1 ${
                            p.paymentMethod === 'UPI'
                              ? 'bg-purple-100 text-purple-900'
                              : p.paymentMethod === 'CASH'
                              ? 'bg-emerald-100 text-emerald-900'
                              : 'bg-blue-100 text-blue-900'
                          }`}
                        >
                          {p.paymentMethod}
                        </span>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-2 rounded-xl text-xs flex items-center justify-between border border-slate-100 text-slate-600 font-mono">
                      <span>Inv: {p.invoice?.invoiceNumber || p.invoiceNumber || '—'}</span>
                      <span>Ref: {p.referenceNumber || 'N/A'}</span>
                    </div>

                    <button
                      onClick={() => handlePrintReceiptForPayment(p)}
                      className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold text-xs py-2 px-3 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 active:scale-98"
                    >
                      <Printer className="w-3.5 h-3.5 text-teal-600" />
                      <span>Print Receipt</span>
                    </button>
                  </div>
                ))}
              </div>

              {/* DESKTOP VIEW: Data Table (>= md) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[760px]">
                  <thead className="bg-slate-100 text-slate-800 font-black text-xs uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Receipt #</th>
                      <th className="py-3 px-4">Date & Time</th>
                      <th className="py-3 px-4">Patient / UHID</th>
                      <th className="py-3 px-4">Invoice #</th>
                      <th className="py-3 px-4">Mode</th>
                      <th className="py-3 px-4">Ref / Txn ID</th>
                      <th className="py-3 px-4 text-right">Amount (₹)</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredPayments.map(p => (
                      <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-teal-800 text-xs">
                          {p.receiptNumber}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600 text-xs">
                          {new Date(p.receivedAt).toLocaleString('en-IN', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </td>
                        <td className="py-3 px-4">
                          <strong className="text-slate-900 block font-black">{p.patient?.fullName}</strong>
                          <span className="font-mono text-xs text-slate-500 font-semibold">{p.patient?.uhid}</span>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-700 font-semibold">
                          {p.invoice?.invoiceNumber || p.invoiceNumber || '—'}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                              p.paymentMethod === 'UPI'
                                ? 'bg-purple-100 text-purple-900 border border-purple-300'
                                : p.paymentMethod === 'CASH'
                                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                : p.paymentMethod === 'CARD'
                                ? 'bg-blue-100 text-blue-900 border border-blue-300'
                                : 'bg-amber-100 text-amber-900 border border-amber-300'
                            }`}
                          >
                            {p.paymentMethod}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-500 text-xs">
                          {p.referenceNumber || 'N/A'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-extrabold text-emerald-800 text-sm">
                          ₹{(p.amountPaise / 100).toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handlePrintReceiptForPayment(p)}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold text-xs py-1.5 px-3 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1 active:scale-95"
                          >
                            <Printer className="w-3.5 h-3.5 text-teal-600" />
                            <span>Print Receipt</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: RECEIPTS (Sequential RCP Register) */}
      {activeTab === 'receipts' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-slate-900">Sequential Receipt Book</h3>
              <p className="text-xs text-slate-500 font-medium">
                Compliant payment receipts generated with official clinic header & tax info
              </p>
            </div>

            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search receipt #, patient..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-teal-600"
              />
            </div>
          </div>

          {filteredPayments.length === 0 ? (
            <div className="clinic-card p-12 text-center text-slate-500 bg-white border border-slate-200">
              <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-800">No payment receipts found</p>
              <p className="text-xs text-slate-500 mt-1">Receipts are generated whenever a payment is settled.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {filteredPayments.map(p => (
                <div
                  key={p.id}
                  className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3 hover:border-teal-300 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="font-mono text-xs font-black text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                        {p.receiptNumber}
                      </span>
                      <h4 className="font-extrabold text-sm text-slate-900 mt-1.5">{p.patient?.fullName}</h4>
                      <p className="font-mono text-xs text-slate-500">{p.patient?.uhid}</p>
                    </div>
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded uppercase ${
                        p.paymentMethod === 'UPI'
                          ? 'bg-purple-100 text-purple-900'
                          : p.paymentMethod === 'CASH'
                          ? 'bg-emerald-100 text-emerald-900'
                          : 'bg-blue-100 text-blue-900'
                      }`}
                    >
                      {p.paymentMethod}
                    </span>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[10px] text-slate-500 block uppercase font-bold">Amount Paid</span>
                      <span className="font-mono font-extrabold text-emerald-700 text-sm">
                        ₹{(p.amountPaise / 100).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 block uppercase font-bold">Date</span>
                      <span className="font-mono text-xs text-slate-700">
                        {new Date(p.receivedAt).toLocaleDateString('en-IN')}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handlePrintReceiptForPayment(p)}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black text-xs py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-98"
                  >
                    <Printer className="w-3.5 h-3.5 text-teal-400" />
                    <span>Print Official Receipt</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: OUTSTANDING BALANCES */}
      {activeTab === 'outstanding' && (
        <div className="space-y-4">
          <div className="p-4 bg-amber-50/80 border border-amber-300 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-950">
            <div>
              <span className="text-[11px] font-black uppercase tracking-wider text-amber-800">
                Accounts Receivable Telemetry
              </span>
              <h3 className="text-base font-black text-amber-900 mt-0.5">
                Total Pending Balances: ₹{((summary?.totalOutstandingPaise || 0) / 100).toLocaleString('en-IN')}
              </h3>
              <p className="text-xs text-amber-700 font-medium">
                {outstandingInvoices.length} patient accounts have unpaid balances or partial installment dues.
              </p>
            </div>

            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-amber-700 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search patient, phone, UHID..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-white border border-amber-300 rounded-xl pl-9 pr-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-amber-600"
              />
            </div>
          </div>

          {outstandingInvoices.length === 0 ? (
            <div className="clinic-card p-12 text-center text-slate-500 bg-white border border-slate-200">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-800">Zero Outstanding Balances!</p>
              <p className="text-xs text-slate-500 mt-1">All invoices are settled in full.</p>
            </div>
          ) : (
            <div className="clinic-card bg-white border border-slate-200 overflow-hidden shadow-xs">
              {/* MOBILE VIEW: Outstanding Cards (< md) */}
              <div className="md:hidden divide-y divide-slate-100">
                {outstandingInvoices.map(inv => (
                  <div key={inv.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-mono font-bold text-teal-800 text-xs">{inv.invoiceNumber}</div>
                        <h4 className="font-black text-slate-900 text-sm mt-0.5">{inv.patient?.fullName}</h4>
                        <span className="font-mono text-xs text-slate-500">{inv.patient?.uhid}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-500 block uppercase font-bold">Balance Due</span>
                        <span className="text-base font-black text-rose-600 font-mono">
                          ₹{(inv.balancePaise / 100).toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-[10px] text-slate-500 block font-bold">Total Bill</span>
                        <span className="font-mono font-bold text-slate-900">
                          ₹{(inv.totalPaise / 100).toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-emerald-700 block font-bold">Paid</span>
                        <span className="font-mono font-bold text-emerald-800">
                          ₹{(inv.paidPaise / 100).toLocaleString('en-IN')}
                        </span>
                      </div>
                      {inv.patient?.phone && (
                        <div>
                          <a
                            href={`tel:${inv.patient.phone}`}
                            className="inline-flex items-center gap-1 text-teal-700 font-bold hover:underline"
                          >
                            <Phone className="w-3 h-3" />
                            <span>Call</span>
                          </a>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      {canRecordPayment && (
                        <button
                          onClick={() => setPaymentInvoice(inv)}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs py-2 px-3 rounded-xl transition-colors cursor-pointer text-center shadow-xs active:scale-98"
                        >
                          Collect Payment
                        </button>
                      )}
                      <button
                        onClick={() => setPrintInvoice(inv)}
                        className={`${!canRecordPayment ? 'flex-1' : ''} bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold text-xs py-2 px-3 rounded-xl transition-colors cursor-pointer text-center active:scale-98`}
                      >
                        Print
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* DESKTOP VIEW: Data Table (>= md) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[740px]">
                  <thead className="bg-slate-100 text-slate-800 font-black text-xs uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Patient / UHID</th>
                      <th className="py-3 px-4">Contact Phone</th>
                      <th className="py-3 px-4">Invoice #</th>
                      <th className="py-3 px-4 text-right">Total Bill (₹)</th>
                      <th className="py-3 px-4 text-right">Paid (₹)</th>
                      <th className="py-3 px-4 text-right">Balance Due (₹)</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {outstandingInvoices.map(inv => (
                      <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4">
                          <strong className="text-slate-900 block font-black">{inv.patient?.fullName}</strong>
                          <span className="font-mono text-xs text-slate-500 font-semibold">{inv.patient?.uhid}</span>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-700 font-semibold">
                          {inv.patient?.phone ? (
                            <a href={`tel:${inv.patient.phone}`} className="text-teal-700 hover:underline inline-flex items-center gap-1 font-bold">
                              <Phone className="w-3 h-3" />
                              <span>{inv.patient.phone}</span>
                            </a>
                          ) : '—'}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-teal-800">
                          {inv.invoiceNumber}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-slate-700">
                          ₹{(inv.totalPaise / 100).toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-700">
                          ₹{(inv.paidPaise / 100).toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-black text-rose-600 text-sm">
                          ₹{(inv.balancePaise / 100).toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-4 text-right space-x-1.5">
                          {canRecordPayment && (
                            <button
                              onClick={() => setPaymentInvoice(inv)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs py-1.5 px-3 rounded-lg transition-colors cursor-pointer shadow-xs active:scale-95"
                            >
                              Collect Payment
                            </button>
                          )}
                          <button
                            onClick={() => setPrintInvoice(inv)}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold text-xs py-1.5 px-3 rounded-lg transition-colors cursor-pointer active:scale-95"
                          >
                            Print
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: REFUNDS & ADJUSTMENTS */}
      {activeTab === 'refunds' && (
        <div className="space-y-4">
          <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl text-amber-950 space-y-1 shadow-xs">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-amber-700 shrink-0" />
              <h3 className="font-black text-sm text-amber-900">Financial Audit & Adjustment Governance</h3>
            </div>
            <p className="text-xs text-amber-800 leading-relaxed font-medium">
              In accordance with AKS Elite Dental Clinic billing protocol, independent refunds and financial credit adjustments require Clinic Admin approval. Every adjustment is recorded permanently in the system audit log.
            </p>
          </div>

          {refunds.length === 0 ? (
            <div className="clinic-card p-12 text-center text-slate-500 bg-white border border-slate-200">
              <AlertTriangle className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-800">No financial adjustments or refunds recorded</p>
              <p className="text-xs text-slate-500 mt-1">All clinical billing matches verified procedures without corrections.</p>
            </div>
          ) : (
            <div className="clinic-card bg-white border border-slate-200 overflow-hidden shadow-xs">
              {/* MOBILE VIEW: Refunds Cards (< md) */}
              <div className="md:hidden divide-y divide-slate-100">
                {refunds.map(ref => (
                  <div key={ref.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="font-mono text-xs font-bold text-teal-800">{ref.invoice?.invoiceNumber}</span>
                        <h4 className="font-black text-slate-900 text-sm">{ref.invoice?.patient?.fullName}</h4>
                      </div>
                      <span className="font-mono font-bold text-rose-600 text-sm">
                        ₹{(ref.amountPaise / 100).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">
                      Reason: {ref.reason}
                    </p>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                      <span>{new Date(ref.createdAt).toLocaleDateString('en-IN')}</span>
                      <span className="font-extrabold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded uppercase">
                        Admin Authorized
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* DESKTOP VIEW: Data Table (>= md) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[720px]">
                  <thead className="bg-slate-100 text-slate-800 font-black text-xs uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Invoice #</th>
                      <th className="py-3 px-4">Patient</th>
                      <th className="py-3 px-4">Adjustment Reason</th>
                      <th className="py-3 px-4 text-right">Amount (₹)</th>
                      <th className="py-3 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {refunds.map(ref => (
                      <tr key={ref.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-mono text-slate-600">
                          {new Date(ref.createdAt).toLocaleDateString('en-IN')}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-teal-800">
                          {ref.invoice?.invoiceNumber}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900">
                          {ref.invoice?.patient?.fullName}
                        </td>
                        <td className="py-3 px-4 text-slate-700">{ref.reason}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-rose-600">
                          ₹{(ref.amountPaise / 100).toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-900 border border-emerald-300 uppercase">
                            Admin Authorized
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Global Modals */}
      <InvoiceModal
        isOpen={createInvoiceOpen}
        preSelectedPatient={selectedBillingPatient}
        appointmentId={selectedAppointmentId}
        initialProcedures={prefilledProcedures}
        initialItems={prefilledProcedures.map(p => ({
          completedProcedureId: p.id || undefined,
          description: `${p.procedureName}${p.toothNumber ? ` - Tooth #${p.toothNumber}` : ''}`,
          toothNumber: p.toothNumber || undefined,
          quantity: 1,
          unitPriceRupees: Math.round(
            (p.feePaise !== undefined && p.feePaise !== null
              ? p.feePaise
              : (p.fee ? p.fee * 100 : 50000)) / 100
          ),
        }))}
        onClose={() => {
          setCreateInvoiceOpen(false);
          setSelectedBillingPatient(null);
          setSelectedAppointmentId(undefined);
          setPrefilledProcedures([]);
        }}
        onInvoiceCreated={created => {
          fetchBillingData(true);
          setCreateInvoiceOpen(false);
          setSelectedBillingPatient(null);
          setSelectedAppointmentId(undefined);
          setPrefilledProcedures([]);
          setPaymentInvoice(created);
          triggerClinicSync('invoice_created');
          showToast(`Invoice #${created.invoiceNumber || ''} created successfully! Record payment now.`);
        }}
        onCollectExistingPayment={inv => {
          setCreateInvoiceOpen(false);
          setSelectedBillingPatient(null);
          setSelectedAppointmentId(undefined);
          setPrefilledProcedures([]);
          setPaymentInvoice(inv);
        }}
      />

      <PaymentModal
        isOpen={Boolean(paymentInvoice)}
        onClose={() => setPaymentInvoice(null)}
        invoice={paymentInvoice}
        onPaymentSuccess={() => {
          fetchBillingData(true);
          triggerClinicSync('payment_recorded');
          showToast('Payment recorded successfully.');
        }}
      />

      <InvoicePrintModal
        isOpen={Boolean(printInvoice)}
        onClose={() => setPrintInvoice(null)}
        invoice={printInvoice}
      />

      {/* Daily EOD Reconciliation Modal */}
      {isEodModalOpen && (() => {
        const todayStr = new Date().toDateString();
        const todayPayments = payments.filter(p => new Date(p.receivedAt).toDateString() === todayStr);
        const cashTotal = todayPayments.filter(p => p.paymentMethod === 'CASH').reduce((sum, p) => sum + p.amountPaise, 0) / 100;
        const upiTotal = todayPayments.filter(p => p.paymentMethod === 'UPI').reduce((sum, p) => sum + p.amountPaise, 0) / 100;
        const cardTotal = todayPayments.filter(p => p.paymentMethod === 'CARD').reduce((sum, p) => sum + p.amountPaise, 0) / 100;
        const netbankingTotal = todayPayments.filter(p => p.paymentMethod === 'NETBANKING').reduce((sum, p) => sum + p.amountPaise, 0) / 100;
        const grandTotal = cashTotal + upiTotal + cardTotal + netbankingTotal;

        const handleShareEodWhatsApp = () => {
          const clinicName = user?.clinic?.name || 'AKS Elite Dental Clinic';
          const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
          const msg = `🦷 *${clinicName} — End-of-Day Financial Closing*
📅 *Date:* ${dateStr}

💵 *Total Collections Today:* ₹${grandTotal.toLocaleString('en-IN')}
• *UPI / QR / GPay:* ₹${upiTotal.toLocaleString('en-IN')} (${todayPayments.filter(p => p.paymentMethod === 'UPI').length} txns)
• *Cash in Drawer:* ₹${cashTotal.toLocaleString('en-IN')} (${todayPayments.filter(p => p.paymentMethod === 'CASH').length} txns)
• *Card (POS Machine):* ₹${cardTotal.toLocaleString('en-IN')} (${todayPayments.filter(p => p.paymentMethod === 'CARD').length} txns)
${netbankingTotal > 0 ? `• *Net Banking:* ₹${netbankingTotal.toLocaleString('en-IN')}\n` : ''}
📋 *Summary:*
• Total Transactions Settled: ${todayPayments.length}
• Total Outstanding Receivable: ₹${((summary?.totalOutstandingPaise || 0) / 100).toLocaleString('en-IN')}

_Automated EOD Closing Report • Generated by Dental Management System_`;

          openWhatsApp(user?.clinic?.phone || '+91 94431 55660', msg);
        };

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden p-6 text-xs space-y-5">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center">
                    <Calculator className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-black text-sm text-slate-900">Daily Cash & Collections Reconciliation</h3>
                    <p className="text-[11px] text-slate-500 font-medium">Closing ledger for {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })}</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsEodModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 bg-teal-50 border border-teal-200 rounded-xl text-center space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-teal-800">Total Net Collections Today</span>
                <p className="text-3xl font-black font-mono text-teal-950">₹{grandTotal.toLocaleString('en-IN')}</p>
                <span className="text-[11px] font-bold text-teal-700">{todayPayments.length} settled payments recorded today</span>
              </div>

              <div className="space-y-2.5">
                <span className="font-black text-slate-800 text-[11px] uppercase tracking-wider block">Collections by Tender Type</span>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="text-slate-500 font-bold block">UPI / GPay / QR</span>
                    <span className="text-base font-black font-mono text-slate-900">₹{upiTotal.toLocaleString('en-IN')}</span>
                    <span className="text-[10px] text-slate-400 font-semibold block">{todayPayments.filter(p => p.paymentMethod === 'UPI').length} payments</span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="text-slate-500 font-bold block">Physical Cash in Till</span>
                    <span className="text-base font-black font-mono text-slate-900">₹{cashTotal.toLocaleString('en-IN')}</span>
                    <span className="text-[10px] text-slate-400 font-semibold block">{todayPayments.filter(p => p.paymentMethod === 'CASH').length} payments</span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="text-slate-500 font-bold block">Card (EDC / POS)</span>
                    <span className="text-base font-black font-mono text-slate-900">₹{cardTotal.toLocaleString('en-IN')}</span>
                    <span className="text-[10px] text-slate-400 font-semibold block">{todayPayments.filter(p => p.paymentMethod === 'CARD').length} payments</span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="text-slate-500 font-bold block">Net Banking / Transfer</span>
                    <span className="text-base font-black font-mono text-slate-900">₹{netbankingTotal.toLocaleString('en-IN')}</span>
                    <span className="text-[10px] text-slate-400 font-semibold block">{todayPayments.filter(p => p.paymentMethod === 'NETBANKING').length} payments</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row justify-between gap-2">
                <button
                  type="button"
                  onClick={handleShareEodWhatsApp}
                  className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-all"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Share Closing Report via WhatsApp</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsEodModalOpen(false)}
                  className="py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 cursor-pointer text-center"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
