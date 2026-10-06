// lib/useDashboardLive.js
// Small hooks for the dashboard's live stat cards.
import { useEffect, useMemo, useRef, useState } from 'react';

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

// ── System load ──────────────────────────────────────────────────────────────
// "Load" = how much the system is being asked to do RIGHT NOW, worked out from live data
// the dashboard already receives. It is low when few people are using it and nothing is
// happening, and it spikes when many users are active AND work is piling up (SOS alerts,
// verification queue). It is a workload score, not CPU/RAM of the server (a web page can't
// read those). Tune the numbers below to match your real-world scale.
export const LOAD_MODEL = {
  ACTIVE_WINDOW_MS: 15 * 60 * 1000, // "active user" = seen in the last 15 min (phone pings every ~5 min)
  BURST_WINDOW_MS: 10 * 60 * 1000,  // an SOS created in the last 10 min counts extra (it's a spike)
  UNITS: {
    activeUser: 1,
    sosPending: 6,
    sosDispatched: 3,
    sosNewBurst: 4,
    pendingVerification: 0.5,
  },
  PENDING_QUEUE_CAP_UNITS: 10,      // a big backlog can't dominate by itself
  CAPACITY_UNITS: 50,               // workload that counts as 100 %
};

const toMs = (t) =>
  t?.toMillis ? t.toMillis() : t?.toDate ? t.toDate().getTime() : t ? new Date(t).getTime() || 0 : 0;

export function computeSystemLoad(users = [], alerts = [], now = Date.now()) {
  const M = LOAD_MODEL;
  let activeUsers = 0;
  let pendingVerifications = 0;
  for (const u of users) {
    const last = Math.max(toMs(u.last_active_timestamp), toMs(u.lastLoginAt), toMs(u.lastActivityAt));
    if (last && now - last <= M.ACTIVE_WINDOW_MS) activeUsers += 1;
    if ((u.status ?? 'PENDING') === 'PENDING') pendingVerifications += 1;
  }
  let sosPending = 0;
  let sosDispatched = 0;
  let sosNew = 0;
  for (const a of alerts) {
    if (a.status === 'pending') sosPending += 1;
    else if (a.status === 'dispatched') sosDispatched += 1;
    if (a.status !== 'resolved' && toMs(a.createdAt) && now - toMs(a.createdAt) <= M.BURST_WINDOW_MS) sosNew += 1;
  }
  const units =
    activeUsers * M.UNITS.activeUser +
    sosPending * M.UNITS.sosPending +
    sosDispatched * M.UNITS.sosDispatched +
    sosNew * M.UNITS.sosNewBurst +
    Math.min(M.PENDING_QUEUE_CAP_UNITS, pendingVerifications * M.UNITS.pendingVerification);
  const raw = Math.min(100, (units / M.CAPACITY_UNITS) * 100);
  return { raw, parts: { activeUsers, sosPending, sosDispatched, sosNew, pendingVerifications } };
}

export const loadLevel = (load) =>
  load < 30 ? 'low' : load < 60 ? 'moderate' : load < 85 ? 'high' : 'critical';

/**
 * Live system load for the dashboard.
 *   users / alerts : the dashboard's live Firestore data
 *   ready          : false until both have loaded (shows the "booting" state)
 * Returns { status: 'booting'|'low'|'moderate'|'high'|'critical', load (0-100|null), parts }.
 *
 * The shown value rises fast and falls slowly, so a burst of activity registers as a spike
 * and then settles back down instead of flickering. It is recomputed whenever the data
 * changes and every 15 s (so "active in the last 15 min" ages out on its own).
 */
export function useSystemLoad({ users, alerts, ready, minBootMs = 1100 } = {}) {
  const [tick, setTick] = useState(0);
  const [bootDone, setBootDone] = useState(false);
  const [shown, setShown] = useState(null);
  const shownRef = useRef(null);
  const mountedAt = useRef(performance.now());

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!ready) return undefined;
    const wait = Math.max(0, minBootMs - (performance.now() - mountedAt.current));
    const id = setTimeout(() => setBootDone(true), wait);
    return () => clearTimeout(id);
  }, [ready, minBootMs]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { raw, parts } = useMemo(() => computeSystemLoad(users, alerts, Date.now()), [users, alerts, tick]);

  useEffect(() => {
    if (!bootDone) return;
    const prev = shownRef.current;
    const next = prev == null ? raw : raw > prev ? prev + (raw - prev) * 0.6 : prev + (raw - prev) * 0.25;
    const rounded = Math.round(next * 10) / 10;
    shownRef.current = rounded;
    setShown(rounded);
  }, [raw, bootDone, tick]);

  // While falling back down, keep easing toward the target even if no new data arrives.
  useEffect(() => {
    if (!bootDone || shown == null || Math.abs(shown - raw) < 0.5) return undefined;
    const id = setTimeout(() => setTick((n) => n + 1), 1200);
    return () => clearTimeout(id);
  }, [shown, raw, bootDone]);

  if (!bootDone || shown == null) return { status: 'booting', load: null, parts };
  const load = Math.round(shown);
  return { status: loadLevel(load), load, parts };
}
