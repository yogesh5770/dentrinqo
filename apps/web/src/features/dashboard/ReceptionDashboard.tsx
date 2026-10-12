import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api';
import {
  Calendar,
  Clock,
  UserCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  PlusCircle,
  Search,
  ArrowRight,
  Filter,
  RefreshCw,
  Armchair,
  Stethoscope,
  Receipt,
  QrCode,
  Printer,
  Power,
  X,
  ExternalLink,
  Sparkles,
  Send,
  Bell,
  CreditCard,
  IndianRupee,
  Zap,
  Check,
  CheckCheck,
  MessageSquare,
  FastForward,
  KeyRound,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useClinicSync, triggerClinicSync, playClinicAlertChime } from '../../lib/sync';
import { QuickReconsultModal } from '../../components/QuickReconsultModal';
import { WalkinConsultModal } from '../../components/WalkinConsultModal';
import { VerifyFirstVisitModal } from '../../components/VerifyFirstVisitModal';

interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  patientUhid: string;
  dentistName: string;
  chairNumber: number;
  scheduledStart: string;
  scheduledEnd: string;
  durationMinutes: number;
  reason: string;
  status: 'SCHEDULED' | 'CONFIRMED' | 'CHECKED_IN' | 'CALLED' | 'IN_CHAIR' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
  checkInTime?: string | null;
  isConfirmedAtDesk?: boolean;
  tokenNumber?: number;
  trackingCode?: string;
  expectedChairNumber?: number;
  needsVerification?: boolean;
  source?: string;
}

interface ReceptionDashboardProps {
  onOpenNewPatient: () => void;
  onOpenBooking: () => void;
}

export type QueueTab = 'WAITING_LOBBY' | 'IN_TREATMENT' | 'READY_BILLING' | 'SCHEDULED' | 'COMPLETED' | 'ALL';

export const ReceptionDashboard: React.FC<ReceptionDashboardProps> = ({
  onOpenNewPatient,
  onOpenBooking,
}) => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterChair, setFilterChair] = useState<number | ''>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [activeQueueTab, setActiveQueueTab] = useState<QueueTab>('WAITING_LOBBY');
  const [settledApptIds, setSettledApptIds] = useState<Set<string>>(new Set());
  const [lobbyCode, setLobbyCode] = useState<string>('');
  const [lobbyCodeExpiresAt, setLobbyCodeExpiresAt] = useState<Date | null>(null);
  const [chairStatus, setChairStatus] = useState<Record<number, boolean>>({ 1: true, 2: true });
  const [togglingChair, setTogglingChair] = useState<number | null>(null);
  const [showQrModal, setShowQrModal] = useState<boolean>(false);
  const [quickReconsultOpen, setQuickReconsultOpen] = useState<boolean>(false);
  const [walkinModalOpen, setWalkinModalOpen] = useState<boolean>(false);
  const [verifyPatientModal, setVerifyPatientModal] = useState<{
    patientId: string;
    patientName: string;
    patientPhone: string;
    patientUhid?: string;
  } | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  const totalChairs = user?.clinic?.chairCount || 2;
  const clinicName = user?.clinic?.name || "Dental Clinic";
  const clinicCode = user?.clinic?.code || 'AKS';
  const [standeeType, setStandeeType] = useState<'DUAL' | 'CHECKIN' | 'WALKIN'>('DUAL');
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  // Single permanent laminated reception QR per clinic (no lobby code in URL)
  const checkInUrl = `${baseUrl}/check-in`;
  const walkinUrl = `${baseUrl}/check-in?mode=walkin`;
  const checkinQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(checkInUrl)}`;
  const walkinQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(walkinUrl)}`;
  const standeeUrl = standeeType === 'CHECKIN' ? checkInUrl : walkinUrl;
  const qrCodeUrl = standeeType === 'CHECKIN' ? checkinQrUrl : walkinQrUrl;

  // Quick Checkout Modal State
  const [checkoutAppt, setCheckoutAppt] = useState<Appointment | null>(null);
  const [checkoutItemDesc, setCheckoutItemDesc] = useState<string>('Dental Consultation & Examination');
  const [checkoutAmountRs, setCheckoutAmountRs] = useState<number>(300);
  const [checkoutPaymentMethod, setCheckoutPaymentMethod] = useState<'CASH' | 'UPI' | 'CARD'>('CASH');
  const [checkoutCashReceived, setCheckoutCashReceived] = useState<number | ''>(500);
  const [checkoutReferenceNumber, setCheckoutReferenceNumber] = useState<string>('');
  const [isProcessingCheckout, setIsProcessingCheckout] = useState<boolean>(false);
  const [checkoutSuccessReceipt, setCheckoutSuccessReceipt] = useState<{
    receiptNumber: string;
    invoiceNumber: string;
    patientName: string;
    amountRs: number;
    paymentMethod: string;
    phone: string;
  } | null>(null);

  const [receptionAlert, setReceptionAlert] = useState<{
    patientName: string;
    chairNumber: number;
    uhid: string;
    appointmentId?: string;
    patientId?: string;
  } | null>(null);

  const fetchTodayAppointments = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
      const [apptsData, invoicesData] = await Promise.all([
        apiRequest<Appointment[]>(`/appointments?date=${todayStr}`),
        apiRequest<any[]>('/billing/invoices').catch(() => []),
      ]);
      setAppointments(apptsData || []);

      if (Array.isArray(invoicesData)) {
        const paidPatients = new Set(
          invoicesData
            .filter((inv: any) => inv.status === 'PAID')
            .map((inv: any) => inv.patientId)
        );
        const settledIds = new Set<string>();
        (apptsData || []).forEach(a => {
          if (a.status === 'COMPLETED' && paidPatients.has(a.patientId)) {
            settledIds.add(a.id);
          }
        });
        setSettledApptIds(prev => new Set([...prev, ...settledIds]));
      }
    } catch (err) {
      console.error('Failed to load appointments', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchChairStatus = async () => {
    try {
      const res = await apiRequest<{ chairs: any }>('/appointments/public-chair-status');
      if (res) {
        if (Array.isArray(res.chairs)) {
          const map: Record<number, boolean> = {};
          res.chairs.forEach((c: any) => { map[c.chairNumber] = c.isActive; });
          setChairStatus(map);
        } else if (res.chairs) {
          setChairStatus(res.chairs);
        }
      }
    } catch (err) {
      console.error('Failed to load chair status', err);
    }
  };

  const fetchLobbyCode = async () => {
    try {
      const res = await apiRequest<{ code: string; expiresAt: string }>('/appointments/lobby-code');
      if (res && res.code) {
        setLobbyCode(res.code);
        setLobbyCodeExpiresAt(new Date(res.expiresAt));
        return;
      }
    } catch (err) {}

    try {
      const res2 = await apiRequest<{ code: string; expiresAt: string }>('/appointments/live-lobby-code');
      if (res2 && res2.code) {
        setLobbyCode(res2.code);
        setLobbyCodeExpiresAt(new Date(res2.expiresAt));
      }
    } catch (err) {}
  };

  const handleConfirmPresence = async (apptId: string) => {
    try {
      await apiRequest(`/appointments/${apptId}/confirm-presence`, {
        method: 'PATCH',
      });
      fetchTodayAppointments(true);
      triggerClinicSync('patient_presence_confirmed', { appointmentId: apptId });
    } catch (err: any) {
      alert(err.message || 'Failed to confirm desk presence');
    }
  };

  useEffect(() => {
    fetchTodayAppointments(false);
    fetchChairStatus();
    fetchLobbyCode();
    const lobbyTimer = setInterval(fetchLobbyCode, 30000);
    return () => clearInterval(lobbyTimer);
  }, []);

  useClinicSync((syncEv) => {
    fetchTodayAppointments(true);
    fetchChairStatus();
    if (syncEv?.reason === 'doctor_sent_to_reception' && syncEv?.payload) {
      playClinicAlertChime();
      setReceptionAlert({
        patientName: syncEv.payload.patientName || 'Patient',
        chairNumber: syncEv.payload.chairNumber || 1,
        uhid: syncEv.payload.patientUhid || '',
        appointmentId: syncEv.payload.appointmentId,
        patientId: syncEv.payload.patientId,
      });
      setActiveQueueTab('READY_BILLING');
    }
  });

  const handleToggleChair = async (chairNum: number, currentActive: boolean) => {
    setTogglingChair(chairNum);
    try {
      const nextState = !currentActive;
      await apiRequest('/appointments/chair-toggle', {
        method: 'PATCH',
        body: JSON.stringify({ chairNumber: chairNum, isActive: nextState }),
      });
      setChairStatus(prev => ({ ...prev, [chairNum]: nextState }));
      triggerClinicSync('chair_status_toggled');
    } catch (err: any) {
      alert(err.message || 'Failed to toggle operatory chair status');
    } finally {
      setTogglingChair(null);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: string, targetChair?: number, emergencyReason?: string) => {
    try {
      const payload: any = { status: newStatus };
      if (targetChair && targetChair >= 1 && targetChair <= 10) {
        payload.chairNumber = targetChair;
      }
      if (emergencyReason && emergencyReason.trim()) {
        payload.emergencyReason = emergencyReason.trim();
      }
      await apiRequest(`/appointments/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      fetchTodayAppointments(true);
      triggerClinicSync(`appointment_${newStatus}`, { appointmentId: id, status: newStatus, chairNumber: targetChair });
    } catch (err: any) {
      alert(err.message || 'Failed to update status');
    }
  };

  const handleOpenQuickCheckout = (appt: Appointment) => {
    setCheckoutAppt(appt);
    setCheckoutItemDesc(appt.reason || 'General Dental Consultation & Treatment');
    setCheckoutAmountRs(300);
    setCheckoutPaymentMethod('CASH');
    setCheckoutCashReceived(500);
    setCheckoutReferenceNumber('');
    setCheckoutSuccessReceipt(null);
  };

  const handleExecuteQuickCheckout = async () => {
    if (!checkoutAppt) return;
    setIsProcessingCheckout(true);
    try {
      const amountPaise = Math.round(Number(checkoutAmountRs) * 100);

      // 1. Create Invoice
      const invoiceRes = await apiRequest<any>('/billing/invoices', {
        method: 'POST',
        body: JSON.stringify({
          patientId: checkoutAppt.patientId,
          notes: `Visit with ${checkoutAppt.dentistName} - Operatory Chair #${checkoutAppt.chairNumber}`,
          items: [
            {
              description: checkoutItemDesc || 'Dental Consultation & Examination',
              quantity: 1,
              unitPricePaise: amountPaise,
            },
          ],
        }),
      });

      // 2. Record Payment
      const paymentRes = await apiRequest<any>('/billing/payments', {
        method: 'POST',
        body: JSON.stringify({
          invoiceId: invoiceRes.id,
          patientId: checkoutAppt.patientId,
          amountPaise: amountPaise,
          paymentMethod: checkoutPaymentMethod,
          referenceNumber: checkoutReferenceNumber || undefined,
          notes: `Instant Reception Desk Payment (${checkoutPaymentMethod})`,
        }),
      });

      // 3. Mark appointment completed if not already
      if (checkoutAppt.status !== 'COMPLETED') {
        await apiRequest(`/appointments/${checkoutAppt.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'COMPLETED' }),
        });
      }

      // 4. Mark as settled in state
      setSettledApptIds(prev => new Set(prev).add(checkoutAppt.id));

      // 5. Trigger sync
      triggerClinicSync('payment_recorded', {
        receiptNumber: paymentRes.receiptNumber,
        invoiceNumber: invoiceRes.invoiceNumber,
        amountRs: checkoutAmountRs,
      });
      triggerClinicSync('appt_COMPLETED');

      // 6. Show receipt summary
      setCheckoutSuccessReceipt({
        receiptNumber: paymentRes.receiptNumber,
        invoiceNumber: invoiceRes.invoiceNumber,
        patientName: checkoutAppt.patientName,
        amountRs: checkoutAmountRs,
        paymentMethod: checkoutPaymentMethod,
        phone: checkoutAppt.patientPhone,
      });

      fetchTodayAppointments(true);
    } catch (err: any) {
      alert(err.message || 'Failed to complete quick checkout');
    } finally {
      setIsProcessingCheckout(false);
    }
  };

  const handleReleaseLateSlot = async (appt: Appointment) => {
    if (!window.confirm(`Patient "${appt.patientName}" has not checked in within the 10-minute arrival grace period.\n\nRelease Operatory Chair #${appt.chairNumber} so you can seat the next waiting patient in the lobby?`)) {
      return;
    }
    try {
      await apiRequest(`/appointments/${appt.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'NO_SHOW',
          notes: '10-minute arrival grace period expired. Operatory chair released to seat next waiting patient.',
        }),
      });
      triggerClinicSync('chair_freed', { chairNumber: appt.chairNumber, patientName: appt.patientName });
      fetchTodayAppointments(true);
    } catch (err: any) {
      alert(err.message || 'Failed to release chair');
    }
  };

  // 10-Minute Late Grace Period Check
  const lateAppointments = appointments.filter(a => {
    const apptDate = new Date(a.scheduledStart);
    return Date.now() > (apptDate.getTime() + 10 * 60 * 1000) && ['SCHEDULED', 'CONFIRMED'].includes(a.status);
  });

  // KPI & Stage Calculations
  const totalToday = appointments.length;
  const waitingCount = appointments.filter(a => a.status === 'CHECKED_IN' || a.status === 'CALLED').length;
  const inChairCount = appointments.filter(a => a.status === 'IN_CHAIR').length;
  const readyBillingList = appointments.filter(a =>
    (a.status === 'COMPLETED' && !settledApptIds.has(a.id)) ||
    (receptionAlert && (a.id === receptionAlert.appointmentId || a.patientUhid === receptionAlert.uhid))
  );
  const readyBillingCount = readyBillingList.length;
  const scheduledCount = appointments.filter(a => ['SCHEDULED', 'CONFIRMED'].includes(a.status)).length;
  const completedSettledCount = appointments.filter(a => a.status === 'COMPLETED' && settledApptIds.has(a.id)).length;
  const completedCount = appointments.filter(a => a.status === 'COMPLETED').length;

  // Filtered appointments by Active Stage Tab and Chair
  const filtered = appointments.filter(a => {
    if (filterChair && a.chairNumber !== filterChair) return false;

    if (activeQueueTab === 'WAITING_LOBBY') {
      return a.status === 'CHECKED_IN' || a.status === 'CALLED';
    }
    if (activeQueueTab === 'IN_TREATMENT') {
      return a.status === 'IN_CHAIR';
    }
    if (activeQueueTab === 'READY_BILLING') {
      return (a.status === 'COMPLETED' && !settledApptIds.has(a.id)) ||
             (receptionAlert && (a.id === receptionAlert.appointmentId || a.patientUhid === receptionAlert.uhid));
    }
    if (activeQueueTab === 'SCHEDULED') {
      return ['SCHEDULED', 'CONFIRMED'].includes(a.status);
    }
    if (activeQueueTab === 'COMPLETED') {
      return a.status === 'COMPLETED' && settledApptIds.has(a.id);
    }
    // 'ALL'
    return true;
  });

  // Prioritize emergencies first, then ready for billing, called, waiting lobby, in-chair, on-time scheduled, then grace-expired
  const sortedFiltered = [...filtered].sort((a, b) => {
    const getPriority = (item: any) => {
      if (item.notes && item.notes.includes('[EMERGENCY ESCALATION]')) return 0; // Emergency top priority
      if (item.status === 'COMPLETED' && !settledApptIds.has(item.id)) return 1; // ready for billing
      if (item.status === 'CALLED') return 2; // called to operatory chair
      if (item.status === 'CHECKED_IN') return 3; // waiting lobby physically present
      if (item.status === 'IN_CHAIR') return 4;
      const aDate = new Date(item.scheduledStart);
      const isLate = Date.now() > (aDate.getTime() + 10 * 60 * 1000) && ['SCHEDULED', 'CONFIRMED'].includes(item.status);
      if (isLate) return 7; // grace expired moved to bottom of active visits
      if (['SCHEDULED', 'CONFIRMED'].includes(item.status)) return 5;
      return 6;
    };
    const pA = getPriority(a);
    const pB = getPriority(b);
    if (pA !== pB) return pA - pB;
    return new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime();
  });

  const statusBadge = (status: string, apptId: string, isConfirmedAtDesk?: boolean) => {
    const isReadyBilling = status === 'COMPLETED' && !settledApptIds.has(apptId);
    if (isReadyBilling) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-900 border border-emerald-300 animate-pulse">
          <Receipt className="w-3.5 h-3.5 text-emerald-700" />
          Ready for Bill
        </span>
      );
    }

    switch (status) {
      case 'CHECKED_IN':
        if (!isConfirmedAtDesk) {
          return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-amber-50 text-amber-950 border border-amber-300">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
              ⚠️ Standby (Desk Check Pending)
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-teal-100 text-teal-900 border border-teal-300">
            <Check className="w-3.5 h-3.5 text-teal-700" />
            Waiting in Lobby (Confirmed)
          </span>
        );
      case 'CALLED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-amber-400 text-slate-950 border border-amber-500 shadow-2xs animate-pulse">
            <Bell className="w-3.5 h-3.5 text-slate-950 animate-bounce" />
            📢 Called (Paging...)
          </span>
        );
      case 'IN_CHAIR':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-teal-100 text-teal-900 border border-teal-300">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-700"></span>
            In Treatment
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
            Completed & Settled
          </span>
        );
      case 'SCHEDULED':
      case 'CONFIRMED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-900 border border-blue-300">
            <Clock className="w-3.5 h-3.5 text-blue-700" />
            Scheduled
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-900 border border-rose-300">
            Cancelled
          </span>
        );
      case 'NO_SHOW':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-slate-200 text-slate-800 border border-slate-300">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            No-Show (Slot Freed)
          </span>
        );
      default:
        return <span className="text-xs font-bold text-slate-700">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Real-time alert when doctor completes consultation and sends patient to front desk */}
      {receptionAlert && (
        <div className="p-4 rounded-2xl bg-linear-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 border border-emerald-400/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5 text-white animate-bounce" />
            </div>
            <div>
              <div className="font-black text-sm">
                🔔 Patient Arrived at Reception Desk: {receptionAlert.patientName} {receptionAlert.uhid ? `(${receptionAlert.uhid})` : ''}
              </div>
              <div className="text-xs text-emerald-100 font-medium">
                Sent from Operatory Chair #{receptionAlert.chairNumber} — Consultation finalized, ready for Invoice & Payment.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={() => {
                const targetAppt = appointments.find(a => a.id === receptionAlert.appointmentId || a.patientUhid === receptionAlert.uhid);
                if (targetAppt) {
                  handleOpenQuickCheckout(targetAppt);
                } else {
                  navigate('/billing');
                }
                setReceptionAlert(null);
              }}
              className="px-4 py-2 rounded-xl bg-white text-emerald-950 font-black text-xs hover:bg-emerald-50 transition cursor-pointer shadow-xs flex items-center gap-1.5 active:scale-95"
            >
              <Zap className="w-3.5 h-3.5 text-emerald-600 fill-emerald-600" />
              <span>⚡ Quick Bill & Collect</span>
            </button>
            <button
              onClick={() => setReceptionAlert(null)}
              className="p-1.5 rounded-lg hover:bg-white/20 text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 10-Minute Arrival Grace Period Alert Banner */}
      {lateAppointments.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-200 text-amber-900 flex items-center justify-center font-bold shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <div className="font-black text-sm text-amber-900">
                ⏰ 10-Min Arrival Grace Period Expired ({lateAppointments.length} Patient{lateAppointments.length > 1 ? 's' : ''})
              </div>
              <div className="text-xs text-amber-800 font-medium">
                {lateAppointments.map(l => `${l.patientName} (Chair #${l.chairNumber})`).join(', ')} did not arrive within 10 minutes. Operatory chairs can be released to seat waiting lobby patients.
              </div>
            </div>
          </div>
          <button
            onClick={() => handleReleaseLateSlot(lateAppointments[0])}
            className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs transition cursor-pointer shadow-xs flex items-center gap-1.5 self-end sm:self-auto active:scale-95"
          >
            <FastForward className="w-3.5 h-3.5" />
            <span>Release Chair #{lateAppointments[0].chairNumber} to Waiting Patient</span>
          </button>
        </div>
      )}

      {/* Top Banner & Quick Actions */}
      <div className="clinic-card p-5 bg-white border border-slate-200 text-slate-900 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-teal-800 font-black text-xs uppercase tracking-wider">
            Clinic Dashboard
          </span>
          <h2 className="text-xl sm:text-2xl font-black mt-0.5 text-slate-900">Today's Patient Queue</h2>
          <p className="text-xs text-slate-500 font-semibold mt-0.5">
            Real-time appointment schedule and patient arrivals
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2.5 bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-400 text-amber-950 font-black text-xs py-2 px-3.5 rounded-xl shadow-xs">
            <KeyRound className="w-5 h-5 text-amber-700 shrink-0" />
            <div>
              <span className="text-[10px] uppercase tracking-wider text-amber-800 font-extrabold block -mb-0.5">
                Live TV Arrival Code
              </span>
              <div className="flex items-center gap-2">
                <strong className="font-mono text-base tracking-widest text-teal-950 bg-white px-2.5 py-0.5 rounded-lg border border-amber-300 shadow-2xs font-black">
                  {lobbyCode || '••••'}
                </strong>
                {lobbyCodeExpiresAt && (
                  <span className="text-[10px] text-amber-900 font-sans font-bold">
                    ({Math.max(0, Math.floor((lobbyCodeExpiresAt.getTime() - Date.now()) / 60000))}m)
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={() => navigate('/admin/duplicates')}
            className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-black text-xs py-2.5 px-3.5 rounded-xl shadow-xs transition-all cursor-pointer"
            title="Review and resolve duplicate patient files"
          >
            <span>👥 Duplicate Review</span>
          </button>

          <button
            onClick={() => setShowQrModal(true)}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs py-2.5 px-3.5 rounded-xl shadow-xs transition-all cursor-pointer"
            title="Print or view Lobby Standee QR Code for Walk-in Patient Self Check-in"
          >
            <QrCode className="w-4 h-4 text-teal-400" />
            <span>🖨️ Standee QR</span>
          </button>

          <button
            onClick={() => setWalkinModalOpen(true)}
            className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-black text-xs py-2.5 px-4 rounded-xl shadow-md transition-all cursor-pointer active:scale-95"
            title="Instant 1-Click Walk-in Registration, Token & Chair Dispatch"
          >
            <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
            <span>⚡ Walk-in Consultation</span>
          </button>

          <button
            onClick={() => setQuickReconsultOpen(true)}
            className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-black text-xs py-2.5 px-3.5 rounded-xl shadow-xs transition-all cursor-pointer active:scale-95"
            title="Re-Consult Returning Patient by Card Serial Number"
          >
            <Stethoscope className="w-4 h-4 text-white" />
            <span>Re-Consult Card #</span>
          </button>

          <button
            onClick={onOpenNewPatient}
            className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white font-black text-xs py-2.5 px-4 rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>+ Register Patient</span>
          </button>

          <button
            onClick={onOpenBooking}
            className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-xs py-2.5 px-4 rounded-xl border border-slate-300 transition-all cursor-pointer"
          >
            <Calendar className="w-4 h-4 text-teal-600" />
            <span>+ Book Appointment</span>
          </button>
        </div>
      </div>

      {/* Operatory Chair Commander & Live Dispatch Hub */}
      <div className="clinic-card p-5 bg-white border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center font-bold shrink-0">
              <Armchair className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-black text-slate-900">Operatory Chair Commander & Live Dispatch</h4>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-teal-100 text-teal-900">
                  Live Concurrency
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Live operatory room occupancy. Seat next waiting lobby patient with 1 click to any free chair.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Free</span>
            <span className="flex items-center gap-1.5 ml-2"><span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> In Treatment</span>
            <span className="flex items-center gap-1.5 ml-2"><span className="w-2.5 h-2.5 rounded-full bg-slate-300" /> Off Duty</span>
          </div>
        </div>

        {/* Chair Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: totalChairs }, (_, i) => i + 1).map(num => {
            const isActive = chairStatus[num] ?? true;
            const isToggling = togglingChair === num;
            const currentPatient = appointments.find(a => a.status === 'IN_CHAIR' && a.chairNumber === num);
            const calledPatient = appointments.find(a => a.status === 'CALLED' && a.chairNumber === num);
            const currentTokenIdx = currentPatient ? sortedFiltered.findIndex(a => a.id === currentPatient.id) + 1 : null;
            const calledTokenIdx = calledPatient ? sortedFiltered.findIndex(a => a.id === calledPatient.id) + 1 : null;
            const nextWaiting = sortedFiltered.find(a => a.status === 'CHECKED_IN');
            const nextWaitingToken = nextWaiting ? sortedFiltered.findIndex(a => a.id === nextWaiting.id) + 1 : null;

            // Check if next waiting patient requested a specific doctor
            const requestedDoctor = nextWaiting?.dentistName;
            const hasDoctorMismatch = requestedDoctor && !requestedDoctor.toLowerCase().includes('duty') && num !== nextWaiting?.chairNumber;

            let docLabel = 'Specialist Room';
            if (num === 1) docLabel = 'Chief Dental Surgeon';
            else if (num === 2) docLabel = 'Associate Dental Surgeon';
            else if (num === 3) docLabel = 'Specialist & Orthodontist';

            return (
              <div
                key={num}
                className={`rounded-2xl border p-4 transition-all flex flex-col justify-between space-y-3 shadow-2xs ${
                  !isActive
                    ? 'bg-slate-50/80 border-slate-200 text-slate-500 opacity-80'
                    : calledPatient
                    ? 'bg-amber-50/70 border-amber-400 text-slate-900 ring-2 ring-amber-300'
                    : currentPatient
                    ? 'bg-rose-50/40 border-rose-300 text-slate-900 ring-1 ring-rose-200'
                    : 'bg-emerald-50/40 border-emerald-300 text-slate-900 ring-1 ring-emerald-200'
                }`}
              >
                {/* Header */}
                <div className="flex items-center justify-between border-b pb-2.5 border-slate-200/60">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-3 h-3 rounded-full ${
                        !isActive
                          ? 'bg-slate-400'
                          : calledPatient
                          ? 'bg-amber-500 animate-ping'
                          : currentPatient
                          ? 'bg-rose-500 animate-pulse'
                          : 'bg-emerald-500 animate-pulse'
                      }`}
                    />
                    <div>
                      <div className="font-black text-sm text-slate-900 flex items-center gap-1.5">
                        <span>Chair #{num}</span>
                        <span className="text-[10px] text-slate-500 font-semibold">(Operatory #{num})</span>
                      </div>
                      <div className="text-[10px] font-bold text-teal-800">{docLabel}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        !isActive
                          ? 'bg-slate-200 text-slate-700'
                          : calledPatient
                          ? 'bg-amber-100 text-amber-950 border border-amber-400 font-black animate-pulse'
                          : currentPatient
                          ? 'bg-rose-100 text-rose-900 border border-rose-300'
                          : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                      }`}
                    >
                      {!isActive ? 'Off Duty' : calledPatient ? 'Paging Patient' : currentPatient ? 'In Treatment' : 'Free & Ready'}
                    </span>
                    <button
                      onClick={() => handleToggleChair(num, isActive)}
                      disabled={isToggling}
                      title={isActive ? 'Set Doctor Off-Duty' : 'Set Doctor On-Duty'}
                      className="p-1 rounded-lg hover:bg-slate-200 text-slate-500 transition cursor-pointer"
                    >
                      <Power className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Body Content */}
                <div className="min-h-[70px] flex flex-col justify-center text-xs">
                  {!isActive ? (
                    <div className="text-center py-2 text-slate-400 font-medium">
                      <p>Room temporarily closed or doctor off duty.</p>
                      <button
                        onClick={() => handleToggleChair(num, false)}
                        className="mt-1 text-[11px] text-teal-700 font-bold hover:underline cursor-pointer"
                      >
                        Activate Room
                      </button>
                    </div>
                  ) : calledPatient ? (
                    <div className="space-y-1.5 bg-white p-2.5 rounded-xl border border-amber-300 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-black text-[11px] bg-amber-500 text-slate-950 px-1.5 py-0.5 rounded animate-pulse">
                          PAGED TOKEN #{calledTokenIdx}
                        </span>
                        <span className="text-[10px] font-bold text-amber-900">
                          Walking in from lobby
                        </span>
                      </div>
                      <div
                        onClick={() => navigate(`/patients/${calledPatient.patientId}`)}
                        className="font-black text-slate-900 hover:text-teal-700 cursor-pointer text-sm truncate"
                      >
                        {calledPatient.patientName}
                      </div>
                      <p className="text-[11px] text-slate-600 line-clamp-1">
                        <strong>Reason:</strong> {calledPatient.reason}
                      </p>
                    </div>
                  ) : currentPatient ? (
                    <div className="space-y-1.5 bg-white p-2.5 rounded-xl border border-rose-200/80 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-black text-[11px] bg-slate-900 text-white px-1.5 py-0.5 rounded">
                          TOKEN #{currentTokenIdx}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500">
                          Dr. {currentPatient.dentistName}
                        </span>
                      </div>
                      <div
                        onClick={() => navigate(`/patients/${currentPatient.patientId}`)}
                        className="font-black text-slate-900 hover:text-teal-700 cursor-pointer text-sm truncate"
                      >
                        {currentPatient.patientName}
                      </div>
                      <p className="text-[11px] text-slate-600 line-clamp-1">
                        <strong>Reason:</strong> {currentPatient.reason}
                      </p>
                    </div>
                  ) : (
                    <div className="text-center py-1.5 bg-white/70 p-2.5 rounded-xl border border-emerald-200/80">
                      <p className="text-xs font-bold text-emerald-950 flex items-center justify-center gap-1">
                        <Check className="w-4 h-4 text-emerald-600" />
                        <span>Room Sanitized & Ready</span>
                      </p>
                      <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                        {nextWaiting
                          ? `Next waiting in lobby: ${nextWaiting.patientName} (Token #${nextWaitingToken})`
                          : 'No patients waiting in lobby right now.'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Footer Action */}
                <div>
                  {calledPatient ? (
                    <button
                      onClick={() => handleUpdateStatus(calledPatient.id, 'IN_CHAIR', num)}
                      className="w-full py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs shadow-xs transition active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Armchair className="w-4 h-4" />
                      <span>💺 Seat in Chair #{num} (Patient Seated)</span>
                    </button>
                  ) : currentPatient ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenQuickCheckout(currentPatient)}
                        className="flex-1 py-2 px-3 rounded-xl bg-linear-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-black text-xs shadow-xs transition active:scale-95 cursor-pointer flex items-center justify-center gap-1"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        <span>⚡ Bill & Discharge</span>
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(currentPatient.id, 'COMPLETED')}
                        className="py-2 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs border border-slate-300 transition cursor-pointer"
                        title="Mark procedure complete without instant checkout"
                      >
                        ✓ Done
                      </button>
                    </div>
                  ) : isActive && nextWaiting ? (
                    <div className="space-y-1.5">
                      {hasDoctorMismatch && (
                        <div className="text-[10px] text-amber-800 bg-amber-100/90 px-2 py-0.5 rounded-md border border-amber-300 font-bold">
                          ⚠️ Requested: {requestedDoctor}
                        </div>
                      )}
                      <button
                        onClick={() => handleUpdateStatus(nextWaiting.id, 'CALLED', num)}
                        className="w-full py-2.5 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-xs shadow-xs transition active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Bell className="w-4 h-4" />
                        <span>📢 Call Token #{nextWaitingToken} to Chair #{num}</span>
                      </button>
                    </div>
                  ) : (
                    <div className="text-center py-1.5 text-[11px] text-slate-400 font-semibold">
                      {isActive ? 'Awaiting next arrival' : 'Offline'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="clinic-card p-4 border border-blue-200 bg-blue-50/50">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-blue-900 uppercase tracking-wider">Today's Appointments</span>
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-900 flex items-center justify-center font-bold">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-blue-950 mt-2">{totalToday}</p>
          <span className="text-xs text-blue-800 font-semibold">Scheduled for today</span>
        </div>

        <div className="clinic-card p-4 border border-amber-300 bg-amber-50/50">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-amber-900 uppercase tracking-wider">Checked In</span>
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-900 flex items-center justify-center font-bold">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-amber-950 mt-2">{waitingCount}</p>
          <span className="text-xs text-amber-800 font-semibold">Waiting for doctor</span>
        </div>

        <div className="clinic-card p-4 border border-teal-200 bg-teal-50/50">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-teal-900 uppercase tracking-wider">In Treatment</span>
            <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-900 flex items-center justify-center font-bold">
              <Armchair className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-teal-950 mt-2">{inChairCount}</p>
          <span className="text-xs text-teal-800 font-semibold">In dental chair</span>
        </div>

        <div className="clinic-card p-4 border border-emerald-200 bg-emerald-50/50">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-emerald-900 uppercase tracking-wider">Completed Today</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-900 flex items-center justify-center font-bold">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-950 mt-2">{completedCount}</p>
          <span className="text-xs text-emerald-800 font-semibold">Visits finished</span>
        </div>
      </div>

      {/* Main Table: Today's Patient Queue with E-Commerce 5-Stage Funnel Tabs */}
      <div className="clinic-card bg-white border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-black text-slate-900 text-base">Patient Queue Pipeline</h3>
              <span className="text-[10px] font-black uppercase tracking-wider bg-teal-100 text-teal-900 px-2 py-0.5 rounded-full">
                Live E-Commerce Funnel
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Click any stage tab below to view and process patients without friction
            </p>
          </div>

          {/* Operatory Room Filter */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 font-bold text-xs hidden sm:inline">Room:</span>
            <select
              value={filterChair}
              onChange={e => setFilterChair(e.target.value ? Number(e.target.value) : '')}
              className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-slate-900 font-bold focus:outline-none focus:border-teal-600 shadow-2xs"
            >
              <option value="">All Rooms (Chairs 1-{totalChairs})</option>
              {Array.from({ length: totalChairs }, (_, i) => i + 1).map(c => (
                <option key={c} value={c}>Chair #{c} (Operatory #{c})</option>
              ))}
            </select>
          </div>
        </div>

        {/* E-Commerce Funnel Tabs */}
        <div className="px-3 sm:px-5 pt-2.5 pb-0 border-b border-slate-200 bg-slate-50/60 overflow-x-auto flex items-center gap-1.5 scrollbar-none">
          <button
            onClick={() => setActiveQueueTab('WAITING_LOBBY')}
            className={`py-2 px-3 rounded-t-xl text-xs font-black transition-all flex items-center gap-1.5 border-b-2 cursor-pointer shrink-0 ${
              activeQueueTab === 'WAITING_LOBBY'
                ? 'bg-white text-amber-950 border-amber-500 shadow-2xs ring-1 ring-slate-200/50'
                : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-100/60'
            }`}
          >
            <span>⏳ 1. Waiting in Lobby</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
              waitingCount > 0 ? 'bg-amber-100 text-amber-950 border border-amber-300' : 'bg-slate-200 text-slate-700'
            }`}>
              {waitingCount}
            </span>
          </button>

          <button
            onClick={() => setActiveQueueTab('IN_TREATMENT')}
            className={`py-2 px-3 rounded-t-xl text-xs font-black transition-all flex items-center gap-1.5 border-b-2 cursor-pointer shrink-0 ${
              activeQueueTab === 'IN_TREATMENT'
                ? 'bg-white text-teal-950 border-teal-600 shadow-2xs ring-1 ring-slate-200/50'
                : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-100/60'
            }`}
          >
            <span>🩺 2. In Treatment</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
              inChairCount > 0 ? 'bg-teal-100 text-teal-950 border border-teal-300' : 'bg-slate-200 text-slate-700'
            }`}>
              {inChairCount}
            </span>
          </button>

          <button
            onClick={() => setActiveQueueTab('READY_BILLING')}
            className={`py-2 px-3 rounded-t-xl text-xs font-black transition-all flex items-center gap-1.5 border-b-2 cursor-pointer shrink-0 ${
              activeQueueTab === 'READY_BILLING'
                ? 'bg-white text-emerald-950 border-emerald-500 shadow-2xs ring-1 ring-emerald-300'
                : readyBillingCount > 0
                ? 'text-emerald-900 bg-emerald-50 border-emerald-400 font-black animate-pulse'
                : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-100/60'
            }`}
          >
            <span>💳 3. Ready for Billing</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
              readyBillingCount > 0 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {readyBillingCount}
            </span>
          </button>

          <button
            onClick={() => setActiveQueueTab('SCHEDULED')}
            className={`py-2 px-3 rounded-t-xl text-xs font-black transition-all flex items-center gap-1.5 border-b-2 cursor-pointer shrink-0 ${
              activeQueueTab === 'SCHEDULED'
                ? 'bg-white text-blue-950 border-blue-600 shadow-2xs ring-1 ring-slate-200/50'
                : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-100/60'
            }`}
          >
            <span>📅 4. Scheduled</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-200 text-slate-700">
              {scheduledCount}
            </span>
          </button>

          <button
            onClick={() => setActiveQueueTab('COMPLETED')}
            className={`py-2 px-3 rounded-t-xl text-xs font-black transition-all flex items-center gap-1.5 border-b-2 cursor-pointer shrink-0 ${
              activeQueueTab === 'COMPLETED'
                ? 'bg-white text-slate-950 border-slate-700 shadow-2xs ring-1 ring-slate-200/50'
                : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-100/60'
            }`}
          >
            <span>✅ 5. Completed & Settled</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-200 text-slate-700">
              {completedSettledCount}
            </span>
          </button>

          <button
            onClick={() => setActiveQueueTab('ALL')}
            className={`py-2 px-3 rounded-t-xl text-xs font-black transition-all flex items-center gap-1.5 border-b-2 cursor-pointer shrink-0 ${
              activeQueueTab === 'ALL'
                ? 'bg-white text-slate-950 border-slate-900 shadow-2xs ring-1 ring-slate-200/50'
                : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-100/60'
            }`}
          >
            <span>📋 All Today ({totalToday})</span>
          </button>
        </div>

        {/* Table Content */}
        {filtered.length === 0 ? (
          <div className="p-12 text-center bg-white">
            <Calendar className="w-12 h-12 mx-auto text-teal-600/40 mb-3" />
            <p className="font-black text-base text-slate-900">
              {activeQueueTab === 'WAITING_LOBBY'
                ? 'No Patients Waiting in the Lobby'
                : activeQueueTab === 'IN_TREATMENT'
                ? 'No Patients Currently in Dental Chairs'
                : activeQueueTab === 'READY_BILLING'
                ? 'No Patients Waiting for Billing & Discharge'
                : activeQueueTab === 'SCHEDULED'
                ? 'No Upcoming Appointments Pending Arrival'
                : 'No Appointments Found in This View'}
            </p>
            <p className="text-xs text-slate-500 font-medium mt-1 max-w-md mx-auto">
              {activeQueueTab === 'WAITING_LOBBY'
                ? 'When a patient arrives or checks in via Walk-in Standee QR, they appear here.'
                : 'Use the quick buttons below to add or check in a patient.'}
            </p>
            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                onClick={onOpenNewPatient}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-black text-xs rounded-xl shadow-xs cursor-pointer"
              >
                + Register Patient
              </button>
              <button
                onClick={onOpenBooking}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-xs rounded-xl border border-slate-300 cursor-pointer"
              >
                + Book Appointment
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white">
            {/* MOBILE VIEW: Patient Queue Cards (< md) */}
            <div className="md:hidden divide-y divide-slate-100">
              {sortedFiltered.map((appt, idx) => {
                const startTime = new Date(appt.scheduledStart).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                });
                const isWalkin = appt.reason?.toLowerCase().includes('walk-in');
                const apptDate = new Date(appt.scheduledStart);
                const isOverdue = Date.now() > (apptDate.getTime() + 10 * 60 * 1000) && ['SCHEDULED', 'CONFIRMED'].includes(appt.status);
                const isReadyBilling = appt.status === 'COMPLETED' && !settledApptIds.has(appt.id);

                return (
                  <div
                    key={appt.id}
                    className={`p-4 space-y-3 transition-colors ${
                      isReadyBilling ? 'bg-emerald-50/50 border-l-4 border-emerald-500' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-900 text-white font-mono font-black text-[11px] shadow-2xs">
                            TOKEN #{appt.tokenNumber || (idx + 1)}
                          </span>
                          <span className="font-mono font-extrabold text-teal-800 text-xs">
                            {startTime}
                          </span>
                          <span className="text-[11px] text-slate-500 font-medium">
                            ({appt.durationMinutes}m)
                          </span>
                          {isOverdue && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black animate-pulse">
                              <AlertTriangle className="w-3 h-3 text-amber-700" />
                              10m Late (Grace Expired)
                            </span>
                          )}
                        </div>
                        <div
                          onClick={() => navigate(`/patients/${appt.patientId}`)}
                          className="font-black text-slate-900 hover:text-teal-700 cursor-pointer flex items-center gap-1.5 text-base mt-1"
                        >
                          <span>{appt.patientName}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-teal-600" />
                        </div>
                        <div className="text-xs text-slate-500 font-mono font-bold mt-0.5 flex items-center gap-2 flex-wrap">
                          <span>{appt.patientUhid} • {appt.patientPhone}</span>
                          {isWalkin ? (
                            <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-black text-[10px]">
                              🏥 WALK-IN
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-900 border border-blue-300 font-black text-[10px]">
                              🌐 ONLINE
                            </span>
                          )}
                          {appt.needsVerification && (
                            <button
                              onClick={() => setVerifyPatientModal({
                                patientId: appt.patientId,
                                patientName: appt.patientName,
                                patientPhone: appt.patientPhone,
                                patientUhid: appt.patientUhid,
                              })}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-[10px] shadow-xs cursor-pointer animate-pulse transition"
                              title="First-visit patient profile unverified. Click to confirm phone, DOB, address, and allergies."
                            >
                              <AlertTriangle className="w-2.5 h-2.5 text-slate-950 shrink-0" />
                              <span>⚠️ Verify Profile</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        {statusBadge(appt.status, appt.id, appt.isConfirmedAtDesk)}
                        <div className="mt-1.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 text-teal-900 font-bold border border-teal-200 text-[11px]">
                            <Armchair className="w-3 h-3 text-teal-700" />
                            Chair {appt.chairNumber}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs space-y-1">
                      <div className="text-slate-700 font-medium line-clamp-2">
                        <strong className="text-slate-900">Reason:</strong> {appt.reason}
                      </div>
                      <div className="text-slate-500 text-[11px]">
                        <strong>Doctor:</strong> {appt.dentistName}
                      </div>
                    </div>

                    {/* Mobile Action Buttons */}
                    <div className="flex items-center gap-2 pt-1 flex-wrap">
                      {appt.status === 'SCHEDULED' && (
                        <>
                          <button
                            onClick={() => handleUpdateStatus(appt.id, 'CHECKED_IN')}
                            className="flex-1 py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs transition-colors cursor-pointer shadow-xs text-center"
                          >
                            Check In
                          </button>
                          <a
                            href={`https://wa.me/${appt.patientPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hello ${appt.patientName}, your appointment at ${clinicName} was scheduled for today at ${startTime}. Are you arriving soon? Please reply so we can keep your room ready.`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="py-2 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs border border-emerald-200 transition-colors text-center"
                            title="Send WhatsApp arrival ping"
                          >
                            💬 Ping
                          </a>
                          {isOverdue ? (
                            <button
                              onClick={() => handleReleaseLateSlot(appt)}
                              className="py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs transition-colors cursor-pointer shadow-xs text-center flex items-center justify-center gap-1"
                              title="Patient is 10+ min late. Release chair to seat next waiting patient."
                            >
                              <FastForward className="w-3.5 h-3.5" />
                              <span>Release Chair to Next</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                if (window.confirm(`Mark ${appt.patientName} as No-Show?\n\nThis will immediately free Operatory Chair ${appt.chairNumber} so you can seat the next waiting walk-in patient.`)) {
                                  handleUpdateStatus(appt.id, 'NO_SHOW');
                                }
                              }}
                              className="py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs border border-rose-200 transition-colors cursor-pointer text-center"
                              title="Patient didn't show up. Release chair and slot."
                            >
                              No-Show
                            </button>
                          )}
                        </>
                      )}

                      {appt.status === 'CALLED' && (
                        <button
                          onClick={() => handleUpdateStatus(appt.id, 'IN_CHAIR', appt.chairNumber)}
                          className="flex-1 py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs transition-colors cursor-pointer shadow-xs text-center flex items-center justify-center gap-1.5 active:scale-95 animate-pulse"
                        >
                          <Armchair className="w-3.5 h-3.5" />
                          <span>💺 Seat in Chair #{appt.chairNumber} (Patient In Room)</span>
                        </button>
                      )}

                      {appt.status === 'CHECKED_IN' && (() => {
                        const freeChairs = Array.from({ length: totalChairs }, (_, i) => i + 1).filter(
                          c => (chairStatus[c] ?? true) && !appointments.some(a => (a.status === 'IN_CHAIR' || a.status === 'CALLED') && a.chairNumber === c)
                        );
                        return (
                          <div className="flex items-center gap-1.5 flex-1 flex-wrap">
                            {!appt.isConfirmedAtDesk ? (
                              <button
                                onClick={() => handleConfirmPresence(appt.id)}
                                className="flex-1 min-w-[140px] py-2 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-xs transition-colors cursor-pointer shadow-xs text-center flex items-center justify-center gap-1.5 active:scale-95"
                                title="Patient arrived at reception - confirm physical presence in waiting room"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                <span>✓ Confirm Desk Presence</span>
                              </button>
                            ) : (
                              freeChairs.map(c => (
                                <button
                                  key={c}
                                  onClick={() => handleUpdateStatus(appt.id, 'CALLED', c)}
                                  className={`flex-1 min-w-[110px] py-2 px-2.5 rounded-xl text-white font-black text-xs transition-colors cursor-pointer shadow-xs text-center flex items-center justify-center gap-1 active:scale-95 ${
                                    c === appt.chairNumber ? 'bg-teal-700 hover:bg-teal-800 ring-2 ring-teal-400' : 'bg-teal-600 hover:bg-teal-700'
                                  }`}
                                >
                                  <Bell className="w-3.5 h-3.5" />
                                  <span>📢 Call Chair #{c}</span>
                                </button>
                              ))
                            )}
                            <button
                              onClick={() => {
                                const reason = window.prompt(`Enter Clinical Reason for Emergency Escalation for ${appt.patientName} (e.g. Acute pulpitis / Severe pain / Bleeding / Facial trauma):`);
                                if (reason && reason.trim()) {
                                  handleUpdateStatus(appt.id, 'CHECKED_IN', undefined, reason.trim());
                                }
                              }}
                              className="py-2 px-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs border border-rose-300 transition cursor-pointer flex items-center gap-1"
                              title="Escalate to Emergency Priority #1 with recorded clinical reason"
                            >
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                              <span>🚨 Emergency</span>
                            </button>
                          </div>
                        );
                      })()}

                      {appt.status === 'IN_CHAIR' && (
                        <button
                          onClick={() => handleUpdateStatus(appt.id, 'COMPLETED')}
                          className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs transition-colors cursor-pointer shadow-xs text-center"
                        >
                          Complete Visit
                        </button>
                      )}

                      {['IN_CHAIR', 'COMPLETED'].includes(appt.status) && (
                        <button
                          onClick={() => handleOpenQuickCheckout(appt)}
                          className="flex-1 py-2 px-3 rounded-xl bg-linear-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-black text-xs transition-colors cursor-pointer shadow-xs text-center flex items-center justify-center gap-1 active:scale-95"
                          title="Instant 1-Click Billing & Checkout"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                          <span>⚡ Quick Bill & Collect</span>
                        </button>
                      )}

                      <button
                        onClick={() => navigate('/doctor')}
                        className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-colors cursor-pointer border border-slate-300 text-center"
                      >
                        Doctor Desk
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* DESKTOP VIEW: Queue Table (>= md) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[720px]">
                <thead className="bg-slate-100 border-b border-slate-200 text-slate-800 font-black uppercase tracking-wider text-xs">
                  <tr>
                    <th className="py-3 px-4">Token / Time</th>
                    <th className="py-3 px-4">Patient</th>
                    <th className="py-3 px-4">Operatory Room</th>
                    <th className="py-3 px-4">Reason for Visit</th>
                    <th className="py-3 px-4">Doctor</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedFiltered.map((appt, idx) => {
                    const startTime = new Date(appt.scheduledStart).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    });
                    const isWalkin = appt.reason?.toLowerCase().includes('walk-in');
                    const apptDate = new Date(appt.scheduledStart);
                    const isOverdue = Date.now() > (apptDate.getTime() + 10 * 60 * 1000) && ['SCHEDULED', 'CONFIRMED'].includes(appt.status);
                    const isReadyBilling = appt.status === 'COMPLETED' && !settledApptIds.has(appt.id);

                    return (
                      <tr
                        key={appt.id}
                        className={`transition-colors ${
                          isReadyBilling ? 'bg-emerald-50/50 hover:bg-emerald-50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-900 text-white font-mono font-black text-xs shadow-2xs">
                              TOKEN #{appt.tokenNumber || (idx + 1)}
                            </span>
                            <span className="text-slate-900 font-extrabold">{startTime}</span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                            <span className="text-[11px] text-slate-500 font-sans font-medium">
                              {appt.durationMinutes}m • {isWalkin ? '🏥 Walk-In' : '🌐 Online'}
                            </span>
                            {isOverdue && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black animate-pulse">
                                <AlertTriangle className="w-2.5 h-2.5 text-amber-700" />
                                10m Late (Grace Expired)
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div
                            onClick={() => navigate(`/patients/${appt.patientId}`)}
                            className="font-black text-slate-900 hover:text-teal-700 cursor-pointer flex items-center gap-1.5 text-sm"
                          >
                            <span>{appt.patientName}</span>
                            <ArrowRight className="w-3.5 h-3.5 text-teal-600" />
                          </div>
                          <div className="text-xs text-slate-600 font-mono font-bold mt-0.5 flex items-center gap-2">
                            <span>{appt.patientUhid} • {appt.patientPhone}</span>
                            {appt.needsVerification && (
                              <button
                                onClick={() => setVerifyPatientModal({
                                  patientId: appt.patientId,
                                  patientName: appt.patientName,
                                  patientPhone: appt.patientPhone,
                                  patientUhid: appt.patientUhid,
                                })}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-[10px] shadow-xs cursor-pointer animate-pulse transition"
                                title="First-visit patient profile unverified. Click to confirm phone, DOB, address, and allergies."
                              >
                                <AlertTriangle className="w-2.5 h-2.5 text-slate-950 shrink-0" />
                                <span>⚠️ Verify Profile</span>
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-teal-50 text-teal-900 font-bold border border-teal-200 text-xs">
                            <Armchair className="w-3.5 h-3.5 text-teal-700" />
                            Chair #{appt.chairNumber} (Operatory #{appt.chairNumber})
                          </span>
                        </td>
                        <td className="py-3.5 px-4 max-w-xs text-slate-800 font-medium text-xs">
                          {appt.reason}
                        </td>
                        <td className="py-3.5 px-4 text-slate-900 font-bold text-xs">
                          {appt.dentistName}
                        </td>
                        <td className="py-3.5 px-4">
                          {statusBadge(appt.status, appt.id, appt.isConfirmedAtDesk)}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {appt.status === 'SCHEDULED' && (
                              <>
                                <button
                                  onClick={() => handleUpdateStatus(appt.id, 'CHECKED_IN')}
                                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs transition-colors cursor-pointer shadow-xs"
                                >
                                  Check In
                                </button>
                                <a
                                  href={`https://wa.me/${appt.patientPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hello ${appt.patientName}, your appointment at ${clinicName} was scheduled for today at ${startTime}. Are you arriving soon? Please reply so we can keep your room ready.`)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-2 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs border border-emerald-200 transition-colors"
                                  title="Send WhatsApp arrival ping"
                                >
                                  💬 Ping
                                </a>
                                {isOverdue ? (
                                  <button
                                    onClick={() => handleReleaseLateSlot(appt)}
                                    className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-black text-xs transition-colors cursor-pointer shadow-xs flex items-center gap-1 active:scale-95"
                                    title="Patient is 10+ min late. Release chair to seat next waiting patient."
                                  >
                                    <FastForward className="w-3 h-3" />
                                    <span>Release Chair to Next</span>
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => {
                                      if (window.confirm(`Mark ${appt.patientName} as No-Show?\n\nThis will immediately free Operatory Chair ${appt.chairNumber} so you can seat the next waiting walk-in patient.`)) {
                                        handleUpdateStatus(appt.id, 'NO_SHOW');
                                      }
                                    }}
                                    className="px-2 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs border border-rose-200 transition-colors cursor-pointer"
                                    title="Patient didn't show up. Release chair and slot."
                                  >
                                    No-Show
                                  </button>
                                )}
                              </>
                            )}

                            {appt.status === 'CALLED' && (
                              <button
                                onClick={() => handleUpdateStatus(appt.id, 'IN_CHAIR', appt.chairNumber)}
                                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs transition-colors cursor-pointer shadow-xs flex items-center gap-1.5 active:scale-95 animate-pulse"
                              >
                                <Armchair className="w-3.5 h-3.5" />
                                <span>Seat in #{appt.chairNumber} (In Room)</span>
                              </button>
                            )}

                            {appt.status === 'CHECKED_IN' && (() => {
                              const freeChairs = Array.from({ length: totalChairs }, (_, i) => i + 1).filter(
                                c => (chairStatus[c] ?? true) && !appointments.some(a => (a.status === 'IN_CHAIR' || a.status === 'CALLED') && a.chairNumber === c)
                              );
                              return (
                                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                  {!appt.isConfirmedAtDesk ? (
                                    <button
                                      onClick={() => handleConfirmPresence(appt.id)}
                                      className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-black text-xs transition-colors cursor-pointer shadow-xs flex items-center gap-1.5 active:scale-95"
                                      title="Patient arrived at reception - confirm physical presence in waiting room"
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      <span>✓ Confirm Desk Presence</span>
                                    </button>
                                  ) : (
                                    freeChairs.map(c => (
                                      <button
                                        key={c}
                                        onClick={() => handleUpdateStatus(appt.id, 'CALLED', c)}
                                        className={`px-2.5 py-1.5 rounded-lg text-white font-black text-xs transition-all cursor-pointer shadow-xs flex items-center gap-1 active:scale-95 ${
                                          c === appt.chairNumber ? 'bg-teal-700 hover:bg-teal-800 ring-2 ring-teal-400' : 'bg-teal-600 hover:bg-teal-700'
                                        }`}
                                        title={`Page and call patient to Operatory Chair #${c}`}
                                      >
                                        <Bell className="w-3 h-3" />
                                        <span>Call #{c}</span>
                                      </button>
                                    ))
                                  )}
                                  <button
                                    onClick={() => {
                                      const reason = window.prompt(`Enter Clinical Reason for Emergency Escalation for ${appt.patientName} (e.g. Acute pulpitis / Severe pain / Bleeding / Facial trauma):`);
                                      if (reason && reason.trim()) {
                                        handleUpdateStatus(appt.id, 'CHECKED_IN', undefined, reason.trim());
                                      }
                                    }}
                                    className="px-2 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs border border-rose-300 transition cursor-pointer flex items-center gap-1"
                                    title="Escalate to Emergency Priority #1 with recorded clinical reason"
                                  >
                                    <AlertTriangle className="w-3 h-3 text-rose-600" />
                                    <span>🚨 Emergency</span>
                                  </button>
                                </div>
                              );
                            })()}

                            {appt.status === 'IN_CHAIR' && (
                              <button
                                onClick={() => handleUpdateStatus(appt.id, 'COMPLETED')}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs transition-colors cursor-pointer shadow-xs"
                              >
                                Complete Visit
                              </button>
                            )}

                            {['IN_CHAIR', 'COMPLETED'].includes(appt.status) && (
                              <button
                                onClick={() => handleOpenQuickCheckout(appt)}
                                className="px-3 py-1.5 rounded-lg bg-linear-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-black text-xs transition-colors cursor-pointer shadow-xs flex items-center gap-1 active:scale-95"
                                title="Instant 1-Click Billing & Checkout"
                              >
                                <Receipt className="w-3.5 h-3.5" />
                                <span>⚡ Quick Bill & Collect</span>
                              </button>
                            )}

                            <button
                              onClick={() => navigate('/doctor')}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-colors cursor-pointer border border-slate-300"
                            >
                              Doctor Desk
                            </button>
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

      {/* Instant 1-Click Quick Checkout Modal */}
      {checkoutAppt && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
            {checkoutSuccessReceipt ? (
              <div className="p-6 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900">Payment Collected & Settled!</h3>
                  <p className="text-xs text-slate-500 font-medium mt-1">
                    Patient has been discharged and Operatory Chair #{checkoutAppt.chairNumber} is officially available.
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-bold">Patient:</span>
                    <span className="font-black text-slate-900">{checkoutSuccessReceipt.patientName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-bold">Receipt #:</span>
                    <span className="font-mono font-black text-teal-800">{checkoutSuccessReceipt.receiptNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-bold">Invoice #:</span>
                    <span className="font-mono font-bold text-slate-700">{checkoutSuccessReceipt.invoiceNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-bold">Amount Paid:</span>
                    <span className="font-black text-emerald-700 text-sm">₹{checkoutSuccessReceipt.amountRs} ({checkoutSuccessReceipt.paymentMethod})</span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
                  <button
                    onClick={() => window.print()}
                    className="w-full sm:flex-1 py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-teal-400" />
                    <span>Print Receipt</span>
                  </button>

                  <a
                    href={`https://wa.me/${checkoutSuccessReceipt.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                      `Dear ${checkoutSuccessReceipt.patientName}, thank you for visiting ${clinicName}! Your payment of ₹${checkoutSuccessReceipt.amountRs} has been received (Receipt: ${checkoutSuccessReceipt.receiptNumber}). Keep smiling! For any questions, please contact our front desk.`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full sm:flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-xs text-center"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>WhatsApp Receipt</span>
                  </a>
                </div>

                <button
                  onClick={() => {
                    setCheckoutAppt(null);
                    setCheckoutSuccessReceipt(null);
                  }}
                  className="w-full py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 font-bold text-xs text-slate-700 cursor-pointer"
                >
                  Close & Return to Queue
                </button>
              </div>
            ) : (
              <div>
                {/* Header */}
                <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                      <Receipt className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-black text-slate-900 text-sm">Quick Bill & Checkout</h3>
                      <p className="text-[11px] text-slate-500 font-semibold">
                        Instant invoice & payment in 1 click
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setCheckoutAppt(null)}
                    className="p-1.5 rounded-xl hover:bg-slate-200 text-slate-500 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Patient Summary Card */}
                <div className="p-4 bg-teal-50/50 border-b border-teal-100 flex items-center justify-between">
                  <div>
                    <h4 className="font-black text-slate-900 text-sm">{checkoutAppt.patientName}</h4>
                    <p className="text-xs text-slate-500 font-mono font-bold">
                      {checkoutAppt.patientUhid} • {checkoutAppt.patientPhone}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] font-black uppercase px-2 py-0.5 rounded-full bg-teal-100 text-teal-900 border border-teal-300">
                      Chair #{checkoutAppt.chairNumber}
                    </span>
                    <p className="text-[11px] text-slate-600 font-bold mt-0.5">{checkoutAppt.dentistName}</p>
                  </div>
                </div>

                {/* Form Body */}
                <div className="p-5 space-y-4">
                  {/* Service / Consultation Item Description */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Consultation / Procedure Description
                    </label>
                    <input
                      type="text"
                      value={checkoutItemDesc}
                      onChange={e => setCheckoutItemDesc(e.target.value)}
                      className="w-full text-xs font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl p-2.5 focus:border-teal-600 focus:bg-white"
                      placeholder="e.g. Dental Consultation & Cleaning"
                    />
                  </div>

                  {/* Consultation / Treatment Fee with Quick Chips */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center justify-between">
                      <span>Total Amount to Collect (₹)</span>
                      <span className="text-emerald-700 font-black">All Inclusive</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-400 font-bold text-sm">₹</span>
                      <input
                        type="number"
                        min="0"
                        value={checkoutAmountRs}
                        onChange={e => setCheckoutAmountRs(Number(e.target.value))}
                        className="w-full pl-8 pr-3 py-2 text-sm font-black text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:border-teal-600 focus:bg-white"
                      />
                    </div>
                    {/* Quick amount presets */}
                    <div className="flex items-center gap-1.5 mt-2">
                      {[300, 500, 800, 1000, 1500, 2500].map(amt => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setCheckoutAmountRs(amt)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                            checkoutAmountRs === amt
                              ? 'bg-teal-600 text-white shadow-2xs'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                          }`}
                        >
                          ₹{amt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Payment Method Selector */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1.5">
                      Payment Mode
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setCheckoutPaymentMethod('CASH')}
                        className={`p-2.5 rounded-xl border text-xs font-black transition-all flex flex-col items-center gap-1 cursor-pointer ${
                          checkoutPaymentMethod === 'CASH'
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-950 shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <span className="text-base">💵</span>
                        <span>Cash</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setCheckoutPaymentMethod('UPI')}
                        className={`p-2.5 rounded-xl border text-xs font-black transition-all flex flex-col items-center gap-1 cursor-pointer ${
                          checkoutPaymentMethod === 'UPI'
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-950 shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <span className="text-base">📱</span>
                        <span>UPI / QR</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setCheckoutPaymentMethod('CARD')}
                        className={`p-2.5 rounded-xl border text-xs font-black transition-all flex flex-col items-center gap-1 cursor-pointer ${
                          checkoutPaymentMethod === 'CARD'
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-950 shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <span className="text-base">💳</span>
                        <span>POS Card</span>
                      </button>
                    </div>
                  </div>

                  {/* Dynamic Section: Cash Change Calculator */}
                  {checkoutPaymentMethod === 'CASH' && (
                    <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-3.5 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <label className="font-bold text-emerald-950">Cash Handed by Patient (₹):</label>
                        <input
                          type="number"
                          value={checkoutCashReceived}
                          onChange={e => setCheckoutCashReceived(e.target.value ? Number(e.target.value) : '')}
                          placeholder="e.g. 500"
                          className="w-24 px-2 py-1 bg-white border border-emerald-300 rounded-lg text-right font-black text-xs text-slate-900"
                        />
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-emerald-200/60">
                        <span className="text-xs font-bold text-emerald-900">Change to Return:</span>
                        <span className="font-mono font-black text-base text-emerald-800 bg-white px-2.5 py-0.5 rounded-lg border border-emerald-300">
                          ₹{Math.max(0, (Number(checkoutCashReceived) || 0) - checkoutAmountRs)}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Dynamic Section: Live UPI QR Code */}
                  {checkoutPaymentMethod === 'UPI' && (
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center space-y-3">
                      <p className="text-xs font-bold text-slate-800">
                        Ask patient to scan with GPay, PhonePe, or Paytm:
                      </p>
                      <div className="bg-white p-2.5 rounded-xl border border-slate-200 inline-block shadow-xs">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                            `upi://pay?pa=${user?.clinic?.upiVpa || 'akselitedental@icici'}&pn=${encodeURIComponent(clinicName)}&am=${checkoutAmountRs}&cu=INR`
                          )}`}
                          alt="UPI Payment QR"
                          className="w-40 h-40 mx-auto"
                        />
                      </div>
                      <input
                        type="text"
                        value={checkoutReferenceNumber}
                        onChange={e => setCheckoutReferenceNumber(e.target.value)}
                        placeholder="UTR / Ref Number (Optional)"
                        className="w-full text-xs font-bold text-slate-900 bg-white border border-slate-300 rounded-xl p-2 text-center"
                      />
                    </div>
                  )}

                  {checkoutPaymentMethod === 'CARD' && (
                    <div>
                      <label className="block text-xs font-bold text-slate-800 mb-1">
                        Card Machine Auth / Approval Code (Optional)
                      </label>
                      <input
                        type="text"
                        value={checkoutReferenceNumber}
                        onChange={e => setCheckoutReferenceNumber(e.target.value)}
                        placeholder="e.g. AUTH-982314"
                        className="w-full text-xs font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl p-2.5"
                      />
                    </div>
                  )}
                </div>

                {/* Footer Action */}
                <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setCheckoutAppt(null)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-200 border border-slate-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isProcessingCheckout || checkoutAmountRs < 0}
                    onClick={handleExecuteQuickCheckout}
                    className="px-5 py-2.5 rounded-xl text-xs font-black text-white bg-linear-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 shadow-sm transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                  >
                    <Receipt className="w-4 h-4" />
                    <span>
                      {isProcessingCheckout
                        ? 'Recording...'
                        : `Collect ₹${checkoutAmountRs} & Complete Checkout`}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Printable Hospital Lobby Standee QR Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
          <div className={`bg-white w-full ${standeeType === 'DUAL' ? 'max-w-4xl' : 'max-w-md'} rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in duration-150 my-6`}>
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-teal-600" />
                <h3 className="font-black text-slate-900 text-sm">Hospital Entrance Standee & Counter Placard QR</h3>
              </div>
              <button
                onClick={() => setShowQrModal(false)}
                className="p-1.5 rounded-xl hover:bg-slate-200 text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Standee Mode Switcher: 3 Options */}
            <div className="p-3 bg-slate-100/90 border-b border-slate-200 grid grid-cols-3 gap-2 text-xs font-black">
              <button
                type="button"
                onClick={() => setStandeeType('DUAL')}
                className={`py-2 px-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  standeeType === 'DUAL'
                    ? 'bg-teal-700 text-white border-teal-800 shadow-xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span>🖨️ Dual A4 Placard</span>
              </button>
              <button
                type="button"
                onClick={() => setStandeeType('CHECKIN')}
                className={`py-2 px-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  standeeType === 'CHECKIN'
                    ? 'bg-teal-700 text-white border-teal-800 shadow-xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span>📱 Check-In QR</span>
              </button>
              <button
                type="button"
                onClick={() => setStandeeType('WALKIN')}
                className={`py-2 px-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  standeeType === 'WALKIN'
                    ? 'bg-teal-700 text-white border-teal-800 shadow-xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span>🏥 Walk-In QR</span>
              </button>
            </div>

            {standeeType === 'DUAL' ? (
              /* DUAL A4 STANDEE POSTER PREVIEW */
              <div className="p-6 bg-white space-y-6 text-center">
                {/* Clinic Letterhead */}
                <div className="flex flex-col items-center border-b border-slate-100 pb-4">
                  <div className="w-14 h-14 rounded-2xl bg-teal-50 border border-teal-200 p-2 shadow-xs mb-2 flex items-center justify-center">
                    <img src="/logo.png" alt={clinicName} className="w-full h-full object-contain" />
                  </div>
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">{clinicName}</h2>
                  <span className="text-xs font-black text-teal-800 uppercase tracking-widest bg-teal-50 px-3 py-0.5 rounded-full border border-teal-200 mt-1">
                    Hospital Entrance Smart Arrival Desk
                  </span>
                </div>

                {/* Side-by-Side Dual QRs */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
                  {/* Left Column: Arrival Check-In for Online Bookings */}
                  <div className="p-5 rounded-2xl border-2 border-emerald-400 bg-emerald-50/40 flex flex-col items-center text-center space-y-3">
                    <span className="px-3 py-1 rounded-full bg-emerald-700 text-white text-[11px] font-black uppercase tracking-wider shadow-2xs">
                      QR 1: Booked Online in Advance?
                    </span>
                    <h4 className="text-base font-black text-slate-900">
                      📱 Arrival Self Check-In
                    </h4>
                    <p className="text-xs text-slate-600 font-medium leading-relaxed">
                      If you booked on our website, scan here to check in and claim your live waiting token.
                    </p>

                    <div className="p-3 bg-white rounded-2xl border border-emerald-300 shadow-sm inline-block">
                      <img
                        src={checkinQrUrl}
                        alt="Scan to Self Check-In"
                        className="w-44 h-44 mx-auto rounded-lg"
                      />
                    </div>

                    <div className="w-full bg-white rounded-xl p-3 text-left border border-emerald-200 text-xs space-y-1.5 text-slate-700">
                      <div className="flex items-center gap-2 font-bold text-[11px]">
                        <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[9px] font-black shrink-0">1</span>
                        <span>Scan with phone camera</span>
                      </div>
                      <div className="flex items-center gap-2 font-bold text-[11px]">
                        <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[9px] font-black shrink-0">2</span>
                        <span>Enter registered mobile #</span>
                      </div>
                      <div className="flex items-center gap-2 font-bold text-[11px]">
                        <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[9px] font-black shrink-0">3</span>
                        <span>Receive live <strong>TOKEN #</strong> & relax in lounge</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Walk-In Instant Queue */}
                  <div className="p-5 rounded-2xl border-2 border-teal-500 bg-teal-50/40 flex flex-col items-center text-center space-y-3">
                    <span className="px-3 py-1 rounded-full bg-teal-800 text-white text-[11px] font-black uppercase tracking-wider shadow-2xs">
                      QR 2: Hospital Walk-In Arrival
                    </span>
                    <h4 className="text-base font-black text-slate-900">
                      🏥 Hospital Walk-In Queue
                    </h4>
                    <p className="text-xs text-slate-600 font-medium leading-relaxed">
                      Arrived without booking? Scan here to register and immediately enter the doctor's queue.
                    </p>

                    <div className="p-3 bg-white rounded-2xl border border-teal-300 shadow-sm inline-block">
                      <img
                        src={walkinQrUrl}
                        alt="Scan for Walk-In Queue"
                        className="w-44 h-44 mx-auto rounded-lg"
                      />
                    </div>

                    <div className="w-full bg-white rounded-xl p-3 text-left border border-teal-200 text-xs space-y-1.5 text-slate-700">
                      <div className="flex items-center gap-2 font-bold text-[11px]">
                        <span className="w-4 h-4 rounded-full bg-teal-700 text-white flex items-center justify-center text-[9px] font-black shrink-0">1</span>
                        <span>Scan with phone camera</span>
                      </div>
                      <div className="flex items-center gap-2 font-bold text-[11px]">
                        <span className="w-4 h-4 rounded-full bg-teal-700 text-white flex items-center justify-center text-[9px] font-black shrink-0">2</span>
                        <span>Enter Name & chief complaint</span>
                      </div>
                      <div className="flex items-center gap-2 font-bold text-[11px]">
                        <span className="w-4 h-4 rounded-full bg-teal-700 text-white flex items-center justify-center text-[9px] font-black shrink-0">3</span>
                        <span>Auto-checked in with <strong>TOKEN #</strong></span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Print and Links Action Footer */}
                <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={() => window.print()}
                    className="py-3 px-6 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-colors active:scale-95"
                  >
                    <Printer className="w-4 h-4" />
                    <span>🖨️ Print Counter Placard (A4 Poster)</span>
                  </button>
                  <a
                    href={checkInUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 border border-slate-300 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Test Check-In URL</span>
                  </a>
                  <a
                    href={walkinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 border border-slate-300 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Test Walk-In URL</span>
                  </a>
                </div>
              </div>
            ) : (
              /* SINGLE STANDEE PREVIEW */
              <div className="p-6 text-center bg-white space-y-4">
                {/* Clinic Branding */}
                <div className="flex flex-col items-center">
                  <div className="w-16 h-16 rounded-2xl bg-teal-50 border border-teal-200 p-2 shadow-xs mb-2 flex items-center justify-center">
                    <img src="/logo.png" alt={clinicName} className="w-full h-full object-contain" />
                  </div>
                  <h2 className="text-lg font-black text-slate-900 tracking-tight">{clinicName}</h2>
                  <span className="text-[11px] font-black text-teal-800 uppercase tracking-widest bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-200 mt-1">
                    {standeeType === 'CHECKIN' ? 'Patient Arrival Self Check-In Desk' : 'Walk-In Instant Queue Desk'}
                  </span>
                </div>

                {/* QR Code Container */}
                <div className="p-4 bg-gradient-to-b from-teal-500/10 to-teal-500/5 rounded-2xl border-2 border-dashed border-teal-400 inline-block">
                  <img
                    src={qrCodeUrl}
                    alt={standeeType === 'CHECKIN' ? 'Scan to Self Check-In' : 'Scan for Instant Queue Token'}
                    className="w-48 h-48 sm:w-56 sm:h-56 mx-auto rounded-xl shadow-xs bg-white p-2"
                  />
                </div>

                {standeeType === 'WALKIN' && (
                  <div className="flex items-center justify-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-300 rounded-full text-xs font-black text-amber-900 shadow-2xs">
                      <span>🔑 Today's Walk-in Code:</span>
                      <span className="font-mono text-sm tracking-wider text-teal-800 bg-white px-2 py-0.5 rounded-md border border-amber-200">{lobbyCode || 'TODAY'}</span>
                    </span>
                  </div>
                )}

                <div>
                  <h4 className="text-base font-black text-slate-900">
                    {standeeType === 'CHECKIN' ? '⚡ ARRIVED AT HOSPITAL? SCAN TO CHECK IN' : '⚡ WALK-IN INSTANT QUEUE & AUTO CHECK-IN'}
                  </h4>
                  <p className="text-xs text-slate-600 font-medium max-w-xs mx-auto mt-1">
                    {standeeType === 'CHECKIN'
                      ? 'Booked online in advance? Scan with your phone camera, confirm your phone number, and enter the lobby queue immediately.'
                      : 'Skip the reception counter! Scan with your phone, register your details, and automatically enter the active waiting queue.'}
                  </p>
                </div>

                {/* 3 Step Instructions */}
                <div className="bg-slate-50 rounded-xl p-3 text-left border border-slate-200 text-xs space-y-2 text-slate-700">
                  {standeeType === 'CHECKIN' ? (
                    <>
                      <div className="flex items-center gap-2 font-semibold">
                        <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-[10px] font-black shrink-0">1</span>
                        <span>Point your phone camera at the QR code</span>
                      </div>
                      <div className="flex items-center gap-2 font-semibold">
                        <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-[10px] font-black shrink-0">2</span>
                        <span>Enter your 10-digit mobile number or Reference code</span>
                      </div>
                      <div className="flex items-center gap-2 font-semibold">
                        <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-[10px] font-black shrink-0">3</span>
                        <span>Receive your live <strong>TOKEN #</strong> & relax in lobby</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 font-semibold">
                        <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-[10px] font-black shrink-0">1</span>
                        <span>Point your phone camera at the QR code</span>
                      </div>
                      <div className="flex items-center gap-2 font-semibold">
                        <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-[10px] font-black shrink-0">2</span>
                        <span>Enter Name, Mobile & chief complaint</span>
                      </div>
                      <div className="flex items-center gap-2 font-semibold">
                        <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-[10px] font-black shrink-0">3</span>
                        <span>Instantly checked-in with <strong>TOKEN #</strong></span>
                      </div>
                    </>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={() => window.print()}
                    className="flex-1 py-3 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-colors"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Print Standee / Poster</span>
                  </button>
                  <a
                    href={standeeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-xs flex items-center justify-center gap-1.5 border border-slate-300 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Open URL</span>
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick Serial # Re-Consultation Modal */}
      <QuickReconsultModal
        isOpen={quickReconsultOpen}
        onClose={() => setQuickReconsultOpen(false)}
        onPatientSelected={() => {
          fetchTodayAppointments(true);
        }}
        onOpenNewPatientWithSerial={() => {
          onOpenNewPatient();
        }}
      />

      {/* Instant 1-Click Walk-in Registration, Token & Chair Dispatch Modal */}
      <WalkinConsultModal
        isOpen={walkinModalOpen}
        onClose={() => setWalkinModalOpen(false)}
        onSuccess={() => {
          fetchTodayAppointments(true);
        }}
      />

      {/* Desk Verification Modal for First-Visit Patients */}
      <VerifyFirstVisitModal
        isOpen={Boolean(verifyPatientModal)}
        onClose={() => setVerifyPatientModal(null)}
        patient={verifyPatientModal}
        onVerified={() => {
          fetchTodayAppointments(true);
        }}
      />
    </div>
  );
};