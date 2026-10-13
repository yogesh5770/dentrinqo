import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useTenant } from '../../hooks/useTenant';
import { useNavigate } from 'react-router-dom';
import {
  Stethoscope,
  Lock,
  User,
  AlertCircle,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  X,
  Phone,
  Mail,
  Building2,
  Calendar,
  Sparkles,
} from 'lucide-react';

import { ClinicLogo } from '../../components/ClinicLogo';
export const LoginScreen: React.FC = () => {
  const { login } = useAuth();
  const { clinic } = useTenant();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await login(identifier, password);
      
      // Role-based redirect
      if (user.role === 'CLINIC_ADMIN' || user.role === 'DENTIST') {
        navigate('/doctor');
      } else if (user.role === 'RECEPTIONIST') {
        navigate('/');
      } else {
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message || 'Invalid email, username, or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 text-slate-900">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Brand Header */}
        <div className="flex justify-center mb-4">
          <div className="w-24 h-24 p-2 bg-white rounded-3xl border border-slate-200 shadow-md flex items-center justify-center">
            <ClinicLogo className="w-full h-full object-contain" />
          </div>
        </div>

        <h1 className="text-center text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
          {clinic?.name || 'Dental Clinic Management'}
        </h1>
        <p className="mt-1 text-center text-xs text-teal-800 font-extrabold tracking-wide uppercase">
          Clinic Management System
        </p>
        <p className="text-center text-xs text-slate-500 mt-1 font-semibold">
          {clinic ? `${clinic.city || ''}${clinic.state ? `, ${clinic.state}` : ''}${clinic.tagline ? ` • ${clinic.tagline}` : ''}` : 'Specialist Dental Hospital & Implant Centre'}
        </p>
      </div>

      <div className="mt-7 sm:mx-auto sm:w-full sm:max-w-md">
        {/* Patient Direct Booking Banner */}
        <div className="mb-4 bg-gradient-to-r from-teal-600 via-teal-700 to-emerald-600 text-white p-3.5 rounded-2xl shadow-md flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-300 animate-pulse shrink-0" />
            <div>
              <span className="text-xs font-black block leading-snug">Are you a patient?</span>
              <span className="text-[10px] text-teal-100 block">Book priority chairside slot online in 20s</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/book')}
            className="px-3.5 py-2 rounded-xl bg-white text-teal-900 hover:bg-teal-50 font-black text-xs transition cursor-pointer shadow-xs flex items-center gap-1 shrink-0"
          >
            <span>Book Now</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="bg-white py-8 px-6 sm:px-10 shadow-lg rounded-3xl border border-slate-200">
          <div className="mb-6 pb-4 border-b border-slate-100">
            <h2 className="text-lg font-black text-slate-900">Sign In</h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Enter your credentials to access your account
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Sign-In Failed</p>
                <p className="mt-0.5 text-rose-800">{error}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username or Email Input */}
            <div>
              <label className="block text-xs font-black text-slate-800 uppercase tracking-wider mb-1.5">
                Email or Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  placeholder={clinic?.email ? `name@${clinic.email.split('@')[1] || 'clinic.com'}` : 'name@clinic.com'}
                  className="block w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 placeholder-slate-400 focus:outline-none focus:border-teal-600 focus:bg-white transition-all"
                />
              </div>
            </div>

            {/* Password Input with Show/Hide Toggle */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-black text-slate-800 uppercase tracking-wider">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  className="text-xs text-teal-700 hover:text-teal-900 font-bold transition-colors cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="block w-full pl-10 pr-11 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 placeholder-slate-400 focus:outline-none focus:border-teal-600 focus:bg-white transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Login Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 flex justify-center items-center gap-2 py-3 px-4 rounded-xl shadow-xs text-xs font-black text-white bg-teal-600 hover:bg-teal-700 focus:outline-none transition-all disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  Signing In...
                </span>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Patient Booking Section */}
          <div className="mt-6 pt-5 border-t border-slate-100">
            <div className="relative mb-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-[10px] uppercase font-black tracking-wider">
                <span className="bg-white px-2.5 text-slate-400">PATIENT PORTAL</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-gradient-to-br from-teal-50/70 via-emerald-50/40 to-slate-50 border border-teal-200 text-center space-y-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-teal-600 text-white text-[10px] font-black uppercase tracking-wider">
                <Sparkles className="w-3 h-3" />
                <span>ONLINE PATIENT SELF-SCHEDULING</span>
              </div>
              <h3 className="text-sm font-black text-slate-900">
                Looking to Book an Appointment?
              </h3>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Choose your treatment, select preferred time, and skip waiting room queues. Zero passwords needed.
              </p>
              <button
                type="button"
                onClick={() => navigate('/book')}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-xs shadow-md shadow-teal-600/20 flex items-center justify-center gap-2 transition cursor-pointer active:scale-98"
              >
                <Calendar className="w-4 h-4" />
                <span>⚡ Book Yours Now (No Login Needed)</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => navigate('/book')}
                className="text-[11px] font-bold text-teal-800 hover:underline pt-1 inline-block cursor-pointer"
              >
                Already booked? Track your live token status →
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-xs text-slate-500 space-y-1">
          <p className="flex items-center justify-center gap-1.5 font-medium">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            <span>{clinic ? `${clinic.name} • ${clinic.city || ''} ${clinic.postalCode || ''}` : 'Dental Clinic Management System'}</span>
          </p>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 text-slate-900 shadow-2xl relative">
            <button
              onClick={() => setShowForgotPassword(false)}
              className="absolute top-5 right-5 p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer font-bold"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-teal-100 text-teal-800 flex items-center justify-center mb-4">
              <Lock className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-black text-slate-900">Password Assistance</h3>
            <p className="text-xs text-slate-600 mt-1 font-medium leading-relaxed">
              To protect patient information, staff passwords are reset by the clinic administrator.
            </p>

            <div className="mt-4 p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
              <p className="font-bold text-slate-800">Please contact your Clinic Administrator:</p>
              {clinic?.name && (
                <div className="flex items-center gap-2 text-teal-800 font-bold">
                  <Building2 className="w-4 h-4" />
                  <span>{clinic.name}</span>
                </div>
              )}
              {clinic?.phone && (
                <div className="flex items-center gap-2 text-slate-700 font-bold">
                  <Phone className="w-4 h-4 text-slate-500" />
                  <span>{clinic.phone}</span>
                </div>
              )}
              <p className="text-slate-500 text-[11px] pt-1">
                For security reasons, password resets must be initiated by an authorized administrator at the reception desk.
              </p>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowForgotPassword(false)}
                className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-xs cursor-pointer shadow-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};