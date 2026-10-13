import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  User,
  Phone,
  CheckCircle2,
  Sparkles,
  MapPin,
  Stethoscope,
  Heart,
  ShieldCheck,
  ChevronRight,
  MessageCircle,
  ExternalLink,
  Star,
  Award,
  Copy,
  Check,
  AlertTriangle,
  Search,
  X,
  Printer,
  Download,
  Activity,
  Smile,
  Zap,
  ArrowRight,
  RefreshCw,
  Info,
  Building2,
  QrCode,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { Link } from 'react-router-dom';
import { usePatientAuth } from '../../hooks/usePatientAuth';
import { useTenant } from '../../hooks/useTenant';

const COMMON_REASONS = [
  { id: 'TOOTH_PAIN', label: 'Severe Toothache / Pain', icon: '⚡' },
  { id: 'CLEANING', label: 'Teeth Cleaning & Polish', icon: '✨' },
  { id: 'CHECKUP', label: 'General Dental Checkup', icon: '🩺' },
  { id: 'CAVITY', label: 'Cavity / Broken Tooth', icon: '🦷' },
  { id: 'GUMS', label: 'Bleeding Gums / Swelling', icon: '🩸' },
  { id: 'CROWN', label: 'Crown / Cap / Missing Tooth', icon: '👑' },
  { id: 'ALIGNERS', label: 'Braces / Aligners Consultation', icon: '💎' },
  { id: 'OTHER', label: 'Other Dental Concern', icon: '💬' },
];

const MORNING_SLOTS = ['09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM', '12:00 PM', '12:30 PM'];
const AFTERNOON_SLOTS = ['02:30 PM', '03:00 PM', '03:30 PM', '04:00 PM', '04:30 PM', '05:00 PM'];
const EVENING_SLOTS = ['05:30 PM', '06:00 PM', '06:30 PM', '07:00 PM', '07:30 PM', '08:00 PM'];

const TOOTH_AREAS = [
  { id: 'UPPER_RIGHT', label: 'Upper Right', sub: 'Molar / Premolar' },
  { id: 'UPPER_LEFT', label: 'Upper Left', sub: 'Molar / Premolar' },
  { id: 'FRONT', label: 'Front Teeth', sub: 'Smile Zone' },
  { id: 'LOWER_RIGHT', label: 'Lower Right', sub: 'Molar / Premolar' },
  { id: 'LOWER_LEFT', label: 'Lower Left', sub: 'Molar / Premolar' },
  { id: 'FULL_MOUTH', label: 'General / Full Mouth', sub: 'Routine / Multiple' },
];

interface PublicBookingViewProps {
  clinicName?: string;
  clinicAddress?: string;
  clinicPhone?: string;
  mapsUrl?: string;
  clinicCode?: string;
  doctorName?: string;
}

export const PublicBookingView: React.FC<PublicBookingViewProps> = ({
  clinicName: propClinicName,
  clinicAddress: propClinicAddress,
  clinicPhone: propClinicPhone,
  mapsUrl = 'https://maps.google.com/?q=Dental+Clinic',
  clinicCode: propClinicCode,
  doctorName = 'Chief Dental Surgeon',
}) => {
  const { clinic: tenantClinic } = useTenant();
  const clinicName = tenantClinic?.name || propClinicName || 'Dental Clinic';
  const clinicAddress = tenantClinic?.address 
    ? `${tenantClinic.address}, ${tenantClinic.city || ''} ${tenantClinic.postalCode || ''}` 
    : (propClinicAddress || '');
  const clinicPhone = tenantClinic?.phone || propClinicPhone || '';
  const clinicCode = tenantClinic?.code || propClinicCode || '';
  const [step, setStep] = useState<number>(1);
  const [visitType, setVisitType] = useState<'ONLINE_BOOKING' | 'WALK_IN'>('ONLINE_BOOKING');
  const [selectedReason, setSelectedReason] = useState<string>('TOOTH_PAIN');
  const [customMessage, setCustomMessage] = useState<string>('');
  
  // Operatory Chair & Doctor Selection
  const [selectedChair, setSelectedChair] = useState<number>(1);
  const [chairs, setChairs] = useState<{ chairNumber: number; name: string; doctorName: string; isActive: boolean }[]>([
    { chairNumber: 1, name: 'Operatory Chair 1 (Chief Room)', doctorName: doctorName, isActive: true },
    { chairNumber: 2, name: 'Operatory Chair 2 (Associate Room)', doctorName: 'Associate Dental Surgeon', isActive: true },
    { chairNumber: 3, name: 'Operatory Chair 3 (Specialist & Ortho Room)', doctorName: 'Consultant Dental Surgeon', isActive: true },
  ]);

  // Booked / Occupied Slots by Chair Number
  const [bookedSlotsByChair, setBookedSlotsByChair] = useState<Record<number, string[]>>({});

  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const dayAfterStr = new Date(Date.now() + 172800000).toISOString().split('T')[0];
  
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedSlot, setSelectedSlot] = useState<string>('10:30 AM');
  const [selectedToothArea, setSelectedToothArea] = useState<string>('FULL_MOUTH');

  // Patient Contact Information
  const [fullName, setFullName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [age, setAge] = useState<string>('');
  const [gender, setGender] = useState<string>('MALE');

  // Confirmation state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [bookingRef, setBookingRef] = useState<string | null>(null);
  const [tokenNumber, setTokenNumber] = useState<number | null>(null);
  const [patientUhid, setPatientUhid] = useState<string | null>(null);
  const [trackingCode, setTrackingCode] = useState<string | null>(null);
  const [copiedRef, setCopiedRef] = useState<boolean>(false);
  const [lobbyCode, setLobbyCode] = useState<string>('');
  const [publicClinicStatus, setPublicClinicStatus] = useState<{
    isOpen: boolean;
    status: string;
    message: string;
    nextOpenAt: string | null;
    phone?: string;
  } | null>(null);

  // Patient Account & Family State
  const { account, familyMembers, token } = usePatientAuth();
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [matchingPatients, setMatchingPatients] = useState<any[]>([]);
  const [searchingMatching, setSearchingMatching] = useState(false);

  // If patient account is logged in, auto-fill contact & default to primary profile
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const prePatientId = params.get('patientId');

    if (account && familyMembers.length > 0) {
      const match = prePatientId ? familyMembers.find(m => m.id === prePatientId) : familyMembers[0];
      const target = match || familyMembers[0];
      setSelectedPatientId(target.id);
      setFullName(target.fullName);
      setPhone(account.phone.replace(/\D/g, '').slice(-10));
      if (target.gender) setGender(target.gender);
      if (target.age) setAge(String(target.age));
    }
  }, [account, familyMembers]);

  // Lookup returning patients under phone number for guest bookings
  useEffect(() => {
    if (!account && phone.length === 10) {
      setSearchingMatching(true);
      apiRequest<{ exists: boolean; patients: any[] }>(`/appointments/lookup-phone?phone=${phone}&clinicCode=${clinicCode}`)
        .then(res => {
          if (res && res.exists && res.patients.length > 0) {
            setMatchingPatients(res.patients);
          } else {
            setMatchingPatients([]);
          }
        })
        .catch(() => setMatchingPatients([]))
        .finally(() => setSearchingMatching(false));
    } else if (phone.length < 10) {
      setMatchingPatients([]);
    }
  }, [phone, account, clinicCode]);

  // Auto-detect Walk-in Mode from Lobby Standee QR
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'walkin') {
      setVisitType('WALK_IN');
      setSelectedDate(todayStr);
    }
    const codeParam = params.get('code');
    if (codeParam) {
      setLobbyCode(codeParam.trim().toUpperCase());
    }

    // Fetch public operational status & active closures
    apiRequest<any>(`/clinic/public-status?clinicCode=${clinicCode}`)
      .then(res => setPublicClinicStatus(res))
      .catch(() => {});

    // Fetch live active chairs
    apiRequest<{ chairs: any[] }>(`/appointments/public-chair-status?clinicCode=${clinicCode}`)
      .then(res => {
        if (res && res.chairs && res.chairs.length > 0) {
          setChairs(res.chairs);
          // If chair 1 is off duty, default to chair 2
          if (!res.chairs[0].isActive && res.chairs[1]?.isActive) {
            setSelectedChair(2);
          }
        }
      })
      .catch(() => {});
  }, [clinicCode]);

  // Fetch live occupied/booked time slots for selected clinic & date
  useEffect(() => {
    if (visitType === 'ONLINE_BOOKING') {
      apiRequest<{ bookedSlotsByChair?: Record<number, string[]> }>(
        `/appointments/public-booked-slots?clinicCode=${clinicCode}&date=${selectedDate}`
      )
        .then(res => {
          if (res && res.bookedSlotsByChair) {
            setBookedSlotsByChair(res.bookedSlotsByChair);
          }
        })
        .catch(() => {});
    }
  }, [clinicCode, selectedDate, visitType]);

  // If currently selected slot is already occupied on the chosen chair, auto-select next available slot
  useEffect(() => {
    if (visitType === 'ONLINE_BOOKING') {
      const chairBooked = bookedSlotsByChair[selectedChair] || [];
      if (chairBooked.includes(selectedSlot)) {
        const allSlots = [...MORNING_SLOTS, ...AFTERNOON_SLOTS, ...EVENING_SLOTS];
        const nextFree = allSlots.find(s => !chairBooked.includes(s));
        if (nextFree) {
          setSelectedSlot(nextFree);
        }
      }
    }
  }, [selectedChair, bookedSlotsByChair, visitType]);

  // Fast-Track Health Intake
  const [intakeOpen, setIntakeOpen] = useState<boolean>(false);
  const [diabetic, setDiabetic] = useState<boolean>(false);
  const [hypertension, setHypertension] = useState<boolean>(false);
  const [cardiac, setCardiac] = useState<boolean>(false);
  const [bloodThinners, setBloodThinners] = useState<boolean>(false);
  const [pregnant, setPregnant] = useState<boolean>(false);
  const [selectedAllergies, setSelectedAllergies] = useState<string[]>([]);
  const [emergencyName, setEmergencyName] = useState<string>('');
  const [emergencyPhone, setEmergencyPhone] = useState<string>('');
  const [submittingIntake, setSubmittingIntake] = useState<boolean>(false);
  const [intakeSubmitted, setIntakeSubmitted] = useState<boolean>(false);

  // Live Queue & Token Tracker Modal
  const [trackerOpen, setTrackerOpen] = useState<boolean>(false);
  const [trackQuery, setTrackQuery] = useState<string>('');
  const [trackingLoading, setTrackingLoading] = useState<boolean>(false);
  const [trackResult, setTrackResult] = useState<any | null>(null);
  const [trackError, setTrackError] = useState<string | null>(null);

  const handleBookAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      alert('Please enter patient full name.');
      return;
    }
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      alert('Please enter a valid 10-digit mobile number.');
      return;
    }
    if (!customMessage.trim()) {
      alert('Please describe your problem or enter a message for the doctor.');
      return;
    }

    if (visitType === 'ONLINE_BOOKING') {
      const chairBooked = bookedSlotsByChair[selectedChair] || [];
      if (chairBooked.includes(selectedSlot)) {
        alert(`The time slot "${selectedSlot}" for Operatory Chair #${selectedChair} is already occupied. Please select an available slot or switch to another operatory room.`);
        return;
      }
    }

    if (tenantClinic?.isOnLeave) {
      alert(`The hospital is currently closed for Holiday / Leave (${tenantClinic.leaveReason || 'Holiday'}). Public appointment booking is paused.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const reasonObj = COMMON_REASONS.find((r) => r.id === selectedReason);
      const reasonLabel = reasonObj ? reasonObj.label : 'Consultation';
      
      const effectiveSlot = visitType === 'WALK_IN' ? 'WALK-IN IMMEDIATE QUEUE' : selectedSlot;
      const combinedService = visitType === 'WALK_IN' 
        ? `[HOSPITAL WALK-IN] ${reasonLabel}` 
        : `[ONLINE] ${reasonLabel}`;

      const combinedNotes = `Visit Mode: ${visitType === 'WALK_IN' ? 'Hospital Lobby Walk-In (Patient at Clinic)' : 'Online Advance Booking'}\nPatient Message / Problem: ${customMessage.trim()}\nAffected Area: ${selectedToothArea}\nSlot: ${effectiveSlot}`;

      const res = await apiRequest<{ reference: string; uhid?: string; tokenNumber?: number }>('/appointments/public-request', {
        method: 'POST',
        body: JSON.stringify({
          fullName: fullName.trim(),
          phone: cleanPhone,
          service: combinedService,
          preferredDate: selectedDate,
          preferredSlot: effectiveSlot,
          gender: gender,
          age: age ? parseInt(age, 10) : undefined,
          notes: combinedNotes,
          clinicCode,
          chairNumber: selectedChair,
          lobbyCode: lobbyCode || undefined,
          patientId: selectedPatientId || undefined,
          isWalkin: visitType === 'WALK_IN',
        }),
      });

      if (res && res.reference) {
        setBookingRef(res.reference);
        if (res.tokenNumber) setTokenNumber(res.tokenNumber);
        if (res.uhid) setPatientUhid(res.uhid);
        if ((res as any).trackingCode) setTrackingCode((res as any).trackingCode);
        setStep(3);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        throw new Error('Could not establish booking confirmation reference.');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to submit appointment request. Please check your phone number and selected slot.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyRef = () => {
    if (!bookingRef) return;
    navigator.clipboard.writeText(bookingRef);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2500);
  };

  const getWhatsAppConfirmLink = () => {
    const reasonObj = COMMON_REASONS.find((r) => r.id === selectedReason);
    const reasonLabel = reasonObj ? reasonObj.label : 'Consultation';
    const cleanPhone = clinicPhone.replace(/\D/g, '');
    const isWalkIn = visitType === 'WALK_IN';
    const msg = encodeURIComponent(
      `🦷 *${clinicName} — ${isWalkIn ? 'Hospital Lobby Walk-In' : 'Online Appointment'} Confirmation*\n\n` +
      `👤 *Patient:* ${fullName}\n` +
      `📅 *Date:* ${new Date(selectedDate).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}\n` +
      `⏰ *Slot / Status:* ${isWalkIn ? '🏥 Walk-In (Present in Clinic Lobby)' : selectedSlot}\n` +
      `💺 *Operatory:* Chair #${selectedChair} (${chairs.find(c => c.chairNumber === selectedChair)?.doctorName || 'Doctor Room'})\n` +
      `🔖 *Daily Token:* #${tokenNumber || 1}\n` +
      `🩺 *Concern / Problem:* ${reasonLabel}\n` +
      `💬 *Message for Doctor:* ${customMessage}\n` +
      `🔖 *Reference:* ${bookingRef || 'NEW'}\n\n` +
      `_I have registered via the clinic portal. Please confirm my token. Thank you!_`
    );
    return `https://wa.me/${cleanPhone}?text=${msg}`;
  };

  const getGoogleCalendarLink = () => {
    const reasonObj = COMMON_REASONS.find((r) => r.id === selectedReason);
    const title = `Dental Appointment - ${clinicName}`;
    const details = `Appointment at ${clinicName} for ${fullName}.\nBooking Ref: ${bookingRef}\nProblem: ${customMessage}\nClinic Phone: ${clinicPhone}`;

    const d = new Date(selectedDate);
    const match = selectedSlot.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (match) {
      let h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      if (match[3].toUpperCase() === 'PM' && h < 12) h += 12;
      if (match[3].toUpperCase() === 'AM' && h === 12) h = 0;
      d.setHours(h, m, 0, 0);
    }
    const startStr = d.toISOString().replace(/-|:|\.\d\d\d/g, '');
    const endDate = new Date(d.getTime() + 45 * 60 * 1000);
    const endStr = endDate.toISOString().replace(/-|:|\.\d\d\d/g, '');

    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${startStr}/${endStr}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(clinicAddress)}`;
  };

  const handleDownloadAppleCalendar = () => {
    const d = new Date(selectedDate);
    const match = selectedSlot.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (match) {
      let h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      if (match[3].toUpperCase() === 'PM' && h < 12) h += 12;
      if (match[3].toUpperCase() === 'AM' && h === 12) h = 0;
      d.setHours(h, m, 0, 0);
    }
    const startStr = d.toISOString().replace(/-|:|\.\d\d\d/g, '');
    const endDate = new Date(d.getTime() + 45 * 60 * 1000);
    const endStr = endDate.toISOString().replace(/-|:|\.\d\d\d/g, '');

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Dental Practice Management//VIP Booking//EN',
      'BEGIN:VEVENT',
      `UID:${bookingRef || Date.now()}@dentalclinic.com`,
      `DTSTAMP:${new Date().toISOString().replace(/-|:|\.\d\d\d/g, '')}`,
      `DTSTART:${startStr}`,
      `DTEND:${endStr}`,
      `SUMMARY:Dental Appointment - ${clinicName}`,
      `DESCRIPTION:Patient: ${fullName}\\nBooking Reference: ${bookingRef}\\nClinic Phone: ${clinicPhone}`,
      `LOCATION:${clinicAddress}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dental_appointment_${bookingRef || 'booking'}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSubmitIntake = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingRef) return;

    setSubmittingIntake(true);
    try {
      await apiRequest(`/appointments/public-intake/${bookingRef}`, {
        method: 'POST',
        body: JSON.stringify({
          diabetic,
          hypertension,
          cardiac,
          bloodThinners,
          pregnant,
          allergies: selectedAllergies,
          emergencyContactName: emergencyName.trim() || undefined,
          emergencyContactPhone: emergencyPhone.trim() || undefined,
        }),
      });
      setIntakeSubmitted(true);
    } catch (err: any) {
      alert(err.message || 'Failed to submit health intake.');
    } finally {
      setSubmittingIntake(false);
    }
  };

  const handleTrackBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackQuery.trim()) return;

    setTrackingLoading(true);
    setTrackError(null);
    setTrackResult(null);

    try {
      const data = await apiRequest<any>(`/appointments/public-status/${encodeURIComponent(trackQuery.trim())}`);
      setTrackResult(data);
    } catch (err: any) {
      setTrackError(err.message || 'No appointment found for this reference or phone number.');
    } finally {
      setTrackingLoading(false);
    }
  };

  const toggleAllergy = (allergy: string) => {
    if (selectedAllergies.includes(allergy)) {
      setSelectedAllergies(selectedAllergies.filter((a) => a !== allergy));
    } else {
      setSelectedAllergies([...selectedAllergies, allergy]);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between font-sans selection:bg-teal-600 selection:text-white">
      {/* Top Header Navbar */}
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur-md sticky top-0 z-40 shadow-xs">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 p-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex items-center justify-center shrink-0">
              <img src="/logo.png" alt={`${clinicName} Logo`} className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm sm:text-base font-black text-slate-900 tracking-tight">{clinicName}</span>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-teal-50 text-teal-800 border border-teal-200">
                  NABH Compliant
                </span>
              </div>
              <p className="text-[11px] text-teal-700 font-bold">{doctorName} • Dental Healthcare</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 text-xs">
            <button
              type="button"
              onClick={() => {
                setTrackerOpen(true);
                setTrackResult(null);
                setTrackError(null);
              }}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Look up your active queue token or booking status"
            >
              <Search className="w-3.5 h-3.5 text-teal-600" />
              <span className="hidden sm:inline">Track Token / Status</span>
              <span className="sm:hidden">Status</span>
            </button>

            <a
              href={`tel:${clinicPhone}`}
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold transition"
            >
              <Phone className="w-3.5 h-3.5 text-teal-600" />
              <span>{clinicPhone}</span>
            </a>

            {account ? (
              <Link
                to="/my/visits"
                className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black transition text-xs shadow-xs flex items-center gap-1.5"
              >
                <span>👤 Family Passbook</span>
              </Link>
            ) : (
              <Link
                to="/patient-login"
                className="px-3 py-2 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 font-bold transition text-xs"
              >
                <span>Patient Portal</span>
              </Link>
            )}

            <a
              href="/login"
              className="px-3 py-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-bold transition text-xs hidden sm:inline-block"
            >
              Staff Login
            </a>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto w-full px-4 py-8 sm:py-10 flex-1">
        {/* Clinic Closed Alert Banner */}
        {publicClinicStatus && !publicClinicStatus.isOpen && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-50 border-2 border-rose-300 text-rose-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-in fade-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center font-black text-lg shrink-0">
                !
              </div>
              <div>
                <h4 className="font-black text-sm text-rose-950">
                  Clinic is currently closed: {publicClinicStatus.message}
                </h4>
                <p className="text-xs text-rose-800 font-medium mt-0.5">
                  {publicClinicStatus.nextOpenAt
                    ? `Next scheduled opening: ${new Date(publicClinicStatus.nextOpenAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}`
                    : 'Online slot booking and walk-ins are currently suspended.'}
                </p>
              </div>
            </div>
            {publicClinicStatus.phone && (
              <a
                href={`tel:${publicClinicStatus.phone}`}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl whitespace-nowrap self-start sm:self-auto shadow-xs flex items-center gap-1.5"
              >
                <span>📞 Emergency: {publicClinicStatus.phone}</span>
              </a>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            {/* Brand Hero Banner */}
            <div className="text-center space-y-2.5 max-w-2xl mx-auto">
              <div className="flex justify-center mb-2">
                <div className="w-20 h-20 p-2 bg-white rounded-3xl border border-slate-200 shadow-md flex items-center justify-center">
                  <img src="/logo.png" alt={`${clinicName} Logo`} className="w-full h-full object-contain" />
                </div>
              </div>

              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-xs font-black tracking-wide">
                <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                <span>ONLINE APPOINTMENT & QUEUE PASS</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                {clinicName}
              </h1>
              <p className="text-xs text-slate-600 font-medium">
                {doctorName} • {clinicAddress}
              </p>

              {tenantClinic?.isOnLeave && (
                <div className="mt-3 p-4 rounded-2xl bg-rose-50 border-2 border-rose-400 text-rose-950 text-xs font-medium space-y-1 text-left shadow-sm">
                  <div className="flex items-center gap-2 font-black text-rose-900 text-sm">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>⛔ Hospital Closed for Holiday / Leave</span>
                  </div>
                  <p className="text-rose-800">
                    {clinicName} is currently observing a holiday ({tenantClinic.leaveReason || 'Holiday'}). Online booking is paused. For dental emergencies, please call {clinicPhone}.
                  </p>
                </div>
              )}

              {/* Trust Badges */}
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-[11px] font-bold text-slate-600">
                <span className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-xs">
                  <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                  <span>4.9 / 5 Rating (850+ Reviews)</span>
                </span>
                <span className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-xs">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Class-B Autoclave Sterilization</span>
                </span>
                <span className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-xs">
                  <Zap className="w-3.5 h-3.5 text-cyan-600" />
                  <span>Same-Day Emergency Relief</span>
                </span>
              </div>
            </div>

            {/* Visit Mode Switcher (Online Booking vs Walk-In Registration) */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-md space-y-3">
              <label className="block text-xs font-black text-slate-800 uppercase tracking-wider">
                Select How You Are Registering:
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setVisitType('ONLINE_BOOKING')}
                  className={`p-4 rounded-2xl border text-left transition cursor-pointer flex items-start gap-3.5 ${
                    visitType === 'ONLINE_BOOKING'
                      ? 'bg-teal-50/80 border-teal-600 ring-2 ring-teal-600/20 shadow-xs'
                      : 'bg-slate-50/60 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    visitType === 'ONLINE_BOOKING' ? 'bg-teal-600 text-white' : 'bg-slate-200 text-slate-600'
                  }`}>
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-black text-xs sm:text-sm text-slate-900 flex items-center gap-1.5">
                      <span>📅 Book Online (From Home)</span>
                      {visitType === 'ONLINE_BOOKING' && (
                        <span className="text-[10px] bg-teal-600 text-white px-2 py-0.5 rounded-full font-bold">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                      Plan ahead. Select date & time slot for today or coming days. Show pass when you arrive.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setVisitType('WALK_IN');
                    setSelectedDate(todayStr);
                  }}
                  className={`p-4 rounded-2xl border text-left transition cursor-pointer flex items-start gap-3.5 ${
                    visitType === 'WALK_IN'
                      ? 'bg-emerald-50/80 border-emerald-600 ring-2 ring-emerald-600/20 shadow-xs'
                      : 'bg-slate-50/60 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    visitType === 'WALK_IN' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
                  }`}>
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-black text-xs sm:text-sm text-slate-900 flex items-center gap-1.5">
                      <span>🏥 Already at Hospital? (Walk-in)</span>
                      {visitType === 'WALK_IN' && (
                        <span className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-full font-bold">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                      Standing in the clinic waiting lobby? Self-register into today's live waiting queue without waiting at the desk.
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* STEP 1: Dental Concern & Custom Message */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-md">
              <div className="border-b border-slate-100 pb-3">
                <span className="text-[10px] font-black uppercase text-teal-800 tracking-wider">
                  STEP 1 OF 3 • CHIEF COMPLAINT
                </span>
                <h2 className="text-base sm:text-lg font-black text-slate-900 mt-0.5">
                  What is Your Main Dental Problem?
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pick a quick category and describe your symptoms in your own words.
                </p>
              </div>

              {/* Quick Concern Chips */}
              <div>
                <label className="block text-xs font-black text-slate-800 uppercase tracking-wider mb-2">
                  Select Quick Reason:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {COMMON_REASONS.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedReason(r.id)}
                      className={`p-3 rounded-2xl border text-left transition cursor-pointer flex items-center gap-2 text-xs font-bold ${
                        selectedReason === r.id
                          ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span className="text-base">{r.icon}</span>
                      <span className="line-clamp-1">{r.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Message / Problem Description Box (Prominent & Required) */}
              <div>
                <label className="block text-xs font-black text-slate-800 uppercase tracking-wider mb-1.5">
                  Describe Your Problem / Message for the Doctor *
                </label>
                <textarea
                  rows={3}
                  required
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  placeholder="e.g. Severe throbbing toothache on my lower right side since yesterday, pain worsens with cold water, need consultation..."
                  className="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-2xl text-xs sm:text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-teal-600 focus:outline-none transition-all shadow-inner"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  The doctor will read this message before examining you in the chair.
                </span>
              </div>

              {/* Tooth Quadrant Area */}
              <div>
                <label className="block text-xs font-black text-slate-800 uppercase tracking-wider mb-2">
                  Which Area is Bothering You? (Optional)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {TOOTH_AREAS.map((area) => (
                    <button
                      key={area.id}
                      type="button"
                      onClick={() => setSelectedToothArea(area.id)}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                        selectedToothArea === area.id
                          ? 'bg-teal-50 border-teal-600 text-teal-900 ring-1 ring-teal-600'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <div className="font-bold text-xs">{area.label}</div>
                      <div className="text-[10px] text-slate-500">{area.sub}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* STEP 2: Date & Slot Picker */}
            {visitType === 'ONLINE_BOOKING' ? (
              <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-md">
                <div className="border-b border-slate-100 pb-3">
                  <span className="text-[10px] font-black uppercase text-teal-800 tracking-wider">
                    STEP 2 OF 3 • SCHEDULE & ROOM
                  </span>
                  <h2 className="text-base sm:text-lg font-black text-slate-900 mt-0.5">
                    Choose Operatory Room, Date & Time Slot
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    We have {chairs.length} operatory rooms with attending doctors operating in parallel.
                  </p>
                </div>

                {/* Operatory Room & Doctor Selection */}
                <div>
                  <label className="block text-xs font-black text-slate-800 uppercase tracking-wider mb-2">
                    Select Operatory Room & Attending Doctor:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {chairs.map((c) => {
                      const isOff = !c.isActive;
                      return (
                        <button
                          key={c.chairNumber}
                          type="button"
                          disabled={isOff}
                          onClick={() => setSelectedChair(c.chairNumber)}
                          className={`p-3.5 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
                            isOff
                              ? 'bg-slate-100 border-slate-200 opacity-60 cursor-not-allowed'
                              : selectedChair === c.chairNumber
                              ? 'bg-teal-50 border-teal-600 ring-2 ring-teal-600/20 shadow-xs'
                              : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <div>
                            <div className="font-black text-xs sm:text-sm text-slate-900 flex items-center justify-between gap-1.5">
                              <span>💺 Chair #{c.chairNumber}</span>
                              {selectedChair === c.chairNumber && !isOff && (
                                <span className="text-[10px] bg-teal-600 text-white px-2 py-0.5 rounded-full font-bold">
                                  Selected
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-teal-800 font-bold mt-1">{c.name}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">{c.doctorName}</p>
                          </div>

                          <div className="mt-2.5 pt-2 border-t border-slate-200 flex items-center justify-between text-[10px]">
                            <span className="text-slate-400">Parallel Operatory</span>
                            {c.isActive ? (
                              <span className="bg-emerald-100 text-emerald-800 font-black px-2 py-0.5 rounded-full">
                                🟢 Open
                              </span>
                            ) : (
                              <span className="bg-rose-100 text-rose-800 font-black px-2 py-0.5 rounded-full">
                                🔴 Off Duty
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {chairs.find((c) => c.chairNumber === selectedChair && !c.isActive) && (
                    <div className="p-3 mt-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Doctor for Operatory #{selectedChair} is currently off duty. Please select another room above.</span>
                    </div>
                  )}
                </div>

                {/* Day selector */}
                <div>
                  <label className="block text-xs font-black text-slate-800 uppercase tracking-wider mb-2">
                    Select Day:
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setSelectedDate(todayStr)}
                      className={`p-3 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
                        selectedDate === todayStr
                          ? 'bg-teal-50 border-teal-600 text-teal-900 ring-2 ring-teal-600/20'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span className="text-[11px] font-black text-emerald-700 uppercase tracking-wider flex items-center gap-1">
                        <Zap className="w-3 h-3 fill-emerald-600 text-emerald-600" />
                        Today
                      </span>
                      <span className="text-sm font-black text-slate-900 mt-0.5">
                        {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </span>
                      <span className="text-[10px] text-emerald-700 font-bold mt-1">⚡ Fast-Track Open</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedDate(tomorrowStr)}
                      className={`p-3 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
                        selectedDate === tomorrowStr
                          ? 'bg-teal-50 border-teal-600 text-teal-900 ring-2 ring-teal-600/20'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tomorrow</span>
                      <span className="text-sm font-black text-slate-900 mt-0.5">
                        {new Date(Date.now() + 86400000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </span>
                      <span className="text-[10px] text-teal-700 font-semibold mt-1">Available Slots</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedDate(dayAfterStr)}
                      className={`p-3 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
                        selectedDate === dayAfterStr
                          ? 'bg-teal-50 border-teal-600 text-teal-900 ring-2 ring-teal-600/20'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Day After</span>
                      <span className="text-sm font-black text-slate-900 mt-0.5">
                        {new Date(Date.now() + 172800000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </span>
                      <span className="text-[10px] text-teal-700 font-semibold mt-1">Available Slots</span>
                    </button>
                  </div>
                </div>

                {/* Slot groups with live occupancy grey out */}
                {(() => {
                  const isSelectedChairOff = !chairs.find(c => c.chairNumber === selectedChair)?.isActive;
                  const chairBookedList = bookedSlotsByChair[selectedChair] || [];

                  const renderSlotButton = (slot: string) => {
                    const isOccupied = chairBookedList.includes(slot);
                    const isPastSlot = selectedDate === todayStr && (() => {
                      const match = slot.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
                      if (!match) return false;
                      let h = parseInt(match[1], 10);
                      const m = parseInt(match[2], 10);
                      const meridiem = match[3].toUpperCase();
                      if (meridiem === 'PM' && h < 12) h += 12;
                      if (meridiem === 'AM' && h === 12) h = 0;
                      const now = new Date();
                      const istTimeParts = new Intl.DateTimeFormat('en-US', {
                        timeZone: 'Asia/Kolkata',
                        hour: 'numeric',
                        minute: 'numeric',
                        hour12: false,
                      }).formatToParts(now);
                      const curH = parseInt(istTimeParts.find(p => p.type === 'hour')?.value || '0', 10);
                      const curM = parseInt(istTimeParts.find(p => p.type === 'minute')?.value || '0', 10);
                      return curH > h || (curH === h && curM > m);
                    })();

                    const isDisabled = isSelectedChairOff || isOccupied || isPastSlot;
                    const isSelected = selectedSlot === slot && !isDisabled;

                    return (
                      <button
                        key={slot}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => setSelectedSlot(slot)}
                        title={
                          isOccupied
                            ? `Occupied: Chair #${selectedChair} is already reserved at ${slot}. Switch to another operatory room above to see if it's free.`
                            : isPastSlot
                            ? `Time passed: ${slot} has already elapsed today.`
                            : isSelectedChairOff
                            ? `Operatory Chair #${selectedChair} is off duty.`
                            : `Select ${slot}`
                        }
                        className={`py-2 px-1 rounded-xl text-xs font-bold transition text-center relative flex flex-col items-center justify-center min-h-[46px] ${
                          isOccupied
                            ? 'bg-slate-100 text-slate-400 border border-slate-200 line-through opacity-50 cursor-not-allowed select-none'
                            : isPastSlot
                            ? 'bg-slate-100 text-slate-400 border border-slate-200 line-through opacity-40 cursor-not-allowed select-none'
                            : isSelectedChairOff
                            ? 'bg-slate-100 text-slate-400 border border-slate-200 opacity-40 cursor-not-allowed'
                            : isSelected
                            ? 'bg-teal-600 text-white shadow-xs font-black cursor-pointer ring-2 ring-teal-600/30'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 cursor-pointer'
                        }`}
                      >
                        <span className={isOccupied || isPastSlot ? 'line-through text-slate-400' : ''}>{slot}</span>
                        {isOccupied && (
                          <span className="text-[9px] font-black text-rose-600 uppercase tracking-tight mt-0.5 no-underline">
                            Booked
                          </span>
                        )}
                        {!isOccupied && isPastSlot && (
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight mt-0.5 no-underline">
                            Passed
                          </span>
                        )}
                      </button>
                    );
                  };

                  return (
                    <div className="space-y-4 pt-1">
                      {/* Occupancy Legend */}
                      <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-600 font-semibold px-1 py-1 border-b border-slate-100 gap-2">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-teal-600"></span> Selected
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-slate-200 border border-slate-300"></span> Open
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-rose-400"></span> Booked (Greyed)
                          </span>
                        </div>
                        <span className="text-teal-800 font-extrabold">
                          Showing Slots for Chair #{selectedChair}
                        </span>
                      </div>

                      {isSelectedChairOff && (
                        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                          <span>All slots for Operatory #{selectedChair} are currently disabled because the doctor is off-duty. Switch operatory room above to view available slots.</span>
                        </div>
                      )}

                      <div>
                        <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-teal-600" />
                          <span>Morning Shift (09:30 AM - 01:00 PM)</span>
                        </label>
                        <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
                          {MORNING_SLOTS.map(renderSlotButton)}
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-teal-600" />
                          <span>Afternoon Shift (02:30 PM - 05:00 PM)</span>
                        </label>
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                          {AFTERNOON_SLOTS.map(renderSlotButton)}
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-teal-600" />
                          <span>Evening Shift (05:30 PM - 08:00 PM)</span>
                        </label>
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                          {EVENING_SLOTS.map(renderSlotButton)}
                        </div>
                      </div>
                    </div>
                  );
                })()}

              </div>
            ) : (
              /* Walk-In immediate queue card */
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-3xl p-5 sm:p-6 text-xs text-emerald-900 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-ping" />
                    <span className="font-black text-sm">Immediate Walk-in Lobby Registration</span>
                  </div>
                  {lobbyCode && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-950 border border-emerald-300 font-mono font-black text-xs">
                      <span>✓ In-Clinic Passcode:</span>
                      <strong className="text-emerald-800">{lobbyCode}</strong>
                    </span>
                  )}
                </div>
                <p className="text-emerald-800 leading-relaxed font-medium">
                  Since you are already at the clinic, you will be assigned to <strong>Today's Active Chair Queue</strong>. No slot picking needed — doctor and reception will be notified the moment you submit.
                </p>
              </div>
            )}

            {/* Continue button to Step 2 */}
            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-slate-500">
                Selected Mode: <strong className="text-slate-900">{visitType === 'WALK_IN' ? 'Hospital Lobby Walk-in' : 'Online Booking'}</strong>
              </div>

              <button
                type="button"
                onClick={() => {
                  const isSelectedChairOff = !chairs.find(c => c.chairNumber === selectedChair)?.isActive;
                  if (visitType === 'ONLINE_BOOKING' && isSelectedChairOff) {
                    alert('The doctor for this operatory room is currently off duty. Please select another room above.');
                    return;
                  }
                  if (!customMessage.trim()) {
                    alert('Please enter a description of your problem or message for the doctor.');
                    return;
                  }
                  setStep(2);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="px-8 py-3.5 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white font-black text-sm shadow-md shadow-teal-600/20 flex items-center justify-center gap-2 transition cursor-pointer active:scale-98"
              >
                <span>Continue to Patient Details</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: 20-Second Patient Contact Details */}
        {step === 2 && (
          <div className="max-w-xl mx-auto space-y-6">
            <button
              onClick={() => {
                setStep(1);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="text-xs font-bold text-teal-700 hover:underline flex items-center gap-1 cursor-pointer"
            >
              ← Back to Concern & Timing
            </button>

            <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-5 shadow-lg">
              <div className="border-b border-slate-100 pb-3">
                <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] font-black uppercase bg-teal-50 text-teal-800 border border-teal-200 mb-2">
                  FINAL STEP • PATIENT REGISTRATION
                </div>
                <h3 className="text-xl font-black text-slate-900">Who is this Visit For?</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  We will send your priority queue pass to your WhatsApp number.
                </p>
              </div>

              <form onSubmit={handleBookAppointment} className="space-y-4 text-xs">
                {/* Logged-in Account Family Member Selector */}
                {account && familyMembers.length > 0 && (
                  <div className="p-4 bg-teal-50/80 border border-teal-200 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black uppercase text-teal-900 tracking-wider">
                        Select Family Member Profile:
                      </span>
                      <Link to="/my/family" className="text-[11px] font-bold text-teal-700 hover:underline">
                        + Add Member
                      </Link>
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                      {familyMembers.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setSelectedPatientId(m.id);
                            setFullName(m.fullName);
                            if (m.age) setAge(String(m.age));
                            if (m.gender) setGender(m.gender);
                          }}
                          className={`px-3 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                            selectedPatientId === m.id
                              ? 'bg-teal-600 text-white shadow-xs font-black'
                              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <span>{m.fullName}</span>
                          <span className="text-[10px] opacity-75 ml-1">({m.relationToAccount})</span>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPatientId(null);
                          setFullName('');
                          setAge('');
                        }}
                        className={`px-3 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                          selectedPatientId === null
                            ? 'bg-teal-600 text-white shadow-xs font-black'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        ➕ Other Family Member
                      </button>
                    </div>
                  </div>
                )}

                {/* Returning Guest Patient Matcher */}
                {!account && matchingPatients.length > 0 && (
                  <div className="p-4 bg-teal-50/80 border border-teal-200 rounded-2xl space-y-2">
                    <div className="text-[11px] font-black uppercase text-teal-900 tracking-wider">
                      Previous Records Found on This Phone Number:
                    </div>
                    <p className="text-[11px] text-slate-600">
                      Who is visiting today? Tap a name to book without creating a duplicate record:
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {matchingPatients.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setSelectedPatientId(p.id);
                            setFullName(p.fullName);
                            if (p.age) setAge(String(p.age));
                            if (p.gender) setGender(p.gender);
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                            selectedPatientId === p.id
                              ? 'bg-teal-600 text-white shadow-xs font-black'
                              : 'bg-white text-slate-700 border border-slate-300 hover:bg-teal-50'
                          }`}
                        >
                          <span>✓ {p.fullName}</span>
                          <span className="font-mono text-[10px] opacity-75 ml-1">({p.uhid})</span>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPatientId(null);
                          setFullName('');
                          setAge('');
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                          selectedPatientId === null
                            ? 'bg-teal-600 text-white shadow-xs font-black'
                            : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        ➕ Different Family Member
                      </button>
                    </div>
                  </div>
                )}

                {/* Full Name */}
                <div>
                  <label className="block font-black text-slate-800 uppercase tracking-wider mb-1.5">
                    Patient Full Name *
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Ramesh Kumar / Anitha Sundaram"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-2xl bg-slate-50 border border-slate-300 text-slate-900 font-bold text-sm focus:outline-none focus:border-teal-600 focus:bg-white"
                    />
                  </div>
                </div>

                {/* WhatsApp Phone */}
                <div>
                  <label className="block font-black text-slate-800 uppercase tracking-wider mb-1.5">
                    WhatsApp Mobile Number *
                  </label>
                  <div className="flex gap-2">
                    <div className="px-3 py-3 rounded-2xl bg-slate-100 border border-slate-300 text-slate-700 font-bold text-sm flex items-center gap-1.5">
                      <span>🇮🇳</span>
                      <span>+91</span>
                    </div>
                    <div className="relative flex-1">
                      <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                      <input
                        type="tel"
                        required
                        maxLength={10}
                        placeholder="10-digit mobile (e.g. 98765 43210)"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                        className="w-full pl-10 pr-4 py-3 rounded-2xl bg-slate-50 border border-slate-300 text-slate-900 font-bold text-sm focus:outline-none focus:border-teal-600 focus:bg-white font-mono"
                      />
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Zero spam. Instant token pass sent directly to your WhatsApp.
                  </span>
                </div>

                {/* Age & Gender */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-black text-slate-800 uppercase tracking-wider mb-1.5">
                      Patient Age
                    </label>
                    <input
                      type="number"
                      placeholder="e.g. 28"
                      min={1}
                      max={110}
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-300 text-slate-900 font-bold text-sm focus:bg-white focus:border-teal-600"
                    />
                  </div>

                  <div>
                    <label className="block font-black text-slate-800 uppercase tracking-wider mb-1.5">
                      Gender
                    </label>
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      className="w-full px-3 py-3 rounded-2xl bg-slate-50 border border-slate-300 text-slate-900 text-sm font-bold cursor-pointer focus:bg-white focus:border-teal-600"
                    >
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                      <option value="OTHER">Other / Prefer not to say</option>
                    </select>
                  </div>
                </div>

                {/* DPDP Act Privacy Card */}
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-800 block">Strict Medical Confidentiality</span>
                    <span>Protected under Indian Digital Personal Data Protection (DPDP) Act. Only your attending doctor has access.</span>
                  </div>
                </div>

                {/* Submit button */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-4 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white font-black text-sm shadow-md shadow-teal-600/20 flex items-center justify-center gap-2 transition cursor-pointer active:scale-98 disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    <span>{isSubmitting ? 'Generating Your Queue Pass...' : '⚡ Generate My Priority Booking Pass'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* STEP 3: Digital VIP Boarding Pass & Confirmation */}
        {step === 3 && (
          <div className="max-w-2xl mx-auto space-y-6">
            {/* VIP Ticket Pass Card */}
            <div className="bg-white border-2 border-teal-600/30 rounded-3xl overflow-hidden shadow-xl relative">
              {/* Decorative top ribbon */}
              <div className="bg-gradient-to-r from-teal-600 to-emerald-600 px-6 py-3.5 text-white flex items-center justify-between">
                <div className="flex items-center gap-2 font-black text-xs uppercase tracking-wider">
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {visitType === 'WALK_IN' ? 'Hospital Lobby Walk-in Pass' : 'VIP Operatory Priority Pass'}
                  </span>
                </div>
                <span className="font-mono font-black text-xs bg-white text-teal-900 px-2.5 py-0.5 rounded-md shadow-xs">
                  {visitType === 'WALK_IN' ? 'QUEUE CONFIRMED' : 'SLOT RESERVED'}
                </span>
              </div>

              <div className="p-6 sm:p-8 space-y-6">
                {/* Header info */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-teal-800 font-mono">
                      TOKEN / BOOKING REFERENCE ID
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xl sm:text-2xl font-black font-mono text-slate-900 tracking-wider">
                        {bookingRef}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyRef}
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                        title="Copy Reference"
                      >
                        {copiedRef ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    {patientUhid && (
                      <span className="text-[11px] font-mono text-slate-500 mt-0.5 block font-bold">
                        Hospital UHID: {patientUhid}
                      </span>
                    )}
                  </div>

                  {/* Scannable Dynamic QR Code */}
                  <div className="p-2 bg-white rounded-2xl border border-slate-200 shrink-0 self-start sm:self-auto shadow-sm text-center">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=DENTAL-PASS:${encodeURIComponent(bookingRef || 'CONFIRMED')}`}
                      alt="Booking QR Code"
                      className="w-20 h-20 sm:w-24 sm:h-24 object-contain mx-auto"
                    />
                    <span className="text-[8px] font-mono font-black text-slate-700 block mt-1 uppercase">
                      Reception Scan
                    </span>
                  </div>
                </div>

                {/* Large Sequential Daily Token Banner */}
                <div className="p-4 rounded-2xl bg-teal-50 border border-teal-200 flex items-center justify-between shadow-xs">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-teal-700 block">
                      TODAY'S LIVE QUEUE TOKEN
                    </span>
                    <span className="text-3xl font-black font-mono text-teal-900">
                      TOKEN #{tokenNumber || 1}
                    </span>
                    <span className="text-[11px] text-teal-800 font-bold block mt-0.5">
                      {visitType === 'WALK_IN' ? '🏥 Walk-In Lobby Queue' : '🌐 Online Scheduled Priority'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Assigned Operatory</span>
                    <span className="text-sm font-black text-slate-900">Chair #{selectedChair}</span>
                    <span className="text-[11px] text-teal-800 font-bold block">
                      {chairs.find(c => c.chairNumber === selectedChair)?.doctorName || 'Doctor Room'}
                    </span>
                  </div>
                </div>

                {/* Smartphone Live Queue Tracker CTA */}
                {trackingCode && (
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-teal-950 via-slate-900 to-teal-900 text-white flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md border border-teal-500/30">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-300 flex items-center justify-center font-black">
                        <Sparkles className="w-5 h-5 text-amber-300" />
                      </div>
                      <div>
                        <div className="font-black text-sm flex items-center gap-2">
                          <span>Live Smartphone Queue Tracker</span>
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950">Active</span>
                        </div>
                        <p className="text-xs text-teal-200 font-medium">Track your queue progress & operatory call on your phone</p>
                      </div>
                    </div>
                    <Link
                      to={`/track/${trackingCode}`}
                      className="px-4 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-black text-xs transition cursor-pointer flex items-center gap-1.5 active:scale-95 shrink-0"
                    >
                      <span>Track My Token Live</span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                )}

                {/* Details Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-2 border-b border-slate-100 pb-5 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Patient Name</span>
                    <strong className="text-slate-900 text-sm block mt-0.5">{fullName}</strong>
                    <span className="text-slate-500 text-[11px] font-mono">+91 {phone}</span>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Date</span>
                    <strong className="text-teal-800 text-sm block mt-0.5">
                      {new Date(selectedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </strong>
                    <span className="text-slate-500 text-[11px]">
                      {new Date(selectedDate).toLocaleDateString('en-IN', { weekday: 'long' })}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      {visitType === 'WALK_IN' ? 'Queue Priority' : 'Reserved Slot'}
                    </span>
                    <strong className="text-slate-900 text-sm block mt-0.5">
                      {visitType === 'WALK_IN' ? 'Immediate Walk-In' : selectedSlot}
                    </strong>
                    <span className="text-teal-700 font-bold text-[11px]">Operatory Chair 1</span>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Concern</span>
                    <strong className="text-slate-900 text-xs block mt-0.5 line-clamp-1">
                      {COMMON_REASONS.find((r) => r.id === selectedReason)?.label}
                    </strong>
                    <span className="text-slate-500 text-[11px]">{selectedToothArea}</span>
                  </div>
                </div>

                {/* Instructions Box depending on Visit Mode */}
                <div className="p-4 rounded-2xl bg-teal-50/80 border border-teal-200 text-xs text-teal-900 space-y-1">
                  <div className="flex items-center gap-1.5 font-black text-sm">
                    <Info className="w-4 h-4 text-teal-700" />
                    <span>
                      {visitType === 'WALK_IN' ? 'Instructions for Lobby Walk-In:' : 'Instructions for Online Booking:'}
                    </span>
                  </div>
                  <p className="text-[11px] text-teal-800 leading-relaxed font-medium">
                    {visitType === 'WALK_IN'
                      ? 'You are registered in today’s active hospital queue! Please take a seat in the waiting lounge. Reception and Doctor have received your alert and will call your token number shortly.'
                      : 'When you arrive at the clinic, simply show this pass or quote your phone number at reception. You will be fast-tracked to the operatory chair without paper forms.'}
                  </p>
                </div>

                {/* Clinic Address & Map */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="font-bold text-slate-900 block">{clinicName}</span>
                    <p className="text-[11px] text-slate-600 mt-0.5">{clinicAddress}</p>
                    <span className="text-[11px] text-teal-800 font-bold mt-1 block">Clinic Help: {clinicPhone}</span>
                  </div>

                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-bold text-xs flex items-center gap-1.5 shrink-0 transition shadow-xs"
                  >
                    <MapPin className="w-3.5 h-3.5 text-teal-600" />
                    <span>Google Maps Directions</span>
                  </a>
                </div>

                {/* Action Buttons Hub */}
                <div className="space-y-2.5 pt-2">
                  {visitType === 'WALK_IN' ? (
                    <div className="p-4 rounded-2xl bg-emerald-50 border-2 border-emerald-400 text-emerald-950 flex items-center justify-between shadow-xs">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black">
                          <CheckCircle2 className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="font-black text-sm text-emerald-950">✅ Officially Checked In!</h4>
                          <p className="text-xs text-emerald-800 font-medium">
                            Token #{tokenNumber || 1} is registered in the live lobby queue. The doctor has received your arrival notification.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="p-3.5 rounded-2xl bg-teal-50 border border-teal-200 text-teal-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs">
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-black uppercase tracking-wider text-teal-800 block">
                            ⚡ Hospital Arrival Self Check-In
                          </span>
                          <p className="text-xs text-teal-900 font-bold">
                            When you arrive at the clinic, scan the lobby QR or tap below to check in:
                          </p>
                        </div>
                        <a
                          href={`/checkin?ref=${encodeURIComponent(bookingRef || '')}&phone=${encodeURIComponent(phone.replace(/\D/g, ''))}`}
                          className="px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-black text-xs flex items-center justify-center gap-1.5 shrink-0 shadow-xs transition"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          <span>Check In On Arrival</span>
                        </a>
                      </div>

                      <a
                        href={getWhatsAppConfirmLink()}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full py-3.5 rounded-2xl bg-[#25D366] hover:bg-[#20ba59] text-white font-black text-sm flex items-center justify-center gap-2 shadow-md transition cursor-pointer active:scale-98"
                      >
                        <MessageCircle className="w-5 h-5" />
                        <span>Confirm Instantly via WhatsApp</span>
                      </a>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-bold">
                    <a
                      href={getGoogleCalendarLink()}
                      target="_blank"
                      rel="noreferrer"
                      className="py-2.5 px-3 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 flex items-center justify-center gap-1.5 transition shadow-xs"
                    >
                      <Calendar className="w-4 h-4 text-teal-600" />
                      <span>Google Calendar</span>
                    </a>

                    <button
                      type="button"
                      onClick={handleDownloadAppleCalendar}
                      className="py-2.5 px-3 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs"
                    >
                      <Download className="w-4 h-4 text-teal-600" />
                      <span>Apple / Outlook (.ics)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="py-2.5 px-3 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs"
                    >
                      <Printer className="w-4 h-4 text-teal-600" />
                      <span>Print Pass / PDF</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>


            {/* Back button */}
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setBookingRef(null);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="text-xs text-slate-500 hover:text-slate-800 underline cursor-pointer font-bold"
              >
                Register Another Patient or Appointment
              </button>
            </div>
          </div>
        )}
      </main>

      {/* TRACK LIVE TOKEN / STATUS MODAL */}
      {trackerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full shadow-2xl p-6 text-xs space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center border border-teal-200">
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900">Live Queue & Token Status</h3>
                  <p className="text-[11px] text-slate-500">Track your spot in line before arriving</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setTrackerOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleTrackBooking} className="space-y-3">
              <div>
                <label className="block text-[11px] font-black text-slate-800 uppercase tracking-wider mb-1">
                  Enter Booking Reference or Mobile Number
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="e.g. AKS-2026-A1B2 or 9876543210"
                    value={trackQuery}
                    onChange={(e) => setTrackQuery(e.target.value)}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 font-mono text-xs focus:outline-none focus:border-teal-600 focus:bg-white"
                  />
                  <button
                    type="submit"
                    disabled={trackingLoading}
                    className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-xs transition cursor-pointer"
                  >
                    {trackingLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Search'}
                  </button>
                </div>
              </div>
            </form>

            {trackError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold">
                {trackError}
              </div>
            )}

            {trackResult && (
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                  <div>
                    <span className="text-[10px] text-slate-500 font-mono block">QUEUE TOKEN</span>
                    <span className="text-2xl font-black font-mono text-teal-800">#{trackResult.tokenNumber}</span>
                  </div>

                  <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-50 text-emerald-800 border border-emerald-200">
                    {trackResult.status}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Patient:</span>
                    <span className="font-bold text-slate-900">{trackResult.patientName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Doctor & Chair:</span>
                    <span className="font-bold text-teal-800">{trackResult.dentistName} (Chair {trackResult.chairNumber})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Time Slot:</span>
                    <span className="font-mono text-slate-900 font-bold">
                      {new Date(trackResult.scheduledStart).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}{' '}
                      at {new Date(trackResult.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Patients Ahead:</span>
                    <span className="font-bold text-amber-700">
                      {trackResult.currentlyAhead > 0 ? `${trackResult.currentlyAhead} patient(s) ahead` : 'You are next!'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© {new Date().getFullYear()} {clinicName}. All rights reserved.</p>
          <div className="flex items-center gap-4 text-[11px] text-slate-600 font-medium">
            <span>Sterilization Protocol: ISO / NABH</span>
            <span>•</span>
            <span>Digital X-Rays</span>
            <span>•</span>
            <span>Emergency Tele-Consultation</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PublicBookingView;
