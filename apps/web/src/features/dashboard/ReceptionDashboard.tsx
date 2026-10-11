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
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useClinicSync, triggerClinicSync } from '../../lib/sync';

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
  status: 'SCHEDULED' | 'CONFIRMED' | 'CHECKED_IN' | 'IN_CHAIR' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
  checkInTime?: string | null;
}

interface ReceptionDashboardProps {
  onOpenNewPatient: () => void;
  onOpenBooking: () => void;
}

export const ReceptionDashboard: React.FC<ReceptionDashboardProps> = ({
  onOpenNewPatient,
  onOpenBooking,
}) => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterChair, setFilterChair] = useState<number | ''>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [lobbyCode, setLobbyCode] = useState<string>('');
  const [chairStatus, setChairStatus] = useState<Record<number, boolean>>({ 1: true, 2: true });
  const [togglingChair, setTogglingChair] = useState<number | null>(null);
  const [showQrModal, setShowQrModal] = useState<boolean>(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const totalChairs = user?.clinic?.chairCount || 3;
  const clinicName = user?.clinic?.name || 'AKS Elite Dental Clinic';
  const standeeUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/book?mode=walkin${lobbyCode ? `&code=${lobbyCode}` : ''}`
    : `https://aksdental.duckdns.org/book?mode=walkin${lobbyCode ? `&code=${lobbyCode}` : ''}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(standeeUrl)}`;

  const fetchTodayAppointments = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const data = await apiRequest<Appointment[]>(`/appointments?date=${todayStr}`);
      setAppointments(data || []);
    } catch (err) {
      console.error('Failed to load appointments', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchChairStatus = async () => {
    try {
      const res = await apiRequest<{ chairs: any; lobbyCode?: string }>('/appointments/public-chair-status');
      if (res) {
        if (Array.isArray(res.chairs)) {
          const map: Record<number, boolean> = {};
          res.chairs.forEach((c: any) => { map[c.chairNumber] = c.isActive; });
          setChairStatus(map);
        } else if (res.chairs) {
          setChairStatus(res.chairs);
        }
        if (res.lobbyCode) {
          setLobbyCode(res.lobbyCode);
        }
      }
    } catch (err) {
      console.error('Failed to load chair status', err);
    }
  };

  useEffect(() => {
    fetchTodayAppointments(false);
    fetchChairStatus();
  }, []);

  useClinicSync(() => {
    fetchTodayAppointments(true);
    fetchChairStatus();
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

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      await apiRequest(`/appointments/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      fetchTodayAppointments(true);
      triggerClinicSync(`appointment_${newStatus}`);
    } catch (err: any) {
      alert(err.message || 'Failed to update status');
    }
  };

  // KPI Calculations
  const totalToday = appointments.length;
  const waitingCount = appointments.filter(a => a.status === 'CHECKED_IN').length;
  const inChairCount = appointments.filter(a => a.status === 'IN_CHAIR').length;
  const completedCount = appointments.filter(a => a.status === 'COMPLETED').length;

  const filtered = appointments.filter(a => {
    if (filterChair && a.chairNumber !== filterChair) return false;
    if (filterStatus && a.status !== filterStatus) return false;
    return true;
  });

  const statusBadge = (status: string) => {
    switch (status) {
      case 'CHECKED_IN':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-900 border border-amber-300">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
            Checked In
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
            Completed
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
          <button
            onClick={() => setShowQrModal(true)}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs py-2.5 px-3.5 rounded-xl shadow-xs transition-all cursor-pointer"
            title="Print or view Lobby Standee QR Code for Walk-in Patient Self Check-in"
          >
            <QrCode className="w-4 h-4 text-teal-400" />
            <span>🖨️ Standee QR</span>
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

      {/* Operatory Chairs Real-Time Active / Off-Duty Control Bar */}
      <div className="clinic-card p-4 bg-white border border-slate-200 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center font-bold shrink-0">
              <Armchair className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-black text-slate-900">Operatory Rooms & Doctor Duty Status</h4>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-teal-100 text-teal-900">
                  Live Concurrency
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                If a doctor leaves or steps out, switch their operatory off. Online booking slots for that doctor will immediately grey out.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {[1, 2].map(num => {
              const isActive = chairStatus[num] ?? true;
              const isToggling = togglingChair === num;
              const docLabel = num === 1 ? 'Chief Dentist' : 'Associate Dentist';

              return (
                <div
                  key={num}
                  className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl border transition-all ${
                    isActive
                      ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
                      : 'bg-rose-50/70 border-rose-300 text-rose-950'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        isActive ? 'bg-emerald-500 shadow-xs animate-pulse' : 'bg-rose-500'
                      }`}
                    />
                    <div className="text-left">
                      <div className="font-black text-xs">
                        Chair #{num}
                      </div>
                      <div className="text-[10px] text-slate-500 font-semibold">{docLabel}</div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleToggleChair(num, isActive)}
                    disabled={isToggling}
                    className={`text-[11px] font-black px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs ${
                      isActive
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'bg-rose-600 hover:bg-rose-700 text-white'
                    }`}
                    title={isActive ? 'Click to set Doctor Off-Duty' : 'Click to set Doctor Active'}
                  >
                    <Power className="w-3 h-3" />
                    <span>{isToggling ? 'Updating...' : isActive ? 'ON DUTY' : 'OFF DUTY'}</span>
                  </button>
                </div>
              );
            })}
          </div>
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

      {/* Main Table: Today's Patient Queue */}
      <div className="clinic-card bg-white border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
          <div>
            <h3 className="font-black text-slate-900 text-base">Patient Queue</h3>
            <p className="text-xs text-slate-500 font-medium">
              Manage patient check-ins and treatment status
            </p>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 text-xs">
            <select
              value={filterChair}
              onChange={e => setFilterChair(e.target.value ? Number(e.target.value) : '')}
              className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-slate-900 font-bold focus:outline-none focus:border-teal-600 shadow-2xs"
            >
              <option value="">All Chairs</option>
              {Array.from({ length: totalChairs }, (_, i) => i + 1).map(c => (
                <option key={c} value={c}>Chair {c} (Operatory #{c})</option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-slate-900 font-bold focus:outline-none focus:border-teal-600 shadow-2xs"
            >
              <option value="">All Statuses</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="CHECKED_IN">Checked In</option>
              <option value="IN_CHAIR">In Treatment</option>
              <option value="COMPLETED">Completed</option>
              <option value="NO_SHOW">No-Show (Late/Freed)</option>
            </select>
          </div>
        </div>

        {/* Table Content */}
        {filtered.length === 0 ? (
          <div className="p-12 text-center bg-white">
            <Calendar className="w-12 h-12 mx-auto text-teal-600/40 mb-3" />
            <p className="font-black text-base text-slate-900">No Appointments Scheduled For Today</p>
            <p className="text-xs text-slate-500 font-medium mt-1 max-w-md mx-auto">
              There are no patient visits scheduled for today yet.
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
              {filtered.map((appt, idx) => {
                const startTime = new Date(appt.scheduledStart).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                });
                const isWalkin = appt.reason?.toLowerCase().includes('walk-in');
                const apptDate = new Date(appt.scheduledStart);
                const isOverdue = Date.now() > (apptDate.getTime() + 15 * 60 * 1000) && ['SCHEDULED', 'CONFIRMED'].includes(appt.status);

                return (
                  <div key={appt.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-900 text-white font-mono font-black text-[11px] shadow-2xs">
                            TOKEN #{idx + 1}
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
                              Late (15m+)
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
                        <div className="text-xs text-slate-500 font-mono font-bold mt-0.5 flex items-center gap-2">
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
                        </div>
                      </div>

                      <div className="text-right">
                        {statusBadge(appt.status)}
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
                    <div className="flex items-center gap-2 pt-1">
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
                        </>
                      )}

                      {appt.status === 'CHECKED_IN' && (
                        <button
                          onClick={() => handleUpdateStatus(appt.id, 'IN_CHAIR')}
                          className="flex-1 py-2 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-xs transition-colors cursor-pointer shadow-xs text-center"
                        >
                          Seat in Chair
                        </button>
                      )}

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
                          onClick={() => navigate(`/billing?tab=ready_to_bill&patientId=${appt.patientId}&appointmentId=${appt.id}`)}
                          className="flex-1 py-2 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-xs transition-colors cursor-pointer shadow-xs text-center flex items-center justify-center gap-1"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                          <span>Bill & Checkout</span>
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
                  {filtered.map((appt, idx) => {
                    const startTime = new Date(appt.scheduledStart).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    });
                    const isWalkin = appt.reason?.toLowerCase().includes('walk-in');
                    const apptDate = new Date(appt.scheduledStart);
                    const isOverdue = Date.now() > (apptDate.getTime() + 15 * 60 * 1000) && ['SCHEDULED', 'CONFIRMED'].includes(appt.status);

                    return (
                      <tr key={appt.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-900 text-white font-mono font-black text-xs shadow-2xs">
                              TOKEN #{idx + 1}
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
                                Late (15m+)
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
                          <div className="text-xs text-slate-600 font-mono font-bold mt-0.5">
                            {appt.patientUhid} • {appt.patientPhone}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-teal-50 text-teal-900 font-bold border border-teal-200 text-xs">
                            <Armchair className="w-3.5 h-3.5 text-teal-700" />
                            Chair {appt.chairNumber} (Operatory #{appt.chairNumber})
                          </span>
                        </td>
                        <td className="py-3.5 px-4 max-w-xs text-slate-800 font-medium text-xs">
                          {appt.reason}
                        </td>
                        <td className="py-3.5 px-4 text-slate-900 font-bold text-xs">
                          {appt.dentistName}
                        </td>
                        <td className="py-3.5 px-4">
                          {statusBadge(appt.status)}
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
                              </>
                            )}

                            {appt.status === 'CHECKED_IN' && (
                              <button
                                onClick={() => handleUpdateStatus(appt.id, 'IN_CHAIR')}
                                className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-black text-xs transition-colors cursor-pointer shadow-xs"
                              >
                                Seat Patient
                              </button>
                            )}

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
                                onClick={() => navigate(`/billing?tab=ready_to_bill&patientId=${appt.patientId}&appointmentId=${appt.id}`)}
                                className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-black text-xs transition-colors cursor-pointer shadow-xs flex items-center gap-1"
                                title="Bill patient and collect payment"
                              >
                                <Receipt className="w-3.5 h-3.5" />
                                <span>Bill & Checkout</span>
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

      {/* Printable Hospital Lobby Standee QR Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in duration-150">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-teal-600" />
                <h3 className="font-black text-slate-900 text-sm">Hospital Lobby Standee QR</h3>
              </div>
              <button
                onClick={() => setShowQrModal(false)}
                className="p-1.5 rounded-xl hover:bg-slate-200 text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Standee Poster Preview */}
            <div className="p-6 text-center bg-white space-y-4">
              {/* Clinic Branding */}
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 rounded-2xl bg-teal-50 border border-teal-200 p-2 shadow-xs mb-2 flex items-center justify-center">
                  <img src="/logo.png" alt={clinicName} className="w-full h-full object-contain" />
                </div>
                <h2 className="text-lg font-black text-slate-900 tracking-tight">{clinicName}</h2>
                <span className="text-[11px] font-black text-teal-800 uppercase tracking-widest bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-200 mt-1">
                  Reception Desk & Waiting Lobby Standee
                </span>
              </div>

              {/* QR Code Container */}
              <div className="p-4 bg-gradient-to-b from-teal-500/10 to-teal-500/5 rounded-2xl border-2 border-dashed border-teal-400 inline-block">
                <img
                  src={qrCodeUrl}
                  alt="Scan for Instant Queue Token"
                  className="w-48 h-48 sm:w-56 sm:h-56 mx-auto rounded-xl shadow-xs bg-white p-2"
                />
              </div>

              <div className="flex items-center justify-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-300 rounded-full text-xs font-black text-amber-900 shadow-2xs">
                  <span>🔑 Today's Walk-in Code:</span>
                  <span className="font-mono text-sm tracking-wider text-teal-800 bg-white px-2 py-0.5 rounded-md border border-amber-200">{lobbyCode || 'TODAY'}</span>
                </span>
              </div>

              <div>
                <h4 className="text-base font-black text-slate-900">⚡ SELF CHECK-IN & INSTANT TOKEN</h4>
                <p className="text-xs text-slate-600 font-medium max-w-xs mx-auto mt-1">
                  Skip the reception queue! Scan with your phone camera, choose your operatory room, and receive your live queue number immediately.
                </p>
              </div>

              {/* 3 Step Instructions */}
              <div className="bg-slate-50 rounded-xl p-3 text-left border border-slate-200 text-xs space-y-2 text-slate-700">
                <div className="flex items-center gap-2 font-semibold">
                  <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-[10px] font-black shrink-0">1</span>
                  <span>Point your phone camera at the QR code</span>
                </div>
                <div className="flex items-center gap-2 font-semibold">
                  <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-[10px] font-black shrink-0">2</span>
                  <span>Enter your Name, Mobile, & Custom problem</span>
                </div>
                <div className="flex items-center gap-2 font-semibold">
                  <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-[10px] font-black shrink-0">3</span>
                  <span>Receive your instant <strong>TOKEN #</strong> & live status</span>
                </div>
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
          </div>
        </div>
      )}
    </div>
  );
};