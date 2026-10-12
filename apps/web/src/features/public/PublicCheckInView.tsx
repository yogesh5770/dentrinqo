import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  Clock,
  Phone,
  Search,
  User,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Sparkles,
  MapPin,
  Calendar,
  Activity,
  QrCode,
  Check,
  Volume2,
  Bell,
  Armchair,
  RefreshCw,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { triggerClinicSync, playClinicAlertChime, playPatientTurnBeeper } from '../../lib/sync';

interface PublicCheckInViewProps {
  clinicCode?: string;
  clinicName?: string;
  clinicPhone?: string;
  clinicAddress?: string;
}

export const PublicCheckInView: React.FC<PublicCheckInViewProps> = ({
  clinicCode = 'AKS',
  clinicName = "AK's Elite Dental Clinic and Multi-Speciality Dental Hospital",
  clinicPhone = '+91 95387 23872',
  clinicAddress = 'Plot No. 162/2A, Alagar Complex, 5th Meenakshi Amman Nagar Main Road, K.Pudur, Madurai',
}) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Search input state
  const initialQuery = searchParams.get('ref') || searchParams.get('phone') || searchParams.get('identifier') || '';
  const initialCode = searchParams.get('code') || searchParams.get('lobbyCode') || '';
  const [query, setQuery] = useState(initialQuery);
  const [lobbyCode, setLobbyCode] = useState(initialCode);
  const [patientNameVerification, setPatientNameVerification] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search result state
  const [appointmentData, setAppointmentData] = useState<any | null>(null);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [checkInSuccess, setCheckInSuccess] = useState<any | null>(null);

  // Fast pre-visit health intake mini-form inside check-in
  const [showIntake, setShowIntake] = useState(false);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [medicalConditions, setMedicalConditions] = useState<{
    diabetic: boolean;
    hypertension: boolean;
    cardiac: boolean;
    bloodThinners: boolean;
    pregnant: boolean;
  }>({
    diabetic: false,
    hypertension: false,
    cardiac: false,
    bloodThinners: false,
    pregnant: false,
  });
  const [intakeSaving, setIntakeSaving] = useState(false);
  const [intakeSaved, setIntakeSaved] = useState(false);

  // Live Beeper Pager State & Turn Alarm
  const [turnAlarmFired, setTurnAlarmFired] = useState(false);
  const [lastSyncedTime, setLastSyncedTime] = useState<Date>(new Date());
  const [testSoundPlayed, setTestSoundPlayed] = useState(false);

  // Periodic Live Beeper Polling Hook (10 second interval)
  useEffect(() => {
    if (!checkInSuccess) return;

    const identifier = checkInSuccess.reference || appointmentData?.reference || query.trim();
    if (!identifier) return;

    const pollStatus = async () => {
      try {
        const res = await apiRequest<any>(`/appointments/public-status/${encodeURIComponent(identifier)}`);
        if (res && res.success) {
          setLastSyncedTime(new Date());

          // Detect transition to CALLED -> ring live beeper & vibrate phone
          if (res.status === 'CALLED' && checkInSuccess.status !== 'CALLED') {
            playPatientTurnBeeper();
            setTurnAlarmFired(true);
          }

          setCheckInSuccess((prev: any) => ({
            ...prev,
            reference: res.reference || prev?.reference,
            tokenNumber: res.tokenNumber ?? prev?.tokenNumber,
            currentlyAhead: res.currentlyAhead ?? prev?.currentlyAhead,
            activeChairsServing: res.activeChairsServing || prev?.activeChairsServing || [],
            chairNumber: res.chairNumber || prev?.chairNumber,
            dentistName: res.dentistName || prev?.dentistName,
            patientName: res.patientName || prev?.patientName,
            status: res.status,
          }));
        }
      } catch (err) {
        // Silent catch during background sync polling
      }
    };

    const intervalId = setInterval(pollStatus, 10000);
    return () => clearInterval(intervalId);
  }, [checkInSuccess?.reference, checkInSuccess?.status, appointmentData?.reference, query]);

  // Auto-search if parameter provided in QR code URL
  useEffect(() => {
    if (initialQuery.trim()) {
      handleSearch(initialQuery.trim());
    }
  }, []);

  const handleSearch = async (searchTarget?: string) => {
    const term = (searchTarget !== undefined ? searchTarget : query).trim();
    if (!term) {
      setError('Please enter your 10-digit mobile number or booking reference code.');
      return;
    }

    setLoading(true);
    setError(null);
    setAppointmentData(null);
    setCheckInSuccess(null);

    try {
      const res = await apiRequest<any>(`/appointments/public-status/${encodeURIComponent(term)}`);
      if (res && res.success) {
        setAppointmentData(res);
        // If already checked in or called, show success state directly
        if (res.status === 'CHECKED_IN' || res.status === 'CALLED' || res.status === 'IN_CHAIR') {
          setCheckInSuccess({
            reference: res.reference,
            tokenNumber: res.tokenNumber,
            currentlyAhead: res.currentlyAhead,
            activeChairsServing: res.activeChairsServing || [],
            chairNumber: res.chairNumber,
            dentistName: res.dentistName,
            patientName: res.patientName,
            status: res.status,
            alreadyCheckedIn: true,
          });
          if (res.status === 'CALLED') {
            playPatientTurnBeeper();
            setTurnAlarmFired(true);
          }
        }
      } else {
        throw new Error('Appointment record not found');
      }
    } catch (err: any) {
      setError(
        err.message ||
          'No scheduled booking found for this number today. If you just arrived without an appointment, you can register as a walk-in.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePerformCheckIn = async () => {
    if (!appointmentData && !query.trim()) return;

    setIsCheckingIn(true);
    setError(null);

    const identifier = appointmentData?.reference || appointmentData?.patientPhone || query.trim();

    try {
      const res = await apiRequest<any>('/appointments/public-checkin', {
        method: 'POST',
        body: JSON.stringify({
          identifier,
          clinicCode,
          lobbyCode: lobbyCode.trim() || undefined,
          patientName: patientNameVerification.trim() || undefined,
        }),
      });

      if (res && res.success) {
        setCheckInSuccess({
          reference: res.reference,
          tokenNumber: res.tokenNumber,
          currentlyAhead: res.currentlyAhead,
          activeChairsServing: res.activeChairsServing || [],
          chairNumber: res.chairNumber,
          dentistName: res.dentistName,
          patientName: res.patientName,
          status: res.status || 'CHECKED_IN',
          alreadyCheckedIn: false,
        });
        playClinicAlertChime();
        triggerClinicSync('patient_self_checked_in', {
          appointmentId: res.appointmentId,
          patientName: res.patientName,
          tokenNumber: res.tokenNumber,
          chairNumber: res.chairNumber,
        });
      } else {
        throw new Error('Check-in could not be confirmed.');
      }
    } catch (err: any) {
      setError(err.message || 'Check-in failed. Please contact the front desk receptionist.');
    } finally {
      setIsCheckingIn(false);
    }
  };

  const handleSubmitIntake = async (e: React.FormEvent) => {
    e.preventDefault();
    const ref = checkInSuccess?.reference || appointmentData?.reference;
    if (!ref) return;

    setIntakeSaving(true);
    try {
      await apiRequest(`/appointments/public-intake/${ref}`, {
        method: 'POST',
        body: JSON.stringify({
          ...medicalConditions,
          allergies,
        }),
      });
      setIntakeSaved(true);
      setShowIntake(false);
    } catch (err: any) {
      alert(err.message || 'Failed to submit safety intake.');
    } finally {
      setIntakeSaving(false);
    }
  };

  const toggleAllergy = (name: string) => {
    setAllergies((prev) => (prev.includes(name) ? prev.filter((a) => a !== name) : [...prev, name]));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between font-sans selection:bg-teal-600 selection:text-white">
      {/* Header Bar */}
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur-md sticky top-0 z-40 shadow-xs">
        <div className="max-w-xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 p-1 bg-white rounded-xl border border-slate-200 shadow-sm flex items-center justify-center shrink-0">
              <img src="/logo.png" alt={`${clinicName} Logo`} className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-sm font-black text-slate-900 tracking-tight leading-tight line-clamp-1">{clinicName}</h1>
              <span className="text-[10px] font-black uppercase tracking-wider text-teal-800 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200 inline-block mt-0.5">
                Hospital Lobby Self Check-In
              </span>
            </div>
          </div>

          <a
            href={`tel:${clinicPhone.replace(/\D/g, '')}`}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-bold transition flex items-center gap-1.5 text-xs shrink-0 cursor-pointer"
            title="Reception Desk Phone"
          >
            <Phone className="w-3.5 h-3.5 text-teal-600" />
            <span className="hidden sm:inline">Help Desk</span>
          </a>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Welcome Banner */}
        <div className="bg-gradient-to-br from-teal-700 via-teal-800 to-slate-900 text-white rounded-3xl p-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-6 -mr-6 w-36 h-36 bg-teal-400/20 rounded-full blur-2xl pointer-events-none" />
          <div className="relative z-10 space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-500/20 text-teal-200 border border-teal-400/30 text-[11px] font-black uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-teal-300" />
              <span>Arrived at Clinic? Check In Here</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight leading-snug">
              Welcome to the Hospital! Confirm Your Arrival
            </h2>
            <p className="text-xs text-teal-100/90 leading-relaxed font-medium">
              If you booked online previously, enter your mobile number to check in, lock your live queue token, and alert the dental team.
            </p>
          </div>
        </div>

        {/* Search Input Box */}
        {!checkInSuccess && (
          <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
                Enter Mobile Number or Reference Code
              </label>
              {lobbyCode ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-800 text-[10px] font-black uppercase">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  <span>Standee QR Verified</span>
                </span>
              ) : null}
            </div>

            {lobbyCode && (
              <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2">
                <QrCode className="w-4 h-4 text-emerald-700 shrink-0" />
                <span className="text-[11px] font-semibold">
                  Verified with Reception Desk Code <strong className="font-mono font-black">{lobbyCode.toUpperCase()}</strong>
                </span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSearch();
              }}
              className="space-y-3"
            >
              <div className="relative">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setError(null);
                  }}
                  placeholder="e.g. 9876543210, last 4 digits (e.g. 3210), or AKS-..."
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border-2 border-slate-200 rounded-2xl text-base font-bold text-slate-900 focus:bg-white focus:border-teal-600 focus:ring-4 focus:ring-teal-100 transition outline-none"
                  autoFocus
                />
                <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {!lobbyCode && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={lobbyCode}
                    onChange={(e) => setLobbyCode(e.target.value.toUpperCase())}
                    placeholder="Desk Code (from Standee QR, e.g. A7E4F2)"
                    maxLength={10}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-semibold text-slate-800 placeholder:text-slate-400 uppercase outline-none focus:border-teal-500 focus:bg-white transition"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="w-full py-3.5 px-5 rounded-2xl bg-teal-600 hover:bg-teal-700 active:scale-98 text-white font-black text-sm flex items-center justify-center gap-2 shadow-md transition disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Searching Appointments...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    <span>Find My Booking</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* Error Alert / Walk-In Recommendation */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-3xl p-5 space-y-3 shadow-xs">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs">
                <p className="font-black text-rose-950">No Scheduled Booking Found for Today</p>
                <p className="text-rose-800 font-medium leading-relaxed">{error}</p>
              </div>
            </div>

            <div className="pt-2 border-t border-rose-200/60 flex flex-col sm:flex-row items-center gap-2">
              <span className="text-[11px] font-bold text-rose-900">Visiting as a Walk-In right now?</span>
              <button
                type="button"
                onClick={() => navigate('/book?mode=walkin')}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-black text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs"
              >
                <span>Register as Walk-In (Instant Queue)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 1: Appointment Found - Confirm Check-In Card */}
        {appointmentData && !checkInSuccess && (
          <div className="bg-white border-2 border-teal-500/40 rounded-3xl p-6 shadow-lg space-y-5 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center font-black">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base text-slate-900">{appointmentData.patientName}</h3>
                  <p className="text-[11px] text-slate-500 font-mono">+91 {appointmentData.patientPhone}</p>
                </div>
              </div>

              <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-900 border border-amber-300">
                {appointmentData.status === 'SCHEDULED' ? 'Scheduled Today' : appointmentData.status}
              </span>
            </div>

            {/* Appointment Details Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Scheduled Time</span>
                <span className="font-black text-slate-900 text-sm mt-0.5 block flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-teal-600" />
                  <span>
                    {appointmentData.scheduledStart
                      ? new Date(appointmentData.scheduledStart).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'Today'}
                  </span>
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Assigned Operatory</span>
                <span className="font-black text-slate-900 text-sm mt-0.5 block">
                  Chair #{appointmentData.chairNumber || 1}
                </span>
                <span className="text-[10px] text-teal-700 font-bold block">
                  {appointmentData.dentistName || 'Duty Dentist'}
                </span>
              </div>
            </div>

            {/* Concern / Reason */}
            {appointmentData.reason && (
              <div className="p-3 bg-teal-50/50 rounded-2xl border border-teal-200 text-xs">
                <span className="text-[10px] uppercase font-bold text-teal-800 block">Chief Complaint</span>
                <p className="font-semibold text-slate-800 mt-0.5">{appointmentData.reason}</p>
              </div>
            )}

            {/* Big Action Check-In Button */}
            <button
              type="button"
              disabled={isCheckingIn}
              onClick={handlePerformCheckIn}
              className="w-full py-4 px-6 rounded-2xl bg-linear-to-r from-emerald-600 via-teal-700 to-emerald-800 hover:from-emerald-700 hover:to-teal-800 active:scale-98 text-white font-black text-base flex items-center justify-center gap-2.5 shadow-lg transition disabled:opacity-50 cursor-pointer"
            >
              {isCheckingIn ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Recording Check-In...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-6 h-6" />
                  <span>💺 Check In Now & Join Lobby Queue</span>
                </>
              )}
            </button>
            <p className="text-center text-[11px] text-slate-500 font-medium">
              Clicking check-in notifies the front desk receptionist and adds you to the live doctor queue.
            </p>
          </div>
        )}

        {/* Step 2: Check-In Live Beeper / Turn Call Card */}
        {checkInSuccess && (
          <div className="space-y-4">
            {checkInSuccess.status === 'CALLED' ? (
              /* --- HERO MOMENT: HIGH VISIBILITY TURN CALL SCREEN --- */
              <div className="bg-gradient-to-b from-emerald-600 via-teal-700 to-slate-950 text-white border-4 border-emerald-400 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-center animate-in zoom-in fade-in duration-300 relative overflow-hidden">
                <div className="absolute top-0 right-0 -mt-10 -mr-10 w-44 h-44 bg-emerald-400/30 rounded-full blur-3xl pointer-events-none" />

                {/* Animated Pulsing Beacon */}
                <div className="relative flex items-center justify-center mx-auto w-24 h-24">
                  <div className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-40" />
                  <div className="absolute -inset-2 rounded-full bg-emerald-300 animate-pulse opacity-50" />
                  <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-slate-950 flex items-center justify-center shadow-xl font-black">
                    <Bell className="w-10 h-10 animate-bounce text-slate-950" />
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="inline-block px-4 py-1.5 rounded-full bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-widest shadow-md animate-pulse">
                    🔔 YOUR OPERATORY CHAIR IS READY!
                  </span>
                  <h3 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
                    IT'S YOUR TURN NOW!
                  </h3>
                  <p className="text-sm text-emerald-100 font-semibold max-w-sm mx-auto">
                    Welcome, <strong className="text-white underline">{checkInSuccess.patientName}</strong>! Please make your way into the operatory room now.
                  </p>
                </div>

                {/* Massive Chair Announcement Box */}
                <div className="p-6 bg-white/10 backdrop-blur-md rounded-3xl border-2 border-emerald-300/60 shadow-inner space-y-3">
                  <span className="text-[11px] font-black uppercase tracking-widest text-emerald-300 block">
                    PLEASE PROCEED TO
                  </span>
                  <div className="text-4xl sm:text-5xl font-black text-amber-300 tracking-tight font-sans">
                    OPERATORY CHAIR #{checkInSuccess.chairNumber || 1}
                  </div>
                  <div className="text-xs sm:text-sm font-bold text-emerald-100 flex items-center justify-center gap-2">
                    <User className="w-4 h-4 text-emerald-300" />
                    <span>Doctor: {checkInSuccess.dentistName || 'Attending Surgeon'}</span>
                  </div>
                  <div className="pt-2">
                    <span className="inline-block px-3 py-1 bg-white/20 rounded-xl text-xs font-mono font-black text-white">
                      YOUR QUEUE TOKEN #{checkInSuccess.tokenNumber || 1}
                    </span>
                  </div>
                </div>

                {/* Instructions */}
                <div className="bg-emerald-950/60 border border-emerald-400/30 rounded-2xl p-4 text-xs text-emerald-100 text-left space-y-1.5">
                  <div className="font-black text-white flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>Doctor & Clinical Team are Waiting:</span>
                  </div>
                  <p className="text-[11px] text-emerald-200/90 leading-relaxed">
                    The surgical chair has been sanitized and prepared for you. If you need any assistance finding Operatory #{checkInSuccess.chairNumber || 1}, please ask the front desk receptionist.
                  </p>
                </div>

                {/* Replay Sound Alert Button */}
                <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      playPatientTurnBeeper();
                      setTestSoundPlayed(true);
                    }}
                    className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg transition active:scale-95 cursor-pointer"
                  >
                    <Volume2 className="w-4 h-4" />
                    <span>Re-play Sound & Vibration Alert</span>
                  </button>
                </div>
              </div>
            ) : checkInSuccess.status === 'IN_CHAIR' ? (
              /* --- CALM IN-TREATMENT CONSULTATION SCREEN --- */
              <div className="bg-gradient-to-b from-teal-900 via-slate-900 to-slate-950 text-white border-2 border-teal-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-center animate-in fade-in duration-300 relative overflow-hidden">
                <div className="w-16 h-16 rounded-2xl bg-teal-800/80 border border-teal-400/40 text-teal-300 flex items-center justify-center mx-auto shadow-inner">
                  <Armchair className="w-8 h-8" />
                </div>

                <div className="space-y-1.5">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-500/20 text-teal-300 border border-teal-400/30 text-[10px] font-black uppercase tracking-wider">
                    <span className="w-2 h-2 rounded-full bg-teal-400 animate-ping" />
                    <span>Procedure in Progress</span>
                  </span>
                  <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                    You Are Currently in Treatment
                  </h3>
                  <p className="text-xs text-slate-300 max-w-sm mx-auto font-medium">
                    Welcome, <strong className="text-white">{checkInSuccess.patientName}</strong>. You are seated in Operatory Chair #{checkInSuccess.chairNumber || 1} with <strong className="text-teal-300">{checkInSuccess.dentistName || 'Duty Dentist'}</strong>.
                  </p>
                </div>

                <div className="p-4 bg-white/5 border border-white/10 rounded-2xl text-xs text-slate-300 space-y-1">
                  <div className="font-bold text-white">Live Session Active</div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Please relax — our clinical team is taking gentle care of your oral health. When your treatment concludes, the front desk will prepare your summary and bill.
                  </p>
                </div>
              </div>
            ) : (
              /* --- LIVE WAITING LOBBY BEEPER SCREEN --- */
              <div className="bg-white border-2 border-emerald-500 rounded-3xl p-6 sm:p-7 shadow-xl space-y-6 text-center animate-in fade-in zoom-in duration-300">
                {/* Live Connectivity Badge */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-900 border border-emerald-300 text-[11px] font-black">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Live Beeper Active</span>
                  </div>

                  <span className="text-[10px] font-mono font-bold text-slate-600 flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 text-teal-600 animate-spin" style={{ animationDuration: '4s' }} />
                    <span>Auto-updating</span>
                  </span>
                </div>

                <div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                    Welcome, {checkInSuccess.patientName}!
                  </h3>
                  <p className="text-xs text-slate-600 mt-1 font-medium">
                    You are checked in and registered in the active hospital lobby queue.
                  </p>
                </div>

                {/* Massive Live Queue Token Display */}
                <div className="p-6 bg-gradient-to-b from-teal-50 to-emerald-50/40 rounded-3xl border-2 border-teal-300/80 shadow-inner space-y-2">
                  <span className="text-[11px] font-black uppercase tracking-widest text-teal-800 block">
                    YOUR LIVE CLINIC QUEUE TOKEN
                  </span>
                  <div className="text-5xl sm:text-6xl font-black font-mono text-teal-950 tracking-tight">
                    #{checkInSuccess.tokenNumber || 1}
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2 text-xs font-bold text-teal-900">
                    <span className="px-3 py-1.5 rounded-xl bg-white border border-teal-200 shadow-2xs">
                      Operatory Chair #{checkInSuccess.chairNumber || 1}
                    </span>
                    <span className="px-3 py-1.5 rounded-xl bg-white border border-teal-200 shadow-2xs">
                      {checkInSuccess.currentlyAhead || 0} Patient{checkInSuccess.currentlyAhead === 1 ? '' : 's'} Ahead
                    </span>
                  </div>
                </div>

                {/* Live Operatory Chairs Activity Mini-Board (Strictly Sanitized - Zero Peer Names) */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-left space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase text-slate-800 flex items-center gap-1.5">
                      <Armchair className="w-4 h-4 text-teal-600" />
                      <span>Live Operatory Chairs Activity</span>
                    </span>
                    <span className="text-[10px] font-bold text-slate-600">Hospital Status</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[1, 2, 3].map((chairNum) => {
                      const serving = (checkInSuccess.activeChairsServing || []).find(
                        (c: any) => c.chairNumber === chairNum
                      );
                      const isCalling = serving?.isCalling || serving?.status === 'CALLED';
                      const isBusy = serving && !isCalling;

                      return (
                        <div
                          key={chairNum}
                          className={`p-2.5 rounded-xl border text-xs transition-all ${
                            isCalling
                              ? 'bg-amber-50/90 border-amber-300 text-amber-950'
                              : isBusy
                              ? 'bg-sky-50/80 border-sky-300 text-sky-950'
                              : 'bg-emerald-50/80 border-emerald-300 text-emerald-950'
                          }`}
                        >
                          <div className="flex items-center justify-between font-black text-[11px]">
                            <span>Chair #{chairNum}</span>
                            <span
                              className={`w-2 h-2 rounded-full ${
                                isCalling
                                  ? 'bg-amber-500 animate-pulse'
                                  : isBusy
                                  ? 'bg-sky-500'
                                  : 'bg-emerald-500'
                              }`}
                            />
                          </div>
                          <div className="text-[10px] font-semibold mt-1">
                            {isCalling ? (
                              <span className="text-amber-900 font-bold">📢 Calling Token #{serving.tokenNumber}</span>
                            ) : isBusy ? (
                              <span className="text-sky-900">💺 In Treatment (Token #{serving.tokenNumber})</span>
                            ) : (
                              <span className="text-emerald-900">🟢 Free & Ready</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Sound Alert Ready Notice & Test Button (Explicit AudioContext Unlock) */}
                <div className="p-4 bg-teal-50 border border-teal-200 rounded-2xl text-left flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0">
                      <Volume2 className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-black text-xs text-teal-950">Sound & Vibration Alerts Ready</div>
                      <div className="text-[11px] text-teal-900 font-medium">
                        Keep this screen open in your phone. It will chime loudly and vibrate when called.
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      playPatientTurnBeeper();
                      setTestSoundPlayed(true);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-black text-xs shrink-0 transition cursor-pointer shadow-xs active:scale-95"
                  >
                    {testSoundPlayed ? '✓ Chime Tested & Audio Active' : '🔊 Tap to Test Chime'}
                  </button>
                </div>

                {/* Waiting Room Instructions */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-left text-xs space-y-2 text-slate-700">
                  <h4 className="font-black text-slate-900 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-teal-600" />
                    <span>What to do next:</span>
                  </h4>
                  <ul className="space-y-1.5 text-[11px] leading-relaxed text-slate-600 pl-4 list-disc font-medium">
                    <li>Please relax in the waiting lounge.</li>
                    <li>Your doctor and reception desk have your arrival record.</li>
                    <li>When your operatory chair opens, this screen will instantly turn green and beep!</li>
                  </ul>
                </div>
              </div>
            )}

            {/* Fast-Track Medical Screening Button */}
            {!intakeSaved && (
              <div className="border border-teal-200 rounded-2xl p-4 bg-white text-left space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-teal-700" />
                    <span className="font-black text-xs text-teal-950">While Waiting: 30s Health Safety Check</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowIntake(!showIntake)}
                    className="px-3 py-1 bg-white hover:bg-teal-100 text-teal-900 border border-teal-300 rounded-lg text-xs font-black transition cursor-pointer"
                  >
                    {showIntake ? 'Close' : 'Fill Form'}
                  </button>
                </div>

                {showIntake && (
                  <form onSubmit={handleSubmitIntake} className="space-y-3 pt-2 border-t border-teal-200/60 text-xs">
                    <p className="text-[11px] text-teal-900 font-medium">
                      Select any existing health conditions so the dentist can adjust anesthesia and medications:
                    </p>

                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { key: 'diabetic', label: 'Diabetes' },
                        { key: 'hypertension', label: 'High BP / Hypertension' },
                        { key: 'cardiac', label: 'Heart / Cardiac Condition' },
                        { key: 'bloodThinners', label: 'Taking Blood Thinners' },
                        { key: 'pregnant', label: 'Pregnancy / Nursing' },
                      ].map((item) => (
                        <label
                          key={item.key}
                          className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl border border-teal-200 cursor-pointer text-[11px] font-semibold text-slate-800"
                        >
                          <input
                            type="checkbox"
                            checked={(medicalConditions as any)[item.key]}
                            onChange={(e) =>
                              setMedicalConditions({ ...medicalConditions, [item.key]: e.target.checked })
                            }
                            className="rounded text-teal-600 focus:ring-teal-500 w-4 h-4"
                          />
                          <span>{item.label}</span>
                        </label>
                      ))}
                    </div>

                    <div>
                      <span className="text-[11px] font-bold text-slate-700 block mb-1">Known Drug Allergies:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {['Penicillin', 'Sulfa Drugs', 'Aspirin', 'Local Anesthesia'].map((alg) => (
                          <button
                            key={alg}
                            type="button"
                            onClick={() => toggleAllergy(alg)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                              allergies.includes(alg)
                                ? 'bg-rose-600 text-white border border-rose-700'
                                : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            {alg}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={intakeSaving}
                      className="w-full py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-black text-xs transition cursor-pointer"
                    >
                      {intakeSaving ? 'Saving Safety Profile...' : 'Save Health Safety Profile'}
                    </button>
                  </form>
                )}
              </div>
            )}

            {intakeSaved && (
              <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-950 flex items-center justify-center gap-2">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>Health Safety Profile recorded! Doctor alerted.</span>
              </div>
            )}

            {/* Reset / Search Another */}
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => {
                  setCheckInSuccess(null);
                  setAppointmentData(null);
                  setQuery('');
                }}
                className="text-xs font-bold text-slate-500 hover:text-slate-800 underline cursor-pointer"
              >
                Check in another patient
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 px-4 text-center text-xs text-slate-500 space-y-1">
        <p className="font-bold text-slate-700">{clinicName}</p>
        <p className="text-[11px]">{clinicAddress} • Tel: {clinicPhone}</p>
      </footer>
    </div>
  );
};
