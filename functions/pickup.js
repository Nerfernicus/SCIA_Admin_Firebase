// functions/pickup.js
//
// City Hall pickup scheduling for physical Senior Citizen IDs.
//
// Only the OSCA office at City Hall releases IDs, so every request gets ONE
// pickup slot (a date + a time) and the senior goes to City Hall once.
//
// Data:
//   osca_office/settings   office hours + live status (open / break / closed).
//                          Written by the OSCA super admin from the dashboard.
//   pickup_slots/{date}    { counts: { "08:00": 2, ... } } how many seniors are
//                          booked per slot. Written ONLY here (Admin SDK), so
//                          the capacity limit cannot be bypassed from a client.
//   id_requests/{id}.pickup  { date: "YYYY-MM-DD", time: "HH:MM", bookedBy }
//
// Both the senior (mobile app) and the OSCA admin (dashboard) call
// bookIdPickup: the senior to pick or change their time, OSCA to move
// someone when the office is busy. It frees the old slot and takes the new
// one in a single transaction.
//
// Times are Philippine time (UTC+8), written as plain strings so they never
// shift with the phone's or server's time zone.

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");

if (!getApps().length) initializeApp();

const PH_OFFSET_MS = 8 * 60 * 60 * 1000;
const BOOKABLE_STATUSES = ["pending", "approved", "processing", "ready", "delivered", "received"];
const MAX_SENIOR_CHANGES = 3; // seniors may change their time this many times; OSCA is unlimited

const DEFAULT_SETTINGS = {
  status: "open",
  statusNote: "",
  location: "OSCA Office, Valenzuela City Hall",
  schedule: { days: [1, 2, 3, 4, 5], start: "08:00", end: "12:00", slotMinutes: 30, capacityPerSlot: 3 },
  closedDates: [],
  advanceDays: 30,
};

// ── time helpers (all Philippine time) ───────────────────────────────────
const pad = (n) => String(n).padStart(2, "0");
const toMinutes = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const toHHMM = (mins) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

/** "now" as a Date whose UTC getters read as Philippine time. */
const phNow = () => new Date(Date.now() + PH_OFFSET_MS);
const phToday = () => {
  const n = phNow();
  return `${n.getUTCFullYear()}-${pad(n.getUTCMonth() + 1)}-${pad(n.getUTCDate())}`;
};
const phMinutesNow = () => {
  const n = phNow();
  return n.getUTCHours() * 60 + n.getUTCMinutes();
};
const isValidDateStr = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && !isNaN(new Date(`${s}T00:00:00Z`).getTime());
const weekday = (dateStr) => new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 0 = Sunday
const addDays = (dateStr, n) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

/** Settings with defaults filled in, so a half-filled doc never breaks booking. */
function mergeSettings(raw) {
  const r = raw || {};
  const s = r.schedule || {};
  return {
    ...DEFAULT_SETTINGS,
    ...r,
    schedule: {
      days: Array.isArray(s.days) && s.days.length ? s.days.map(Number) : DEFAULT_SETTINGS.schedule.days,
      start: s.start || DEFAULT_SETTINGS.schedule.start,
      end: s.end || DEFAULT_SETTINGS.schedule.end,
      slotMinutes: Number(s.slotMinutes) > 0 ? Number(s.slotMinutes) : DEFAULT_SETTINGS.schedule.slotMinutes,
      capacityPerSlot: Number(s.capacityPerSlot) > 0 ? Number(s.capacityPerSlot) : DEFAULT_SETTINGS.schedule.capacityPerSlot,
    },
    closedDates: Array.isArray(r.closedDates) ? r.closedDates : [],
    advanceDays: Number(r.advanceDays) > 0 ? Number(r.advanceDays) : DEFAULT_SETTINGS.advanceDays,
  };
}

/** Every start time offered on a normal day: ["08:00", "08:30", ... "11:30"]. */
function slotTimes(schedule) {
  const start = toMinutes(schedule.start);
  const end = toMinutes(schedule.end);
  if (start == null || end == null || end <= start) return [];
  const out = [];
  for (let t = start; t + schedule.slotMinutes <= end; t += schedule.slotMinutes) out.push(toHHMM(t));
  return out;
}

/** Throws an HttpsError if (date, time) is not a slot OSCA is offering. */
function assertOfferedSlot(settings, date, time) {
  if (!isValidDateStr(date)) throw new HttpsError("invalid-argument", "Please choose a valid date.");
  if (!slotTimes(settings.schedule).includes(time)) {
    throw new HttpsError("invalid-argument", "That time is outside OSCA's pickup hours.");
  }
  if (!settings.schedule.days.includes(weekday(date))) {
    throw new HttpsError("invalid-argument", "OSCA does not release IDs on that day.");
  }
  if (settings.closedDates.includes(date)) {
    throw new HttpsError("invalid-argument", "OSCA is closed on that date. Please pick another day.");
  }
  const today = phToday();
  if (date < today) throw new HttpsError("invalid-argument", "That date has already passed.");
  if (date > addDays(today, settings.advanceDays)) {
    throw new HttpsError("invalid-argument", `Pickup can be booked up to ${settings.advanceDays} days ahead.`);
  }
  if (date === today && toMinutes(time) <= phMinutesNow()) {
    throw new HttpsError("invalid-argument", "That time has already passed today.");
  }
}

// ── message wording ──────────────────────────────────────────────────────
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function formatPickup(p) {
  if (!p || !p.date || !p.time) return "";
  const [y, mo, d] = p.date.split("-").map(Number);
  const mins = toMinutes(p.time) || 0;
  const h24 = Math.floor(mins / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const ampm = h24 >= 12 ? "PM" : "AM";
  return `${DAYS[weekday(p.date)]}, ${MONTHS[mo - 1]} ${d}, ${y} at ${h12}:${pad(mins % 60)} ${ampm}`;
}

/** Give one booked seat back (cancelled / rejected / deleted request, or a move). */
async function freePickupSlot(pickup) {
  if (!pickup || !pickup.date || !pickup.time) return;
  const db = getFirestore();
  const ref = db.doc(`pickup_slots/${pickup.date}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const counts = { ...(snap.get("counts") || {}) };
    if ((counts[pickup.time] || 0) > 0) counts[pickup.time] -= 1;
    tx.set(ref, { counts, updatedAt: FieldValue.serverTimestamp() });
  });
}

// ── bookIdPickup ─────────────────────────────────────────────────────────
exports.bookIdPickup = onCall({ region: "asia-southeast1" }, async (request) => {
  const { auth: callerAuth, data } = request;
  if (!callerAuth) throw new HttpsError("unauthenticated", "Please sign in first.");

  const requestId = data && data.requestId;
  const date = data && data.date;
  const time = data && data.time;
  if (!requestId || !date || !time) {
    throw new HttpsError("invalid-argument", "Please choose a day and a time.");
  }

  const db = getFirestore();
  const adminSnap = await db.collection("admins").doc(callerAuth.uid).get();
  const isOsca = adminSnap.exists && adminSnap.data().role === "super_admin";

  const settingsSnap = await db.doc("osca_office/settings").get();
  const settings = mergeSettings(settingsSnap.exists ? settingsSnap.data() : null);
  assertOfferedSlot(settings, date, time);

  const reqRef = db.collection("id_requests").doc(requestId);
  const newRef = db.doc(`pickup_slots/${date}`);
  let result;

  await db.runTransaction(async (tx) => {
    const reqSnap = await tx.get(reqRef);
    if (!reqSnap.exists) throw new HttpsError("not-found", "That ID request was not found.");
    const req = reqSnap.data();

    if (!isOsca && req.uid !== callerAuth.uid) {
      throw new HttpsError("permission-denied", "This is not your ID request.");
    }
    if (!BOOKABLE_STATUSES.includes(req.status || "pending")) {
      throw new HttpsError("failed-precondition", "This request is already finished, so the pickup time cannot be changed.");
    }
    if (!isOsca && (req.pickupChanges || 0) >= MAX_SENIOR_CHANGES) {
      throw new HttpsError("failed-precondition", "You already changed your schedule several times. Please contact the OSCA office.");
    }

    const old = req.pickup && req.pickup.date && req.pickup.time ? req.pickup : null;
    if (old && old.date === date && old.time === time) {
      result = { ok: true, unchanged: true, pickup: { date, time } };
      return;
    }

    // All reads first, then writes.
    const newSnap = await tx.get(newRef);
    const oldRef = old && old.date !== date ? db.doc(`pickup_slots/${old.date}`) : null;
    const oldSnap = oldRef ? await tx.get(oldRef) : null;

    const counts = { ...((newSnap.exists && newSnap.get("counts")) || {}) };
    if (old && old.date === date && (counts[old.time] || 0) > 0) counts[old.time] -= 1; // moving within the same day
    if ((counts[time] || 0) >= settings.schedule.capacityPerSlot) {
      throw new HttpsError("resource-exhausted", "That time is already full. Please pick another time.");
    }
    counts[time] = (counts[time] || 0) + 1;
    tx.set(newRef, { counts, updatedAt: FieldValue.serverTimestamp() });

    if (oldRef) {
      const oc = { ...((oldSnap.exists && oldSnap.get("counts")) || {}) };
      if ((oc[old.time] || 0) > 0) oc[old.time] -= 1;
      tx.set(oldRef, { counts: oc, updatedAt: FieldValue.serverTimestamp() });
    }

    tx.update(reqRef, {
      pickup: { date, time, bookedBy: isOsca ? "osca" : "senior", bookedAt: Timestamp.now() },
      pickupUpdatedAt: FieldValue.serverTimestamp(),
      pickupChanges: FieldValue.increment(isOsca ? 0 : old ? 1 : 0),
    });
    result = { ok: true, pickup: { date, time }, previous: old || null };
  });

  // Tell the other side (best effort - the booking itself already succeeded).
  if (!result.unchanged) {
    try {
      const reqSnap = await reqRef.get();
      const req = reqSnap.data() || {};
      const when = formatPickup({ date, time });
      const changed = !!result.previous;
      if (isOsca && req.uid) {
        await db.doc(`notifications/${requestId}_pickup_${date}_${time}`).set({
          uid: req.uid,
          type: "id_request_status",
          requestId,
          status: req.status || "pending",
          title: changed ? "Your ID pickup schedule was changed" : "Your ID pickup schedule is set",
          body: `Please go to ${settings.location} on ${when}. Bring a valid ID.`,
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      } else if (!isOsca) {
        const who = req.seniorName || req.fullName || "A senior citizen";
        await db.doc(`admin_notifications/${requestId}_pickup_${date}_${time}`).set({
          audience: "super_admin",
          type: "id_pickup",
          requestId,
          uid: req.uid || null,
          title: changed ? "ID pickup time changed" : "ID pickup time booked",
          body: `${who} will pick up their ID on ${when}.`,
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    } catch (e) {
      console.error("bookIdPickup notification failed", e);
    }
  }

  return result;
});

exports.freePickupSlot = freePickupSlot;
exports.formatPickup = formatPickup;
exports.mergeSettings = mergeSettings;
