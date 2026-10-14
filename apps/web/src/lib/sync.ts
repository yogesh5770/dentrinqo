import { useEffect, useRef } from 'react';

export interface ClinicSyncEvent {
  reason?: string;
  payload?: any;
  clinicId?: string;
  timestamp: number;
}

type SyncListener = (event?: ClinicSyncEvent) => void;
const listeners = new Set<SyncListener>();

export const getCurrentClinicId = (): string | undefined => {
  if (typeof window === 'undefined') return undefined;
  try {
    const cached = sessionStorage.getItem(`clinic_cache_${window.location.host}`);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed?.id) return parsed.id;
    }
  } catch {}
  return undefined;
};

let broadcastChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    broadcastChannel = new BroadcastChannel('dental_clinic_sync');
    broadcastChannel.onmessage = (ev) => {
      const data: ClinicSyncEvent = ev.data || { timestamp: Date.now() };
      const currentClinicId = getCurrentClinicId();
      // Multi-tenant isolation: strictly ignore sync events from a different clinic
      if (data.clinicId && currentClinicId && data.clinicId !== currentClinicId) {
        return;
      }
      listeners.forEach(fn => {
        try {
          fn(data);
        } catch (err) {
          console.error('Error in sync listener', err);
        }
      });
    };
  }
} catch {
  // BroadcastChannel unavailable
}

/**
 * Synthesizes a crisp, pleasant 2-tone melodic notification chime for operatory alerts
 * Works cross-browser via Web Audio API without requiring external MP3/WAV assets.
 */
export const playClinicAlertChime = () => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;

    // Tone 1: High pleasant bell chime (880 Hz - A5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    gain1.gain.setValueAtTime(0.18, now);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.45);

    // Tone 2: Melodic resolving bell (1174.66 Hz - D6) starting at 120ms
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1174.66, now + 0.12);
    gain2.gain.setValueAtTime(0.22, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.65);
  } catch {
    // Audio Context suppressed or unavailable
  }
};

/**
 * Synthesizes an unmistakable 4-tone ascending hospital paging chime for patient mobile beeper
 * Plays two consecutive bursts (C5 -> E5 -> G5 -> C6) and triggers device vibration
 */
export const playPatientTurnBeeper = () => {
  try {
    // 1. Device Vibration (Android / mobile devices supporting Navigator Vibration API)
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([400, 200, 400, 200, 600]);
      } catch {}
    }

    // 2. Synthesized Audio Pager Chime via Web Audio API
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const playBurst = (startTimeOffset: number) => {
      const notes = [
        { freq: 523.25, time: 0.00, dur: 0.22, vol: 0.25 }, // C5
        { freq: 659.25, time: 0.16, dur: 0.22, vol: 0.28 }, // E5
        { freq: 783.99, time: 0.32, dur: 0.25, vol: 0.30 }, // G5
        { freq: 1046.50, time: 0.50, dur: 0.45, vol: 0.35 }, // C6
      ];

      notes.forEach(({ freq, time, dur, vol }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle'; // triangle gives a warm, rich bell-like acoustic
        const noteStart = ctx.currentTime + startTimeOffset + time;
        osc.frequency.setValueAtTime(freq, noteStart);
        gain.gain.setValueAtTime(vol, noteStart);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(noteStart);
        osc.stop(noteStart + dur);
      });
    };

    // Burst 1
    playBurst(0.05);
    // Burst 2 repeated after 0.85s for guaranteed arrival notice
    playBurst(0.90);
  } catch {
    // Audio context suppressed or blocked
  }
};

/**
 * Triggers an instant update across all views and open browser tabs/windows
 */
export const triggerClinicSync = (reason?: string, payload?: any, clinicId?: string) => {
  if (typeof window === 'undefined') return;

  const resolvedClinicId = clinicId || getCurrentClinicId();
  const eventData: ClinicSyncEvent = {
    reason,
    payload,
    clinicId: resolvedClinicId,
    timestamp: Date.now(),
  };

  // 1. Notify listeners in current window
  listeners.forEach(fn => {
    try {
      fn(eventData);
    } catch (err) {
      console.error('Error in sync listener', err);
    }
  });

  // 2. Dispatch custom event for vanilla DOM listeners
  window.dispatchEvent(new CustomEvent('clinic_sync', { detail: eventData }));

  // 3. Broadcast across all open browser tabs
  try {
    broadcastChannel?.postMessage(eventData);
  } catch {
    // Ignore cross-tab broadcast errors
  }
};

interface UseClinicSyncOptions {
  intervalMs?: number; // Background polling interval (default 8000ms = 8s)
  enablePolling?: boolean;
  clinicId?: string;
}

/**
 * Hook to keep any component's data synchronized in real-time without requiring manual page refresh.
 * Automatically refreshes on:
 * - triggerClinicSync() calls anywhere in the app
 * - Cross-tab sync messages
 * - Window focus / tab visibility change
 * - Lightweight silent background polling (every 8 seconds by default)
 */
export const useClinicSync = (
  refreshFn: (event?: ClinicSyncEvent) => void | Promise<any>,
  options: UseClinicSyncOptions = {}
) => {
  const { intervalMs = 8000, enablePolling = true, clinicId: targetClinicId } = options;
  const fnRef = useRef(refreshFn);
  fnRef.current = refreshFn;

  useEffect(() => {
    const handler = (ev?: ClinicSyncEvent) => {
      const activeClinicId = targetClinicId || getCurrentClinicId();
      // If event has clinicId and local window has clinicId, filter out mismatched events
      if (ev?.clinicId && activeClinicId && ev.clinicId !== activeClinicId) {
        return;
      }
      fnRef.current(ev);
    };

    listeners.add(handler);

    // Window focus & tab visibility change
    const onFocus = () => {
      if (document.visibilityState === 'visible') {
        fnRef.current();
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    // Silent background polling
    let timer: any = null;
    if (enablePolling && intervalMs > 0) {
      timer = setInterval(() => {
        if (document.visibilityState === 'visible') {
          fnRef.current();
        }
      }, intervalMs);
    }

    return () => {
      listeners.delete(handler);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      if (timer) clearInterval(timer);
    };
  }, [intervalMs, enablePolling]);
};
