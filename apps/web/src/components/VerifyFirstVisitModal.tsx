import React, { useState } from 'react';
import { apiRequest } from '../lib/api';
import { triggerClinicSync } from '../lib/sync';
import {
  X,
  ShieldCheck,
  Phone,
  Calendar,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  User,
} from 'lucide-react';

interface VerifyFirstVisitModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: {
    patientId: string;
    patientName: string;
    patientPhone: string;
    patientUhid?: string;
  } | null;
  onVerified?: () => void;
}

export const VerifyFirstVisitModal: React.FC<VerifyFirstVisitModalProps> = ({
  isOpen,
  onClose,
  patient,
  onVerified,
}) => {
  if (!isOpen || !patient) return null;

  const [phone, setPhone] = useState(patient.patientPhone || '');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [address, setAddress] = useState('');
  const [allergies, setAllergies] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);

    try {
      const payload: any = {
        phone: phone.trim() || undefined,
        dateOfBirth: dateOfBirth || undefined,
        address: address.trim() || undefined,
        allergies: allergies ? allergies.split(',').map(a => a.trim()).filter(Boolean) : undefined,
      };

      await apiRequest(`/patients/${patient.patientId}/verify-first-visit`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      triggerClinicSync('patient_first_visit_verified', { patientId: patient.patientId });
      if (onVerified) onVerified();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to verify first-visit patient profile.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center font-bold">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-black">
                Verify First-Visit Patient Profile
              </h3>
              <p className="text-xs text-amber-100 font-medium">
                Confirm identity & contact details before operatory consultation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Patient Header Summary */}
          <div className="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-200 text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-black text-slate-900 text-sm">{patient.patientName}</span>
              {patient.patientUhid && (
                <span className="font-mono font-bold text-teal-800">{patient.patientUhid}</span>
              )}
            </div>
            <p className="text-[11px] text-amber-900 font-medium">
              This patient registered online or via self-service kiosk. Please verify details at the desk.
            </p>
          </div>

          <div>
            <label className="block text-xs font-black text-slate-700 mb-1 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-teal-600" />
              Verified Mobile Number
            </label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-teal-600 focus:outline-hidden text-xs font-mono font-bold text-slate-900 bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-black text-slate-700 mb-1 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-teal-600" />
              Date of Birth (Optional)
            </label>
            <input
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-teal-600 focus:outline-hidden text-xs font-bold text-slate-900 bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-black text-slate-700 mb-1 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-teal-600" />
              Residential Address (Optional)
            </label>
            <textarea
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 42 Main Cross, Alagar Complex, K.Pudur"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 focus:border-teal-600 focus:outline-hidden text-xs font-medium text-slate-900 bg-white resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-black text-slate-700 mb-1">
              Known Medical Allergies (Optional)
            </label>
            <input
              type="text"
              value={allergies}
              onChange={(e) => setAllergies(e.target.value)}
              placeholder="e.g. Penicillin, Local Anesthetic, Dust"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-teal-600 focus:outline-hidden text-xs font-bold text-slate-900 bg-white"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black transition cursor-pointer shadow-md flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{submitting ? 'Verifying...' : '✓ Confirm & Clear Verification'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
