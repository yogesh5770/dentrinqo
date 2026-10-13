import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiRequest } from '../../lib/api';
import { useTenant } from '../../hooks/useTenant';
import {
  Armchair,
  Bell,
  BellRing,
  CheckCircle2,
  Clock,
  Sparkles,
  RefreshCw,
  AlertCircle,
  Volume2,
  VolumeX,
  MapPin,
  Phone,
  Shield,
  ArrowRight,
} from 'lucide-react';

interface TrackingData {
  success: boolean;
  tokenNumber: number;
  status: string;
  chairNumber: number;
  expectedChairNumber: number;
  patientsAhead: number;
  isImmediateSeat: boolean;
  chairBanner: string;
  isConfirmedAtDesk: boolean;
  clinicName: string;
  clinicAddress?: string;
  clinicPhone?: string;
}

export const PublicTrackView: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const { clinic } = useTenant();
  const [data, setData] = useState<TrackingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [soundEnabled, setSoundEnabled] = useState(true);
  const prevStatusRef = useRef<string | null>(null);

  // Play gentle web audio chime
  const playChime = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const now = ctx.currentTime;
      // Dual gentle chime: 587.33 Hz (D5) -> 880 Hz (A5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);
      gain1.gain.setValueAtTime(0.2, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.8);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.15);
      gain2.gain.setValueAtTime(0.25, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 1.2);
    } catch {}
  };

  const fetchStatus = async (silent = false) => {
    if (!code) return;
    if (!silent) setLoading(true);
    try {
      const res = await apiRequest<TrackingData>(`/appointments/track/${code}`);
      if (res && res.success) {
        // If status changed to CALLED, ring chime
        if (soundEnabled && prevStatusRef.current && prevStatusRef.current !== 'CALLED' && res.status === 'CALLED') {
          playChime();
        }
        prevStatusRef.current = res.status;
        setData(res);
        setError(null);
        setLastRefreshed(new Date());
      } else {
        throw new Error('No active visit found for this tracking code.');
      }
    } catch (err: any) {
      setError(err.message || 'Unable to load live queue tracking details.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const timer = setInterval(() => {
      fetchStatus(true);
    }, 10000); // Polling every 10 seconds per security and performance specification
    return () => clearInterval(timer);
  }, [code, soundEnabled]);

  const isCalled = data?.status === 'CALLED';
  const isInChair = data?.status === 'IN_CHAIR';
  const isTreated = data?.status === 'TREATED';
  const isBilled = data?.status === 'BILLED';
  const isPaid = data?.status === 'PAID' || data?.status === 'COMPLETED';
  const isPostTreatment = isTreated || isBilled || isPaid;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-teal-950 text-white font-sans flex flex-col justify-between p-4 sm:p-6 antialiased selection:bg-teal-500 selection:text-slate-950">
      {/* Top Header */}
      <header className="max-w-md w-full mx-auto flex items-center justify-between pb-4 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-[11px] font-black uppercase tracking-wider text-teal-300">
              Live Queue Tracker
            </span>
          </div>
          <h1 className="text-base sm:text-lg font-black tracking-tight text-white mt-0.5">
            {data?.clinicName || clinic?.name || 'Dental Clinic'}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setSoundEnabled(!soundEnabled);
              if (!soundEnabled) playChime();
            }}
            className={`p-2 rounded-xl border transition cursor-pointer ${
              soundEnabled
                ? 'bg-teal-500/20 text-teal-300 border-teal-500/40'
                : 'bg-white/5 text-slate-400 border-white/10'
            }`}
            title={soundEnabled ? 'Chime Enabled' : 'Chime Muted'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          <button
            onClick={() => fetchStatus(true)}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white transition cursor-pointer"
            title="Refresh now"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* Main Status Container */}
      <main className="max-w-md w-full mx-auto my-auto py-6 space-y-5">
        {loading && !data ? (
          <div className="text-center py-16 space-y-4">
            <div className="w-12 h-12 border-4 border-teal-400 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-400 font-bold tracking-wider uppercase">
              Locating your consultation token...
            </p>
          </div>
        ) : error ? (
          <div className="p-6 rounded-3xl bg-rose-950/40 border border-rose-500/40 text-center space-y-3">
            <AlertCircle className="w-10 h-10 text-rose-400 mx-auto" />
            <h2 className="text-base font-black text-white">Tracking Link Expired or Not Found</h2>
            <p className="text-xs text-rose-200">{error}</p>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition mt-2"
            >
              <span>Back to Clinic Home</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        ) : data ? (
          <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
            {/* Status Announcement Hero */}
            {isCalled ? (
              <div className="p-5 rounded-3xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-xl shadow-amber-500/20 text-center space-y-2 animate-bounce">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-950 text-white text-[10px] font-black uppercase tracking-wider">
                  <BellRing className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                  <span>Your Token is Called!</span>
                </div>
                <h2 className="text-2xl font-black">Please Enter Operatory Room</h2>
                <p className="text-xs font-bold text-slate-900">
                  Doctor is ready at <strong>Chair #{data.chairNumber}</strong>
                </p>
              </div>
            ) : isInChair ? (
              <div className="p-4 rounded-3xl bg-gradient-to-r from-emerald-600 to-teal-700 text-white shadow-xl text-center space-y-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-white text-[10px] font-black uppercase tracking-wider">
                  <Armchair className="w-3.5 h-3.5 text-emerald-300" />
                  <span>In Treatment</span>
                </div>
                <h2 className="text-xl font-black">Currently in Dental Chair #{data.chairNumber}</h2>
                <p className="text-xs text-emerald-100 font-medium">Consultation & procedure in progress</p>
              </div>
            ) : isTreated ? (
              <div className="p-5 rounded-3xl bg-indigo-950/80 border border-indigo-500/40 text-white text-center space-y-2 shadow-xl">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-black uppercase tracking-wider">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Clinical Procedure Complete</span>
                </div>
                <h2 className="text-xl font-black">Treatment Finished</h2>
                <p className="text-xs text-indigo-200 font-medium">
                  Please proceed to the reception desk for prescription handover and invoice preparation.
                </p>
              </div>
            ) : isBilled ? (
              <div className="p-5 rounded-3xl bg-amber-950/80 border border-amber-500/40 text-white text-center space-y-2 shadow-xl">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-black uppercase tracking-wider">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Billing Ready</span>
                </div>
                <h2 className="text-xl font-black">Invoice Prepared</h2>
                <p className="text-xs text-amber-200 font-medium">
                  Your visit summary and invoice are ready. Please settle at the front counter.
                </p>
              </div>
            ) : isPaid ? (
              <div className="p-5 rounded-3xl bg-slate-800 text-white text-center space-y-2 border border-white/10">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                <h2 className="text-xl font-black">Visit Completed & Settled</h2>
                <p className="text-xs text-slate-400 font-medium">
                  Thank you for visiting {data.clinicName}. Your payment has been recorded.
                </p>
              </div>
            ) : null}

            {/* Giant Token Card */}
            <div className="p-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md text-center space-y-3 relative overflow-hidden shadow-2xl">
              <div className="text-[11px] font-black uppercase tracking-widest text-teal-400">
                Your Queue Token
              </div>
              <div className="text-6xl sm:text-7xl font-black font-mono tracking-tight text-white">
                #{data.tokenNumber}
              </div>

              {/* Patients Ahead Counter */}
              {!isInChair && !isPostTreatment && (
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-teal-500/10 border border-teal-500/30 text-teal-200 text-xs font-black">
                  <Clock className="w-4 h-4 text-teal-400" />
                  <span>
                    {data.patientsAhead === 0
                      ? 'You are next in line!'
                      : `${data.patientsAhead} patient${data.patientsAhead > 1 ? 's' : ''} ahead in waiting lounge`}
                  </span>
                </div>
              )}

              {/* Operatory Chair Status */}
              <div className="pt-3 border-t border-white/10">
                <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Armchair className="w-4 h-4 text-teal-400" />
                    <span>Assigned Operatory:</span>
                  </span>
                  <span className="text-white font-black text-sm">
                    {data.isImmediateSeat || isCalled || isInChair
                      ? `Chair #${data.chairNumber} (Immediate)`
                      : `Chair #${data.expectedChairNumber || data.chairNumber} (Expected)`}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-medium text-left mt-1">
                  {data.chairBanner}
                </p>
              </div>
            </div>

            {/* Privacy & Clinic Guidance */}
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2 text-xs text-slate-400">
              <div className="flex items-center gap-2 text-white font-black">
                <Shield className="w-3.5 h-3.5 text-teal-400" />
                <span>Private & Zero-PII Tracking</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                This screen displays only queue position and room dispatch. Patient names and contact details remain strictly confidential.
              </p>
              <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px]">
                <span>Last updated: {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                <span className="text-teal-400 font-bold">Auto-syncs every 10s</span>
              </div>
            </div>
          </div>
        ) : null}
      </main>

      {/* Footer */}
      <footer className="max-w-md w-full mx-auto pt-4 border-t border-white/10 text-center text-xs text-slate-500">
        <p>© {new Date().getFullYear()} {data?.clinicName || 'Dental Practice Management'}. All rights reserved.</p>
      </footer>
    </div>
  );
};
