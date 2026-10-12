import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Armchair,
  Bell,
  Clock,
  KeyRound,
  Wifi,
  WifiOff,
  Sparkles,
  User,
  ShieldCheck,
  Settings,
  X,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { playPatientTurnBeeper, playClinicAlertChime } from '../../lib/sync';
import { useTenant } from '../../hooks/useTenant';

export const WaitingRoomTvView: React.FC = () => {
  const { clinic: tenantClinic } = useTenant();
  const [searchParams] = useSearchParams();

  // Clinic Info
  const clinicName = tenantClinic?.name || "AK's Elite Dental Clinic and Hospital";
  const clinicCode = tenantClinic?.code || 'AKS';
  const chairCount = tenantClinic?.chairCount || 3;

  // Display Token Management
  const queryToken = searchParams.get('token') || searchParams.get('displayToken') || '';
  const [displayToken, setDisplayToken] = useState<string>(
    queryToken || localStorage.getItem('aks_tv_display_token') || ''
  );
  const [showSetupModal, setShowSetupModal] = useState<boolean>(!displayToken);
  const [tempTokenInput, setTempTokenInput] = useState<string>('');

  // Clock
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // Lobby Code & Expiry
  const [lobbyCode, setLobbyCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState<number>(0);
  const [isConnectionLost, setIsConnectionLost] = useState<boolean>(false);
  const [consecutiveFailures, setConsecutiveFailures] = useState<number>(0);

  // Chairs & Queue Status
  const [chairs, setChairs] = useState<any[]>([]);
  const [calledPatients, setCalledPatients] = useState<any[]>([]);
  const [audioUnlocked, setAudioUnlocked] = useState<boolean>(false);
  const prevCalledIdsRef = useRef<Set<string>>(new Set());

  // Save display token to localStorage if provided in URL
  useEffect(() => {
    if (queryToken) {
      localStorage.setItem('aks_tv_display_token', queryToken);
      setDisplayToken(queryToken);
      setShowSetupModal(false);
    }
  }, [queryToken]);

  // Clock ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch Lobby Code (Uses display token header or session)
  const fetchLobbyCode = async () => {
    try {
      const headers: Record<string, string> = {};
      if (displayToken) {
        headers['x-display-token'] = displayToken;
      }

      const res = await apiRequest<{
        code: string;
        expiresAt: string;
        windowSeconds: number;
        clinicCode: string;
      }>('/appointments/lobby-code', {
        headers,
      });

      if (res && res.code) {
        setLobbyCode(res.code);
        setExpiresAt(new Date(res.expiresAt));
        setIsConnectionLost(false);
        setConsecutiveFailures(0);
      } else {
        throw new Error('Invalid response');
      }
    } catch (err) {
      setConsecutiveFailures((prev) => {
        const next = prev + 1;
        // If 2 consecutive fetches fail, mark connection as lost and hide code
        if (next >= 2) {
          setIsConnectionLost(true);
          setLobbyCode(null);
        }
        return next;
      });
    }
  };

  // Fetch Public Chairs & Waiting Queue
  const fetchChairsAndQueue = async () => {
    try {
      const res = await apiRequest<{
        chairs: any[];
        called?: any[];
      }>(`/appointments/public-chair-status?clinicCode=${clinicCode}`);

      if (res && res.chairs) {
        setChairs(res.chairs);

        // Detect new CALLED patients to chime
        const activeCalled = res.chairs.filter((c: any) => c.status === 'CALLED' || c.isCalling);
        setCalledPatients(activeCalled);

        const currentCalledIds = new Set<string>(
          activeCalled.map((c: any) => `${c.chairNumber}_${c.tokenNumber}`)
        );

        let hasNewCall = false;
        currentCalledIds.forEach((id) => {
          if (!prevCalledIdsRef.current.has(id)) {
            hasNewCall = true;
          }
        });

        if (hasNewCall && audioUnlocked) {
          playPatientTurnBeeper();
        }
        prevCalledIdsRef.current = currentCalledIds;
      }
    } catch (err) {
      // Chair status fetch failure
    }
  };

  // Periodic Polling
  useEffect(() => {
    fetchLobbyCode();
    fetchChairsAndQueue();

    // Poll lobby code every 15s to keep in sync with window expiration
    const lobbyInterval = setInterval(fetchLobbyCode, 15000);
    // Poll queue status every 6s for live dispatch
    const queueInterval = setInterval(fetchChairsAndQueue, 6000);

    return () => {
      clearInterval(lobbyInterval);
      clearInterval(queueInterval);
    };
  }, [displayToken, clinicCode, audioUnlocked]);

  // Expiry countdown calculation
  useEffect(() => {
    if (!expiresAt) return;
    const diff = Math.max(0, Math.floor((expiresAt.getTime() - currentTime.getTime()) / 1000));
    setTimeRemainingSeconds(diff);

    // If local time exceeds expiration + grace without update, hide code
    if (diff <= 0 && consecutiveFailures > 0) {
      setIsConnectionLost(true);
      setLobbyCode(null);
    }
  }, [currentTime, expiresAt, consecutiveFailures]);

  const handleSaveToken = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = tempTokenInput.trim();
    if (clean) {
      localStorage.setItem('aks_tv_display_token', clean);
      setDisplayToken(clean);
      setShowSetupModal(false);
      fetchLobbyCode();
    }
  };

  const unlockAudio = () => {
    playClinicAlertChime();
    setAudioUnlocked(true);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between font-sans selection:bg-teal-500 selection:text-slate-950 p-6 sm:p-10 select-none overflow-hidden">
      {/* Top Header Bar */}
      <header className="flex items-center justify-between border-b border-slate-800 pb-6">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 p-2 bg-white rounded-2xl shadow-xl flex items-center justify-center shrink-0">
            <img src="/logo.png" alt={clinicName} className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight uppercase">
              {clinicName}
            </h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs font-black uppercase tracking-widest text-teal-400 bg-teal-950/80 px-3 py-1 rounded-full border border-teal-800/60 inline-flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-teal-300" />
                <span>Waiting Lounge Live Board</span>
              </span>
              <button
                type="button"
                onClick={() => setShowSetupModal(true)}
                className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 cursor-pointer transition"
                title="Configure TV Display Token"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Display Setup</span>
              </button>
            </div>
          </div>
        </div>

        {/* Live Clock & Connectivity Indicator */}
        <div className="flex items-center gap-6">
          {!audioUnlocked && (
            <button
              type="button"
              onClick={unlockAudio}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center gap-2 cursor-pointer shadow-lg animate-pulse"
            >
              <Bell className="w-4 h-4" />
              <span>🔊 Enable TV Sound Alerts</span>
            </button>
          )}

          <div className="text-right">
            <div className="text-3xl sm:text-4xl font-mono font-black tracking-tight text-white">
              {currentTime.toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </div>
            <div className="text-xs font-bold text-slate-400 flex items-center justify-end gap-1.5 mt-0.5">
              {isConnectionLost ? (
                <span className="text-rose-400 flex items-center gap-1">
                  <WifiOff className="w-3.5 h-3.5" />
                  <span>Connection Lost</span>
                </span>
              ) : (
                <span className="text-emerald-400 flex items-center gap-1">
                  <Wifi className="w-3.5 h-3.5" />
                  <span>Connected & Live</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 my-8 space-y-8 flex flex-col justify-center">
        {/* HERO MOMENT: Large Rotating Arrival Code Banner */}
        <div className="relative">
          {isConnectionLost ? (
            /* Connection Lost State -> Code is Strictly Hidden */
            <div className="bg-rose-950/80 border-4 border-rose-600 rounded-3xl p-8 sm:p-10 text-center shadow-2xl space-y-3 animate-pulse">
              <div className="w-16 h-16 rounded-full bg-rose-600 text-white flex items-center justify-center mx-auto mb-2">
                <WifiOff className="w-8 h-8" />
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-rose-200 tracking-tight">
                ⚠️ CONNECTION LOST — RECONNECTING TO CLINIC SERVER...
              </h2>
              <p className="text-base text-rose-300 font-semibold max-w-xl mx-auto">
                Check-in code temporarily hidden while connection is being re-established. Please check with the front desk receptionist for self check-in assistance.
              </p>
            </div>
          ) : (
            /* Connected State -> High Contrast Lobby Code Display */
            <div className="bg-gradient-to-r from-teal-950 via-slate-900 to-teal-950 border-4 border-teal-500/80 rounded-3xl p-8 sm:p-10 shadow-2xl flex flex-col lg:flex-row items-center justify-between gap-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="space-y-2 text-center lg:text-left">
                <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-400/40 text-xs font-black uppercase tracking-widest">
                  <KeyRound className="w-4 h-4 text-teal-300" />
                  <span>Permanent Standee QR Check-In</span>
                </span>
                <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
                  Arrived at Hospital? Scan Standee & Enter Code:
                </h2>
                <p className="text-sm text-slate-300 font-medium">
                  Scan the permanent laminated QR at reception with your phone camera, then enter this 4-digit code.
                </p>
              </div>

              {/* Massive 4-Digit Code Box */}
              <div className="text-center bg-black/60 border-2 border-teal-400/80 rounded-3xl px-8 sm:px-12 py-5 shadow-2xl shrink-0">
                <span className="text-[11px] font-black uppercase tracking-widest text-teal-300 block mb-1">
                  CURRENT ROTATING ARRIVAL CODE
                </span>
                <div className="text-6xl sm:text-7xl font-mono font-black text-amber-300 tracking-widest drop-shadow-md">
                  {lobbyCode || '----'}
                </div>
                <div className="flex items-center justify-center gap-2 mt-2 text-xs font-mono font-bold text-slate-400">
                  <Clock className="w-3.5 h-3.5 text-teal-400" />
                  <span>
                    {expiresAt
                      ? `Expires at ${expiresAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} (${Math.floor(timeRemainingSeconds / 60)}:${(timeRemainingSeconds % 60).toString().padStart(2, '0')})`
                      : 'Refreshing...'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Operatory Chairs Activity Board */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <Armchair className="w-6 h-6 text-teal-400" />
              <span>Operatory Rooms & Chair Activity</span>
            </h3>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              Live Dental Suite Status
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: chairCount }, (_, i) => i + 1).map((chairNum) => {
              const serving = chairs.find((c: any) => c.chairNumber === chairNum);
              const isCalling = serving?.isCalling || serving?.status === 'CALLED';
              const isInChair = serving && !isCalling && serving.status === 'IN_CHAIR';

              return (
                <div
                  key={chairNum}
                  className={`rounded-3xl p-6 border-3 transition-all duration-300 shadow-xl flex flex-col justify-between min-h-[220px] ${
                    isCalling
                      ? 'bg-gradient-to-b from-amber-950 via-slate-900 to-slate-950 border-amber-400 ring-4 ring-amber-400/40 animate-pulse'
                      : isInChair
                      ? 'bg-gradient-to-b from-teal-950/80 via-slate-900 to-slate-950 border-teal-500/70'
                      : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <span className="text-lg font-black text-white flex items-center gap-2">
                      <span>OPERATORY CHAIR #{chairNum}</span>
                    </span>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                        isCalling
                          ? 'bg-amber-400 text-slate-950 shadow-md'
                          : isInChair
                          ? 'bg-teal-500 text-slate-950'
                          : 'bg-emerald-950 text-emerald-400 border border-emerald-700/60'
                      }`}
                    >
                      {isCalling ? '📢 CALLING NOW' : isInChair ? '🩺 IN TREATMENT' : '🟢 READY'}
                    </span>
                  </div>

                  {/* Body Info */}
                  <div className="my-auto py-3">
                    {isCalling ? (
                      <div className="space-y-2 text-center">
                        <span className="text-xs font-black uppercase tracking-widest text-amber-300 block">
                          PLEASE PROCEED TO ROOM:
                        </span>
                        <div className="text-4xl sm:text-5xl font-mono font-black text-amber-300">
                          TOKEN #{serving.tokenNumber}
                        </div>
                        <div className="text-sm font-bold text-white flex items-center justify-center gap-1.5">
                          <User className="w-4 h-4 text-amber-400" />
                          <span>{serving.patientName || 'Patient'}</span>
                        </div>
                      </div>
                    ) : isInChair ? (
                      <div className="space-y-1 text-center">
                        <span className="text-xs font-bold text-slate-400 block uppercase">
                          CURRENT PROCEDURE:
                        </span>
                        <div className="text-3xl font-mono font-bold text-teal-300">
                          TOKEN #{serving.tokenNumber}
                        </div>
                        <div className="text-xs font-medium text-slate-300">
                          {serving.dentistName || 'Attending Dentist'}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center space-y-1 text-slate-500">
                        <ShieldCheck className="w-8 h-8 mx-auto text-emerald-500/60 mb-1" />
                        <span className="text-sm font-bold text-emerald-400/90 block">
                          Sanitized & Ready for Next Arrival
                        </span>
                        <span className="text-xs text-slate-500">
                          Awaiting queue dispatch
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="text-[11px] font-mono text-slate-500 border-t border-white/5 pt-2 flex items-center justify-between">
                    <span>Suite Room #{chairNum}</span>
                    <span>{serving?.durationMinutes ? `${serving.durationMinutes}m Slot` : 'Standard'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* Footer Navigation Bar */}
      <footer className="border-t border-slate-800 pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 font-medium">
        <div>
          <span>{clinicName}</span> • <span>Self Check-In Powered by AKS Elite Cloud</span>
        </div>
        <div className="flex items-center gap-4">
          <span>Need assistance? Step forward to the reception counter</span>
        </div>
      </footer>

      {/* Setup Display Token Modal */}
      {showSetupModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl text-left">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-teal-400" />
                <h3 className="font-black text-white text-base">Waiting Room TV Setup</h3>
              </div>
              {displayToken && (
                <button
                  type="button"
                  onClick={() => setShowSetupModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            <p className="text-xs text-slate-300 leading-relaxed font-medium">
              To display the rotating check-in code without staff login, enter the <strong>32-byte Display Token</strong> generated in Clinic Settings by the Clinic Administrator.
            </p>

            <form onSubmit={handleSaveToken} className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase text-slate-400 mb-1">
                  Display Token (Secret Key)
                </label>
                <input
                  type="text"
                  value={tempTokenInput}
                  onChange={(e) => setTempTokenInput(e.target.value)}
                  placeholder="Paste 32-byte display token..."
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white focus:border-teal-500 outline-none"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                {displayToken && (
                  <button
                    type="button"
                    onClick={() => {
                      localStorage.removeItem('aks_tv_display_token');
                      setDisplayToken('');
                      setTempTokenInput('');
                    }}
                    className="px-3 py-2 rounded-xl text-xs font-bold text-rose-400 hover:bg-rose-950/40 cursor-pointer"
                  >
                    Clear Token
                  </button>
                )}
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-black cursor-pointer shadow-md"
                >
                  Save & Connect TV
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
