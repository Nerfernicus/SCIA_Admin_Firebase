// src/components/OfficeSchedulePanel.jsx
//
// OSCA's "Schedule & Status" tab (super admin only):
//   1. Live office status: Open / On break / Closed (+ a short note), shown to
//      seniors in the mobile app.
//   2. Office hours: which weekdays, start/end time, minutes per slot, how many
//      seniors per slot, how far ahead they may book, and closed dates (holidays).
//   3. The pickup queue: every booked City Hall pickup by day and time, with a
//      Reschedule button.
//
// Settings live in osca_office/settings; see src/lib/pickupSlots.js.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  CheckCircle2, Coffee, XCircle, Clock as ClockIcon, CalendarDays, Users,
  Plus, Trash2, Save, Loader2,
} from 'lucide-react';
import { db } from '../lib/firebase';
import {
  mergeOffice, effectiveOfficeStatus, saveOfficeSettings, WEEKDAYS,
  formatDateLong, formatTime12, phToday, addDays, OFFICE_STATUS,
} from '../lib/pickupSlots';
import { normalizeStatus, STATUS_LABEL } from '../lib/idRequestStatus';

const STATUS_BUTTONS = [
  { key: OFFICE_STATUS.OPEN,   label: 'Open',     Icon: CheckCircle2, on: 'bg-green-600 text-white border-green-600',   off: 'text-green-700 border-green-200 hover:bg-green-50' },
  { key: OFFICE_STATUS.BREAK,  label: 'On break', Icon: Coffee,       on: 'bg-amber-500 text-white border-amber-500',   off: 'text-amber-700 border-amber-200 hover:bg-amber-50' },
  { key: OFFICE_STATUS.CLOSED, label: 'Closed',   Icon: XCircle,      on: 'bg-red-600 text-white border-red-600',       off: 'text-red-700 border-red-200 hover:bg-red-50' },
];

const BADGE = {
  open:    { cls: 'bg-green-100 text-green-700', text: 'Open now' },
  break:   { cls: 'bg-amber-100 text-amber-700', text: 'On break' },
  closed:  { cls: 'bg-red-100 text-red-700',     text: 'Closed' },
  outside: { cls: 'bg-gray-100 text-gray-600',   text: 'Outside office hours' },
};

const ACTIVE = ['pending', 'approved', 'processing', 'ready'];

export default function OfficeSchedulePanel({ idRequests, actorUid, onToast, onReschedule }) {
  const [office, setOffice] = useState(() => mergeOffice(null));
  const loadedRef = useRef(false); // fill the form once; later snapshots must not wipe unsaved edits
  const [draft, setDraft]   = useState(() => mergeOffice(null));
  const [note, setNote]     = useState('');
  const [saving, setSaving] = useState(false);
  const [newClosed, setNewClosed] = useState('');

  useEffect(() => onSnapshot(
    doc(db, 'osca_office', 'settings'),
    snap => {
      const merged = mergeOffice(snap.exists() ? snap.data() : null);
      setOffice(merged);
      if (!loadedRef.current) {
        loadedRef.current = true;
        setDraft(merged);
        setNote(merged.statusNote || '');
      }
    },
    () => { loadedRef.current = true; },
  ), []);

  const live = effectiveOfficeStatus(office);

  async function setStatus(status) {
    setSaving(true);
    try {
      await saveOfficeSettings({ status, statusNote: status === OFFICE_STATUS.OPEN ? '' : note.trim(), statusUpdatedAt: new Date() }, actorUid);
      if (status === OFFICE_STATUS.OPEN) setNote('');
      onToast?.(`Office status: ${STATUS_BUTTONS.find(b => b.key === status).label}`);
    } catch (e) {
      console.error(e);
      onToast?.('Could not update the office status.', 'error');
    } finally { setSaving(false); }
  }

  async function saveHours() {
    const s = draft.schedule;
    if (!s.days.length) return onToast?.('Choose at least one office day.', 'error');
    if (!(s.start < s.end)) return onToast?.('The closing time must be after the opening time.', 'error');
    if (Number(s.slotMinutes) < 5 || Number(s.capacityPerSlot) < 1) return onToast?.('Check the minutes per slot and seniors per slot.', 'error');
    if (draft.phone && !/^[0-9+()\s-]{7,20}$/.test(draft.phone.trim())) return onToast?.('Enter the office phone number using digits only (for example 0917 123 4567 or (02) 8123 4567).', 'error');
    setSaving(true);
    try {
      await saveOfficeSettings({
        location: draft.location.trim() || mergeOffice(null).location,
        phone: (draft.phone || '').trim(),
        schedule: {
          days: [...s.days].sort(),
          start: s.start, end: s.end,
          slotMinutes: Number(s.slotMinutes), capacityPerSlot: Number(s.capacityPerSlot),
        },
        closedDates: draft.closedDates,
        advanceDays: Number(draft.advanceDays) || 30,
      }, actorUid);
      onToast?.('Office hours saved');
    } catch (e) {
      console.error(e);
      onToast?.('Could not save the office hours.', 'error');
    } finally { setSaving(false); }
  }

  const setSched = patch => setDraft(d => ({ ...d, schedule: { ...d.schedule, ...patch } }));
  const toggleDay = day => setSched({
    days: draft.schedule.days.includes(day) ? draft.schedule.days.filter(x => x !== day) : [...draft.schedule.days, day],
  });
  const addClosed = () => {
    if (!newClosed || draft.closedDates.includes(newClosed)) return;
    setDraft(d => ({ ...d, closedDates: [...d.closedDates, newClosed].sort() }));
    setNewClosed('');
  };

  /* ── Queue: booked pickups from today onward, grouped by day ── */
  const queue = useMemo(() => {
    const today = phToday();
    const rows = idRequests
      .filter(r => r.pickup?.date && r.pickup.date >= today && ACTIVE.includes(normalizeStatus(r.status)))
      .sort((a, b) => (a.pickup.date + a.pickup.time).localeCompare(b.pickup.date + b.pickup.time));
    const byDay = {};
    rows.forEach(r => { (byDay[r.pickup.date] = byDay[r.pickup.date] || []).push(r); });
    return Object.entries(byDay);
  }, [idRequests]);

  const noSlotYet = idRequests.filter(r => !r.pickup?.date && ACTIVE.includes(normalizeStatus(r.status)));
  const cap = office.schedule.capacityPerSlot;
  const badge = BADGE[live.state];

  return (
    <div className="space-y-6">
      {/* ── Live status ── */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <ClockIcon size={16} className="text-[#0f52ba]" /> Office status
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Seniors see this in the app when they choose a pickup time.</p>
          </div>
          <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${badge.cls}`}>
            {badge.text}{live.note ? ` · ${live.note}` : ''}
          </span>
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          {STATUS_BUTTONS.map(({ key, label, Icon, on, off }) => (
            <button
              key={key} disabled={saving} onClick={() => setStatus(key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold border transition-colors disabled:opacity-50 ${office.status === key ? on : `bg-white ${off}`}`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
        <input
          value={note} onChange={e => setNote(e.target.value)} maxLength={80}
          placeholder='Note for seniors, e.g. "Back at 1:00 PM" (used for On break / Closed)'
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#0f52ba]"
        />
      </div>

      {/* ── Office hours ── */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <h2 className="text-base font-bold text-gray-900 flex items-center gap-2 mb-4">
          <CalendarDays size={16} className="text-[#0f52ba]" /> Pickup hours
        </h2>

        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Days seniors can pick up</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {WEEKDAYS.map((w, i) => (
            <button
              key={w} onClick={() => toggleDay(i)}
              className={`w-14 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                draft.schedule.days.includes(i) ? 'bg-[#0f52ba] text-white border-[#0f52ba]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#0f52ba]'
              }`}
            >{w}</button>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <label className="text-xs font-semibold text-gray-500">From
            <input type="time" value={draft.schedule.start} onChange={e => setSched({ start: e.target.value })}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900" />
          </label>
          <label className="text-xs font-semibold text-gray-500">Until
            <input type="time" value={draft.schedule.end} onChange={e => setSched({ end: e.target.value })}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900" />
          </label>
          <label className="text-xs font-semibold text-gray-500">Minutes per slot
            <select value={draft.schedule.slotMinutes} onChange={e => setSched({ slotMinutes: Number(e.target.value) })}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 bg-white">
              {[10, 15, 20, 30, 45, 60].map(m => <option key={m} value={m}>{m} min</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-gray-500">Seniors per slot
            <input type="number" min="1" max="50" value={draft.schedule.capacityPerSlot} onChange={e => setSched({ capacityPerSlot: e.target.value })}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900" />
          </label>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          <label className="text-xs font-semibold text-gray-500">Pickup location shown to seniors
            <input value={draft.location} onChange={e => setDraft(d => ({ ...d, location: e.target.value }))}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900" />
          </label>
          <label className="text-xs font-semibold text-gray-500">OSCA office phone (seniors tap Tulong to call this)
            <input type="tel" value={draft.phone || ''} onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))}
              placeholder="e.g. (02) 8123 4567"
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900" />
          </label>
          <label className="text-xs font-semibold text-gray-500">How many days ahead can they book?
            <input type="number" min="1" max="90" value={draft.advanceDays} onChange={e => setDraft(d => ({ ...d, advanceDays: e.target.value }))}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900" />
          </label>
        </div>

        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Closed dates (holidays, no pickups)</p>
        <div className="flex flex-wrap gap-2 mb-2">
          {draft.closedDates.length === 0 && <span className="text-xs text-gray-400">None</span>}
          {draft.closedDates.map(d => (
            <span key={d} className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 text-xs font-semibold px-3 py-1.5 rounded-full">
              {formatDateLong(d)}
              <button onClick={() => setDraft(x => ({ ...x, closedDates: x.closedDates.filter(c => c !== d) }))}><Trash2 size={11} className="text-gray-400 hover:text-red-500" /></button>
            </span>
          ))}
        </div>
        <div className="flex gap-2 mb-5">
          <input type="date" min={phToday()} max={addDays(phToday(), 365)} value={newClosed} onChange={e => setNewClosed(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900" />
          <button onClick={addClosed} disabled={!newClosed}
            className="flex items-center gap-1.5 border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 text-xs font-bold px-3 py-2 rounded-xl">
            <Plus size={12} /> Add closed date
          </button>
        </div>

        <button onClick={saveHours} disabled={saving}
          className="flex items-center gap-2 bg-[#0f52ba] hover:bg-[#0c44a0] disabled:opacity-60 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save pickup hours
        </button>
        <p className="text-xs text-gray-400 mt-2">Seniors already booked keep their time. Changes apply to new bookings.</p>
      </div>

      {/* ── Queue ── */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <h2 className="text-base font-bold text-gray-900 flex items-center gap-2 mb-1">
          <Users size={16} className="text-[#0f52ba]" /> Pickup queue
        </h2>
        <p className="text-xs text-gray-500 mb-4">Everyone who will come to City Hall, by day and time.</p>

        {queue.length === 0 && <p className="text-sm text-gray-400 py-4">No pickups booked yet.</p>}
        {queue.map(([date, rows]) => (
          <div key={date} className="mb-5 last:mb-0">
            <p className="text-sm font-bold text-gray-800 mb-2">
              {formatDateLong(date)} <span className="text-gray-400 font-medium">· {rows.length} {rows.length === 1 ? 'senior' : 'seniors'}</span>
            </p>
            <div className="space-y-2">
              {rows.map(r => {
                const st = normalizeStatus(r.status);
                const sameSlot = rows.filter(x => x.pickup.time === r.pickup.time).length;
                return (
                  <div key={r.id} className="flex items-center justify-between gap-3 border border-gray-100 rounded-xl px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        <span className="text-[#0f52ba] mr-2">{formatTime12(r.pickup.time)}</span>
                        {r.seniorName || r.fullName || 'Senior'}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {STATUS_LABEL[st] || st}
                        {sameSlot >= cap ? ' · slot full' : ''}
                        {r.pickup.bookedBy === 'osca' ? ' · set by OSCA' : ''}
                      </p>
                    </div>
                    <button onClick={() => onReschedule(r)}
                      className="shrink-0 text-xs font-bold border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-2 rounded-xl">
                      Reschedule
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {noSlotYet.length > 0 && (
          <div className="mt-5 pt-4 border-t border-gray-100">
            <p className="text-xs font-bold text-orange-600 uppercase tracking-wider mb-2">No pickup time yet ({noSlotYet.length})</p>
            <div className="space-y-2">
              {noSlotYet.map(r => (
                <div key={r.id} className="flex items-center justify-between gap-3 border border-orange-100 bg-orange-50/40 rounded-xl px-4 py-3">
                  <p className="text-sm font-semibold text-gray-800 truncate">{r.seniorName || r.fullName || 'Senior'}</p>
                  <button onClick={() => onReschedule(r)}
                    className="shrink-0 text-xs font-bold bg-[#0f52ba] text-white hover:bg-[#0c44a0] px-3 py-2 rounded-xl">
                    Set time
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
