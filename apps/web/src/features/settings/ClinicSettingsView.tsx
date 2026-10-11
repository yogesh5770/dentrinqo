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
  Sparkles,
} from 'lucide-react';
import { TreatmentCatalogManager } from '../admin/TreatmentCatalogManager';
import { useAuth } from '../../hooks/useAuth';

export const ClinicSettingsView: React.FC = () => {
  const { user, refreshProfile } = useAuth();
  const isAdmin = user?.role === 'CLINIC_ADMIN';
  const [activeTab, setActiveTab] = useState<'profile' | 'chairs' | 'services'>('profile');

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
  const [chairCount, setChairCount] = useState(3);
  const [workingHours, setWorkingHours] = useState('Mon - Sat: 9:00 AM – 8:30 PM | Sun: 10:00 AM – 2:00 PM');

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
        setChairCount(data.chairCount || 3);

        if (data.workingHours) {
          if (typeof data.workingHours === 'string') {
            setWorkingHours(data.workingHours);
          } else if (typeof data.workingHours === 'object') {
            const wh = data.workingHours;
            setWorkingHours(`${wh.weekdays || 'Mon-Sat: 9:00 AM - 8:30 PM'} | Sun: ${wh.sunday || '10:00 AM - 2:00 PM'}`);
          }
        }
      }
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
      const res = await apiRequest<any>('/clinic/settings', {
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
          chairCount: Number(chairCount) || 3,
          workingHours: workingHours.trim(),
        }),
      });

      setSavedMessage(true);
      triggerClinicSync('clinic_settings_updated');
      setTimeout(() => setSavedMessage(false), 4000);
    } catch (err: any) {
      console.error('Failed to update clinic settings', err);
      setErrorMessage(err?.message || 'Failed to save clinic settings');
    } finally {
      setSaving(false);
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
            Manage hospital hours, operatory chairs, contact information and treatment fee catalogue.
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
          onClick={() => setActiveTab('chairs')}
          className={`px-4 py-2 rounded-xl transition-all cursor-pointer ${
            activeTab === 'chairs'
              ? 'bg-teal-600 text-white shadow-xs font-extrabold'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Operatory Chairs Setup ({chairCount})
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
                    placeholder="AKS Elite Dental Clinic"
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
                    placeholder="akselitedental.madurai@gmail.com"
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

      {/* Tab 2: Chairs */}
      {activeTab === 'chairs' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
          {/* Header & Controls */}
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

                <button
                  type="button"
                  onClick={() => handleChairCountChange(chairCount + 1)}
                  disabled={chairCount >= 20 || chairUpdating}
                  className="px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs rounded-xl flex items-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Operatory Chair</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600">
                <Lock className="w-3.5 h-3.5 text-amber-600" />
                <span>{chairCount} Configured Units (Admin Managed)</span>
              </div>
            )}
          </div>

          {/* Role notification for non-admins */}
          {!isAdmin && (
            <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center gap-2.5">
              <Lock className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Admin Restricted:</strong> Only the Clinic Administrator can change chair capacity. Current active capacity is <strong>{chairCount} Operatory Units</strong>.
              </span>
            </div>
          )}

          {/* Quick presets for Admin */}
          {isAdmin && (
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              <span className="text-slate-500 font-bold mr-1 text-[11px] uppercase tracking-wider">Quick Capacity:</span>
              {[1, 2, 3, 4, 5, 6, 8, 10].map(count => (
                <button
                  key={count}
                  type="button"
                  onClick={() => handleChairCountChange(count)}
                  disabled={chairUpdating}
                  className={`px-3 py-1 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                    chairCount === count
                      ? 'bg-teal-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  {count} {count === 1 ? 'Chair' : 'Chairs'}
                </button>
              ))}
            </div>
          )}

          {/* Success / Feedback toast */}
          {chairSuccessMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 flex items-center gap-2 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{chairSuccessMsg}</span>
            </div>
          )}

          {/* Dynamic Operatory Units Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
            {Array.from({ length: chairCount }, (_, i) => i + 1).map(num => (
              <div
                key={num}
                className="p-4 rounded-xl border border-slate-200 bg-white hover:border-teal-300 transition-all shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 text-slate-900 font-black text-sm">
                      <div className="w-7 h-7 rounded-lg bg-teal-600 text-white flex items-center justify-center font-black text-xs shadow-2xs">
                        C{num}
                      </div>
                      <span>Operatory Chair {num}</span>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      Active
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 font-medium">
                    Fully equipped clinical operatory unit for patient consultations, scheduled treatments & chairside care.
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
                  <span className="font-bold text-slate-500">Suite #{num} • Ground Floor</span>
                  {isAdmin && chairCount > 1 && num === chairCount && (
                    <button
                      type="button"
                      onClick={() => handleChairCountChange(chairCount - 1)}
                      disabled={chairUpdating}
                      className="text-rose-600 hover:text-rose-700 font-extrabold hover:underline cursor-pointer flex items-center gap-1"
                      title="Remove this last chair"
                    >
                      <Minus className="w-3 h-3" />
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Services & Pricing */}
      {activeTab === 'services' && (
        <TreatmentCatalogManager />
      )}
    </div>
  );
};
