import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api';
import { X, Calendar, Clock, Armchair, Stethoscope, AlertTriangle, UserCheck, AlertCircle, CalendarPlus, MessageCircle, CheckCircle2, Zap, KeyRound, Ticket } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { openWhatsApp, generateAppointmentWhatsAppText } from '../../lib/whatsapp';
import { triggerClinicSync } from '../../lib/sync';

// Helper to calculate smart current time in IST (rounded to next 5 minutes)
const getSmartCurrentTime = (offsetMins = 0): string => {
  const d = new Date();
  if (offsetMins) {
    d.setMinutes(d.getMinutes() + offsetMins);
  }
  const m = d.getMinutes();
  const roundedM = Math.ceil(m / 5) * 5;
  d.setMinutes(roundedM);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

interface BookingDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onBookingSuccess: () => void;
  preSelectedPatient?: any;
}

export const BookingDrawer: React.FC<BookingDrawerProps> = ({
  isOpen,
  onClose,
  onBookingSuccess,
  preSelectedPatient,
}) => {
  if (!isOpen) return null;

  const { user } = useAuth();
  const [totalChairs, setTotalChairs] = useState<number>(() => user?.clinic?.chairCount || 1);
  const isOnLeave = Boolean(user?.clinic?.isOnLeave);
  const leaveReason = user?.clinic?.leaveReason;

  // Mode: Book Now (Walk-In / At Clinic Now) vs Book Later (Advance Schedule)
  const [bookingMode, setBookingMode] = useState<'BOOK_NOW' | 'BOOK_LATER'>('BOOK_NOW');

  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>(preSelectedPatient?.id || '');
  const [dentists, setDentists] = useState<any[]>([]);
  const [selectedDentistId, setSelectedDentistId] = useState<string>('');
  const [chairNumber, setChairNumber] = useState<number>(1);
  const [isAutoAllocate, setIsAutoAllocate] = useState<boolean>(true);
  const [chairLoads, setChairLoads] = useState<Record<number, any>>({});
  const [recommendedChair, setRecommendedChair] = useState<number>(1);
  const [lobbyCode, setLobbyCode] = useState<string>('');

  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState<string>(() => getSmartCurrentTime());
  const [duration, setDuration] = useState<number>(30);
  const [reason, setReason] = useState<string>('General Dental Consultation & Examination');
  const [notes, setNotes] = useState<string>('');

  const [conflictError, setConflictError] = useState<string | null>(null);
  const [bookingSuccessData, setBookingSuccessData] = useState<{
    patient: any;
    date: string;
    time: string;
    chairNumber: number;
    tokenNumber?: number;
    trackingCode?: string;
    doctorName?: string;
    reason?: string;
    lobbyCode?: string;
    isBookNow?: boolean;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Fetch live clinic settings for chair count
  useEffect(() => {
    apiRequest<any>('/clinic/settings')
      .then(settings => {
        if (settings && settings.chairCount) {
          setTotalChairs(settings.chairCount);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch chair loads and lobby code
  useEffect(() => {
    const fetchLoadsAndCode = async () => {
      try {
        const [loadsRes, codeRes] = await Promise.all([
          apiRequest<{ totalChairs: number; chairLoads: Record<number, any>; recommendedChair: number }>(
            `/appointments/chair-loads?date=${date}`
          ).catch(() => null),
          apiRequest<{ code: string }>('/appointments/lobby-code').catch(() => null),
        ]);

        if (loadsRes) {
          setChairLoads(loadsRes.chairLoads || {});
          if (loadsRes.recommendedChair) {
            setRecommendedChair(loadsRes.recommendedChair);
            if (isAutoAllocate) {
              setChairNumber(loadsRes.recommendedChair);
            }
          }
        }
        if (codeRes && codeRes.code) {
          setLobbyCode(codeRes.code);
        }
      } catch (err) {
        console.error('Failed to load chair loads or lobby code', err);
      }
    };

    fetchLoadsAndCode();
  }, [date]);

  useEffect(() => {
    // Fetch patients and dentists
    const loadData = async () => {
      try {
        const [patientsRes, usersRes] = await Promise.all([
          apiRequest<{ data: any[] }>('/patients?limit=50'),
          apiRequest<any[]>('/users?role=DENTIST'),
        ]);
        const pList = (patientsRes as any)?.data || patientsRes || [];
        setPatients(Array.isArray(pList) ? pList : []);

        let dList = usersRes || [];
        // Fallback: If no dentists found with role=DENTIST, fetch active users
        if (!Array.isArray(dList) || dList.length === 0) {
          const allUsers = await apiRequest<any[]>('/users?isActive=true');
          const filtered = (allUsers || []).filter(
            (u: any) => u.role === 'DENTIST' || u.role === 'CLINIC_ADMIN'
          );
          dList = filtered.length > 0 ? filtered : (allUsers || []);
        }

        setDentists(dList);
        if (dList && dList.length > 0) {
          setSelectedDentistId(dList[0].id);
        }
      } catch (err) {
        console.error('Failed to load booking references', err);
      }
    };
    loadData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isOnLeave) {
      setConflictError(`Hospital is currently marked as CLOSED for Holiday / Leave (${leaveReason || 'Holiday'}). Please turn Hospital Status to OPEN before scheduling.`);
      return;
    }

    setConflictError(null);
    setSubmitting(true);

    try {
      const isBookNow = bookingMode === 'BOOK_NOW';
      const effectiveDate = isBookNow ? new Date().toISOString().split('T')[0] : date;
      const effectiveTime = isBookNow ? getSmartCurrentTime() : time;
      const scheduledStart = new Date(`${effectiveDate}T${effectiveTime}:00.000+05:30`).toISOString();

      const res = await apiRequest<any>('/appointments', {
        method: 'POST',
        body: JSON.stringify({
          patientId: selectedPatientId,
          dentistId: selectedDentistId,
          chairNumber: isAutoAllocate ? 0 : chairNumber, // 0 signals backend auto-allocation
          scheduledStart,
          durationMinutes: isBookNow ? 30 : duration,
          reason,
          notes: notes ? `${notes} [${isBookNow ? 'Book Now / In-Clinic Walk-In' : 'Advance Scheduled'}]` : `[${isBookNow ? 'Book Now / In-Clinic Walk-In' : 'Advance Scheduled'}]`,
          isWalkin: isBookNow,
          status: isBookNow ? 'CHECKED_IN' : 'SCHEDULED',
        }),
      });

      const pObj = patients.find(p => p.id === selectedPatientId) || preSelectedPatient;
      const dObj = dentists.find(d => d.id === selectedDentistId);
      setBookingSuccessData({
        patient: res?.patient || pObj,
        date: effectiveDate,
        time: effectiveTime,
        chairNumber: res?.chairNumber || chairNumber,
        tokenNumber: res?.tokenNumber,
        trackingCode: res?.trackingCode,
        doctorName: res?.dentist?.fullName || dObj?.fullName,
        reason,
        lobbyCode: lobbyCode || 'Live on TV',
        isBookNow,
      });

      triggerClinicSync(isBookNow ? 'appt_CHECKED_IN' : 'appointment_booked');
      onBookingSuccess();
    } catch (err: any) {
      setConflictError(err.message || 'Appointment booking failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col justify-between border-l border-slate-200 text-slate-900">
        {/* Drawer Header */}
        <div className="p-5 bg-white border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center">
              <CalendarPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base text-slate-900">Schedule Appointment</h3>
              <p className="text-xs text-slate-600 font-medium">
                Auto-allocate free chair or select manually
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 font-bold cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Hospital On Leave Alert */}
        {isOnLeave && (
          <div className="p-4 bg-rose-50 border-b border-rose-300 text-rose-950 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-black text-rose-900">⛔ Hospital Closed for Holiday / Leave</p>
              <p className="mt-0.5 font-medium text-rose-800">
                Hospital is set to Leave ({leaveReason || 'Holiday'}). All patient bookings are blocked. Toggle hospital status to "Open" in the top bar to enable booking.
              </p>
            </div>
          </div>
        )}

        {/* Conflict Warning */}
        {conflictError && (
          <div className="p-4 bg-rose-50 border-b border-rose-300 text-rose-900 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-black">Schedule Notice</p>
              <p className="mt-0.5 font-medium">{conflictError}</p>
            </div>
          </div>
        )}

        {bookingSuccessData ? (
          <div className="flex-1 p-6 flex flex-col justify-between items-center text-center overflow-y-auto">
            <div className="w-full space-y-4 my-auto">
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center shadow-xs">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900">Appointment Confirmed!</h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Slot has been successfully locked in calendar and queue
                </p>
              </div>

              {/* HIGH VISIBILITY RECEPTIONIST VERBAL CALLOUT CARD */}
              <div className="bg-gradient-to-br from-teal-900 via-teal-800 to-slate-900 text-white rounded-2xl p-5 shadow-lg border border-teal-700 text-left space-y-3">
                <div className="flex items-center justify-between border-b border-teal-700/60 pb-2">
                  <div className="flex items-center gap-1.5 text-teal-300 text-xs font-black uppercase tracking-wider">
                    <Ticket className="w-4 h-4" />
                    <span>Live Queue Credentials</span>
                  </div>
                  <span className="text-[10px] bg-teal-500/20 text-teal-200 border border-teal-400/40 px-2 py-0.5 rounded-full font-bold">
                    Tell Patient Now
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-center py-1">
                  <div className="bg-white/10 rounded-xl p-2.5 backdrop-blur-xs border border-white/10">
                    <div className="text-[10px] uppercase font-bold text-teal-200">Queue Token</div>
                    <div className="font-mono text-base sm:text-xl font-black text-amber-300">
                      {bookingSuccessData.tokenNumber ? `#${bookingSuccessData.tokenNumber}` : 'On Arrival'}
                    </div>
                  </div>
                  <div className="bg-white/10 rounded-xl p-2.5 backdrop-blur-xs border border-white/10">
                    <div className="text-[10px] uppercase font-bold text-teal-200">Operatory Chair</div>
                    <div className="font-mono text-2xl font-black text-emerald-300">
                      #{bookingSuccessData.chairNumber}
                    </div>
                  </div>
                </div>

                <div className="bg-teal-950/70 rounded-xl p-3 border border-teal-600/30 text-xs text-teal-100 font-medium leading-relaxed">
                  <strong className="text-amber-300 block mb-0.5">🗣️ Verbal Instruction for Receptionist:</strong>
                  {bookingSuccessData.tokenNumber ? (
                    <span>"Please tell the patient: 'Your appointment is booked for <strong>Chair #{bookingSuccessData.chairNumber}</strong> with <strong>Token #{bookingSuccessData.tokenNumber}</strong>. Please take a seat in the waiting area!'"</span>
                  ) : (
                    <span>"Please tell the patient: 'Your appointment is scheduled for <strong>{bookingSuccessData.date} at {bookingSuccessData.time}</strong> (Chair #{bookingSuccessData.chairNumber}). When you arrive at the clinic, please scan the check-in QR standee or check in with reception to receive your live queue token!'"</span>
                  )}
                </div>
              </div>

              {/* Details Summary */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left space-y-2 text-xs">
                <div className="flex justify-between items-center border-b border-slate-200 pb-1.5">
                  <span className="text-slate-500 font-bold">Patient:</span>
                  <span className="font-black text-slate-900">{bookingSuccessData.patient?.fullName} ({bookingSuccessData.patient?.phone})</span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-200 pb-1.5">
                  <span className="text-slate-500 font-bold">Schedule:</span>
                  <span className="font-black text-teal-700">{bookingSuccessData.date} at {bookingSuccessData.time}</span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-200 pb-1.5">
                  <span className="text-slate-500 font-bold">Operatory:</span>
                  <span className="font-black text-slate-900">Chair #{bookingSuccessData.chairNumber} (Unit #{bookingSuccessData.chairNumber})</span>
                </div>
                {bookingSuccessData.doctorName && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-bold">Doctor:</span>
                    <span className="font-black text-slate-900">{bookingSuccessData.doctorName}</span>
                  </div>
                )}
              </div>

              {/* Instant WhatsApp Action */}
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2.5">
                <div className="flex items-center gap-2 text-emerald-800 text-xs font-black">
                  <MessageCircle className="w-4 h-4 text-emerald-600" />
                  <span>1-Click Patient Confirmation</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    openWhatsApp(
                      bookingSuccessData.patient?.phone,
                      generateAppointmentWhatsAppText({
                        clinicName: user?.clinic?.name || 'Dental Clinic',
                        patientName: bookingSuccessData.patient?.fullName || 'Patient',
                        date: bookingSuccessData.date,
                        time: bookingSuccessData.time,
                        chairNumber: bookingSuccessData.chairNumber,
                        doctorName: bookingSuccessData.doctorName,
                        reason: bookingSuccessData.reason,
                        clinicAddress: user?.clinic?.address || '',
                        clinicPhone: user?.clinic?.phone || '',
                      }),
                    );
                  }}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all active:scale-[0.98]"
                >
                  <MessageCircle className="w-4 h-4" />
                  Send WhatsApp Confirmation
                </button>
              </div>
            </div>

            <div className="w-full pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 cursor-pointer"
              >
                Done / Back to Calendar
              </button>
            </div>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          {/* Mode Switcher: Book Now (Walk-In / At Desk) vs Book Later (Advance Schedule) */}
          <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-100 rounded-2xl border border-slate-200">
            <button
              type="button"
              onClick={() => {
                setBookingMode('BOOK_NOW');
                setDate(new Date().toISOString().split('T')[0]);
                setTime(getSmartCurrentTime());
              }}
              className={`py-3 px-3 rounded-xl text-center transition-all cursor-pointer ${
                bookingMode === 'BOOK_NOW'
                  ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-black shadow-md ring-2 ring-emerald-400'
                  : 'text-slate-600 hover:text-slate-900 font-bold hover:bg-white/60'
              }`}
            >
              <div className="flex items-center justify-center gap-1.5 text-xs font-black">
                <Zap className="w-4 h-4" />
                <span>⚡ Book Now</span>
              </div>
              <div className={`text-[10px] mt-0.5 font-medium ${bookingMode === 'BOOK_NOW' ? 'text-teal-100' : 'text-slate-500'}`}>
                In-Clinic • Instant Token #
              </div>
            </button>

            <button
              type="button"
              onClick={() => setBookingMode('BOOK_LATER')}
              className={`py-3 px-3 rounded-xl text-center transition-all cursor-pointer ${
                bookingMode === 'BOOK_LATER'
                  ? 'bg-slate-900 text-white font-black shadow-md ring-2 ring-slate-700'
                  : 'text-slate-600 hover:text-slate-900 font-bold hover:bg-white/60'
              }`}
            >
              <div className="flex items-center justify-center gap-1.5 text-xs font-black">
                <Calendar className="w-4 h-4" />
                <span>📅 Book Later</span>
              </div>
              <div className={`text-[10px] mt-0.5 font-medium ${bookingMode === 'BOOK_LATER' ? 'text-slate-300' : 'text-slate-500'}`}>
                Advance Schedule (No Token)
              </div>
            </button>
          </div>

          {/* Mode Explanatory Notice */}
          {bookingMode === 'BOOK_NOW' ? (
            <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-950 text-xs flex items-center gap-2.5 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Patient is at the clinic now. Submitting will <strong>instantly issue daily Token #</strong> and place them in the waiting lobby queue.
              </span>
            </div>
          ) : (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-2xl text-amber-950 text-xs flex items-center gap-2.5 font-medium">
              <Clock className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Advance booking. <strong>No Token #</strong> is issued now. When patient arrives at the clinic, reception marks them arrived to give their queue token.
              </span>
            </div>
          )}

          {/* Patient Selection */}
          <div>
            <label className="block font-black text-slate-800 mb-1">
              Select Patient <span className="text-rose-500">*</span>
            </label>
            {preSelectedPatient ? (
              <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl font-black text-slate-900">
                {preSelectedPatient.fullName} ({preSelectedPatient.uhid})
              </div>
            ) : (
              <select
                required
                value={selectedPatientId}
                onChange={e => setSelectedPatientId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold text-slate-900 focus:border-teal-600 focus:bg-white"
              >
                <option value="">-- Choose Registered Patient --</option>
                {patients.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.fullName} ({p.uhid}) • {p.phone}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Dentist Selection */}
          <div>
            <label className="block font-black text-slate-800 mb-1">
              Doctor / Dentist <span className="text-rose-500">*</span>
            </label>
            <select
              required
              value={selectedDentistId}
              onChange={e => setSelectedDentistId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold text-slate-900 focus:border-teal-600 focus:bg-white"
            >
              {dentists.length === 0 ? (
                <option value="">-- No Doctors Available --</option>
              ) : (
                dentists.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.fullName} ({d.designation || d.specialization || (d.role === 'CLINIC_ADMIN' ? 'Chief Dental Surgeon' : 'Dental Surgeon')})
                  </option>
                ))
              )}
            </select>
          </div>

          {/* ADVANCE FIELDS ONLY SHOWN IN BOOK LATER MODE */}
          {bookingMode === 'BOOK_LATER' && (
            <>
              {/* Date and Time */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-black text-slate-800 mb-1">Appointment Date</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-mono font-bold text-slate-900 focus:border-teal-600 focus:bg-white"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-black text-slate-800">Start Time (IST)</label>
                    <button
                      type="button"
                      onClick={() => setTime(getSmartCurrentTime())}
                      className="text-[11px] font-bold text-teal-700 hover:text-teal-900 cursor-pointer flex items-center gap-1"
                    >
                      <Clock className="w-3 h-3" />
                      Set to Now
                    </button>
                  </div>
                  <input
                    type="time"
                    required
                    value={time}
                    onChange={e => setTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-mono font-bold text-slate-900 focus:border-teal-600 focus:bg-white"
                  />
                  <div className="flex flex-wrap gap-1 mt-2">
                    {[
                      { label: '+15m', offset: 15 },
                      { label: '+30m', offset: 30 },
                      { label: '+1h', offset: 60 },
                      { label: '10:00 AM', timeVal: '10:00' },
                      { label: '04:00 PM', timeVal: '16:00' },
                      { label: '06:00 PM', timeVal: '18:00' },
                    ].map(chip => (
                      <button
                        key={chip.label}
                        type="button"
                        onClick={() => {
                          if (chip.timeVal) {
                            setTime(chip.timeVal);
                          } else {
                            setTime(getSmartCurrentTime(chip.offset));
                          }
                        }}
                        className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 hover:bg-teal-50 hover:text-teal-900 hover:border-teal-300 border border-slate-200 text-slate-700 cursor-pointer transition-colors"
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Operatory Dental Chair (Only show picker if more than 1 chair configured in settings) */}
              {totalChairs > 1 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <label className="block font-black text-slate-800">Operatory Dental Chair</label>
                      <span className="text-[11px] text-slate-500 font-medium">Auto balance or pick chair</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !isAutoAllocate;
                        setIsAutoAllocate(next);
                        if (next && recommendedChair) setChairNumber(recommendedChair);
                      }}
                      className={`px-2.5 py-1 rounded-xl text-xs font-black flex items-center gap-1 transition-all cursor-pointer ${
                        isAutoAllocate
                          ? 'bg-amber-400 text-slate-950 shadow-xs ring-2 ring-amber-300'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>{isAutoAllocate ? '⚡ Auto-Allocate: ON' : 'Manual Pick'}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Array.from({ length: totalChairs }, (_, i) => i + 1).map(c => {
                      const load = chairLoads[c];
                      const patientCount = load?.total ?? 0;
                      const isRec = c === recommendedChair;
                      const isSelected = chairNumber === c;

                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => {
                            setChairNumber(c);
                            setIsAutoAllocate(false);
                          }}
                          className={`p-3 rounded-xl border text-center transition-all cursor-pointer relative ${
                            isSelected
                              ? 'bg-teal-50 border-2 border-teal-600 text-teal-900 font-black shadow-xs ring-2 ring-teal-500/20'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 font-bold'
                          }`}
                        >
                          {isRec && (
                            <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-amber-400 text-slate-950 text-[9px] font-black px-1.5 py-0.2 rounded-full uppercase tracking-wider shadow-2xs whitespace-nowrap">
                              ⭐ Best Fit
                            </span>
                          )}
                          <Armchair className={`w-4 h-4 mx-auto mb-1 ${isSelected ? 'text-teal-700' : 'text-slate-500'}`} />
                          <div className="text-xs font-black">Chair {c}</div>
                          <div className="text-[10px] font-bold mt-1">
                            {patientCount === 0 ? (
                              <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">🟢 Free</span>
                            ) : (
                              <span className="text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">{patientCount} booked</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Reason for Visit */}
          <div>
            <label className="block font-black text-slate-800 mb-1">
              Reason for Visit / Complaint <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Toothache, Cleaning, Root Canal, Consultation"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold text-slate-900 focus:border-teal-600 focus:bg-white placeholder-slate-400"
            />
          </div>

          {/* Notes (Optional) */}
          <div>
            <label className="block font-black text-slate-800 mb-1">Notes (Optional)</label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional notes for doctor or reception..."
              className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-medium text-slate-900 focus:border-teal-600 focus:bg-white placeholder-slate-400"
            />
          </div>

          {/* Submit Button */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-slate-700 border border-slate-300 font-bold hover:bg-slate-100 cursor-pointer text-xs"
            >
              Cancel
            </button>

            {bookingMode === 'BOOK_NOW' ? (
              <button
                type="submit"
                disabled={submitting || !selectedPatientId}
                className="flex-1 py-3 px-5 rounded-xl font-black text-white bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 shadow-md cursor-pointer disabled:opacity-50 transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-xs sm:text-sm"
              >
                <Zap className="w-4 h-4" />
                <span>{submitting ? 'Generating Token...' : '⚡ Book Now & Issue Token #'}</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={submitting || !selectedPatientId}
                className="flex-1 py-3 px-5 rounded-xl font-black text-white bg-slate-900 hover:bg-slate-800 shadow-md cursor-pointer disabled:opacity-50 transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-xs sm:text-sm"
              >
                <Calendar className="w-4 h-4" />
                <span>{submitting ? 'Booking...' : '📅 Confirm Advance Booking'}</span>
              </button>
            )}
          </div>
        </form>
        )}
      </div>
    </div>
  );
};