import React, { useState } from 'react';
import { apiRequest } from '../../lib/api';
import { triggerClinicSync } from '../../lib/sync';
import { X, AlertCircle, AlertTriangle, Check, User, Phone, HeartPulse, ShieldAlert, UserPlus } from 'lucide-react';

interface NewPatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPatientCreated: (newPatient: any) => void;
}

export const NewPatientModal: React.FC<NewPatientModalProps> = ({ isOpen, onClose, onPatientCreated }) => {
  if (!isOpen) return null;

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

  const [duplicateWarning, setDuplicateWarning] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

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

      const payload = {
        fullName: fullName.trim(),
        phone: phone.trim(),
        age: age ? Number(age) : undefined,
        gender,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        bloodGroup,
        allergies: parsedAllergies,
        medicalConditions: parsedConditions,
        currentMedications: parsedMedications,
        notes: notes.trim() || undefined,
      };

      const res = await apiRequest('/patients', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      triggerClinicSync('patient_created');
      onPatientCreated(res);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to register patient');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
        {/* Header */}
        <div className="p-5 bg-white border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 p-1 rounded-2xl bg-white border border-slate-200 shadow-2xs flex items-center justify-center shrink-0">
              <img src="/logo.png" alt="AKS Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h3 className="font-black text-lg text-slate-900">New Patient Registration</h3>
              <p className="text-xs text-slate-600 font-medium">
                AKS Elite Dental Clinic • Patient Intake
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

        {/* Duplicate Warning Alert Banner */}
        {duplicateWarning && (
          <div className="p-4 bg-amber-50 border-b border-amber-300 text-amber-950 flex items-start gap-3 text-xs">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-black">Possible Duplicate Patient Detected</p>
              <p className="mt-0.5 font-medium">
                A patient named <strong>{duplicateWarning.fullName}</strong> is already registered with this phone number (UHID: <strong>{duplicateWarning.uhid}</strong>).
              </p>
              <p className="mt-1 text-amber-800 font-semibold">
                Please verify if this is an existing patient booking a follow-up or a family member with the same phone.
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
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto text-xs">
          {/* Personal Info */}
          <div>
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-teal-600" />
              Personal Details
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
                  placeholder="e.g. Kavitha Murugan"
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
                <label className="block text-xs font-bold text-slate-800 mb-1">Email (Optional)</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="patient@example.com"
                  className="w-full text-xs font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl p-2.5 focus:border-teal-600 focus:bg-white placeholder-slate-400"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-800 mb-1">Address / Locality</label>
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="e.g. K.Pudur, Madurai"
                  className="w-full text-xs font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl p-2.5 focus:border-teal-600 focus:bg-white placeholder-slate-400"
                />
              </div>
            </div>
          </div>

          {/* Medical Alerts & History (Fully Custom Typing & Optional) */}
          <div className="pt-4 border-t border-slate-200 space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-rose-800 uppercase tracking-wider font-black">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                  Known Medical & Drug Allergies
                </span>
                <span className="text-[11px] font-semibold text-slate-500">Optional</span>
              </label>
              <input
                type="text"
                value={allergiesText}
                onChange={e => setAllergiesText(e.target.value)}
                placeholder="Type allergies (e.g. Penicillin, Latex, Sulfa) or leave blank if none"
                className="w-full text-xs font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl p-2.5 focus:border-rose-500 focus:bg-white placeholder-slate-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-amber-800 uppercase tracking-wider font-black">
                  <HeartPulse className="w-3.5 h-3.5 text-amber-600" />
                  Medical Conditions / Systemic Health
                </span>
                <span className="text-[11px] font-semibold text-slate-500">Optional</span>
              </label>
              <input
                type="text"
                value={conditionsText}
                onChange={e => setConditionsText(e.target.value)}
                placeholder="Type medical conditions (e.g. Diabetes, Hypertension, Cardiac, Asthma) or leave blank"
                className="w-full text-xs font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl p-2.5 focus:border-amber-500 focus:bg-white placeholder-slate-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center justify-between">
                <span className="text-slate-800 font-bold">Current Medications</span>
                <span className="text-[11px] font-semibold text-slate-500">Optional</span>
              </label>
              <input
                type="text"
                value={medications}
                onChange={e => setMedications(e.target.value)}
                placeholder="Type current medications (e.g. Metformin 500mg, Telmisartan 40mg) or leave blank"
                className="w-full text-xs font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl p-2.5 focus:border-teal-600 focus:bg-white placeholder-slate-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center justify-between">
                <span className="text-slate-800 font-bold">Clinical Notes</span>
                <span className="text-[11px] font-semibold text-slate-500">Optional</span>
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Type any patient notes, preferences, or observations (Optional)..."
                className="w-full text-xs font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl p-2.5 focus:border-teal-600 focus:bg-white placeholder-slate-400"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 border border-slate-300 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl text-xs font-black text-white bg-teal-600 hover:bg-teal-700 shadow-xs transition-all disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Registering...' : 'Register Patient'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};