import { useEffect, useRef } from 'react';

export interface ClinicSyncEvent {
  reason?: string;
  payload?: any;
  timestamp: number;
}

type SyncListener = (event?: ClinicSyncEvent) => void;
const listeners = new Set<SyncListener>();

let broadcastChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    broadcastChannel = new BroadcastChannel('dental_clinic_sync');
    broadcastChannel.onmessage = (ev) => {
      const data: ClinicSyncEvent = ev.data || { timestamp: Date.now() };
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
 * Triggers an instant update across all views and open browser tabs/windows
 */
export const triggerClinicSync = (reason?: string, payload?: any) => {
  if (typeof window === 'undefined') return;

  const eventData: ClinicSyncEvent = {
    reason,
    payload,
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
  const { intervalMs = 8000, enablePolling = true } = options;
  const fnRef = useRef(refreshFn);
  fnRef.current = refreshFn;

  useEffect(() => {
    const handler = (ev?: ClinicSyncEvent) => {
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
