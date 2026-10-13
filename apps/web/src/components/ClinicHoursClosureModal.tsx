import React, { useState, useEffect } from 'react';
import { apiRequest } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import {
  Clock,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  X,
  Phone,
  MessageSquare,
  RefreshCw,
  CalendarX,
  CalendarCheck,
  ShieldAlert,
  User,
  ExternalLink,
} from 'lucide-react';

interface WorkingHour {
  id?: string;
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  breakStartTime?: string | null;
  breakEndTime?: string | null;
  isClosed: boolean;
}

interface ClinicClosure {
  id: string;
  startAt: string;
  endAt: string;
  reason: string;
  createdAt: string;
  endedAt?: string | null;
  createdByUser?: { fullName: string; role: string };
  endedByUser?: { fullName: string; role: string };
}

interface ClinicStatus {
  isOpen: boolean;
  status: 'OPEN' | 'CLOSED_HOURS' | 'CLOSED_BREAK' | 'CLOSED_CLOSURE' | 'CLOSED_LEGACY_LEAVE';
  message: string;
  nextOpenAt: string | null;
  activeClosure: ClinicClosure | null;
  clinicName?: string;
  emergencyPhone?: string;
}

interface ImpactedBooking {
  id: string;
  patientName: string;
  patientPhone: string;
  scheduledStart: string;
  scheduledEnd: string;
  chairNumber: number;
  doctorName?: string;
  tokenNumber?: number;
  status: string;
  whatsAppUrl: string;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const ClinicHoursClosureModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onStatusChanged?: () => void;
  initialTab?: 'STATUS_CLOSURES' | 'WORKING_HOURS' | 'HISTORY';
}> = ({ isOpen, onClose, onStatusChanged, initialTab = 'STATUS_CLOSURES' }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'CLINIC_ADMIN';
  const isReceptionist = user?.role === 'RECEPTIONIST';

  const [activeTab, setActiveTab] = useState<'STATUS_CLOSURES' | 'WORKING_HOURS' | 'HISTORY'>(
    initialTab || 'STATUS_CLOSURES'
  );

  useEffect(() => {
    if (initialTab && isOpen) {
      setActiveTab(initialTab);
    }
  }, [initialTab, isOpen]);

  const [loading, setLoading] = useState(false);
  const [clinicStatus, setClinicStatus] = useState<ClinicStatus | null>(null);

  // Closures state
  const [closures, setClosures] = useState<ClinicClosure[]>([]);
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [closureReason, setClosureReason] = useState('');
  const [creatingClosure, setCreatingClosure] = useState(false);
  const [closureError, setClosureError] = useState<string | null>(null);
  const [closureSuccess, setClosureSuccess] = useState<string | null>(null);

  // Impacted Bookings state
  const [impactedBookings, setImpactedBookings] = useState<ImpactedBooking[]>([]);
  const [activeClosureIdForBookings, setActiveClosureIdForBookings] = useState<string | null>(null);
  const [loadingBookings, setLoadingBookings] = useState(false);

  // Working Hours state
  const [workingHours, setWorkingHours] = useState<WorkingHour[]>([]);
  const [savingHours, setSavingHours] = useState(false);
  const [hoursSuccess, setHoursSuccess] = useState<string | null>(null);
  const [hoursError, setHoursError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadStatus();
      loadClosures();
      loadWorkingHours();
    }
  }, [isOpen]);

  const loadStatus = async () => {
    try {
      const res = await apiRequest<ClinicStatus>('/clinic/status');
      setClinicStatus(res);
      if (res.activeClosure) {
        setActiveClosureIdForBookings(res.activeClosure.id);
        loadImpactedBookings(res.activeClosure.id);
      }
    } catch (err: any) {
      console.error('Failed to load clinic status', err);
    }
  };

  const loadClosures = async () => {
    try {
      const res = await apiRequest<ClinicClosure[]>('/clinic/closures');
      setClosures(Array.isArray(res) ? res : []);
    } catch (err: any) {
      console.error('Failed to load closures', err);
    }
  };

  const loadWorkingHours = async () => {
    try {
      const res = await apiRequest<WorkingHour[]>('/clinic/hours');
      if (Array.isArray(res) && res.length > 0) {
        // Sort by dayOfWeek: Mon (1) to Sun (0)
        const sorted = [...res].sort((a, b) => {
          const dayA = a.dayOfWeek === 0 ? 7 : a.dayOfWeek;
          const dayB = b.dayOfWeek === 0 ? 7 : b.dayOfWeek;
          return dayA - dayB;
        });
        setWorkingHours(sorted);
      }
    } catch (err: any) {
      console.error('Failed to load working hours', err);
    }
  };

  const loadImpactedBookings = async (closureId: string) => {
    setLoadingBookings(true);
    try {
      const res = await apiRequest<{ impactedBookings: ImpactedBooking[] }>(
        `/clinic/closures/${closureId}/impacted-bookings`
      );
      setImpactedBookings(res.impactedBookings || []);
    } catch (err: any) {
      console.error('Failed to load impacted bookings', err);
    } finally {
      setLoadingBookings(false);
    }
  };

  const handleCreateClosure = async (e: React.FormEvent) => {
    e.preventDefault();
    setClosureError(null);
    setClosureSuccess(null);

    if (!startAt || !endAt || !closureReason.trim()) {
      setClosureError('Start time, end time, and reason are strictly required.');
      return;
    }

    const startDate = new Date(startAt);
    const endDate = new Date(endAt);

    if (endDate <= startDate) {
      setClosureError('Closure end time must be after start time.');
      return;
    }

    if (endDate.getTime() <= Date.now()) {
      setClosureError('Closure end time must be in the future.');
      return;
    }

    setCreatingClosure(true);
    try {
      const res = await apiRequest<{ closure: ClinicClosure; impactedBookings: ImpactedBooking[] }>(
        '/clinic/closures',
        {
          method: 'POST',
          body: JSON.stringify({
            startAt: startDate.toISOString(),
            endAt: endDate.toISOString(),
            reason: closureReason.trim(),
          }),
        }
      );

      setClosureSuccess('Clinic closure successfully scheduled and recorded!');
      setStartAt('');
      setEndAt('');
      setClosureReason('');
      if (res.closure?.id) {
        setActiveClosureIdForBookings(res.closure.id);
        setImpactedBookings(res.impactedBookings || []);
      }
      await loadStatus();
      await loadClosures();
      onStatusChanged?.();
    } catch (err: any) {
      setClosureError(err.message || 'Failed to schedule closure');
    } finally {
      setCreatingClosure(false);
    }
  };

  const handleEndClosure = async (closureId: string) => {
    if (!window.confirm('Are you sure you want to re-open the clinic and end this closure early?')) {
      return;
    }
    setLoading(true);
    try {
      await apiRequest(`/clinic/closures/${closureId}/end`, { method: 'POST' });
      await loadStatus();
      await loadClosures();
      setImpactedBookings([]);
      setActiveClosureIdForBookings(null);
      onStatusChanged?.();
    } catch (err: any) {
      alert(err.message || 'Failed to end closure');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelBookingDueToClosure = async (bookingId: string) => {
    if (!window.confirm('Cancel this appointment due to clinic closure? Patient will receive 0 strikes.')) {
      return;
    }
    try {
      await apiRequest(`/clinic/closures/cancel-booking/${bookingId}`, { method: 'POST' });
      if (activeClosureIdForBookings) {
        await loadImpactedBookings(activeClosureIdForBookings);
      }
      onStatusChanged?.();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel appointment');
    }
  };

  const handleUpdateHourRow = (index: number, field: keyof WorkingHour, value: any) => {
    const updated = [...workingHours];
    updated[index] = { ...updated[index], [field]: value };
    setWorkingHours(updated);
  };

  const handleSaveWorkingHours = async () => {
    setSavingHours(true);
    setHoursError(null);
    setHoursSuccess(null);
    try {
      await apiRequest('/clinic/hours', {
        method: 'PUT',
        body: JSON.stringify({ hours: workingHours }),
      });
      setHoursSuccess('Standard weekly working hours updated successfully!');
      await loadStatus();
      onStatusChanged?.();
    } catch (err: any) {
      setHoursError(err.message || 'Failed to save working hours');
    } finally {
      setSavingHours(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden text-slate-900 animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold shrink-0 ${
                clinicStatus?.isOpen
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-rose-100 text-rose-800'
              }`}
            >
              {clinicStatus?.isOpen ? (
                <CalendarCheck className="w-6 h-6" />
              ) : (
                <CalendarX className="w-6 h-6" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base sm:text-lg text-slate-900">
                  Clinic Hours & Holiday Closures
                </h3>
                <span
                  className={`text-[11px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                    clinicStatus?.isOpen
                      ? 'bg-emerald-500 text-white'
                      : 'bg-rose-600 text-white animate-pulse'
                  }`}
                >
                  {clinicStatus?.isOpen ? '● OPEN' : '● CLOSED'}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Kolkata Time (Asia/Kolkata) • Real-time server-side appointment gatekeeper
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Pill & Re-open Banner */}
        {clinicStatus && !clinicStatus.isOpen && (
          <div className="bg-rose-50 border-b border-rose-200 px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <div className="text-xs text-rose-950 font-bold">
                <span>{clinicStatus.message}</span>
                {clinicStatus.nextOpenAt && (
                  <span className="block text-[11px] text-rose-800 font-normal">
                    Re-opens: {new Date(clinicStatus.nextOpenAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                )}
              </div>
            </div>
            {clinicStatus.activeClosure && (isAdmin || isReceptionist) && (
              <button
                type="button"
                disabled={loading}
                onClick={() => handleEndClosure(clinicStatus.activeClosure!.id)}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl transition cursor-pointer shadow-xs whitespace-nowrap self-start sm:self-auto"
              >
                End Closure & Re-Open Now
              </button>
            )}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-100/70 p-1.5 gap-1 shrink-0 text-xs font-black">
          <button
            type="button"
            onClick={() => setActiveTab('STATUS_CLOSURES')}
            className={`flex-1 py-2 px-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'STATUS_CLOSURES'
                ? 'bg-white text-teal-900 shadow-xs border border-slate-200 font-extrabold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <CalendarX className="w-3.5 h-3.5 text-teal-600" />
            <span>Emergency / Planned Closures</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('WORKING_HOURS')}
            className={`flex-1 py-2 px-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'WORKING_HOURS'
                ? 'bg-white text-teal-900 shadow-xs border border-slate-200 font-extrabold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-teal-600" />
            <span>Weekly Hours & Breaks</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('HISTORY')}
            className={`flex-1 py-2 px-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'HISTORY'
                ? 'bg-white text-teal-900 shadow-xs border border-slate-200 font-extrabold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 text-teal-600" />
            <span>Closure Logs</span>
          </button>
        </div>

        {/* Tab 1: Operational Status & Create Closure */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {activeTab === 'STATUS_CLOSURES' && (
            <div className="space-y-6">
              {/* Active Closure Details */}
              {clinicStatus?.activeClosure ? (
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-700" />
                      Currently Active Closure
                    </span>
                    <span className="text-[11px] font-mono text-amber-800">
                      ID: {clinicStatus.activeClosure.id.slice(0, 8)}
                    </span>
                  </div>
                  <div className="text-sm font-black text-slate-900">
                    Reason: "{clinicStatus.activeClosure.reason}"
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700">
                    <div>
                      <span className="text-slate-500 font-medium">Starts: </span>
                      <strong className="font-mono">
                        {new Date(clinicStatus.activeClosure.startAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium">Auto-Resumes: </span>
                      <strong className="font-mono text-teal-800">
                        {new Date(clinicStatus.activeClosure.endAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}
                      </strong>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Schedule New Closure Form */}
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
                <div>
                  <h4 className="font-black text-sm text-slate-900 flex items-center gap-2">
                    <CalendarX className="w-4 h-4 text-rose-600" />
                    <span>Schedule Clinic Closure / Holiday</span>
                  </h4>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    {isAdmin
                      ? 'As Clinic Admin, you can schedule closures for any future date or range.'
                      : 'As Receptionist, you can schedule closures for today or tomorrow.'}
                  </p>
                </div>

                {isReceptionist && !isAdmin && (
                  <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs flex items-center gap-2 font-medium">
                    <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      <strong>Staff Boundary:</strong> Receptionists can declare closures for today or tomorrow. An automated alert will be logged for the Clinic Admin.
                    </span>
                  </div>
                )}

                {closureError && (
                  <div className="p-3 bg-rose-50 border border-rose-300 text-rose-900 rounded-xl text-xs font-bold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{closureError}</span>
                  </div>
                )}

                {closureSuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-bold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{closureSuccess}</span>
                  </div>
                )}

                <form onSubmit={handleCreateClosure} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-black text-slate-700 mb-1">
                        Start Date & Time (IST) *
                      </label>
                      <input
                        type="datetime-local"
                        required
                        value={startAt}
                        onChange={(e) => setStartAt(e.target.value)}
                        className="w-full p-2.5 rounded-xl border border-slate-300 bg-white font-mono text-xs font-bold text-slate-900 focus:border-teal-600 focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-700 mb-1">
                        End Date & Time (Auto-Resume) *
                      </label>
                      <input
                        type="datetime-local"
                        required
                        value={endAt}
                        onChange={(e) => setEndAt(e.target.value)}
                        className="w-full p-2.5 rounded-xl border border-slate-300 bg-white font-mono text-xs font-bold text-slate-900 focus:border-teal-600 focus:outline-hidden"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1">
                      Reason for Closure *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Pongal Public Holiday, Clinic Renovation, Doctor Emergency"
                      value={closureReason}
                      onChange={(e) => setClosureReason(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-900 focus:border-teal-600 focus:outline-hidden placeholder:text-slate-400"
                    />
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      disabled={creatingClosure}
                      className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs transition cursor-pointer shadow-md disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {creatingClosure ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Scheduling Closure...</span>
                        </>
                      ) : (
                        <>
                          <CalendarX className="w-3.5 h-3.5" />
                          <span>Schedule Closure & Notify Impacted Patients</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>

              {/* Impacted Bookings List */}
              {activeClosureIdForBookings && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-black text-sm text-slate-900 flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-teal-600" />
                        <span>Impacted Bookings ({impactedBookings.length})</span>
                      </h4>
                      <p className="text-xs text-slate-500 font-medium">
                        Appointments falling inside closure hours. One-click WhatsApp links and 0-strike cancellation.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => loadImpactedBookings(activeClosureIdForBookings)}
                      className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 cursor-pointer"
                      title="Refresh impacted bookings"
                    >
                      <RefreshCw className={`w-4 h-4 ${loadingBookings ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  {impactedBookings.length === 0 ? (
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500 font-medium">
                      No booked appointments fall within this closure window.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {impactedBookings.map((b) => (
                        <div
                          key={b.id}
                          className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                        >
                          <div>
                            <div className="font-black text-slate-900 flex items-center gap-2">
                              <span>{b.patientName}</span>
                              <span className="font-mono text-slate-500">({b.patientPhone})</span>
                              {b.tokenNumber && (
                                <span className="bg-teal-100 text-teal-900 px-2 py-0.2 rounded font-mono font-bold">
                                  #{b.tokenNumber}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                              {new Date(b.scheduledStart).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', month: 'short', day: 'numeric' })} at{' '}
                              {new Date(b.scheduledStart).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} • Chair #{b.chairNumber} {b.doctorName ? `• Dr. ${b.doctorName}` : ''}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <a
                              href={b.whatsAppUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                              title="Send WhatsApp notice"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>WhatsApp</span>
                            </a>
                            <button
                              type="button"
                              onClick={() => handleCancelBookingDueToClosure(b.id)}
                              className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-lg font-bold cursor-pointer"
                              title="Cancel appointment with 0 strikes"
                            >
                              Cancel (0 Strikes)
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Weekly Working Hours */}
          {activeTab === 'WORKING_HOURS' && (
            <div className="space-y-4">
              <div>
                <h4 className="font-black text-sm text-slate-900">Weekly Operating Hours & Breaks</h4>
                <p className="text-xs text-slate-500 font-medium">
                  {isAdmin
                    ? 'Configure standard open/close times and lunch/prayer breaks per weekday.'
                    : 'Standard operating hours (Read-only for receptionist; contact admin to modify).'}
                </p>
              </div>

              {hoursError && (
                <div className="p-3 bg-rose-50 border border-rose-300 text-rose-900 rounded-xl text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{hoursError}</span>
                </div>
              )}

              {hoursSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{hoursSuccess}</span>
                </div>
              )}

              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 uppercase font-black tracking-wider text-[11px]">
                    <tr>
                      <th className="p-3">Day</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Open Time</th>
                      <th className="p-3">Close Time</th>
                      <th className="p-3">Break Start</th>
                      <th className="p-3">Break End</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {workingHours.map((row, idx) => (
                      <tr key={row.dayOfWeek} className={row.isClosed ? 'bg-slate-50/70 text-slate-400' : 'bg-white'}>
                        <td className="p-3 font-bold text-slate-900">
                          {DAY_NAMES[row.dayOfWeek]}
                        </td>
                        <td className="p-3">
                          {isAdmin ? (
                            <button
                              type="button"
                              onClick={() => handleUpdateHourRow(idx, 'isClosed', !row.isClosed)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-black cursor-pointer transition ${
                                row.isClosed
                                  ? 'bg-rose-100 text-rose-700 border border-rose-300'
                                  : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              }`}
                            >
                              {row.isClosed ? 'Closed' : 'Open'}
                            </button>
                          ) : (
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                row.isClosed ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {row.isClosed ? 'Closed' : 'Open'}
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <input
                            type="time"
                            disabled={!isAdmin || row.isClosed}
                            value={row.openTime}
                            onChange={(e) => handleUpdateHourRow(idx, 'openTime', e.target.value)}
                            className="p-1.5 rounded-lg border border-slate-300 bg-white font-mono text-xs font-bold disabled:opacity-50"
                          />
                        </td>
                        <td className="p-3">
                          <input
                            type="time"
                            disabled={!isAdmin || row.isClosed}
                            value={row.closeTime}
                            onChange={(e) => handleUpdateHourRow(idx, 'closeTime', e.target.value)}
                            className="p-1.5 rounded-lg border border-slate-300 bg-white font-mono text-xs font-bold disabled:opacity-50"
                          />
                        </td>
                        <td className="p-3">
                          <input
                            type="time"
                            disabled={!isAdmin || row.isClosed}
                            value={row.breakStartTime || ''}
                            onChange={(e) => handleUpdateHourRow(idx, 'breakStartTime', e.target.value || null)}
                            className="p-1.5 rounded-lg border border-slate-300 bg-white font-mono text-xs font-bold disabled:opacity-50"
                          />
                        </td>
                        <td className="p-3">
                          <input
                            type="time"
                            disabled={!isAdmin || row.isClosed}
                            value={row.breakEndTime || ''}
                            onChange={(e) => handleUpdateHourRow(idx, 'breakEndTime', e.target.value || null)}
                            className="p-1.5 rounded-lg border border-slate-300 bg-white font-mono text-xs font-bold disabled:opacity-50"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {isAdmin && (
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    disabled={savingHours}
                    onClick={handleSaveWorkingHours}
                    className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-xs transition cursor-pointer shadow-md disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {savingHours ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving Working Hours...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Save Working Hours</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Tab 3: History & Logs */}
          {activeTab === 'HISTORY' && (
            <div className="space-y-3">
              <div>
                <h4 className="font-black text-sm text-slate-900">Clinic Closure Audit History</h4>
                <p className="text-xs text-slate-500 font-medium">
                  Past emergency, holiday, and temporary closures.
                </p>
              </div>

              {closures.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500 font-medium">
                  No clinic closure history found.
                </div>
              ) : (
                <div className="space-y-2">
                  {closures.map((c) => (
                    <div
                      key={c.id}
                      className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-black text-slate-900">{c.reason}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            c.endedAt
                              ? 'bg-slate-100 text-slate-600'
                              : new Date(c.endAt) > new Date()
                              ? 'bg-rose-100 text-rose-700 font-black'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {c.endedAt ? 'Ended Early' : new Date(c.endAt) > new Date() ? 'Active / Upcoming' : 'Completed'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium">
                        Window: {new Date(c.startAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} —{' '}
                        {new Date(c.endAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Created by: {c.createdByUser?.fullName || 'Staff'} ({c.createdByUser?.role})
                        {c.endedByUser && ` • Ended by: ${c.endedByUser.fullName} (${c.endedByUser.role})`}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
