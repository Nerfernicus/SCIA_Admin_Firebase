// lib/useDashboardLive.js
// Small hooks for the dashboard's live stat cards.
import { useEffect, useRef, useState } from 'react';
import { doc, getDocFromServer } from 'firebase/firestore';
import { auth, db } from './firebase';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Animates a number from its previous value to `target` (starts at 0).
 * Used for the stat cards so counts "tick up" on load and whenever they change live.
 */
export function useCountUp(target, { duration = 700, enabled = true } = {}) {
  const [value, setValue] = useState(0);
  const currentRef = useRef(0);

  useEffect(() => {
    if (!enabled || typeof target !== 'number' || Number.isNaN(target)) return undefined;
    if (prefersReducedMotion() || currentRef.current === target) {
      currentRef.current = target;
      setValue(target);
      return undefined;
    }
    const from = currentRef.current;
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out
      const v = Math.round(from + (target - from) * eased);
      currentRef.current = v;
      setValue(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, enabled]);

  return value;
}

/**
 * Live "system load" for the dashboard, measured, not a placeholder.
 *
 * Every `intervalMs` it times a real round trip to Firestore (a tiny server read) and turns
 * the latency into a load percentage: 0 ms -> 0 %, 2000 ms or slower -> 100 %, smoothed so the
 * number moves instead of jumping. It is a measure of how responsive the backend is right now
 * from this admin's connection, not CPU usage of the server (a browser can't see that).
 *
 * status: 'booting' (first reading pending) | 'online' | 'slow' | 'offline'
 * Pauses while the tab is hidden so it doesn't spend reads in the background.
 */
export function useSystemLoad({ intervalMs = 10000, timeoutMs = 8000, minBootMs = 1100 } = {}) {
  const [state, setState] = useState({ status: 'booting', load: null, latency: null });
  const emaRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let timer;
    let inFlight = false;
    const mountedAt = performance.now();
    let first = true;

    const schedule = () => {
      if (!cancelled) timer = setTimeout(measure, intervalMs);
    };

    async function measure() {
      if (cancelled) return;
      if (document.hidden || inFlight) { schedule(); return; }
      inFlight = true;
      const t0 = performance.now();
      let ok = false;
      try {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('offline');
        const uid = auth.currentUser?.uid || '_probe';
        await Promise.race([
          getDocFromServer(doc(db, 'admins', uid)),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
        ]);
        ok = true;
      } catch (err) {
        // The server answered, we just aren't allowed to read that doc: still a valid round trip.
        if (err?.code === 'permission-denied') ok = true;
      }
      const ms = Math.round(performance.now() - t0);

      // Let the "booting" animation play for a moment on first load.
      if (first) {
        const wait = minBootMs - (performance.now() - mountedAt);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        first = false;
      }
      inFlight = false;
      if (cancelled) return;

      if (ok) {
        const raw = Math.min(100, (ms / 2000) * 100);
        emaRef.current = emaRef.current == null ? raw : emaRef.current * 0.6 + raw * 0.4;
        setState({ status: ms < 800 ? 'online' : 'slow', load: Math.round(emaRef.current), latency: ms });
      } else {
        emaRef.current = null;
        setState({ status: 'offline', load: null, latency: null });
      }
      schedule();
    }

    const onVisible = () => {
      if (!document.hidden && !inFlight) { clearTimeout(timer); measure(); }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    measure();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [intervalMs, timeoutMs, minBootMs]);

  return state;
}
