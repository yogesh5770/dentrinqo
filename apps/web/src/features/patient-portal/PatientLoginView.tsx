import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { usePatientAuth } from '../../hooks/usePatientAuth';
import { useTenant } from '../../hooks/useTenant';
import { Phone, Lock, AlertCircle, ArrowRight, Shield, UserPlus } from 'lucide-react';

import { ClinicLogo } from '../../components/ClinicLogo';
export const PatientLoginView: React.FC = () => {
  const navigate = useNavigate();
  const { login, account } = usePatientAuth();
  const { clinic } = useTenant();

  const hostClinicName = clinic?.name || 'Dental Clinic';
  const hostClinicCode = clinic?.code || (typeof window !== 'undefined' && window.location.hostname.includes('jacob') ? 'JDC' : 'AKS');

  useEffect(() => {
    if (account) {
      navigate('/my/visits');
    }
  }, [account, navigate]);

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(phone.trim(), password, hostClinicCode);
      navigate('/my/visits');
    } catch (err: any) {
      setError(err.message || 'Invalid mobile number or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50/20 to-blue-50/30 flex flex-col justify-between py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-md w-full mx-auto">
        {/* Clinic Header Branding */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto mb-3 bg-white rounded-2xl p-2.5 shadow-sm border border-slate-200/80 flex items-center justify-center">
            <ClinicLogo className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            {hostClinicName}
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-bold">
            Patient Portal Login • Access your queue tokens & family records
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
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Registered Mobile Number
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
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Password
                </label>
                <span className="text-[11px] text-slate-400">
                  Forgot? Ask reception
                </span>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white font-bold rounded-xl shadow-md shadow-teal-600/20 flex items-center justify-center gap-2 text-sm transition"
            >
              {loading ? (
                <span>Signing in...</span>
              ) : (
                <>
                  <span>Sign In to Portal</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between text-xs gap-3">
            <span className="text-slate-500">First time visiting?</span>
            <Link to="/signup" className="font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1">
              <UserPlus className="w-3.5 h-3.5" />
              <span>Create Patient Account</span>
            </Link>
          </div>
        </div>

        {/* Footer Links */}
        <div className="mt-6 flex items-center justify-between text-xs text-slate-500 px-2">
          <Link to="/book" className="hover:text-teal-700 underline underline-offset-2">
            Book as Guest
          </Link>
          <Link to="/login" className="hover:text-slate-700">
            Clinic Staff Login →
          </Link>
        </div>
      </div>
    </div>
  );
};
