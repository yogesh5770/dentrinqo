import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api';
import { triggerClinicSync } from '../../lib/sync';
import {
  Building2,
  Armchair,
  Clock,
  Phone,
  Mail,
  MapPin,
  CheckCircle2,
  Save,
  Tag,
  RefreshCw,
  AlertCircle,
  FileText,
  Plus,
  Minus,
  Lock,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Tv,
  KeyRound,
  Trash2,
  Copy,
  Check,
  ExternalLink,
} from 'lucide-react';
import { TreatmentCatalogManager } from '../admin/TreatmentCatalogManager';
import { useAuth } from '../../hooks/useAuth';

export const ClinicSettingsView: React.FC = () => {
  const { user, refreshProfile } = useAuth();
  const isAdmin = user?.role === 'CLINIC_ADMIN';
  const [activeTab, setActiveTab] = useState<'profile' | 'chairs' | 'arrival_displays' | 'services'>('profile');

  // Form states
  const [clinicName, setClinicName] = useState('');
  const [tagline, setTagline] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('Tamil Nadu');
  const [postalCode, setPostalCode] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gstin, setGstin] = useState('');
  const [upiVpa, setUpiVpa] = useState('');
  const [chairCount, setChairCount] = useState(3);
  const [workingHours, setWorkingHours] = useState('Mon - Sat: 9:00 AM – 8:30 PM | Sun: 10:00 AM – 2:00 PM');

  // Multi-Tenant Arrival & Security Gates
  const [requireLobbyCode, setRequireLobbyCode] = useState(true);
  const [requireDeskConfirmation, setRequireDeskConfirmation] = useState(true);
  const [lobbyCodeDigits, setLobbyCodeDigits] = useState(4);
  const [lobbyCodeWindowSeconds, setLobbyCodeWindowSeconds] = useState(300);
  const [isDoctorVerified, setIsDoctorVerified] = useState(false);
  const [isBillingVerified, setIsBillingVerified] = useState(false);

  // Display Tokens
  const [displayTokens, setDisplayTokens] = useState<any[]>([]);
  const [newDisplayTokenName, setNewDisplayTokenName] = useState('');
  const [creatingToken, setCreatingToken] = useState(false);
  const [createdTokenInfo, setCreatedTokenInfo] = useState<{ name: string; token: string } | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [chairUpdating, setChairUpdating] = useState(false);
  const [chairSuccessMsg, setChairSuccessMsg] = useState<string | null>(null);

  const handleChairCountChange = async (newCount: number) => {
    if (!isAdmin) return;
    const clamped = Math.max(1, Math.min(20, newCount));
    setChairCount(clamped);
    setChairUpdating(true);
    setChairSuccessMsg(null);
    setErrorMessage(null);
    try {
      await apiRequest('/clinic/settings', {
        method: 'PUT',
        body: JSON.stringify({ chairCount: clamped }),
      });
      setChairSuccessMsg(`Operatory setup updated: Clinic configured with ${clamped} active ${clamped === 1 ? 'chair' : 'chairs'}.`);
      if (refreshProfile) {
        await refreshProfile();
      }
      setTimeout(() => setChairSuccessMsg(null), 4000);
    } catch (err: any) {
      console.error('Failed to update chair capacity', err);
      setErrorMessage(err?.message || 'Failed to update operatory chair capacity');
    } finally {
      setChairUpdating(false);
    }
  };

  const fetchDisplayTokens = async () => {
    if (!isAdmin) return;
    try {
      const tokens = await apiRequest<any[]>('/appointments/display-tokens');
      setDisplayTokens(tokens || []);
    } catch (err) {
      // ignore
    }
  };

  const fetchSettings = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await apiRequest<any>('/clinic/settings');
      if (data) {
        setClinicName(data.name || '');
        setTagline(data.tagline || '');
        setAddress(data.address || '');
        setCity(data.city || 'Madurai');
        setStateName(data.state || 'Tamil Nadu');
        setPostalCode(data.postalCode || '625007');
        setPhone(data.phone || '');
        setEmail(data.email || '');
        setGstin(data.gstin || '');
        setUpiVpa(data.upiVpa || '');
        setChairCount(data.chairCount || 3);
        setRequireLobbyCode(data.requireLobbyCode ?? true);
        setRequireDeskConfirmation(data.requireDeskConfirmation ?? true);
        setLobbyCodeDigits(data.lobbyCodeDigits ?? 4);
        setLobbyCodeWindowSeconds(data.lobbyCodeWindowSeconds ?? 300);
        setIsDoctorVerified(data.isDoctorVerified ?? false);
        setIsBillingVerified(data.isBillingVerified ?? false);

        if (data.workingHours) {
          if (typeof data.workingHours === 'string') {
            setWorkingHours(data.workingHours);
          } else if (typeof data.workingHours === 'object') {
            const wh = data.workingHours;
            setWorkingHours(`${wh.weekdays || 'Mon-Sat: 9:00 AM - 8:30 PM'} | Sun: ${wh.sunday || '10:00 AM - 2:00 PM'}`);
          }
        }
      }

      await fetchDisplayTokens();
    } catch (err: any) {
      console.error('Failed to load clinic settings', err);
      setErrorMessage(err?.message || 'Unable to load clinic settings from server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMessage(null);
    setSavedMessage(false);

    try {
      await apiRequest<any>('/clinic/settings', {
        method: 'PUT',
        body: JSON.stringify({
          name: clinicName.trim(),
          tagline: tagline.trim(),
          address: address.trim(),
          city: city.trim(),
          state: stateName.trim(),
          postalCode: postalCode.trim(),
          phone: phone.trim(),
          email: email.trim(),
          gstin: gstin.trim() || undefined,
          upiVpa: upiVpa.trim() || undefined,
          chairCount: Number(chairCount) || 3,
          workingHours: workingHours.trim(),
          requireLobbyCode,
          requireDeskConfirmation,
          lobbyCodeDigits: Number(lobbyCodeDigits),
          lobbyCodeWindowSeconds: Number(lobbyCodeWindowSeconds),
          isDoctorVerified,
          isBillingVerified,
        }),
      });

      setSavedMessage(true);
      triggerClinicSync('clinic_settings_updated');
      if (refreshProfile) {
        await refreshProfile();
      }
      setTimeout(() => setSavedMessage(false), 4000);
    } catch (err: any) {
      console.error('Failed to update clinic settings', err);
      setErrorMessage(err?.message || 'Failed to save clinic settings');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateDisplayToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDisplayTokenName.trim()) return;

    setCreatingToken(true);
    try {
      const res = await apiRequest<{ id: string; name: string; token: string }>('/appointments/display-tokens', {
        method: 'POST',
        body: JSON.stringify({ name: newDisplayTokenName.trim() }),
      });

      if (res && res.token) {
        setCreatedTokenInfo({ name: res.name, token: res.token });
        setNewDisplayTokenName('');
        await fetchDisplayTokens();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to create display token');
    } finally {
      setCreatingToken(false);
    }
  };

  const handleRevokeDisplayToken = async (id: string, name: string) => {
    if (!window.confirm(`Revoke display token for "${name}"?\n\nThe connected TV will lose its authorization to display the lobby code immediately.`)) {
      return;
    }

    try {
      await apiRequest(`/appointments/display-tokens/${id}`, {
        method: 'DELETE',
      });
      await fetchDisplayTokens();
    } catch (err: any) {
      alert(err.message || 'Failed to revoke token');
    }
  };

  const handleCopyCreatedToken = () => {
    if (createdTokenInfo && navigator.clipboard) {
      navigator.clipboard.writeText(createdTokenInfo.token);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="clinic-card bg-white border border-slate-200 p-5 rounded-2xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <Building2 className="w-6 h-6 text-teal-600" />
            Clinic Settings & Configuration
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
            Manage hospital hours, operatory chairs, arrival security, and legal verifications.
          </p>
        </div>

        <button
          onClick={fetchSettings}
          title="Reload Settings"
          className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer self-start sm:self-center transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-teal-600' : ''}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs font-bold overflow-x-auto no-scrollbar touch-scroll whitespace-nowrap">
        <button
          onClick={() => setActiveTab('profile')}
          className={`px-4 py-2 rounded-xl transition-all cursor-pointer ${
            activeTab === 'profile'
              ? 'bg-teal-600 text-white shadow-xs font-extrabold'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Clinic Details & Hours
        </button>
        <button
          onClick={() => setActiveTab('arrival_displays')}
          className={`px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'arrival_displays'
              ? 'bg-teal-600 text-white shadow-xs font-extrabold'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <KeyRound className="w-3.5 h-3.5" />
          <span>Arrival Security & TV Displays</span>
        </button>
        <button
          onClick={() => setActiveTab('chairs')}
          className={`px-4 py-2 rounded-xl transition-all cursor-pointer ${
            activeTab === 'chairs'
              ? 'bg-teal-600 text-white shadow-xs font-extrabold'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Operatory Chairs ({chairCount})
        </button>
        <button
          onClick={() => setActiveTab('services')}
          className={`px-4 py-2 rounded-xl transition-all cursor-pointer ${
            activeTab === 'services'
              ? 'bg-teal-600 text-white shadow-xs font-extrabold'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Services & Pricing Catalogue
        </button>
      </div>

      {/* Tab 1: Profile */}
      {activeTab === 'profile' && (
        <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
          {savedMessage && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 text-xs font-extrabold flex items-center gap-2 animate-fadeIn">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>Clinic settings saved and updated permanently on the server!</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-xl text-rose-900 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center text-slate-500 font-bold text-xs flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-teal-600" />
              <span>Loading clinic configuration from database...</span>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-bold">
                <div>
                  <label className="block text-slate-700 mb-1">
                    Clinic Official Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={clinicName}
                    onChange={e => setClinicName(e.target.value)}
                    placeholder="e.g. My Dental Clinic"
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:border-teal-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-1">Hospital Tagline / Specialty</label>
                  <input
                    type="text"
                    value={tagline}
                    onChange={e => setTagline(e.target.value)}
                    placeholder="Precision Dentistry & Gentle Healthcare"
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:border-teal-600 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-slate-700 mb-1">Street Address</label>
                  <input
                    type="text"
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    placeholder="Plot No. 162/2A, Alagar Complex, 5th Meenakshi Amman Nagar Main Road"
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:border-teal-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-1">City / Town</label>
                  <input
                    type="text"
                    value={city}
                    onChange={e => setCity(e.target.value)}
                    placeholder="K.Pudur, Madurai"
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:border-teal-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-1">State & Postal PIN</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={stateName}
                      onChange={e => setStateName(e.target.value)}
                      placeholder="Tamil Nadu"
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:border-teal-600 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={postalCode}
                      onChange={e => setPostalCode(e.target.value)}
                      placeholder="625007"
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 mb-1">
                    Official Reception Phone <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+91 95387 23872"
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:border-teal-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-1">Clinic Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="contact@clinic.com"
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:border-teal-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-1">GSTIN / Tax ID (Optional)</label>
                  <input
                    type="text"
                    value={gstin}
                    onChange={e => setGstin(e.target.value)}
                    placeholder="33AABCA1234F1Z5"
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:border-teal-600 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-1">Clinic Operating Hours</label>
                  <input
                    type="text"
                    value={workingHours}
                    onChange={e => setWorkingHours(e.target.value)}
                    placeholder="Mon - Sat: 9:00 AM – 8:30 PM | Sun: 10:00 AM – 2:00 PM"
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:border-teal-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">
                  Changes apply immediately to Invoices, Receipts, and Patient Communication.
                </span>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs rounded-xl flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50 transition-all"
                >
                  <Save className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
                  <span>{saving ? 'Saving...' : 'Save Clinic Settings'}</span>
                </button>
              </div>
            </div>
          )}
        </form>
      )}

      {/* Tab 2: Arrival Security & TV Displays */}
      {activeTab === 'arrival_displays' && (
        <div className="space-y-6">
          <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
            <div>
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-teal-600" />
                <h3 className="text-base font-black text-slate-900">Hospital Check-In & Queue Security</h3>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Configure rotating codes, desk arrival confirmation requirements, and anti-spoofing limits.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {/* Require Lobby Code */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="font-black text-slate-900">Require Rotating Lobby Code</span>
                  <input
                    type="checkbox"
                    checked={requireLobbyCode}
                    onChange={(e) => setRequireLobbyCode(e.target.checked)}
                    className="w-4 h-4 rounded text-teal-600"
                  />
                </label>
                <p className="text-[11px] text-slate-600 leading-relaxed font-medium">
                  When enabled, patients scanning the standee QR must type the on-screen code displayed on the lobby TV to prove physical arrival.
                </p>
              </div>

              {/* Require Desk Confirmation */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="font-black text-slate-900">Require Desk Presence Confirmation</span>
                  <input
                    type="checkbox"
                    checked={requireDeskConfirmation}
                    onChange={(e) => setRequireDeskConfirmation(e.target.checked)}
                    className="w-4 h-4 rounded text-teal-600"
                  />
                </label>
                <p className="text-[11px] text-slate-600 leading-relaxed font-medium">
                  When enabled, the receptionist (or dentist in solo mode) must confirm the patient at the desk before they can be called into a chair.
                </p>
              </div>

              {/* Lobby Code Digits */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <label className="block font-black text-slate-900 mb-1">Rotating Code Length</label>
                <select
                  value={lobbyCodeDigits}
                  onChange={(e) => setLobbyCodeDigits(Number(e.target.value))}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none"
                >
                  <option value={4}>4 Digits (Standard, recommended for fast typing)</option>
                  <option value={6}>6 Digits (Higher entropy)</option>
                </select>
                <p className="text-[11px] text-slate-500 font-medium">
                  Generated cryptographically from the per-clinic HMAC 32-byte secret.
                </p>
              </div>

              {/* Lobby Code Window Seconds */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <label className="block font-black text-slate-900 mb-1">Rotation Window Interval</label>
                <select
                  value={lobbyCodeWindowSeconds}
                  onChange={(e) => setLobbyCodeWindowSeconds(Number(e.target.value))}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none"
                >
                  <option value={300}>5 Minutes (300 Seconds - Recommended)</option>
                  <option value={600}>10 Minutes (600 Seconds)</option>
                  <option value={900}>15 Minutes (900 Seconds)</option>
                </select>
                <p className="text-[11px] text-slate-500 font-medium">
                  Accepts both current and previous time window to prevent race conditions during refresh.
                </p>
              </div>
            </div>

            {/* Legal & Administrative Verifications */}
            <div className="pt-4 border-t border-slate-100 space-y-4">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-teal-600" />
                  <h3 className="text-base font-black text-slate-900">Clinical & Billing Verification Gates</h3>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Official prescription printing, invoice PDF generation, and live UPI collections require verified credentials.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                {/* Doctor Verification */}
                <div className={`p-4 rounded-2xl border space-y-2 ${isDoctorVerified ? 'bg-emerald-50/50 border-emerald-300' : 'bg-rose-50/50 border-rose-300'}`}>
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="font-black text-slate-900">Doctor Registration Verified</span>
                    <input
                      type="checkbox"
                      checked={isDoctorVerified}
                      onChange={(e) => setIsDoctorVerified(e.target.checked)}
                      className="w-4 h-4 rounded text-teal-600"
                    />
                  </label>
                  <p className="text-[11px] text-slate-700 leading-relaxed font-medium">
                    Confirms doctor's name, qualifications, and State Dental Council registration number. Required before prescription printing/sharing is enabled.
                  </p>
                </div>

                {/* Billing Verification */}
                <div className={`p-4 rounded-2xl border space-y-2 ${isBillingVerified ? 'bg-emerald-50/50 border-emerald-300' : 'bg-rose-50/50 border-rose-300'}`}>
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="font-black text-slate-900">Clinic Billing & UPI Verified</span>
                    <input
                      type="checkbox"
                      checked={isBillingVerified}
                      onChange={(e) => setIsBillingVerified(e.target.checked)}
                      className="w-4 h-4 rounded text-teal-600"
                    />
                  </label>
                  <p className="text-[11px] text-slate-700 leading-relaxed font-medium">
                    Confirms official clinic GSTIN, tax invoices, and UPI VPA collections. Required before invoice PDF printing and UPI QR generation are unlocked.
                  </p>
                </div>

                {/* UPI VPA Input */}
                <div className="sm:col-span-2">
                  <label className="block font-black text-slate-900 mb-1">
                    Official Clinic UPI VPA (e.g. clinic@icici or 9538723872@okaxis)
                  </label>
                  <input
                    type="text"
                    value={upiVpa}
                    onChange={(e) => setUpiVpa(e.target.value.trim())}
                    placeholder="e.g. myclinic@icici"
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono text-xs focus:bg-white focus:border-teal-600 outline-none"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Payments collected from the live dynamic QR are credited directly to this merchant UPI address.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs rounded-xl flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50 transition-all"
              >
                <Save className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
                <span>{saving ? 'Saving...' : 'Save Security & Verification Settings'}</span>
              </button>
            </div>
          </form>

          {/* Waiting Room TV Display Tokens Section */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Tv className="w-5 h-5 text-teal-600" />
                  <h3 className="text-base font-black text-slate-900">Waiting Room TV Display Tokens</h3>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Authorize lobby TVs to display the rotating code without staff logins. Tokens are 32 random bytes stored hashed.
                </p>
              </div>

              <a
                href="/tv"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 self-start sm:self-auto border border-slate-300 transition"
              >
                <ExternalLink className="w-3.5 h-3.5 text-teal-600" />
                <span>Open /tv Screen</span>
              </a>
            </div>

            {/* Created Token Announcement Callout */}
            {createdTokenInfo && (
              <div className="p-4 bg-emerald-50 border-2 border-emerald-400 rounded-2xl space-y-2 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-emerald-950 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Display Token Created: {createdTokenInfo.name}</span>
                  </span>
                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-200/60 px-2 py-0.5 rounded">
                    Shown Only Once
                  </span>
                </div>
                <p className="text-xs text-emerald-900 font-medium">
                  Copy this 32-byte token and paste it into the TV setup at <strong>/tv</strong>:
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={createdTokenInfo.token}
                    className="flex-1 p-2 bg-white border border-emerald-300 rounded-xl font-mono text-xs text-slate-900 select-all"
                  />
                  <button
                    type="button"
                    onClick={handleCopyCreatedToken}
                    className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                  >
                    {copiedToken ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedToken ? 'Copied' : 'Copy Token'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Create New Display Token Form */}
            <form onSubmit={handleCreateDisplayToken} className="flex flex-col sm:flex-row items-center gap-2">
              <input
                type="text"
                value={newDisplayTokenName}
                onChange={(e) => setNewDisplayTokenName(e.target.value)}
                placeholder="Display Name (e.g. Main Lobby 55-inch TV)"
                className="w-full sm:flex-1 p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:border-teal-600 outline-none"
                required
              />
              <button
                type="submit"
                disabled={creatingToken || !newDisplayTokenName.trim()}
                className="w-full sm:w-auto px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 transition shadow-xs shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>+ Authorize New TV</span>
              </button>
            </form>

            {/* Table of Active Display Tokens */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Display Name</th>
                    <th className="py-2.5 px-3">Token Preview</th>
                    <th className="py-2.5 px-3">Created</th>
                    <th className="py-2.5 px-3">Last Active</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayTokens.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-500 font-medium">
                        No display tokens authorized yet. Add a display above to run the /tv lobby board.
                      </td>
                    </tr>
                  ) : (
                    displayTokens.map((tok) => (
                      <tr key={tok.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-black text-slate-900">{tok.name}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-500">{tok.tokenPreview}••••••</td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {new Date(tok.createdAt).toLocaleDateString('en-IN')}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {tok.lastUsedAt ? new Date(tok.lastUsedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Not yet'}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleRevokeDisplayToken(tok.id, tok.name)}
                            className="px-2.5 py-1 text-rose-600 hover:text-white hover:bg-rose-600 rounded-lg font-black transition cursor-pointer"
                            title="Revoke TV display authorization"
                          >
                            Revoke
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Chairs */}
      {activeTab === 'chairs' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-slate-900">Operatory Chairs & Clinical Units</h2>
                <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
                  {isAdmin ? 'Admin Controlled' : 'Read Only'}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Configure dental chair capacity for appointments, doctor allocation, and chairside procedure logging.
              </p>
            </div>

            {isAdmin ? (
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl p-1 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => handleChairCountChange(chairCount - 1)}
                    disabled={chairCount <= 1 || chairUpdating}
                    className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-black text-sm shadow-2xs transition-all cursor-pointer"
                    title="Decrease Chair"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>

                  <div className="px-3 text-center min-w-[100px]">
                    <span className="block text-xs font-black text-slate-900 leading-tight">
                      {chairCount} {chairCount === 1 ? 'Chair' : 'Chairs'}
                    </span>
                    <span className="text-[10px] text-teal-600 font-bold">Active Units</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleChairCountChange(chairCount + 1)}
                    disabled={chairCount >= 20 || chairUpdating}
                    className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-black text-sm shadow-2xs transition-all cursor-pointer"
                    title="Increase Chair"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {Array.from({ length: chairCount }, (_, i) => i + 1).map((num) => (
              <div
                key={num}
                className="p-5 rounded-2xl border border-slate-200 bg-white hover:border-teal-400 hover:shadow-xs transition-all flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-black text-slate-900 text-sm">
                      <div className="w-7 h-7 rounded-lg bg-teal-600 text-white flex items-center justify-center font-black text-xs shadow-2xs">
                        C{num}
                      </div>
                      <span>Operatory Chair {num}</span>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Active
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 font-medium">
                    Fully equipped clinical operatory unit for patient consultations, scheduled treatments & chairside care.
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: Services & Pricing */}
      {activeTab === 'services' && (
        <TreatmentCatalogManager />
      )}
    </div>
  );
};
