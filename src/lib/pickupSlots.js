// src/lib/pickupSlots.js
//
// City Hall pickup scheduling for physical Senior Citizen IDs (admin side).
// Mirrors functions/pickup.js (server) and the mobile app's lib/pickup.ts, so
// the dashboard, the app and the Cloud Function all agree on what a "slot" is.
//
// Data:
//   osca_office/settings   office hours + live status, edited on the Schedule tab
//   pickup_slots/{date}    { counts: { "08:00": 2 } }  written only by bookIdPickup
//   id_requests/{id}.pickup { date: "YYYY-MM-DD", time: "HH:MM", bookedBy }
//
// All dates/times are Philippine time, stored as plain strings.

import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';

export const OFFICE_STATUS = { OPEN: 'open', BREAK: 'break', CLOSED: 'closed' };

export const DEFAULT_OFFICE = {
  status: 'open',
  statusNote: '',
  location: 'OSCA Office, Valenzuela City Hall',
  phone: '',
  schedule: { days: [1, 2, 3, 4, 5], start: '08:00', end: '12:00', slotMinutes: 30, capacityPerSlot: 3 },
  closedDates: [],
  advanceDays: 30,
};

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = n => String(n).padStart(2, '0');
export const toMinutes = hhmm => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
export const toHHMM = mins => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

/** "now" as a Date whose UTC getters read as Philippine time. */
const phNow = () => new Date(Date.now() + 8 * 60 * 60 * 1000);
export const phToday = () => {
  const n = phNow();
  return `${n.getUTCFullYear()}-${pad(n.getUTCMonth() + 1)}-${pad(n.getUTCDate())}`;
};
const phMinutesNow = () => {
  const n = phNow();
  return n.getUTCHours() * 60 + n.getUTCMinutes();
};
export const weekdayOf = dateStr => new Date(`${dateStr}T00:00:00Z`).getUTCDay();
export const addDays = (dateStr, n) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

/** Settings with defaults filled in, so a half-filled doc never breaks the UI. */
export function mergeOffice(raw) {
  const r = raw || {};
  const s = r.schedule || {};
  return {
    ...DEFAULT_OFFICE,
    ...r,
    schedule: {
      days: Array.isArray(s.days) && s.days.length ? s.days.map(Number) : DEFAULT_OFFICE.schedule.days,
      start: s.start || DEFAULT_OFFICE.schedule.start,
      end: s.end || DEFAULT_OFFICE.schedule.end,
      slotMinutes: Number(s.slotMinutes) > 0 ? Number(s.slotMinutes) : DEFAULT_OFFICE.schedule.slotMinutes,
      capacityPerSlot: Number(s.capacityPerSlot) > 0 ? Number(s.capacityPerSlot) : DEFAULT_OFFICE.schedule.capacityPerSlot,
    },
    closedDates: Array.isArray(r.closedDates) ? r.closedDates : [],
    advanceDays: Number(r.advanceDays) > 0 ? Number(r.advanceDays) : DEFAULT_OFFICE.advanceDays,
  };
}

/** Every start time offered on a normal day: ['08:00', '08:30', ... '11:30']. */
export function slotTimes(schedule) {
  const start = toMinutes(schedule.start);
  const end = toMinutes(schedule.end);
  if (start == null || end == null || end <= start) return [];
  const out = [];
  for (let t = start; t + schedule.slotMinutes <= end; t += schedule.slotMinutes) out.push(toHHMM(t));
  return out;
}

/** The next bookable dates (skips closed weekdays, closed dates and the past). */
export function bookableDates(office, maxCount = 14) {
  const today = phToday();
  const times = slotTimes(office.schedule);
  const out = [];
  for (let i = 0; i <= office.advanceDays && out.length < maxCount; i += 1) {
    const d = addDays(today, i);
    if (!office.schedule.days.includes(weekdayOf(d))) continue;
    if (office.closedDates.includes(d)) continue;
    // Today only counts while there is still a slot left today.
    if (d === today && !times.some(t => toMinutes(t) > phMinutesNow())) continue;
    out.push(d);
  }
  return out;
}

/** Is this time still in the future (only matters for today)? */
export const isSlotInFuture = (dateStr, time) =>
  dateStr > phToday() || (dateStr === phToday() && toMinutes(time) > phMinutesNow());

// ── wording ───────────────────────────────────────────────────────────────
export function formatTime12(hhmm) {
  const mins = toMinutes(hhmm);
  if (mins == null) return hhmm || '';
  const h24 = Math.floor(mins / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${pad(mins % 60)} ${h24 >= 12 ? 'PM' : 'AM'}`;
}
export function formatDateLong(dateStr) {
  if (!dateStr) return '';
  const [y, mo, d] = dateStr.split('-').map(Number);
  return `${WEEKDAYS[weekdayOf(dateStr)]}, ${MONTHS[mo - 1]} ${d}, ${y}`;
}
export function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const [, mo, d] = dateStr.split('-').map(Number);
  return `${WEEKDAYS[weekdayOf(dateStr)]} ${MONTHS[mo - 1]} ${d}`;
}
export const formatPickup = p => (p && p.date && p.time ? `${formatDateLong(p.date)} · ${formatTime12(p.time)}` : '');

/**
 * What seniors should see right now. The manual status (open / break / closed)
 * wins when it says break or closed; "open" is only shown during office hours,
 * so a forgotten toggle at 5 PM does not tell seniors the office is open.
 */
export function effectiveOfficeStatus(office) {
  const o = mergeOffice(office);
  const today = phToday();
  if (o.status === OFFICE_STATUS.BREAK) return { state: 'break', note: o.statusNote };
  if (o.status === OFFICE_STATUS.CLOSED) return { state: 'closed', note: o.statusNote };
  const now = phMinutesNow();
  const inHours =
    o.schedule.days.includes(weekdayOf(today)) &&
    !o.closedDates.includes(today) &&
    now >= (toMinutes(o.schedule.start) ?? 0) &&
    now < (toMinutes(o.schedule.end) ?? 0);
  return inHours ? { state: 'open', note: o.statusNote } : { state: 'outside', note: '' };
}

// ── writes ────────────────────────────────────────────────────────────────
export async function saveOfficeSettings(patch, actorUid) {
  await setDoc(
    doc(db, 'osca_office', 'settings'),
    { ...patch, updatedAt: serverTimestamp(), updatedBy: actorUid || null },
    { merge: true },
  );
}

const bookIdPickupFn = httpsCallable(functions, 'bookIdPickup');
/** OSCA moves (or sets) a request's City Hall pickup slot. */
export async function bookPickup(requestId, date, time) {
  const res = await bookIdPickupFn({ requestId, date, time });
  return res.data;
}
