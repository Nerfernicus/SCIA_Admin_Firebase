// src/pages/EventCheckIn.jsx — new file
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  QrCode, Camera, CameraOff, CheckCircle2, XCircle, Search,
  Clock, Users2, RotateCcw, ListChecks, AlertCircle, Loader2,
} from "lucide-react";
import { db, COLLECTIONS, EVENT_ATTENDEES_SUBCOLLECTION } from "../lib/firebase";
import {
  collection, doc, getDoc, getDocs, query, where, limit,
  onSnapshot, orderBy, serverTimestamp, updateDoc, setDoc,
} from "firebase/firestore";

// html5-qrcode drives the camera + decode loop. Add it once:
//   npm install html5-qrcode
import { Html5Qrcode } from "html5-qrcode";
import { useAuth } from "../context/AuthContext";

const READER_ELEMENT_ID = "scia-qr-reader";

/**
 * Resolves whatever the scanned QR text turns out to be into a user uid.
 *
 * IMPORTANT: the mobile repo pushed to GitHub doesn't yet contain the QR
 * generation code shown in the dev chat (only "Fix Build" is on main), so
 * the exact payload format couldn't be confirmed against source. This
 * resolver tries the three most likely formats in order:
 *   1. JSON payload with a `uid` field, e.g. {"uid":"abc123"}
 *   2. Raw text that IS a users/{uid} doc id (the plain-uid case)
 *   3. Raw text that matches a user's `idNumber` (OSCA ID) field instead
 * If your account QR turns out to encode something else, tell me the
 * exact string it produces and I'll tighten this to a single case.
 */
async function resolveUidFromScan(rawText) {
  const text = (rawText || "").trim();
  if (!text) return null;

  // 1) JSON payload
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && parsed.uid) {
      const snap = await getDoc(doc(db, COLLECTIONS.USERS, parsed.uid));
      if (snap.exists()) return snap.id;
    }
  } catch {
    // not JSON — fall through
  }

  // 2) Raw uid
  const directSnap = await getDoc(doc(db, COLLECTIONS.USERS, text));
  if (directSnap.exists()) return directSnap.id;

  // 3) OSCA ID number fallback
  const q = query(collection(db, COLLECTIONS.USERS), where("idNumber", "==", text), limit(1));
  const results = await getDocs(q);
  if (!results.empty) return results.docs[0].id;

  return null;
}

function formatFieldValue(field, value) {
  if (value === undefined || value === null || value === "") return "—";
  return String(value);
}

export default function EventCheckIn() {
  const { adminData } = useAuth();
  const myBarangay = adminData?.barangay || null; // null for OSCA + the generic sub_admin

  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [tab, setTab] = useState("scan"); // "scan" | "attendees"

  // Scanner state
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [result, setResult] = useState(null); // { status, name, uid, attendee }
  const [manualCode, setManualCode] = useState("");
  const scannerRef = useRef(null);
  const busyRef = useRef(false); // guards against double-processing while camera keeps firing

  // Attendees tab state
  const [attendees, setAttendees] = useState([]);
  const [attendeesLoading, setAttendeesLoading] = useState(false);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) || null,
    [events, selectedEventId]
  );

  // ── Load joinable events ────────────────────────────────────────────────
  useEffect(() => {
    const q = query(
      collection(db, COLLECTIONS.EVENTS),
      where("isJoinable", "==", true),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          // A barangay-scoped admin only checks in attendees for events
          // targeted at their own barangay (or ALL/district-wide events)
          .filter((e) => !myBarangay || e.Audience !== "BARANGAY" || e.barangay === myBarangay);
        setEvents(list);
        setSelectedEventId((prev) => prev || (list[0] && list[0].id) || "");
      },
      (err) => console.error("Failed to load joinable events:", err)
    );
    return () => unsub();
  }, [myBarangay]);

  // ── Attendees list for the selected event ───────────────────────────────
  useEffect(() => {
    if (!selectedEventId) { setAttendees([]); return; }
    setAttendeesLoading(true);
    const q = query(
      collection(db, COLLECTIONS.EVENTS, selectedEventId, EVENT_ATTENDEES_SUBCOLLECTION)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => {
          if (!!a.checkedIn !== !!b.checkedIn) return a.checkedIn ? 1 : -1;
          return (a.name || "").localeCompare(b.name || "");
        });
        setAttendees(list);
        setAttendeesLoading(false);
      },
      (err) => { console.error("Failed to load attendees:", err); setAttendeesLoading(false); }
    );
    return () => unsub();
  }, [selectedEventId]);

  // ── Check a resolved uid into the currently selected event ──────────────
  const checkInUid = useCallback(async (uid) => {
    if (!selectedEventId) {
      setResult({ status: "error", message: "Select an event first." });
      return;
    }
    setLookingUp(true);
    try {
      const userSnap = await getDoc(doc(db, COLLECTIONS.USERS, uid));
      const userData = userSnap.exists() ? userSnap.data() : null;
      const name = userData
        ? `${userData.firstName ?? ""} ${userData.lastName ?? ""}`.trim() || "Unnamed senior"
        : "Unknown user";

      const attendeeRef = doc(db, COLLECTIONS.EVENTS, selectedEventId, EVENT_ATTENDEES_SUBCOLLECTION, uid);
      const attendeeSnap = await getDoc(attendeeRef);

      if (!attendeeSnap.exists()) {
        setResult({ status: "not_registered", name, uid });
        return;
      }

      const attendee = attendeeSnap.data();
      if (attendee.checkedIn) {
        setResult({ status: "already", name, uid, attendee });
        return;
      }

      await updateDoc(attendeeRef, {
        checkedIn: true,
        checkedInAt: serverTimestamp(),
        checkedInBy: "admin-dashboard",
      });
      setResult({ status: "success", name, uid, attendee });
    } catch (err) {
      console.error(err);
      setResult({ status: "error", message: "Lookup failed. Check your connection and try again." });
    } finally {
      setLookingUp(false);
    }
  }, [selectedEventId]);

  const handleDecodedText = useCallback(async (text) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setResult(null);
    setLookingUp(true);
    const uid = await resolveUidFromScan(text);
    if (!uid) {
      setResult({ status: "unresolved", raw: text });
      setLookingUp(false);
      busyRef.current = false;
      return;
    }
    await checkInUid(uid);
    setLookingUp(false);
    // small cooldown so the same badge doesn't get scanned twice in a row
    setTimeout(() => { busyRef.current = false; }, 1500);
  }, [checkInUid]);

  // ── Camera lifecycle ─────────────────────────────────────────────────────
  const startScanning = async () => {
    setScanError("");
    setResult(null);

    if (typeof window !== "undefined" && window.isSecureContext === false) {
      setScanError("Camera access needs HTTPS (or localhost) — this page is loaded over an insecure connection.");
      return;
    }

    const config = { fps: 10, qrbox: 260 };
    const onDecoded = (decodedText) => { handleDecodedText(decodedText); };
    const onDecodeMiss = () => { /* per-frame decode miss — ignore, this fires constantly */ };

    let instance;
    try {
      instance = new Html5Qrcode(READER_ELEMENT_ID);
      scannerRef.current = instance;

      try {
        // Preferred: rear/environment camera (phones, tablets)
        await instance.start({ facingMode: "environment" }, config, onDecoded, onDecodeMiss);
      } catch (envErr) {
        // Most laptops/desktops have no rear camera, so the constraint above
        // fails immediately — fall back to whatever camera the browser has
        // (front-facing webcam, external USB cam, etc.)
        console.warn("Rear camera unavailable, falling back to any camera:", envErr);
        const cameras = await Html5Qrcode.getCameras();
        if (!cameras || cameras.length === 0) throw envErr;
        await instance.start({ deviceId: { exact: cameras[0].id } }, config, onDecoded, onDecodeMiss);
      }

      setScanning(true);
    } catch (err) {
      console.error(err);
      const detail = err?.message || String(err);
      setScanError(`Couldn't access the camera (${detail}). Check browser permissions, make sure no other app/tab is using the camera, or use manual entry below.`);
      setScanning(false);
      if (scannerRef.current) {
        try { await scannerRef.current.clear(); } catch { /* already stopped */ }
        scannerRef.current = null;
      }
    }
  };

  const stopScanning = async () => {
    const instance = scannerRef.current;
    if (instance) {
      try {
        await instance.stop();
        await instance.clear();
      } catch {
        // already stopped
      }
      scannerRef.current = null;
    }
    setScanning(false);
  };

  useEffect(() => () => { stopScanning(); }, []); // stop camera on unmount

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    await handleDecodedText(manualCode.trim());
    setManualCode("");
  };

  const manualCheckIn = async (uid) => {
    setResult(null);
    await checkInUid(uid);
  };

  const undoCheckIn = async (uid) => {
    if (!selectedEventId) return;
    const attendeeRef = doc(db, COLLECTIONS.EVENTS, selectedEventId, EVENT_ATTENDEES_SUBCOLLECTION, uid);
    await updateDoc(attendeeRef, { checkedIn: false, checkedInAt: null, checkedInBy: null });
  };

  const checkedInCount = attendees.filter((a) => a.checkedIn).length;

  return (
    <div className="flex-1 bg-[#f8f9fa] min-h-screen p-8 font-sans">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
          <QrCode className="text-[#0f52ba]" size={30} /> Event Check-In
        </h1>
        <p className="text-gray-500">Scan a senior's account QR to check them in to a joinable event.</p>
      </div>

      {/* Event selector */}
      <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm mb-6">
        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Event</label>
        {events.length === 0 ? (
          <p className="text-sm text-gray-400">
            No joinable events yet. Toggle "Joinable Event" on when publishing an announcement to see it here.
          </p>
        ) : (
          <select
            value={selectedEventId}
            onChange={(e) => { setSelectedEventId(e.target.value); setResult(null); }}
            className="w-full bg-gray-50 rounded-xl py-3 px-4 text-sm text-gray-800 border border-gray-100 outline-none"
          >
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.Title} — {ev.Date}</option>
            ))}
          </select>
        )}
        {selectedEvent && (
          <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
            <span className="flex items-center gap-1"><Users2 size={13} /> {attendees.length} registered</span>
            <span className="flex items-center gap-1"><CheckCircle2 size={13} /> {checkedInCount} checked in</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab("scan")}
          className={`px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2 ${tab === "scan" ? "bg-[#0f52ba] text-white" : "bg-white text-gray-500 border border-gray-100"}`}
        >
          <Camera size={15} /> Scan
        </button>
        <button
          onClick={() => setTab("attendees")}
          className={`px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2 ${tab === "attendees" ? "bg-[#0f52ba] text-white" : "bg-white text-gray-500 border border-gray-100"}`}
        >
          <ListChecks size={15} /> Attendees
        </button>
      </div>

      {tab === "scan" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Camera panel */}
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">Camera Scanner</h3>
              {!scanning ? (
                <button onClick={startScanning} disabled={!selectedEventId}
                  className="bg-[#0f52ba] disabled:opacity-40 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-full flex items-center gap-2">
                  <Camera size={15} /> Start
                </button>
              ) : (
                <button onClick={stopScanning}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold px-4 py-2 rounded-full flex items-center gap-2">
                  <CameraOff size={15} /> Stop
                </button>
              )}
            </div>

            <div id={READER_ELEMENT_ID} className="rounded-2xl overflow-hidden bg-gray-900 min-h-[280px] flex items-center justify-center">
              {!scanning && <p className="text-gray-400 text-sm">Camera preview will appear here</p>}
            </div>

            {scanError && (
              <div className="mt-3 flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-xl p-3">
                <AlertCircle size={16} className="shrink-0 mt-0.5" /> {scanError}
              </div>
            )}

            {/* Manual fallback */}
            <form onSubmit={handleManualSubmit} className="mt-5 pt-5 border-t border-gray-100">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                Or enter code manually
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="Paste QR text or OSCA ID number"
                  className="flex-1 bg-gray-50 rounded-xl py-2.5 px-4 text-sm border border-gray-100 outline-none"
                />
                <button type="submit" className="bg-gray-900 hover:bg-black text-white px-4 rounded-xl flex items-center gap-2 text-sm font-semibold">
                  <Search size={15} /> Look up
                </button>
              </div>
            </form>
          </div>

          {/* Result panel */}
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-4">Result</h3>

            {lookingUp && (
              <div className="flex items-center gap-2 text-gray-500 text-sm">
                <Loader2 size={16} className="animate-spin" /> Checking…
              </div>
            )}

            {!lookingUp && !result && (
              <p className="text-sm text-gray-400">Scan a QR or submit a code to see the result here.</p>
            )}

            {!lookingUp && result?.status === "success" && (
              <ResultCard tone="green" icon={CheckCircle2} title="Checked in" name={result.name}>
                {result.attendee?.formResponses && Object.keys(result.attendee.formResponses).length > 0 && (
                  <FormResponsesList responses={result.attendee.formResponses} />
                )}
              </ResultCard>
            )}

            {!lookingUp && result?.status === "already" && (
              <ResultCard tone="amber" icon={Clock} title="Already checked in" name={result.name}>
                <button onClick={() => undoCheckIn(result.uid)} className="mt-3 text-xs font-semibold text-gray-500 hover:text-red-500 flex items-center gap-1.5">
                  <RotateCcw size={13} /> Undo check-in
                </button>
              </ResultCard>
            )}

            {!lookingUp && result?.status === "not_registered" && (
              <ResultCard tone="red" icon={XCircle} title="Not registered for this event" name={result.name}>
                <p className="text-xs text-gray-500 mt-1 mb-3">This senior hasn't tapped Join on this event yet.</p>
                <button onClick={() => manualCheckIn(result.uid)}
                  className="text-xs font-semibold bg-gray-900 hover:bg-black text-white px-3 py-2 rounded-lg">
                  Check in anyway
                </button>
              </ResultCard>
            )}

            {!lookingUp && result?.status === "unresolved" && (
              <ResultCard tone="red" icon={AlertCircle} title="Couldn't identify this QR" >
                <p className="text-xs text-gray-500 mt-1 break-all">Raw value: {result.raw}</p>
                <p className="text-xs text-gray-400 mt-2">
                  No matching user was found by uid or OSCA ID. If this keeps happening, the account QR's
                  payload format doesn't match what this scanner expects — see the comment at the top of
                  EventCheckIn.jsx.
                </p>
              </ResultCard>
            )}

            {!lookingUp && result?.status === "error" && (
              <ResultCard tone="red" icon={AlertCircle} title="Error">
                <p className="text-xs text-gray-500 mt-1">{result.message}</p>
              </ResultCard>
            )}
          </div>
        </div>
      )}

      {tab === "attendees" && (
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-4">Registered Attendees</h3>
          {attendeesLoading && <p className="text-sm text-gray-400">Loading…</p>}
          {!attendeesLoading && attendees.length === 0 && (
            <p className="text-sm text-gray-400">No one has joined this event yet.</p>
          )}
          <div className="space-y-3">
            {attendees.map((a) => (
              <div key={a.id} className="flex items-center justify-between p-4 rounded-2xl border border-gray-50 bg-gray-50/50">
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 text-sm">{a.name || a.id}</p>
                  {a.formResponses && Object.keys(a.formResponses).length > 0 && (
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      {Object.entries(a.formResponses).map(([k, v]) => `${k}: ${formatFieldValue(k, v)}`).join(" • ")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {a.checkedIn ? (
                    <span className="px-3 py-1 rounded-full text-[10px] font-bold tracking-wider bg-green-50 text-green-600">CHECKED IN</span>
                  ) : (
                    <button
                      onClick={() => manualCheckIn(a.id)}
                      className="text-xs font-semibold bg-[#0f52ba] hover:bg-blue-700 text-white px-3 py-1.5 rounded-full"
                    >
                      Check in
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ResultCard({ tone, icon: Icon, title, name, children }) {
  const tones = {
    green: "bg-green-50 text-green-700 border-green-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    red:   "bg-red-50 text-red-700 border-red-100",
  };
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <div className="flex items-center gap-2 font-bold text-sm mb-1">
        <Icon size={18} /> {title}
      </div>
      {name && <p className="text-sm font-semibold">{name}</p>}
      {children}
    </div>
  );
}

function FormResponsesList({ responses }) {
  return (
    <div className="mt-3 pt-3 border-t border-green-100 space-y-1">
      {Object.entries(responses).map(([key, value]) => (
        <p key={key} className="text-xs text-green-800">
          <span className="font-semibold">{key}:</span> {formatFieldValue(key, value)}
        </p>
      ))}
    </div>
  );
}
