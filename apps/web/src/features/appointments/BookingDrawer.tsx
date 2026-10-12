import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api';
import { X, Calendar, Clock, Armchair, Stethoscope, AlertTriangle, UserCheck, AlertCircle, CalendarPlus, MessageCircle, CheckCircle2 } from 'lucide-react';
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
  const totalChairs = user?.clinic?.chairCount || 3;

  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>(preSelectedPatient?.id || '');
  const [dentists, setDentists] = useState<any[]>([]);
  const [selectedDentistId, setSelectedDentistId] = useState<string>('');
  const [chairNumber, setChairNumber] = useState<number>(1);
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState<string>(() => getSmartCurrentTime());
  const [duration, setDuration] = useState<number>(30);
  const [reason, setReason] = useState<string>('Routine Dental Consultation');
  const [notes, setNotes] = useState<string>('');

  const [conflictError, setConflictError] = useState<string | null>(null);
  const [bookingSuccessData, setBookingSuccessData] = useState<{
    patient: any;
    date: string;
    time: string;
    chairNumber: number;
    doctorName?: string;
    reason?: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    setConflictError(null);
    setSubmitting(true);

    try {
      const scheduledStart = new Date(`${date}T${time}:00.000+05:30`).toISOString();

      await apiRequest('/appointments', {
        method: 'POST',
        body: JSON.stringify({
          patientId: selectedPatientId,
          dentistId: selectedDentistId,
          chairNumber,
          scheduledStart,
          durationMinutes: duration,
          reason,
          notes,
        }),
      });

      const pObj = patients.find(p => p.id === selectedPatientId) || preSelectedPatient;
      const dObj = dentists.find(d => d.id === selectedDentistId);
      setBookingSuccessData({
        patient: pObj,
        date,
        time,
        chairNumber,
        doctorName: dObj?.fullName,
        reason,
      });

      triggerClinicSync('appointment_booked');
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
                Select dental chair, date, and time slot
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

        {/* Conflict Warning */}
        {conflictError && (
          <div className="p-4 bg-rose-50 border-b border-rose-300 text-rose-900 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-black">Schedule Conflict Detected</p>
              <p className="mt-0.5 font-medium">{conflictError}</p>
            </div>
          </div>
        )}

        {bookingSuccessData ? (
          <div className="flex-1 p-6 flex flex-col justify-between items-center text-center">
            <div className="w-full space-y-5 my-auto">
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center shadow-xs">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900">Appointment Confirmed!</h3>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  Slot has been successfully locked in the calendar
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left space-y-2.5 text-xs">
                <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                  <span className="text-slate-500 font-bold">Patient:</span>
                  <span className="font-black text-slate-900">{bookingSuccessData.patient?.fullName} ({bookingSuccessData.patient?.phone})</span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                  <span className="text-slate-500 font-bold">Schedule:</span>
                  <span className="font-black text-teal-700">{bookingSuccessData.date} at {bookingSuccessData.time}</span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                  <span className="text-slate-500 font-bold">Operatory Chair:</span>
                  <span className="font-black text-slate-900">Chair #{bookingSuccessData.chairNumber}</span>
                </div>
                {bookingSuccessData.doctorName && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-bold">Doctor:</span>
                    <span className="font-black text-slate-900">{bookingSuccessData.doctorName}</span>
                  </div>
                )}
              </div>

              {/* Instant WhatsApp Action */}
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 text-emerald-800 text-xs font-black">
                  <MessageCircle className="w-4 h-4 text-emerald-600" />
                  <span>1-Click Patient Confirmation</span>
                </div>
                <p className="text-xs text-emerald-700 font-medium text-left">
                  Dispatch branded WhatsApp message with date, chair number, doctor, and clinic address.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    openWhatsApp(
                      bookingSuccessData.patient?.phone,
                      generateAppointmentWhatsAppText({
                        clinicName: user?.clinic?.name || (user?.clinic?.code === 'JDC' ? 'Jacobs Dental Clinic' : "AK's Elite Dental Clinic"),
                        patientName: bookingSuccessData.patient?.fullName || 'Patient',
                        date: bookingSuccessData.date,
                        time: bookingSuccessData.time,
                        chairNumber: bookingSuccessData.chairNumber,
                        doctorName: bookingSuccessData.doctorName,
                        reason: bookingSuccessData.reason,
                        clinicAddress: user?.clinic?.address || (user?.clinic?.code === 'JDC' ? '14th East Cross Main Road, Gandhi Nagar East, Vellore' : 'Plot No. 162/2A, Alagar Complex, K.Pudur, Madurai'),
                        clinicPhone: user?.clinic?.phone || (user?.clinic?.code === 'JDC' ? '+91 97500 31330' : '+91 95387 23872'),
                      }),
                    );
                  }}
                  className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all active:scale-[0.98]"
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

          {/* Dental Chair */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block font-black text-slate-800">Operatory Dental Chair</label>
              <span className="text-xs text-teal-700 font-bold">{totalChairs} Available Units</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {Array.from({ length: totalChairs }, (_, i) => i + 1).map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChairNumber(c)}
                  className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                    chairNumber === c
                      ? 'bg-teal-50 border-2 border-teal-600 text-teal-900 font-black shadow-xs ring-2 ring-teal-500/20'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 font-bold'
                  }`}
                >
                  <Armchair className={`w-4 h-4 mx-auto mb-1 ${chairNumber === c ? 'text-teal-700' : 'text-slate-500'}`} />
                  <div className="text-xs font-black">Chair {c}</div>
                  <div className="text-[10px] text-slate-500 font-medium truncate">
                    Unit #{c}
                  </div>
                </button>
              ))}
            </div>
          </div>

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
                  { label: 'Now', offset: 0 },
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

          {/* Duration */}
          <div>
            <label className="block font-black text-slate-800 mb-1">Expected Duration</label>
            <div className="flex gap-2">
              {[15, 30, 45, 60].map(mins => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setDuration(mins)}
                  className={`flex-1 py-2 rounded-xl border text-center transition-colors cursor-pointer font-black ${
                    duration === mins
                      ? 'bg-teal-600 text-white border-teal-700 shadow-xs'
                      : 'bg-slate-50 border-slate-300 text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  {mins}m
                </button>
              ))}
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block font-black text-slate-800 mb-1">
              Reason for Visit / Complaint <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Toothache, Cleaning, Crown, Consultation"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold text-slate-900 focus:border-teal-600 focus:bg-white placeholder-slate-400"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block font-black text-slate-800 mb-1">Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional notes for doctor or reception..."
              className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-medium text-slate-900 focus:border-teal-600 focus:bg-white placeholder-slate-400"
            />
          </div>

          {/* Submit Button */}
          <div className="pt-4 border-t border-slate-200 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-700 border border-slate-300 font-bold hover:bg-slate-100 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl font-black text-white bg-teal-600 hover:bg-teal-700 shadow-xs cursor-pointer disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Confirm Appointment'}
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  );
};