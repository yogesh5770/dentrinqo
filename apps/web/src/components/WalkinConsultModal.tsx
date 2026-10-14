import React, { useState, useEffect } from 'react';
import { apiRequest } from '../lib/api';
import { triggerClinicSync, playClinicAlertChime } from '../lib/sync';
import {
  X,
  Zap,
  Phone,
  User,
  CheckCircle2,
  AlertTriangle,
  Armchair,
  Stethoscope,
  Printer,
  QrCode,
  Send,
  Sparkles,
  Users,
  UserCheck,
  Check,
  ChevronRight,
  ShieldCheck,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

interface WalkinConsultModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (result: any) => void;
}

export const WalkinConsultModal: React.FC<WalkinConsultModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  if (!isOpen) return null;

  const { user } = useAuth();
  const clinicName = user?.clinic?.name || 'Dental Clinic';
  const clinicCode = user?.clinic?.code || '';

  // Form Fields
  const [phone, setPhone] = useState('');
  const [searchingPhone, setSearchingPhone] = useState(false);
  const [matchingPatients, setMatchingPatients] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);
  const [isAddingNewPatient, setIsAddingNewPatient] = useState(false);

  // New Patient Details
  const [fullName, setFullName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [age, setAge] = useState('');
  const [dobApproximate, setDobApproximate] = useState(false);
  const [gender, setGender] = useState<'MALE' | 'FEMALE' | 'OTHER'>('MALE');
  const [allergies, setAllergies] = useState('');
  const [reason, setReason] = useState('General Dental Consultation & Examination');

  // Doctor & Consent
  const [preferredDentistId, setPreferredDentistId] = useState<string>('');
  const [dentists, setDentists] = useState<any[]>([]);
  const [consentWhatsapp, setConsentWhatsapp] = useState(true);
  const [consentDataUse, setConsentDataUse] = useState(true);

  const handleDobChange = (val: string) => {
    setDateOfBirth(val);
    setDobApproximate(false);
    if (val) {
      const d = new Date(val);
      const computedAge = Math.max(0, new Date().getFullYear() - d.getFullYear());
      setAge(String(computedAge));
    }
  };

  const handleAgeChange = (val: string) => {
    setAge(val);
    setDobApproximate(true);
    if (val && !isNaN(Number(val))) {
      const approxYear = new Date().getFullYear() - parseInt(val, 10);
      setDateOfBirth(`${approxYear}-01-01`);
    }
  };

  // Submission & Result
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState<any | null>(null);
  const [clinicStatus, setClinicStatus] = useState<any | null>(null);

  // Load active dentists and clinic operational status
  useEffect(() => {
    const fetchDentistsAndStatus = async () => {
      try {
        const [usersRes, statusRes] = await Promise.all([
          apiRequest<any[]>('/users').catch(() => []),
          apiRequest<any>('/clinic/status').catch(() => null),
        ]);
        if (Array.isArray(usersRes)) {
          const docs = usersRes.filter(u => u.role === 'DENTIST' || u.role === 'ADMIN');
          setDentists(docs);
        }
        if (statusRes) {
          setClinicStatus(statusRes);
        }
      } catch {}
    };
    fetchDentistsAndStatus();
  }, []);

  // Phone search debouncing
  useEffect(() => {
    const cleanDigits = phone.replace(/\D/g, '');
    if (cleanDigits.length === 10) {
      setSearchingPhone(true);
      setErrorMsg(null);
      apiRequest<{ exists: boolean; patients: any[] }>(`/appointments/lookup-by-phone?phone=${cleanDigits}`)
        .then(res => {
          if (res && res.exists && res.patients.length > 0) {
            setMatchingPatients(res.patients);
            // If only 1 patient, automatically select them
            if (res.patients.length === 1) {
              setSelectedPatientId(res.patients[0].id);
              setSelectedPatient(res.patients[0]);
              setIsAddingNewPatient(false);
            } else {
              setSelectedPatientId(null);
              setSelectedPatient(null);
              setIsAddingNewPatient(false);
            }
          } else {
            setMatchingPatients([]);
            setSelectedPatientId(null);
            setSelectedPatient(null);
            setIsAddingNewPatient(true);
          }
        })
        .catch(() => {
          setMatchingPatients([]);
          setIsAddingNewPatient(true);
        })
        .finally(() => {
          setSearchingPhone(false);
        });
    } else {
      setMatchingPatients([]);
      setSelectedPatientId(null);
      setSelectedPatient(null);
      if (cleanDigits.length < 10) {
        setIsAddingNewPatient(false);
      }
    }
  }, [phone]);

  const handleSelectExisting = (pt: any) => {
    setSelectedPatientId(pt.id);
    setSelectedPatient(pt);
    setIsAddingNewPatient(false);
    setErrorMsg(null);
  };

  const handleSwitchToNewPatient = () => {
    setSelectedPatientId(null);
    setSelectedPatient(null);
    setIsAddingNewPatient(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanDigits = phone.replace(/\D/g, '');
    if (cleanDigits.length < 10) {
      setErrorMsg('Please enter a valid 10-digit mobile number.');
      return;
    }

    if (!selectedPatientId && !fullName.trim()) {
      setErrorMsg('Please enter the patient’s full name or select an existing patient.');
      return;
    }

    if (!selectedPatientId && !consentDataUse) {
      setErrorMsg('Patient consent for medical data processing is required under DPDP Act.');
      return;
    }

    if (clinicStatus && !clinicStatus.isOpen) {
      setErrorMsg(`Hospital is currently closed (${clinicStatus.message || 'Outside hours'}). Walk-in consultations cannot be accepted while the clinic is closed.`);
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        phone: cleanDigits,
        reason: reason.trim() || 'General Consultation',
        preferredDentistId: preferredDentistId || undefined,
      };

      if (selectedPatientId) {
        payload.patientId = selectedPatientId;
      } else {
        payload.fullName = fullName.trim();
        payload.age = age ? parseInt(age, 10) : undefined;
        payload.dateOfBirth = dateOfBirth || undefined;
        payload.dobApproximate = dobApproximate;
        payload.gender = gender;
        payload.allergies = allergies ? allergies.split(',').map(a => a.trim()).filter(Boolean) : [];
        payload.consentWhatsapp = consentWhatsapp;
        payload.consentDataUse = consentDataUse;
        payload.consentVersion = 'v1.0';
      }

      const res = await apiRequest<any>('/appointments/reception-quick-consult', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (res && res.success) {
        setBookingSuccess(res);
        playClinicAlertChime();
        triggerClinicSync('appt_CHECKED_IN', {
          appointmentId: res.appointmentId,
          chairNumber: res.chairNumber,
          tokenNumber: res.tokenNumber,
        });
        if (onSuccess) onSuccess(res);
      } else {
        throw new Error(res?.message || 'Could not allocate walk-in token and chair.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to complete quick consultation booking.');
    } finally {
      setSubmitting(false);
    }
  };

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const trackUrl = bookingSuccess?.trackingCode ? `${baseUrl}/track/${bookingSuccess.trackingCode}` : '';
  const qrImageUrl = trackUrl ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(trackUrl)}` : '';

  const handlePrintThermalSlip = () => {
    const printWindow = window.open('', '_blank', 'width=380,height=560');
    if (!printWindow) {
      alert('Pop-up blocked. Please allow pop-ups to print the thermal receipt.');
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Queue Slip - Token #${bookingSuccess?.tokenNumber}</title>
          <style>
            @page { size: 80mm auto; margin: 4mm; }
            body {
              font-family: 'Courier New', monospace, sans-serif;
              width: 72mm;
              margin: 0 auto;
              padding: 4mm;
              color: #000;
              font-size: 12px;
              line-height: 1.3;
              text-align: center;
            }
            .header { border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 8px; }
            .clinic-name { font-size: 15px; font-weight: 900; text-transform: uppercase; margin-bottom: 2px; }
            .sub-title { font-size: 10px; font-weight: bold; }
            .token-box {
              border: 2px solid #000;
              padding: 8px 4px;
              margin: 8px 0;
              border-radius: 6px;
            }
            .token-label { font-size: 11px; font-weight: bold; letter-spacing: 1px; }
            .token-number { font-size: 34px; font-weight: 900; margin: 2px 0; line-height: 1; }
            .chair-badge { font-size: 13px; font-weight: 900; background: #000; color: #fff; padding: 3px 6px; display: inline-block; border-radius: 4px; margin-top: 4px; }
            .details { text-align: left; margin: 8px 0; border-bottom: 1px dashed #000; padding-bottom: 6px; font-size: 11px; }
            .row { display: flex; justify-content: space-between; margin-bottom: 3px; }
            .qr-container { margin: 8px auto; text-align: center; }
            .qr-container img { width: 120px; height: 120px; display: block; margin: 0 auto; }
            .qr-caption { font-size: 9px; margin-top: 4px; font-weight: bold; }
            .footer { font-size: 9px; margin-top: 8px; font-style: italic; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="clinic-name">${clinicName}</div>
            <div class="sub-title">CONSULTATION QUEUE SLIP</div>
          </div>

          <div class="token-box">
            <div class="token-label">YOUR TOKEN NUMBER</div>
            <div class="token-number">#${bookingSuccess?.tokenNumber}</div>
            <div class="chair-badge">
              ${bookingSuccess?.isImmediateSeat ? `CHAIR #${bookingSuccess?.chairNumber}: GO NOW` : `CHAIR #${bookingSuccess?.chairNumber} (EXPECTED)`}
            </div>
          </div>

          <div class="details">
            <div class="row"><span>Patient:</span><strong>${bookingSuccess?.patientName}</strong></div>
            <div class="row"><span>UHID:</span><strong>${bookingSuccess?.uhid}</strong></div>
            <div class="row"><span>Status:</span><strong>CHECKED IN (DESK)</strong></div>
            <div class="row"><span>Time:</span><strong>${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong></div>
            <div class="row"><span>Date:</span><strong>${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong></div>
          </div>

          <div class="qr-container">
            <img src="${qrImageUrl}" alt="Scan for Live Queue Position" />
            <div class="qr-caption">Scan with Phone Camera for Live Status</div>
          </div>

          <div class="footer">
            Please be seated in the Waiting Lounge.<br/>Your token will be announced shortly.
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 800);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const handleShareWhatsApp = () => {
    if (!bookingSuccess) return;
    const cleanDigits = phone.replace(/\D/g, '');
    const message = encodeURIComponent(
      `🦷 *${clinicName} — Walk-in Consultation Slip*\n\n` +
      `👤 *Patient:* ${bookingSuccess.patientName}\n` +
      `🔖 *Token Number:* #${bookingSuccess.tokenNumber}\n` +
      `💺 *Assigned Chair:* ${bookingSuccess.isImmediateSeat ? `Chair #${bookingSuccess.chairNumber} (Go Now)` : `Chair #${bookingSuccess.chairNumber} (Expected)`}\n` +
      `🆔 *UHID:* ${bookingSuccess.uhid}\n` +
      `⏰ *Status:* Checked In at Reception Desk\n\n` +
      `📱 *Track your live turn & chair on your smartphone:*\n` +
      `${trackUrl}\n\n` +
      `_Please take a seat in our reception lounge. Your token will chime when your operatory is ready._`
    );
    window.open(`https://wa.me/${cleanDigits}?text=${message}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-teal-900 via-slate-900 to-teal-950 text-white border-b border-teal-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shadow-md shrink-0">
              <Zap className="w-5 h-5 fill-slate-950" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
                <span>⚡ Walk-in Consultation & Instant Chair</span>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 tracking-wider">
                  1-Click
                </span>
              </h3>
              <p className="text-xs text-teal-200 font-medium">
                Instant patient find-or-create, atomic queue token & operatory chair allocation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-teal-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-300 text-rose-950 text-xs font-bold flex items-center gap-2 animate-in fade-in">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {bookingSuccess ? (
            /* =========================================================================
               SUCCESS SCREEN: TOKEN #N, CHAIR DISPATCH, QR CODE & THERMAL PRINT
               ========================================================================= */
            <div className="space-y-5 text-center py-2 animate-in zoom-in-95 duration-200">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 mx-auto shadow-inner">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div>
                <h4 className="text-xl font-black text-slate-900">
                  Walk-in Consultation Booked!
                </h4>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Patient checked in at reception desk & added to today's active queue.
                </p>
              </div>

              {/* Huge Token & Chair Card */}
              <div className="bg-gradient-to-br from-teal-50 to-slate-50 p-5 rounded-3xl border-2 border-teal-500/40 shadow-sm space-y-3">
                <div className="flex items-center justify-center gap-2">
                  <span className="text-xs uppercase font-extrabold tracking-wider text-teal-900">
                    Queue Token
                  </span>
                </div>
                <div className="text-5xl font-black text-slate-900 font-mono tracking-tight">
                  #{bookingSuccess.tokenNumber}
                </div>

                {/* Chair Banner */}
                <div
                  className={`py-2 px-4 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 shadow-xs ${
                    bookingSuccess.isImmediateSeat
                      ? 'bg-emerald-500 text-slate-950 animate-pulse'
                      : 'bg-amber-100 text-amber-950 border border-amber-300'
                  }`}
                >
                  <Armchair className="w-4 h-4" />
                  <span>
                    {bookingSuccess.isImmediateSeat
                      ? `Chair #${bookingSuccess.chairNumber}: Go now to operatory`
                      : `Chair #${bookingSuccess.chairNumber} (expected) — seat when called`}
                  </span>
                </div>

                {/* Patients Ahead & Approx Wait */}
                <div className="grid grid-cols-2 gap-2 text-center text-xs">
                  <div className="bg-white/80 p-2 rounded-xl border border-teal-200">
                    <span className="text-slate-500 font-bold block text-[10px] uppercase">Patients Ahead</span>
                    <span className="font-black text-slate-900 text-sm">{bookingSuccess.patientsAhead ?? 0}</span>
                  </div>
                  <div className="bg-white/80 p-2 rounded-xl border border-teal-200">
                    <span className="text-slate-500 font-bold block text-[10px] uppercase">Approx. Wait Time</span>
                    <span className="font-black text-teal-800 text-sm">
                      {bookingSuccess.isImmediateSeat
                        ? 'Immediate Seating'
                        : `approx. ${Math.max(5, (bookingSuccess.patientsAhead ?? 1) * 15)} mins`}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-teal-200/60 flex items-center justify-between text-xs font-bold text-slate-600 px-2">
                  <span>Patient: <strong className="text-slate-900">{bookingSuccess.patientName}</strong></span>
                  <span>UHID: <strong className="font-mono text-teal-900">{bookingSuccess.uhid}</strong></span>
                </div>
              </div>

              {/* Scannable Smartphone Tracking QR Code */}
              {trackUrl && (
                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4 text-left">
                  <div className="flex items-center gap-3">
                    <img
                      src={qrImageUrl}
                      alt="Queue Tracker QR Code"
                      className="w-20 h-20 rounded-xl border border-slate-200 p-1 shrink-0"
                    />
                    <div>
                      <div className="font-black text-xs text-slate-900 flex items-center gap-1.5">
                        <QrCode className="w-3.5 h-3.5 text-teal-600" />
                        <span>Live Smartphone Tracker</span>
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                        Patient can scan to view live queue position, patients ahead & chair alerts on their own phone with zero names revealed.
                      </p>
                    </div>
                  </div>
                  <a
                    href={trackUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition whitespace-nowrap cursor-pointer flex items-center gap-1"
                  >
                    <span>Open Tracker</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}

              {/* Dispatch Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={handlePrintThermalSlip}
                  className="px-4 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs transition cursor-pointer shadow-md flex items-center justify-center gap-2 active:scale-95"
                >
                  <Printer className="w-4 h-4 text-amber-300" />
                  <span>🖨️ Print 80mm Slip</span>
                </button>

                <button
                  type="button"
                  onClick={handleShareWhatsApp}
                  className="px-4 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs transition cursor-pointer shadow-md flex items-center justify-center gap-2 active:scale-95"
                >
                  <Send className="w-4 h-4" />
                  <span>💬 Send via WhatsApp</span>
                </button>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setBookingSuccess(null);
                    onClose();
                  }}
                  className="w-full py-3 rounded-2xl bg-teal-50 hover:bg-teal-100 text-teal-900 font-black text-xs transition cursor-pointer border border-teal-200"
                >
                  Done & Refresh Queue
                </button>
              </div>
            </div>
          ) : (
            /* =========================================================================
               FORM SCREEN: MOBILE LOOKUP, SELECT OR QUICK-ADD, AND BOOK NOW
               ========================================================================= */
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Step 1: Mobile Number Input with Live Lookup */}
              <div>
                <label className="block text-xs font-black text-slate-800 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-teal-700" />
                    Patient Mobile Number <strong className="text-rose-500">*</strong>
                  </span>
                  {searchingPhone && (
                    <span className="text-[10px] text-teal-700 font-bold animate-pulse">
                      Searching records...
                    </span>
                  )}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 font-mono font-bold text-xs">
                    +91
                  </div>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="10-digit mobile (e.g. 9876543210)"
                    className="w-full pl-12 pr-4 py-3 rounded-2xl border-2 border-slate-200 focus:border-teal-600 focus:outline-hidden font-mono font-bold text-sm text-slate-900 transition-all bg-slate-50 focus:bg-white"
                  />
                </div>
              </div>

              {/* Step 2: Existing Patient Matches (1-Click Selection) */}
              {matchingPatients.length > 0 && !isAddingNewPatient && (
                <div className="space-y-2 p-3.5 rounded-2xl bg-teal-50/70 border border-teal-200 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-teal-950 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-teal-700" />
                      {matchingPatients.length} Existing Patient{matchingPatients.length > 1 ? 's' : ''} on this Phone
                    </span>
                    <button
                      type="button"
                      onClick={handleSwitchToNewPatient}
                      className="text-[11px] font-black text-teal-800 hover:text-teal-950 hover:underline cursor-pointer"
                    >
                      + New Family Member
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-2 pt-1">
                    {matchingPatients.map((pt) => {
                      const isSelected = selectedPatientId === pt.id;
                      return (
                        <div
                          key={pt.id}
                          onClick={() => handleSelectExisting(pt)}
                          className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                            isSelected
                              ? 'bg-teal-900 text-white border-teal-900 shadow-xs'
                              : 'bg-white text-slate-900 border-slate-200 hover:border-teal-400'
                          }`}
                        >
                          <div>
                            <div className="font-black text-sm flex items-center gap-2">
                              <span>{pt.fullName}</span>
                              {pt.needsVerification && (
                                <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-amber-400 text-slate-950">
                                  Unverified
                                </span>
                              )}
                            </div>
                            <div className={`text-xs font-mono font-bold mt-0.5 ${isSelected ? 'text-teal-200' : 'text-slate-500'}`}>
                              UHID: {pt.uhid} {pt.age ? `• ${pt.age} yrs` : ''} {pt.gender ? `• ${pt.gender}` : ''}
                            </div>
                          </div>
                          <div className="shrink-0">
                            {isSelected ? (
                              <div className="w-6 h-6 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center font-bold">
                                <Check className="w-3.5 h-3.5" />
                              </div>
                            ) : (
                              <span className="text-xs font-bold text-teal-700">Select</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Step 3: Quick Registration Fields for New Patient / Unregistered Family Member */}
              {isAddingNewPatient && (
                <div className="space-y-3.5 p-4 rounded-2xl bg-slate-50 border border-slate-200 animate-in fade-in">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-teal-700" />
                      New Patient Registration
                    </span>
                    {matchingPatients.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setIsAddingNewPatient(false)}
                        className="text-[11px] font-bold text-teal-700 hover:underline cursor-pointer"
                      >
                        ← Choose existing
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1">
                      Full Name <strong className="text-rose-500">*</strong>
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Ramesh Kannan"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-teal-600 focus:outline-hidden text-xs font-bold text-slate-900 bg-white"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-black text-slate-700 mb-1">
                        Date of Birth
                      </label>
                      <input
                        type="date"
                        value={dateOfBirth}
                        onChange={(e) => handleDobChange(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-teal-600 focus:outline-hidden text-xs font-bold text-slate-900 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-700 mb-1 flex items-center justify-between">
                        <span>Age</span>
                        {dobApproximate && (
                          <span className="text-[10px] text-amber-700 font-bold">Approx</span>
                        )}
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="120"
                        value={age}
                        onChange={(e) => handleAgeChange(e.target.value)}
                        placeholder="e.g. 34"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-teal-600 focus:outline-hidden text-xs font-bold text-slate-900 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-700 mb-1">
                        Gender
                      </label>
                      <select
                        value={gender}
                        onChange={(e) => setGender(e.target.value as any)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-teal-600 focus:outline-hidden text-xs font-bold text-slate-900 bg-white"
                      >
                        <option value="MALE">Male</option>
                        <option value="FEMALE">Female</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1">
                      Known Medical Allergies (optional)
                    </label>
                    <input
                      type="text"
                      value={allergies}
                      onChange={(e) => setAllergies(e.target.value)}
                      placeholder="e.g. Penicillin, Dust, Sulfa (or leave blank)"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-teal-600 focus:outline-hidden text-xs font-bold text-slate-900 bg-white"
                    />
                  </div>
                </div>
              )}

              {/* Step 4: Chief Complaint / Reason */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">
                  Reason for Consultation / Chief Complaint
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Toothache, Scaling, Crown consultation"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-teal-600 focus:outline-hidden text-xs font-bold text-slate-900 bg-white"
                />
              </div>

              {/* Step 5: Preferred Doctor (Optional) */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1 flex items-center justify-between">
                  <span>Preferred Doctor</span>
                  <span className="text-[10px] text-slate-500 font-normal">Optional</span>
                </label>
                <select
                  value={preferredDentistId}
                  onChange={(e) => setPreferredDentistId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-teal-600 focus:outline-hidden text-xs font-bold text-slate-900 bg-white"
                >
                  <option value="">⚡ Any Available Doctor (Fastest Dispatch)</option>
                  {dentists.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.fullName} ({doc.role})
                    </option>
                  ))}
                </select>
              </div>

              {/* Consent Checkboxes */}
              {/* Consent Checkboxes (DPDP Framework) */}
              {isAddingNewPatient && (
                <div className="space-y-2 p-3 rounded-xl bg-teal-50/50 border border-teal-200/60 text-xs">
                  <div className="flex items-center justify-between text-[11px] font-black text-teal-900 border-b border-teal-200/50 pb-1">
                    <span className="flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-teal-700" />
                      DPDP Act Statutory Consent (v1.0)
                    </span>
                    <span className="text-[10px] text-teal-700 font-mono">Required</span>
                  </div>
                  <label className="flex items-start gap-2 cursor-pointer font-bold text-slate-800">
                    <input
                      type="checkbox"
                      required
                      checked={consentDataUse}
                      onChange={(e) => setConsentDataUse(e.target.checked)}
                      className="mt-0.5 w-4 h-4 text-teal-600 rounded border-slate-300"
                    />
                    <span>
                      Patient explicitly consents to dental examination, clinical record creation, and health data processing <strong className="text-rose-500">*</strong>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={consentWhatsapp}
                      onChange={(e) => setConsentWhatsapp(e.target.checked)}
                      className="mt-0.5 w-4 h-4 text-teal-600 rounded border-slate-300"
                    />
                    <span>Receive queue tokens, digital prescriptions, and updates via WhatsApp</span>
                  </label>
                </div>
              )}

              {/* Closed Warning Banner */}
              {clinicStatus && !clinicStatus.isOpen && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border-2 border-rose-300 text-rose-950 flex items-center gap-3 text-xs font-bold animate-in fade-in">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                  <div>
                    <span className="block font-black text-rose-900">Hospital is Currently Closed</span>
                    <span className="text-[11px] text-rose-800 font-medium">
                      {clinicStatus.message || 'Walk-in consultations cannot be registered outside operating hours.'}
                    </span>
                  </div>
                </div>
              )}

              {/* Primary CTA: 1-Click Consultation Booking */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting || (clinicStatus && !clinicStatus.isOpen)}
                  className={`w-full py-3.5 px-4 rounded-2xl font-black text-sm transition-all shadow-lg flex items-center justify-center gap-2 active:scale-98 ${
                    clinicStatus && !clinicStatus.isOpen
                      ? 'bg-slate-300 text-slate-600 cursor-not-allowed shadow-none border border-slate-300'
                      : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white cursor-pointer shadow-teal-900/20 disabled:opacity-50 disabled:cursor-not-allowed'
                  }`}
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Allocating Token & Operatory Chair...</span>
                    </>
                  ) : clinicStatus && !clinicStatus.isOpen ? (
                    <>
                      <AlertTriangle className="w-4 h-4 text-rose-600" />
                      <span>🚫 Hospital Closed (Walk-Ins Disabled)</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
                      <span>⚡ Book Consultation Now & Dispatch Chair</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
