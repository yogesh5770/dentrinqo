import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api';
import { triggerClinicSync } from '../../lib/sync';
import {
  X,
  AlertCircle,
  AlertTriangle,
  Check,
  User,
  Phone,
  HeartPulse,
  ShieldAlert,
  UserPlus,
  Archive,
  Camera,
  MapPin,
  Calendar,
  Sparkles,
  Stethoscope,
  FolderOpen,
  Armchair,
  Zap,
  Printer,
  Send,
  QrCode,
  CheckCircle2,
} from 'lucide-react';
import { SpeechToTextDictation } from '../../components/SpeechToTextDictation';
import { useAuth } from '../../hooks/useAuth';
import { useTenant } from '../../hooks/useTenant';

interface NewPatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPatientCreated: (newPatient: any) => void;
  onOpenBookingForPatient?: (patient: any) => void;
  initialMode?: 'STANDARD' | 'LEGACY_ARCHIVE';
  initialSerialNo?: string;
}

export const NewPatientModal: React.FC<NewPatientModalProps> = ({
  isOpen,
  onClose,
  onPatientCreated,
  onOpenBookingForPatient,
  initialMode = 'LEGACY_ARCHIVE',
  initialSerialNo = '',
}) => {
  if (!isOpen) return null;

  const { user } = useAuth();
  const { clinic: tenantClinic } = useTenant();
  const clinicName = tenantClinic?.name || user?.clinic?.name || 'Dental Clinic';

  // Active registration mode - defaults to LEGACY_ARCHIVE if opened with serial or archive
  const [recordMode, setRecordMode] = useState<'STANDARD' | 'LEGACY_ARCHIVE'>(
    initialSerialNo ? 'LEGACY_ARCHIVE' : initialMode
  );

  // Standard patient fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [age, setAge] = useState<number | ''>('');
  const [gender, setGender] = useState('FEMALE');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [bloodGroup, setBloodGroup] = useState('B+');
  const [allergiesText, setAllergiesText] = useState('');
  const [conditionsText, setConditionsText] = useState('');
  const [medications, setMedications] = useState('');
  const [notes, setNotes] = useState('');

  // Physical Archive Card Fields
  const [legacySlNo, setLegacySlNo] = useState(initialSerialNo || '');
  const [physicalLocation, setPhysicalLocation] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [occupation, setOccupation] = useState('');
  const [legacyRegistrationDate, setLegacyRegistrationDate] = useState('');
  const [legacyPastHistory, setLegacyPastHistory] = useState('');
  const [voiceNoteBase64, setVoiceNoteBase64] = useState<string | null>(null);
  const [cardPhotoBase64, setCardPhotoBase64] = useState<string | null>(null);
  const [cardPhotoPreview, setCardPhotoPreview] = useState<string | null>(null);
  const [reappearChair, setReappearChair] = useState<number>(1);
  const [reconsultToday, setReconsultToday] = useState<boolean>(true);

  const [duplicateWarning, setDuplicateWarning] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitMode, setSubmitMode] = useState<'WALK_IN_NOW' | 'SCHEDULE_LATER' | 'SAVE_ONLY'>('WALK_IN_NOW');
  const [walkinSuccessData, setWalkinSuccessData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialSerialNo) {
      setLegacySlNo(initialSerialNo);
      setRecordMode('LEGACY_ARCHIVE');
    }
  }, [initialSerialNo]);

  const handlePhoneBlur = async () => {
    if (phone.length >= 10) {
      try {
        const res = await apiRequest<{ isDuplicate: boolean; existingPatient: any }>(
          `/patients/check-duplicate?phone=${phone.trim()}`,
        );
        if (res.isDuplicate) {
          setDuplicateWarning(res.existingPatient);
        } else {
          setDuplicateWarning(null);
        }
      } catch {
        // Ignore duplicate check error
      }
    }
  };

  const handleCardPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setCardPhotoBase64(base64);
        setCardPhotoPreview(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRegister = async (mode: 'WALK_IN_NOW' | 'SCHEDULE_LATER' | 'SAVE_ONLY') => {
    // Validation
    if (recordMode === 'LEGACY_ARCHIVE') {
      if (!legacySlNo.trim()) {
        setError('Physical Card Serial Number (Sl. No / Card #) is required');
        return;
      }
      if (!fullName.trim()) {
        setError('Patient Full Name is required');
        return;
      }
    } else {
      if (!fullName.trim() || !phone.trim()) {
        setError('Full Name and Phone Number are required for standard registration');
        return;
      }
    }

    setError(null);
    setSubmitting(true);
    setSubmitMode(mode);

    try {
      const parsedAllergies = allergiesText.trim()
        ? allergiesText.split(',').map(s => s.trim()).filter(Boolean)
        : [];
      const parsedConditions = conditionsText.trim()
        ? conditionsText.split(',').map(s => s.trim()).filter(Boolean)
        : [];
      const parsedMedications = medications.trim()
        ? medications.split(',').map(s => s.trim()).filter(Boolean)
        : [];

      const cleanPhone = phone.trim() || (recordMode === 'LEGACY_ARCHIVE' ? 'N/A' : '');

      const payload: any = {
        fullName: fullName.trim(),
        phone: cleanPhone,
        age: age ? Number(age) : undefined,
        gender: gender || 'UNKNOWN',
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        bloodGroup: bloodGroup || undefined,
        allergies: parsedAllergies,
        medicalConditions: parsedConditions,
        currentMedications: parsedMedications,
        notes: notes.trim() || undefined,
      };

      if (recordMode === 'LEGACY_ARCHIVE') {
        payload.legacySlNo = legacySlNo.trim();
        payload.physicalLocation = physicalLocation.trim() || undefined;
        payload.guardianName = guardianName.trim() || undefined;
        payload.occupation = occupation.trim() || undefined;
        payload.legacyRegistrationDate = legacyRegistrationDate || undefined;
        payload.legacyPastHistory = notes.trim() || undefined;
        payload.cardPhotoUrl = cardPhotoBase64 || undefined;
      }

      const res = await apiRequest<any>('/patients', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      triggerClinicSync('patient_created');

      if (mode === 'WALK_IN_NOW') {
        try {
          const quickRes = await apiRequest<any>('/appointments/reception-quick-consult', {
            method: 'POST',
            body: JSON.stringify({
              patientId: res.id,
              reason: recordMode === 'LEGACY_ARCHIVE'
                ? `Re-Consultation (Card #${legacySlNo.trim()})`
                : 'Walk-In Consultation & Examination',
            }),
          });
          triggerClinicSync('appointment_booked');
          triggerClinicSync('appt_CHECKED_IN');
          onPatientCreated(res);
          setWalkinSuccessData({ ...quickRes, patient: res });
          return;
        } catch (apptErr: any) {
          console.error('Auto-checkin appointment error', apptErr);
          setError(apptErr.message || 'Walk-in consult allocation failed');
          return;
        }
      }

      onPatientCreated(res);
      onClose();

      if (mode === 'SCHEDULE_LATER' && onOpenBookingForPatient) {
        onOpenBookingForPatient(res);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to register patient');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrintSlip = () => {
    if (!walkinSuccessData) return;
    const printWindow = window.open('', '_blank', 'width=380,height=560');
    if (!printWindow) {
      alert('Pop-up blocked. Please allow pop-ups to print the thermal receipt.');
      return;
    }
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Queue Slip - Token #${walkinSuccessData.tokenNumber}</title>
          <style>
            @page { size: 80mm auto; margin: 4mm; }
            body { font-family: 'Courier New', monospace, sans-serif; width: 72mm; margin: 0 auto; padding: 4mm; color: #000; font-size: 12px; line-height: 1.3; text-align: center; }
            .header { border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 8px; }
            .clinic-name { font-size: 14px; font-weight: 900; text-transform: uppercase; margin-bottom: 2px; }
            .token-box { border: 2px solid #000; padding: 6px; margin: 8px 0; border-radius: 4px; }
            .token-num { font-size: 32px; font-weight: 900; }
            .info-row { display: flex; justify-content: space-between; font-size: 11px; margin: 3px 0; text-align: left; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="clinic-name">${clinicName}</div>
            <div>PATIENT QUEUE SLIP</div>
          </div>
          <div class="token-box">
            <div>QUEUE TOKEN</div>
            <div class="token-num">#${walkinSuccessData.tokenNumber}</div>
            <div>CHAIR #${walkinSuccessData.chairNumber || walkinSuccessData.expectedChairNumber} (EXPECTED)</div>
          </div>
          <div class="info-row"><span>Patient:</span><strong>${fullName}</strong></div>
          <div class="info-row"><span>Patients Ahead:</span><strong>${walkinSuccessData.patientsAhead ?? 0}</strong></div>
          <div class="info-row"><span>Est. Wait:</span><strong>approx. ${Math.max(5, (walkinSuccessData.patientsAhead ?? 1) * 15)} mins</strong></div>
          <p style="font-size: 10px; margin-top: 10px;">Please watch the lobby display TV. We will page your token when ready.</p>
        </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
        {/* Header */}
        <div className="p-5 bg-white border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 p-1 rounded-2xl bg-white border border-slate-200 shadow-2xs flex items-center justify-center shrink-0">
              <img src="/logo.png" alt="Clinic Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h3 className="font-black text-lg text-slate-900">
                {recordMode === 'LEGACY_ARCHIVE'
                  ? 'Physical Card Digitization'
                  : 'New Patient Registration'}
              </h3>
              <p className="text-xs text-slate-600 font-medium">
                {recordMode === 'LEGACY_ARCHIVE'
                  ? 'Card Serial Number & Patient Name • Voice Dictation • Re-Consultation Check-in'
                  : 'Full Patient Registration & Walk-in Check-in'}
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

        {walkinSuccessData ? (
          <div className="p-6 space-y-5 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 mx-auto shadow-inner">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div>
              <h4 className="text-xl font-black text-slate-900">
                Patient Registered & Walk-in Booked!
              </h4>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Patient is added to today's active queue.
              </p>
            </div>

            {/* Huge Token & Chair Card */}
            <div className="bg-gradient-to-br from-teal-50 to-slate-50 p-5 rounded-3xl border-2 border-teal-500/40 shadow-sm space-y-3">
              <span className="text-xs uppercase font-extrabold tracking-wider text-teal-900 block">
                Queue Token
              </span>
              <div className="text-5xl font-black text-slate-900 font-mono tracking-tight">
                #{walkinSuccessData.tokenNumber}
              </div>

              <div className="py-2 px-4 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 bg-amber-100 text-amber-950 border border-amber-300">
                <Armchair className="w-4 h-4" />
                <span>
                  {walkinSuccessData.isImmediateSeat
                    ? `Chair #${walkinSuccessData.chairNumber}: Go now to operatory`
                    : `Chair #${walkinSuccessData.chairNumber || walkinSuccessData.expectedChairNumber} (expected) — seat when called`}
                </span>
              </div>

              {/* Patients Ahead & Approx Wait */}
              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                <div className="bg-white/80 p-2 rounded-xl border border-teal-200">
                  <span className="text-slate-500 font-bold block text-[10px] uppercase">Patients Ahead</span>
                  <span className="font-black text-slate-900 text-sm">{walkinSuccessData.patientsAhead ?? 0}</span>
                </div>
                <div className="bg-white/80 p-2 rounded-xl border border-teal-200">
                  <span className="text-slate-500 font-bold block text-[10px] uppercase">Approx. Wait Time</span>
                  <span className="font-black text-teal-800 text-sm">
                    {walkinSuccessData.isImmediateSeat
                      ? 'Immediate Seating'
                      : `approx. ${Math.max(5, (walkinSuccessData.patientsAhead ?? 1) * 15)} mins`}
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-teal-200/60 flex items-center justify-between text-xs font-bold text-slate-600 px-2">
                <span>Patient: <strong className="text-slate-900">{fullName}</strong></span>
                <span>UHID: <strong className="font-mono text-teal-900">{walkinSuccessData.patient?.uhid}</strong></span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={handlePrintSlip}
                className="px-4 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs transition cursor-pointer shadow-md flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4 text-amber-300" />
                <span>🖨️ Print 80mm Slip</span>
              </button>

              <a
                href={`https://wa.me/${phone.replace(/\D/g, '').length === 10 ? '91' + phone.replace(/\D/g, '') : phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hello ${fullName}, your walk-in token at ${clinicName} is #${walkinSuccessData.tokenNumber}. Expected chair: Chair #${walkinSuccessData.chairNumber || walkinSuccessData.expectedChairNumber}. Estimated wait: approx. ${Math.max(5, (walkinSuccessData.patientsAhead ?? 1) * 15)} mins.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs transition cursor-pointer shadow-md flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                <span>💬 Send via WhatsApp</span>
              </a>
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-xs cursor-pointer shadow-xs"
              >
                Done & Close
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Top Mode Selector Tabs */}
            <div className="bg-slate-100 p-2 border-b border-slate-200 flex gap-2">
              <button
                type="button"
                onClick={() => setRecordMode('LEGACY_ARCHIVE')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  recordMode === 'LEGACY_ARCHIVE'
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'text-amber-900 bg-amber-100/60 hover:bg-amber-100'
                }`}
              >
            <Archive className="w-4 h-4" />
            <span>Physical Card Intake (Serial No & Name)</span>
          </button>

          <button
            type="button"
            onClick={() => setRecordMode('STANDARD')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 ${
              recordMode === 'STANDARD'
                ? 'bg-white text-teal-900 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <User className="w-4 h-4 text-teal-600" />
            <span>Standard New Patient (Full Form)</span>
          </button>
        </div>

        {/* Duplicate Warning Alert Banner */}
        {duplicateWarning && (
          <div className="p-4 bg-amber-50 border-b border-amber-300 text-amber-950 flex items-start gap-3 text-xs">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-black">Possible Existing Patient Detected</p>
              <p className="mt-0.5 font-medium">
                A patient named <strong>{duplicateWarning.fullName}</strong> is already registered with this phone number (UHID: <strong>{duplicateWarning.uhid}</strong>).
              </p>
              <p className="mt-1 text-amber-800 font-semibold">
                If this old patient is returning, their card details will be safely linked to their historical profile.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="p-4 bg-rose-50 border-b border-rose-300 text-rose-900 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Form Body */}
        <form
          onSubmit={e => {
            e.preventDefault();
            handleRegister('WALK_IN_NOW');
          }}
          className="p-6 space-y-5 max-h-[72vh] overflow-y-auto text-xs"
        >
          {/* ========================================================= */}
          {/* STREAMLINED OLD CARD MODE (DOCTOR ONLY TYPES SERIAL NO & NAME) */}
          {/* ========================================================= */}
          {recordMode === 'LEGACY_ARCHIVE' ? (
            <div className="space-y-4">
              {/* Core 2 Fields: Serial No and Name */}
              <div className="p-5 bg-gradient-to-br from-amber-50 to-amber-100/40 border-2 border-amber-400 rounded-2xl space-y-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-200 text-amber-950 font-black text-xs">
                    <Archive className="w-3.5 h-3.5 text-amber-800" />
                    Physical Archive Card Record
                  </span>
                  <span className="text-[11px] font-bold text-amber-800">
                    Instant Search by Card Serial Number
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black text-slate-900 mb-1">
                      Card Serial Number (Sl. No / Card #) <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      autoFocus
                      value={legacySlNo}
                      onChange={e => setLegacySlNo(e.target.value)}
                      placeholder="e.g. 1042, 3041, or C-502"
                      className="w-full text-base font-mono font-black text-amber-950 bg-white border-2 border-amber-500 rounded-xl p-2.5 focus:border-amber-700 focus:outline-none shadow-2xs"
                    />
                    <p className="text-[11px] text-amber-800 mt-1 font-semibold">
                      Printed on the physical paper card.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-black text-slate-900 mb-1">
                      Patient Full Name <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      placeholder="e.g. Ramesh Kumar"
                      className="w-full text-base font-black text-slate-900 bg-white border-2 border-amber-500 rounded-xl p-2.5 focus:border-amber-700 focus:outline-none shadow-2xs"
                    />
                    <p className="text-[11px] text-amber-800 mt-1 font-semibold">
                      Patient name as written on the card.
                    </p>
                  </div>
                </div>

                {/* Optional Phone & Filing Location */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-amber-200/60">
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Phone Number <span className="text-slate-500 text-[10px] font-normal">(Optional)</span>
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      onBlur={handlePhoneBlur}
                      placeholder="Leave blank if not on card"
                      className="w-full text-xs font-mono font-bold text-slate-900 bg-white border border-amber-300 rounded-xl p-2 focus:border-amber-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Age / Gender <span className="text-slate-500 text-[10px] font-normal">(Optional)</span>
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        type="number"
                        min="1"
                        max="110"
                        value={age}
                        onChange={e => setAge(e.target.value ? Number(e.target.value) : '')}
                        placeholder="Age"
                        className="w-16 text-xs font-bold text-slate-900 bg-white border border-amber-300 rounded-xl p-2 focus:border-amber-600 focus:outline-none"
                      />
                      <select
                        value={gender}
                        onChange={e => setGender(e.target.value)}
                        className="flex-1 text-xs font-bold text-slate-900 bg-white border border-amber-300 rounded-xl p-2 focus:border-amber-600 focus:outline-none"
                      >
                        <option value="FEMALE">Female</option>
                        <option value="MALE">Male</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Filing Shelf / Drawer <span className="text-slate-500 text-[10px] font-normal">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      value={physicalLocation}
                      onChange={e => setPhysicalLocation(e.target.value)}
                      placeholder="e.g. Rack B, Drawer 3"
                      className="w-full text-xs font-bold text-slate-900 bg-white border border-amber-300 rounded-xl p-2 focus:border-amber-600 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Clinical Voice-to-Text Dictation */}
              <SpeechToTextDictation
                value={notes}
                onChange={setNotes}
                label="Clinical Voice Dictation (Speech to Text)"
                placeholder="Click 'Start Dictation' and speak patient past dental history, root canals, or remarks..."
                helperText="Converts your voice speech directly to text. No audio files are recorded or stored."
                minRows={3}
              />

              {/* Card Photo / Scan */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-slate-600" />
                  <span className="text-xs font-bold text-slate-800">
                    Snap or Attach Photo of Paper Card
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <label className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-xl font-bold text-xs cursor-pointer shadow-2xs">
                    <span>📷 Upload Photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleCardPhotoUpload}
                      className="hidden"
                    />
                  </label>

                  {cardPhotoPreview && (
                    <div className="flex items-center gap-1.5">
                      <img
                        src={cardPhotoPreview}
                        alt="Preview"
                        className="w-8 h-8 object-cover rounded-lg border border-amber-400"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setCardPhotoBase64(null);
                          setCardPhotoPreview(null);
                        }}
                        className="text-[11px] text-rose-600 font-bold hover:underline cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Re-consultation Chair Selection */}
              <div className="p-4 bg-teal-50 border border-teal-300 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="font-black text-teal-950 text-xs flex items-center gap-1.5">
                    <Armchair className="w-4 h-4 text-teal-700" />
                    Patient Visiting Clinic Today? (Re-Consultation)
                  </span>
                  <p className="text-[11px] text-teal-700 font-medium mt-0.5">
                    Assign operatory chair to immediately send to doctor desk:
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {[1, 2, 3].map(chair => (
                    <button
                      key={chair}
                      type="button"
                      onClick={() => setReappearChair(chair)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black cursor-pointer transition-all ${
                        reappearChair === chair
                          ? 'bg-teal-700 text-white shadow-xs'
                          : 'bg-white text-teal-900 border border-teal-300 hover:bg-teal-100'
                      }`}
                    >
                      Chair {chair}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* ========================================================= */
            /* STANDARD FULL FORM FOR FRESH NEW PATIENTS */
            /* ========================================================= */
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-teal-600" />
                  Patient Personal Details
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Full Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      placeholder="e.g. Ramesh Kumar"
                      className="w-full text-xs font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl p-2.5 focus:border-teal-600 focus:bg-white placeholder-slate-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Phone Number (10 digits) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      onBlur={handlePhoneBlur}
                      placeholder="e.g. 9876543210"
                      className="w-full text-xs font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl p-2.5 focus:border-teal-600 focus:bg-white font-mono placeholder-slate-400"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-800 mb-1">Age</label>
                      <input
                        type="number"
                        min="1"
                        max="110"
                        value={age}
                        onChange={e => setAge(e.target.value ? Number(e.target.value) : '')}
                        placeholder="34"
                        className="w-full text-xs font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl p-2.5 focus:border-teal-600 focus:bg-white placeholder-slate-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-800 mb-1">Gender</label>
                      <select
                        value={gender}
                        onChange={e => setGender(e.target.value)}
                        className="w-full text-xs font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl p-2.5 focus:border-teal-600 focus:bg-white"
                      >
                        <option value="FEMALE">Female</option>
                        <option value="MALE">Male</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">Blood Group</label>
                    <select
                      value={bloodGroup}
                      onChange={e => setBloodGroup(e.target.value)}
                      className="w-full text-xs font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl p-2.5 focus:border-teal-600 focus:bg-white"
                    >
                      <option value="O+">O Positive (O+)</option>
                      <option value="A+">A Positive (A+)</option>
                      <option value="B+">B Positive (B+)</option>
                      <option value="AB+">AB Positive (AB+)</option>
                      <option value="O-">O Negative (O-)</option>
                      <option value="A-">A Negative (A-)</option>
                      <option value="B-">B Negative (B-)</option>
                      <option value="AB-">AB Negative (AB-)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">Address / Locality</label>
                    <input
                      type="text"
                      value={address}
                      onChange={e => setAddress(e.target.value)}
                      placeholder="e.g. Near Bus Stand, Madurai"
                      className="w-full text-xs font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl p-2.5 focus:border-teal-600 focus:bg-white placeholder-slate-400"
                    />
                  </div>
                </div>
              </div>

              {/* Past History / Medical Notes */}
              <div className="pt-4 border-t border-slate-200 space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-rose-800 uppercase tracking-wider font-black">
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                      Known Allergies
                    </span>
                    <span className="text-[11px] font-semibold text-slate-500">Optional</span>
                  </label>
                  <input
                    type="text"
                    value={allergiesText}
                    onChange={e => setAllergiesText(e.target.value)}
                    placeholder="e.g. Penicillin, Latex (leave blank if none)"
                    className="w-full text-xs font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl p-2.5 focus:border-rose-500 focus:bg-white placeholder-slate-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">Clinical Notes</label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Any clinical observations or notes..."
                    className="w-full text-xs font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl p-2.5 focus:border-teal-600 focus:bg-white placeholder-slate-400"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 border border-slate-300 transition-colors cursor-pointer text-center"
            >
              Cancel
            </button>

            <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleRegister('SAVE_ONLY')}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 transition-all cursor-pointer"
                title="Save into system without adding to today's queue"
              >
                {submitting && submitMode === 'SAVE_ONLY'
                  ? 'Saving...'
                  : recordMode === 'LEGACY_ARCHIVE'
                  ? 'Save Record'
                  : 'Save Profile'}
              </button>

              <button
                type="button"
                disabled={submitting}
                onClick={() => handleRegister('SCHEDULE_LATER')}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-black text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-300 transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                title="Save patient and immediately schedule an appointment"
              >
                <Calendar className="w-3.5 h-3.5 text-teal-700" />
                <span>
                  {submitting && submitMode === 'SCHEDULE_LATER'
                    ? 'Saving...'
                    : 'Save & Book Appointment 📅'}
                </span>
              </button>

              <button
                type="button"
                disabled={submitting}
                onClick={() => handleRegister('WALK_IN_NOW')}
                className={`w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-black text-white shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 ${
                  recordMode === 'LEGACY_ARCHIVE'
                    ? 'bg-linear-to-r from-amber-600 via-orange-600 to-amber-700 hover:from-amber-700 hover:to-orange-700'
                    : 'bg-linear-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700'
                }`}
                title="Save and immediately add patient to Doctor Waiting Queue"
              >
                <Stethoscope className="w-4 h-4 text-white" />
                <span>
                  {submitting && submitMode === 'WALK_IN_NOW'
                    ? 'Checking in...'
                    : recordMode === 'LEGACY_ARCHIVE'
                    ? `Save & Check In (Chair ${reappearChair})`
                    : 'Register & Check In (Walk-In)'}
                </span>
              </button>
            </div>
          </div>
        </form>
      </>
    )}
  </div>
</div>
);
};