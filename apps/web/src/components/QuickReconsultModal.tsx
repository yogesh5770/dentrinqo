import React, { useState } from 'react';
import { apiRequest } from '../lib/api';
import { triggerClinicSync } from '../lib/sync';
import {
  X,
  Search,
  Archive,
  Volume2,
  Camera,
  CheckCircle2,
  AlertCircle,
  Armchair,
  Stethoscope,
  Calendar,
  Zap,
  UserPlus,
} from 'lucide-react';

interface QuickReconsultModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPatientSelected?: (appointment: any, patient: any) => void;
  onOpenNewPatientWithSerial?: (serialNo: string) => void;
  initialSerialNo?: string;
  preloadedPatient?: any;
}

export const QuickReconsultModal: React.FC<QuickReconsultModalProps> = ({
  isOpen,
  onClose,
  onPatientSelected,
  onOpenNewPatientWithSerial,
  initialSerialNo = '',
  preloadedPatient = null,
}) => {
  if (!isOpen) return null;

  const [serialQuery, setSerialQuery] = useState(initialSerialNo || (preloadedPatient?.legacySlNo || ''));
  const [patient, setPatient] = useState<any | null>(preloadedPatient);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Re-consultation settings
  const [chairNumber, setChairNumber] = useState<number>(1);
  const [reason, setReason] = useState('Re-Consultation & Dental Review');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const term = serialQuery.trim();
    if (!term) return;

    setSearching(true);
    setNotFound(false);
    setSearchError(null);
    setPatient(null);
    setSuccessMsg(null);

    try {
      // 1. Direct serial lookup
      const res = await apiRequest<any>(`/patients/serial/${encodeURIComponent(term)}`);
      if (res && res.id) {
        setPatient(res);
      } else {
        setNotFound(true);
      }
    } catch (err: any) {
      // Fallback: search query
      try {
        const searchRes = await apiRequest<{ data: any[] }>(`/patients?search=${encodeURIComponent(term)}&limit=1`);
        if (searchRes && searchRes.data && searchRes.data.length > 0) {
          setPatient(searchRes.data[0]);
        } else {
          setNotFound(true);
        }
      } catch {
        setNotFound(true);
      }
    } finally {
      setSearching(false);
    }
  };

  const handleCreateReconsultation = async () => {
    if (!patient) return;
    setSubmitting(true);
    setSearchError(null);

    try {
      const appt = await apiRequest<any>('/appointments', {
        method: 'POST',
        body: JSON.stringify({
          patientId: patient.id,
          scheduledStart: new Date().toISOString(),
          durationMinutes: 30,
          reason: reason.trim() || `Re-Consultation (Card #${patient.legacySlNo || patient.uhid})`,
          status: 'CHECKED_IN',
          chairNumber: chairNumber,
          isReappearance: true,
          legacySlNo: patient.legacySlNo || undefined,
        }),
      });

      triggerClinicSync('appointment_booked');
      triggerClinicSync('appt_CHECKED_IN', {
        patientId: patient.id,
        patientName: patient.fullName,
        chairNumber,
      });

      setSuccessMsg(`✅ Patient "${patient.fullName}" checked in to Chair ${chairNumber}!`);

      if (onPatientSelected) {
        onPatientSelected(appt, patient);
      }

      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setSearchError(err.message || 'Failed to check in patient for re-consultation');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden text-slate-900 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 text-amber-200 fill-amber-200" />
            </div>
            <div>
              <h3 className="font-black text-base sm:text-lg">
                Patient Record Lookup & Re-Consultation
              </h3>
              <p className="text-xs text-amber-100 font-medium">
                Search patient by Card Serial Number or UHID and assign to Operatory Chair
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/20 text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {/* Search Box */}
          <form onSubmit={handleSearch} className="space-y-2">
            <label className="block text-xs font-black text-slate-800">
              Enter Card Serial Number (Sl. No) or UHID:
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Archive className="w-4 h-4 text-amber-700 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  autoFocus
                  value={serialQuery}
                  onChange={e => {
                    setSerialQuery(e.target.value);
                    setNotFound(false);
                  }}
                  placeholder="e.g. 1042, 3041, or C-502"
                  className="w-full pl-10 pr-4 py-2.5 text-sm font-mono font-black text-slate-900 bg-amber-50/60 border-2 border-amber-400 rounded-xl focus:border-amber-600 focus:bg-white focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={searching || !serialQuery.trim()}
                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Search className="w-4 h-4" />
                <span>{searching ? 'Searching...' : 'Search Record'}</span>
              </button>
            </div>
          </form>

          {/* Error / Not Found Alert */}
          {notFound && (
            <div className="p-4 bg-rose-50 border border-rose-300 rounded-2xl text-rose-950 text-xs space-y-3">
              <div className="flex items-center gap-2 font-black">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>No patient found with Card Serial Number #{serialQuery}</span>
              </div>
              <p className="text-slate-600 font-medium">
                This physical card has not been registered in the system yet. You can register it now using the serial number and patient name.
              </p>
              {onOpenNewPatientWithSerial && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenNewPatientWithSerial(serialQuery.trim());
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-black text-xs cursor-pointer shadow-xs active:scale-95"
                >
                  <UserPlus className="w-4 h-4" />
                  + Register Card #{serialQuery}
                </button>
              )}
            </div>
          )}

          {searchError && (
            <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-900 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{searchError}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-950 text-xs font-black flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Patient Profile Card (When Found) */}
          {patient && (
            <div className="border-2 border-amber-300 rounded-2xl p-4 bg-gradient-to-br from-amber-50/70 to-amber-100/30 space-y-4">
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-amber-200">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-black text-base text-slate-900">
                      {patient.fullName}
                    </h4>
                    {patient.legacySlNo && (
                      <span className="font-mono font-black text-xs bg-amber-300 text-amber-950 border border-amber-400 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <Archive className="w-3 h-3 text-amber-800" />
                        Card #{patient.legacySlNo}
                      </span>
                    )}
                    <span className="font-mono text-xs font-bold text-teal-800 bg-teal-100 px-2 py-0.5 rounded">
                      {patient.uhid}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-slate-600 mt-1 flex items-center gap-2">
                    <span>Phone: <strong className="text-slate-900 font-mono">{patient.phone || 'N/A'}</strong></span>
                    {patient.age && <span>• {patient.age} yrs</span>}
                    {patient.gender && <span>• {patient.gender}</span>}
                  </div>
                </div>

                {patient.cardPhotoUrl && (
                  <div className="shrink-0">
                    <img
                      src={patient.cardPhotoUrl}
                      alt="Physical Card Scan"
                      className="w-14 h-14 object-cover rounded-xl border-2 border-amber-400 shadow-2xs cursor-pointer hover:scale-105 transition"
                      onClick={() => window.open(patient.cardPhotoUrl, '_blank')}
                      title="Click to view full card scan"
                    />
                  </div>
                )}
              </div>

              {/* Historical Clinical Notes if available */}
              {(patient.legacyNotes || patient.legacyPastHistory || patient.notes) && (
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1">
                  <span className="font-black text-amber-950 text-xs flex items-center gap-1.5">
                    <Archive className="w-3.5 h-3.5 text-amber-700" />
                    Historical Clinical Summary
                  </span>
                  <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed line-clamp-3">
                    {patient.legacyNotes || patient.legacyPastHistory || patient.notes}
                  </p>
                </div>
              )}

              {/* Reconsultation Assignment Form */}
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-black text-slate-800 mb-1 flex items-center gap-1">
                      <Armchair className="w-3.5 h-3.5 text-teal-600" />
                      Select Operatory Chair:
                    </label>
                    <div className="flex gap-2">
                      {[1, 2, 3].map(ch => (
                        <button
                          key={ch}
                          type="button"
                          onClick={() => setChairNumber(ch)}
                          className={`flex-1 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                            chairNumber === ch
                              ? 'bg-teal-700 text-white shadow-xs'
                              : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          Chair {ch}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-black text-slate-800 mb-1">
                      Reason / Chief Complaint:
                    </label>
                    <input
                      type="text"
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      placeholder="e.g. Re-Consultation, pain, checkup"
                      className="w-full text-xs font-bold text-slate-900 bg-white border border-slate-300 rounded-xl p-2.5 focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Action Button */}
                <button
                  type="button"
                  onClick={handleCreateReconsultation}
                  disabled={submitting}
                  className="w-full py-3 px-4 bg-teal-600 hover:bg-teal-700 active:scale-98 text-white font-black text-xs sm:text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Stethoscope className="w-4 h-4 text-white" />
                  <span>
                    {submitting
                      ? 'Checking in...'
                      : `Start Re-Consultation (Chair ${chairNumber})`}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
