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
  QrCode,
  Check,
  Volume2,
  Bell,
  Armchair,
  RefreshCw,
  KeyRound,
  ShieldAlert,
  HelpCircle,
  Calendar,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { triggerClinicSync, playClinicAlertChime, playPatientTurnBeeper } from '../../lib/sync';
import { useTenant } from '../../hooks/useTenant';

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
  const { clinic: tenantClinic } = useTenant();
  const activeClinicCode = tenantClinic?.code || clinicCode;
  const activeClinicName = tenantClinic?.name || clinicName;
  const activeClinicPhone = tenantClinic?.phone || clinicPhone;
  const activeClinicAddress = tenantClinic?.address 
    ? `${tenantClinic.address}, ${tenantClinic.city || ''}` 
    : clinicAddress;

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Mode: Tab 1 (I Have a Booking) vs Tab 2 (Walk-In)
  const initialMode = searchParams.get('mode') === 'walkin' ? 'walkin' : 'booked';
  const [activeTab, setActiveTab] = useState<'booked' | 'walkin'>(initialMode);

  // Form State for Booked Patients
  const initialPhone = searchParams.get('phone') || '';
  const initialRef = searchParams.get('ref') || '';
  const [phone, setPhone] = useState(initialPhone);
  const [bookingRefOrName, setBookingRefOrName] = useState(initialRef);
  const [lobbyCode, setLobbyCode] = useState('');

  // Form State for Walk-In Patients
  const [walkinName, setWalkinName] = useState('');
  const [walkinPhone, setWalkinPhone] = useState('');
  const [walkinAge, setWalkinAge] = useState('');
  const [walkinGender, setWalkinGender] = useState<'MALE' | 'FEMALE' | 'OTHER'>('MALE');
  const [walkinComplaint, setWalkinComplaint] = useState('Toothache / Dental Consultation');
  const [walkinLobbyCode, setWalkinLobbyCode] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLockedOut, setIsLockedOut] = useState(false);

  // Success State
  const [checkInSuccess, setCheckInSuccess] = useState<any | null>(null);

  // Pre-visit Health Intake Mini-Form
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

  // Periodic Live Status Polling Hook (8 second interval)
  useEffect(() => {
    if (!checkInSuccess) return;

    const identifier = checkInSuccess.reference || checkInSuccess.appointmentId;
    if (!identifier) return;

    const pollStatus = async () => {
      try {
        const res = await apiRequest<any>(`/appointments/public-status/${encodeURIComponent(identifier)}`);
        if (res && res.success) {
          setLastSyncedTime(new Date());

          // Transition to CALLED -> ring live beeper & trigger vibration
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
            isConfirmedAtDesk: res.isConfirmedAtDesk ?? prev?.isConfirmedAtDesk,
          }));
        }
      } catch (err) {
        // Silent catch during background sync polling
      }
    };

    const intervalId = setInterval(pollStatus, 8000);
    return () => clearInterval(intervalId);
  }, [checkInSuccess?.reference, checkInSuccess?.status, checkInSuccess?.appointmentId]);

  // Submit Booked Patient Self Check-In
  const handleBookedCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = phone.trim().replace(/\D/g, '');
    const cleanRefOrName = bookingRefOrName.trim();
    const cleanCode = lobbyCode.trim();

    if (!cleanPhone || cleanPhone.length < 10) {
      setError('Please enter your valid 10-digit mobile number.');
      return;
    }

    if (!cleanRefOrName) {
      setError('Please enter your Booking Reference (e.g. AKS-...) OR your registered Full Name.');
      return;
    }

    if (!cleanCode) {
      setError('Please enter the Check-In Code displayed on the Waiting Room TV or reception counter.');
      return;
    }

    if (tenantClinic?.isOnLeave) {
      setError(`Hospital is currently closed for Holiday / Leave (${tenantClinic.leaveReason || 'Holiday'}). Check-in is paused.`);
      return;
    }

    setLoading(true);
    setError(null);
    setIsLockedOut(false);

    try {
      // Determine if identifier is booking reference or phone
      const isRef = cleanRefOrName.toUpperCase().includes('AKS') || cleanRefOrName.includes('-');
      const identifier = isRef ? cleanRefOrName : cleanPhone;
      const patientNameParam = isRef ? undefined : cleanRefOrName;

      const res = await apiRequest<any>('/appointments/public-checkin', {
        method: 'POST',
        body: JSON.stringify({
          identifier,
          patientPhone: cleanPhone,
          patientName: patientNameParam,
          clinicCode: activeClinicCode,
          lobbyCode: cleanCode,
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
          isConfirmedAtDesk: res.isConfirmedAtDesk,
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
        throw new Error('Check-in could not be processed.');
      }
    } catch (err: any) {
      const msg = err.message || 'Check-in failed.';
      setError(msg);
      if (msg.includes('temporarily paused') || msg.includes('Too many failed')) {
        setIsLockedOut(true);
      }
    } finally {
      setLoading(false);
    }
  };

  // Submit Walk-In Instant Registration & Check-In
  const handleWalkInCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = walkinName.trim();
    const cleanPhone = walkinPhone.trim().replace(/\D/g, '');
    const cleanCode = walkinLobbyCode.trim();

    if (!cleanName) {
      setError('Please enter your full name.');
      return;
    }
    if (!cleanPhone || cleanPhone.length < 10) {
      setError('Please enter your 10-digit mobile number.');
      return;
    }
    if (!cleanCode) {
      setError('Please enter the Check-In Code displayed on the Waiting Room TV or reception counter.');
      return;
    }

    if (tenantClinic?.isOnLeave) {
      setError(`Hospital is currently closed for Holiday / Leave (${tenantClinic.leaveReason || 'Holiday'}). Walk-in registration is paused.`);
      return;
    }

    setLoading(true);
    setError(null);
    setIsLockedOut(false);

    try {
      const res = await apiRequest<any>('/appointments/public-book', {
        method: 'POST',
        body: JSON.stringify({
          patientName: cleanName,
          patientPhone: cleanPhone,
          age: walkinAge ? parseInt(walkinAge, 10) : undefined,
          gender: walkinGender,
          reason: `[WALK-IN] ${walkinComplaint}`,
          clinicCode: activeClinicCode,
          lobbyCode: cleanCode,
          isWalkIn: true,
        }),
      });

      if (res && res.success) {
        setCheckInSuccess({
          reference: res.reference,
          tokenNumber: res.tokenNumber,
          currentlyAhead: res.currentlyAhead ?? 0,
          activeChairsServing: res.activeChairsServing || [],
          chairNumber: res.chairNumber,
          dentistName: res.dentistName,
          patientName: res.patientName || cleanName,
          status: res.status || 'CHECKED_IN',
          isConfirmedAtDesk: res.isConfirmedAtDesk,
          alreadyCheckedIn: false,
        });
        playClinicAlertChime();
        triggerClinicSync('patient_self_checked_in', {
          appointmentId: res.appointmentId,
          patientName: cleanName,
          tokenNumber: res.tokenNumber,
        });
      } else {
        throw new Error('Walk-in check-in could not be completed.');
      }
    } catch (err: any) {
      const msg = err.message || 'Walk-in check-in failed.';
      setError(msg);
      if (msg.includes('temporarily paused') || msg.includes('Too many failed')) {
        setIsLockedOut(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitIntake = async (e: React.FormEvent) => {
    e.preventDefault();
    const ref = checkInSuccess?.reference;
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
              <img src="/logo.png" alt={`${activeClinicName} Logo`} className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-sm font-black text-slate-900 tracking-tight leading-tight line-clamp-1">{activeClinicName}</h1>
              <span className="text-[10px] font-black uppercase tracking-wider text-teal-800 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200 inline-block mt-0.5">
                Hospital Lobby Self Check-In
              </span>
            </div>
          </div>

          <a
            href={`tel:${activeClinicPhone.replace(/\D/g, '')}`}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-bold transition flex items-center gap-1.5 text-xs shrink-0 cursor-pointer"
            title="Reception Desk Phone"
          >
            <Phone className="w-3.5 h-3.5 text-teal-600" />
            <span className="hidden sm:inline">Reception Desk</span>
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
              <span>Hospital Arrival Portal</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight leading-snug">
              Welcome to the Hospital! Confirm Your Arrival
            </h2>
            <p className="text-xs text-teal-100/90 leading-relaxed font-medium">
              Check in with the rotating code shown on the waiting room TV or reception counter to receive your live queue token.
            </p>
          </div>
        </div>

        {/* Hospital Closed / On Leave Notice */}
        {tenantClinic?.isOnLeave && (
          <div className="bg-gradient-to-r from-rose-50 to-amber-50 border-2 border-rose-400 rounded-3xl p-5 space-y-3 shadow-md animate-in fade-in">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h3 className="font-black text-sm text-rose-950">⛔ Hospital Closed for Holiday / Leave</h3>
                <p className="text-xs text-rose-900 font-medium leading-relaxed">
                  {activeClinicName} is currently observing a holiday ({tenantClinic.leaveReason || 'Holiday'}). Public arrivals, appointments, and walk-in registrations are temporarily paused.
                </p>
                <div className="pt-2">
                  <span className="inline-block px-3 py-1 bg-rose-200/80 rounded-xl text-xs font-black text-rose-950">
                    📞 For dental emergencies, please call reception directly: {activeClinicPhone}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Lockout / Pause Banner */}
        {isLockedOut && (
          <div className="bg-amber-50 border-2 border-amber-400 rounded-3xl p-5 space-y-3 shadow-md animate-in fade-in">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-6 h-6 text-amber-700 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h3 className="font-black text-sm text-amber-950">Self Check-In Temporarily Paused</h3>
                <p className="text-xs text-amber-900 font-medium leading-relaxed">
                  For clinic security, self check-in has been temporarily paused after multiple unsuccessful attempts.
                </p>
                <div className="pt-2">
                  <span className="inline-block px-3 py-1 bg-amber-200/80 rounded-xl text-xs font-black text-amber-950">
                    👉 Please step forward to the reception counter — our staff will check you in immediately!
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Standard Error Alert */}
        {error && !isLockedOut && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3 text-xs text-rose-800 shadow-xs">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-black text-rose-950 block">Check-In Verification Failed</span>
              <p className="font-medium leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        {/* Mode Selector Tabs (Booked vs Walk-in) */}
        {!checkInSuccess && (
          <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-5">
            <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-2xl text-xs font-black">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('booked');
                  setError(null);
                }}
                className={`py-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeTab === 'booked'
                    ? 'bg-white text-teal-900 shadow-xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Calendar className="w-4 h-4 text-teal-600" />
                <span>I Have a Booking</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('walkin');
                  setError(null);
                }}
                className={`py-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeTab === 'walkin'
                    ? 'bg-white text-teal-900 shadow-xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <User className="w-4 h-4 text-amber-600" />
                <span>I Am a Walk-In</span>
              </button>
            </div>

            {/* TAB 1: I HAVE A BOOKING */}
            {activeTab === 'booked' && (
              <form onSubmit={handleBookedCheckIn} className="space-y-4">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                    1. Registered Mobile Number
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        setError(null);
                      }}
                      placeholder="e.g. 9876543210"
                      maxLength={15}
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl text-base font-bold text-slate-900 focus:bg-white focus:border-teal-600 focus:ring-4 focus:ring-teal-100 transition outline-none"
                      required
                    />
                    <Phone className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5 flex items-center justify-between">
                    <span>2. Booking Reference OR Full Name</span>
                    <span className="text-[10px] text-teal-700 font-bold normal-case">Strict Server Verification</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={bookingRefOrName}
                      onChange={(e) => {
                        setBookingRefOrName(e.target.value);
                        setError(null);
                      }}
                      placeholder="e.g. AKS-20261012-001 or Patient's Booked Name"
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl text-base font-bold text-slate-900 focus:bg-white focus:border-teal-600 focus:ring-4 focus:ring-teal-100 transition outline-none"
                      required
                    />
                    <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 font-medium">
                    Enter the booking reference from your SMS/WhatsApp confirmation, or your registered patient name.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5 flex items-center justify-between">
                    <span>3. On-Screen Lobby Code</span>
                    <span className="text-[10px] text-amber-700 font-bold normal-case flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>Shown on Waiting Room TV</span>
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={lobbyCode}
                      onChange={(e) => {
                        setLobbyCode(e.target.value.replace(/[^0-9A-Za-z]/g, '').toUpperCase());
                        setError(null);
                      }}
                      placeholder="e.g. 8429"
                      maxLength={6}
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl text-lg font-mono font-black text-slate-900 tracking-widest focus:bg-white focus:border-teal-600 focus:ring-4 focus:ring-teal-100 transition outline-none"
                      required
                    />
                    <KeyRound className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 font-medium">
                    Look at the waiting room TV or ask reception for today's rotating arrival code.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 px-5 rounded-2xl bg-teal-600 hover:bg-teal-700 active:scale-98 text-white font-black text-sm flex items-center justify-center gap-2 shadow-md transition disabled:opacity-50 cursor-pointer mt-2"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Verifying & Recording Check-In...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-5 h-5" />
                      <span>Verify & Check In Now</span>
                    </>
                  )}
                </button>
              </form>
            )}

            {/* TAB 2: I AM A WALK-IN */}
            {activeTab === 'walkin' && (
              <form onSubmit={handleWalkInCheckIn} className="space-y-4">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                    1. Patient Full Name
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={walkinName}
                      onChange={(e) => {
                        setWalkinName(e.target.value);
                        setError(null);
                      }}
                      placeholder="e.g. Karthik Kumar"
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl text-base font-bold text-slate-900 focus:bg-white focus:border-teal-600 focus:ring-4 focus:ring-teal-100 transition outline-none"
                      required
                    />
                    <User className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                    2. Mobile Number
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      value={walkinPhone}
                      onChange={(e) => {
                        setWalkinPhone(e.target.value);
                        setError(null);
                      }}
                      placeholder="e.g. 9876543210"
                      maxLength={15}
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl text-base font-bold text-slate-900 focus:bg-white focus:border-teal-600 focus:ring-4 focus:ring-teal-100 transition outline-none"
                      required
                    />
                    <Phone className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                      Age (Years)
                    </label>
                    <input
                      type="number"
                      value={walkinAge}
                      onChange={(e) => setWalkinAge(e.target.value)}
                      placeholder="e.g. 28"
                      min={1}
                      max={120}
                      className="w-full px-3.5 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl text-base font-bold text-slate-900 focus:bg-white focus:border-teal-600 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                      Gender
                    </label>
                    <select
                      value={walkinGender}
                      onChange={(e) => setWalkinGender(e.target.value as any)}
                      className="w-full px-3.5 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl text-sm font-bold text-slate-900 focus:bg-white focus:border-teal-600 outline-none"
                    >
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                    Chief Complaint / Dental Reason
                  </label>
                  <input
                    type="text"
                    value={walkinComplaint}
                    onChange={(e) => setWalkinComplaint(e.target.value)}
                    placeholder="e.g. Toothache, cleaning, bleeding gums"
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl text-sm font-bold text-slate-900 focus:bg-white focus:border-teal-600 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5 flex items-center justify-between">
                    <span>On-Screen Lobby Code</span>
                    <span className="text-[10px] text-amber-700 font-bold normal-case flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>Shown on Waiting Room TV</span>
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={walkinLobbyCode}
                      onChange={(e) => {
                        setWalkinLobbyCode(e.target.value.replace(/[^0-9A-Za-z]/g, '').toUpperCase());
                        setError(null);
                      }}
                      placeholder="e.g. 8429"
                      maxLength={6}
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl text-lg font-mono font-black text-slate-900 tracking-widest focus:bg-white focus:border-teal-600 focus:ring-4 focus:ring-teal-100 transition outline-none"
                      required
                    />
                    <KeyRound className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 px-5 rounded-2xl bg-amber-500 hover:bg-amber-600 active:scale-98 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-md transition disabled:opacity-50 cursor-pointer mt-2"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>Registering Walk-In...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      <span>Register & Join Waiting Queue</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        )}

        {/* Check-In Success State & Live Beeper */}
        {checkInSuccess && (
          <div className="space-y-4">
            {checkInSuccess.status === 'CALLED' ? (
              /* --- HIGH VISIBILITY TURN CALL SCREEN --- */
              <div className="bg-gradient-to-b from-emerald-600 via-teal-700 to-slate-950 text-white border-4 border-emerald-400 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-center animate-in zoom-in fade-in duration-300 relative overflow-hidden">
                <div className="absolute top-0 right-0 -mt-10 -mr-10 w-44 h-44 bg-emerald-400/30 rounded-full blur-3xl pointer-events-none" />

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
              /* --- IN-TREATMENT SCREEN --- */
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

                {/* Desk Confirmation Notice */}
                {!checkInSuccess.isConfirmedAtDesk && (
                  <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl text-left flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <strong className="text-amber-950 font-black block">Please Confirm with Reception Desk</strong>
                      <p className="text-amber-900 mt-0.5 font-medium leading-relaxed">
                        Your self check-in was recorded. Please show yourself to the front desk counter so the receptionist can confirm your physical presence in the lounge.
                      </p>
                    </div>
                  </div>
                )}

                {checkInSuccess.isConfirmedAtDesk && (
                  <div className="p-2.5 bg-emerald-50 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-900 flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Reception Desk Confirmed Your Presence</span>
                  </div>
                )}

                <div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                    Welcome, {checkInSuccess.patientName}!
                  </h3>
                  <p className="text-xs text-slate-600 mt-1 font-medium">
                    You are checked in and registered in the active hospital lobby queue.
                  </p>
                </div>

                {/* Live Queue Token Display */}
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

                {/* Sound Alert Test Button */}
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
                    {testSoundPlayed ? '✓ Audio Active' : '🔊 Test Chime'}
                  </button>
                </div>
              </div>
            )}

            {/* Fast-Track Medical Screening Button */}
            {!intakeSaved && (
              <div className="border border-teal-200 rounded-2xl p-4 bg-white text-left space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="font-black text-xs text-teal-950">While Waiting: 30s Health Safety Check</span>
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
                  setPhone('');
                  setBookingRefOrName('');
                  setLobbyCode('');
                  setWalkinName('');
                  setWalkinPhone('');
                  setWalkinLobbyCode('');
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
        <p className="font-bold text-slate-700">{activeClinicName}</p>
        <p className="text-[11px]">{activeClinicAddress} • Tel: {activeClinicPhone}</p>
      </footer>
    </div>
  );
};
