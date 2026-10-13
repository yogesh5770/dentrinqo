import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { usePatientAuth } from '../../hooks/usePatientAuth';
import { useTenant } from '../../hooks/useTenant';
import { Shield, Lock, Phone, User, Calendar, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react';

export const PatientSignupView: React.FC = () => {
  const navigate = useNavigate();
  const { signup, account } = usePatientAuth();
  const { clinic } = useTenant();

  const hostClinicName = clinic?.name || 'Dental Clinic';
  const hostClinicCode = clinic?.code || (typeof window !== 'undefined' && window.location.hostname.includes('jacob') ? 'JDC' : 'AKS');
  const hostClinicCity = clinic?.city || (typeof window !== 'undefined' && window.location.hostname.includes('jacob') ? 'Chennai' : 'Madurai');

  useEffect(() => {
    if (account) {
      navigate('/my/visits');
    }
  }, [account, navigate]);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState('MALE');
  const [hasExactDob, setHasExactDob] = useState(true);
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [age, setAge] = useState<number | ''>('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [consentDataUse, setConsentDataUse] = useState(false);
  const [consentWhatsapp, setConsentWhatsapp] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (!consentDataUse) {
      setError('You must agree to the healthcare data processing policy to create an account.');
      return;
    }

    setLoading(true);
    try {
      await signup({
        fullName: fullName.trim(),
        phone: phone.trim(),
        gender,
        dateOfBirth: hasExactDob && dateOfBirth ? dateOfBirth : undefined,
        age: !hasExactDob && age !== '' ? Number(age) : undefined,
        password,
        confirmPassword,
        consentDataUse,
        consentWhatsapp,
        clinicCode: hostClinicCode,
      });
      navigate('/my/visits');
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please check your details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50/20 to-blue-50/30 flex flex-col justify-between py-8 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-md w-full mx-auto">
        {/* Clinic Header Branding */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto mb-3 bg-white rounded-2xl p-2.5 shadow-sm border border-slate-200/80 flex items-center justify-center">
            <img src="/logo.png" alt={`${hostClinicName} Logo`} className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Create Patient Account
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {hostClinicName} • {hostClinicCity}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200/80 p-6 sm:p-8">
          {error && (
            <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-700 text-xs font-medium">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Full Name *
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                />
              </div>
            </div>

            {/* Mobile Number */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Mobile Number *
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="tel"
                  required
                  placeholder="10-digit mobile number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">All family visits can be booked under this primary number.</p>
            </div>

            {/* Gender */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Gender *
              </label>
              <div className="grid grid-cols-3 gap-2">
                {['MALE', 'FEMALE', 'OTHER'].map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGender(g)}
                    className={`py-2 text-xs font-bold rounded-xl border transition ${
                      gender === g
                        ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {/* DOB vs Age */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  {hasExactDob ? 'Date of Birth' : 'Approximate Age'}
                </label>
                <button
                  type="button"
                  onClick={() => setHasExactDob(!hasExactDob)}
                  className="text-[11px] font-semibold text-teal-600 hover:text-teal-700"
                >
                  {hasExactDob ? "Don't know exact DOB? Enter age" : "Know exact birth date?"}
                </button>
              </div>

              {hasExactDob ? (
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                  />
                </div>
              ) : (
                <input
                  type="number"
                  min="1"
                  max="120"
                  placeholder="e.g. 35 years"
                  value={age}
                  onChange={(e) => setAge(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                />
              )}
            </div>

            {/* Passwords */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Password *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="password"
                    required
                    placeholder="Min 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Confirm *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="password"
                    required
                    placeholder="Re-type password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                  />
                </div>
              </div>
            </div>

            {/* DPDP and WhatsApp Consents */}
            <div className="pt-2 space-y-2.5 border-t border-slate-100">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  required
                  checked={consentDataUse}
                  onChange={(e) => setConsentDataUse(e.target.checked)}
                  className="mt-1 w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500"
                />
                <span className="text-xs text-slate-600 leading-relaxed">
                  I consent to {hostClinicName} securely maintaining my medical and dental records for diagnosis, scheduling, and treatment planning in compliance with the Digital Personal Data Protection (DPDP) Act. *
                </span>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentWhatsapp}
                  onChange={(e) => setConsentWhatsapp(e.target.checked)}
                  className="mt-1 w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500"
                />
                <span className="text-xs text-slate-600 leading-relaxed">
                  Send live token queue updates, appointment confirmation passes, and treatment reminders directly to my WhatsApp.
                </span>
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-4 py-3 px-4 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white font-bold rounded-xl shadow-md shadow-teal-600/20 flex items-center justify-center gap-2 text-sm transition"
            >
              {loading ? (
                <span>Creating Account...</span>
              ) : (
                <>
                  <span>Create Account & Continue</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Links */}
          <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between text-xs gap-3">
            <span className="text-slate-500">Already registered?</span>
            <Link to="/patient-login" className="font-bold text-teal-600 hover:text-teal-700">
              Log in to Patient Portal →
            </Link>
          </div>
        </div>

        {/* Quick guest booking option */}
        <div className="text-center mt-6">
          <Link
            to="/book"
            className="text-xs font-semibold text-slate-600 hover:text-teal-700 inline-flex items-center gap-1.5 bg-white/70 backdrop-blur-sm px-4 py-2 rounded-full border border-slate-200/80 shadow-sm"
          >
            <span>Need a quick booking without account? Book as Guest</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
};
