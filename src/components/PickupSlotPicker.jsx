// src/components/PickupSlotPicker.jsx
//
// Pick a City Hall pickup day + time. Shows how many seats are left in each
// time slot (live, from pickup_slots/{date}). Used when OSCA marks an ID ready
// and when OSCA moves someone to another time. Capacity is enforced again on
// the server by the bookIdPickup function, so a stale screen cannot overbook.

import React, { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  bookableDates, slotTimes, formatDateShort, formatTime12, isSlotInFuture,
} from '../lib/pickupSlots';

export default function PickupSlotPicker({ office, value, onChange, ownSlot }) {
  const dates = bookableDates(office, 14);
  const times = slotTimes(office.schedule);
  const [counts, setCounts] = useState({});

  const selectedDate = value?.date || '';

  useEffect(() => {
    if (!selectedDate) { setCounts({}); return undefined; }
    return onSnapshot(
      doc(db, 'pickup_slots', selectedDate),
      snap => setCounts((snap.exists() && snap.data().counts) || {}),
      () => setCounts({}),
    );
  }, [selectedDate]);

  if (!dates.length) {
    return (
      <p className="text-sm text-orange-600 bg-orange-50 border border-orange-100 rounded-xl p-3">
        No pickup days are open. Check the office days and closed dates on the Schedule tab.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Day</p>
        <div className="flex flex-wrap gap-2">
          {dates.map(d => (
            <button
              key={d} type="button"
              onClick={() => onChange({ date: d, time: value?.date === d ? value.time : '' })}
              className={`px-3 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                selectedDate === d
                  ? 'bg-[#0f52ba] text-white border-[#0f52ba]'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-[#0f52ba]'
              }`}
            >
              {formatDateShort(d)}
            </button>
          ))}
        </div>
      </div>

      {selectedDate && (
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Time</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {times.map(tm => {
              const isOwn = ownSlot && ownSlot.date === selectedDate && ownSlot.time === tm;
              const taken = counts[tm] || 0;
              const left = office.schedule.capacityPerSlot - taken + (isOwn ? 1 : 0);
              const disabled = left <= 0 || !isSlotInFuture(selectedDate, tm);
              const active = value?.time === tm;
              return (
                <button
                  key={tm} type="button" disabled={disabled}
                  onClick={() => onChange({ date: selectedDate, time: tm })}
                  className={`px-2 py-2 rounded-xl text-sm border transition-colors ${
                    active
                      ? 'bg-[#0f52ba] text-white border-[#0f52ba]'
                      : disabled
                        ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-[#0f52ba]'
                  }`}
                >
                  <span className="font-semibold block">{formatTime12(tm)}</span>
                  <span className={`text-[11px] ${active ? 'text-white/80' : 'text-gray-400'}`}>
                    {left <= 0 ? 'Full' : `${left} left`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
