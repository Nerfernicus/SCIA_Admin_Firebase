/**
 * IDManagement.jsx — Unified ID Module
 *
 * Combines IDVerification + IDRelease into one page with top-level tabs:
 *   1. ID Verification   (OSCA submissions + Physical ID requests)
 *   2. ID Release        (Super admin: approve/release · Sub-admin: distribute)
 *
 * Key rules enforced:
 *  • "Birthday not on record" → Approve button is DISABLED in both verification modals
 *  • "Birthday not on record" → Release button is DISABLED in the Release modal
 *  • Barangay field shown in Physical ID verification modal
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  ShieldCheck, Clock as ClockIcon, CheckCircle2, XCircle, Eye,
  Loader2, Trash2, AlertTriangle, X, User, Search, Database,
  FileImage, RotateCcw, FileText, MapPin, Phone, CreditCard,
  Globe, WifiOff, Send, Bell, Package, ChevronRight,
} from 'lucide-react';
import { db, functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import {
  collection, onSnapshot, query, orderBy, where,
  doc, updateDoc, setDoc, deleteDoc, serverTimestamp,
  getDocs, addDoc, getDoc,
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

/* ─── Cloud Function ─────────────────────────────────────────────────────────── */
const ncscVerifyFn = httpsCallable(functions, 'ncscVerify');

/* ─── NCSC live verification ─────────────────────────────────────────────────── */
async function runNCSCVerify(record) {
  const rawName  = (record.fullName || record.seniorName || '').trim();
  const lastName  = record.lastName   || record.surname       || '';
  const firstName = record.firstName  || record.givenName     || '';
  const middleName= record.middleName || record.middleInitial || '';

  let ln = lastName, fn = firstName, mn = middleName;
  if (!ln && rawName) {
    if (rawName.includes(',')) {
      const [l, rest] = rawName.split(',').map(s => s.trim());
      ln = l;
      const parts = rest.split(' ').filter(Boolean);
      fn = parts[0] || '';
      mn = parts.slice(1).join(' ');
    } else {
      const parts = rawName.split(' ').filter(Boolean);
      fn = parts[0] || '';
      mn = parts.length > 2 ? parts.slice(1, -1).join(' ') : '';
      ln = parts[parts.length - 1] || '';
    }
  }

  const dob = record.dob || record.dateOfBirth || record.birthday || '';
  let month = '', day = '';
  if (dob) {
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sept','Oct','Nov','Dec'];
    const isoMatch   = dob.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const slashMatch = dob.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const textMatch  = dob.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
    if (isoMatch)   { month = monthNames[parseInt(isoMatch[2],10)-1]||'';  day = String(parseInt(isoMatch[3],10)); }
    else if (slashMatch) { month = monthNames[parseInt(slashMatch[1],10)-1]||''; day = String(parseInt(slashMatch[2],10)); }
    else if (textMatch)  { month = textMatch[1].charAt(0).toUpperCase()+textMatch[1].slice(1,3).toLowerCase(); day = String(parseInt(textMatch[2],10)); }
  }

  if (!ln || !fn) {
    return runLocalNCSIDCheck(record);
  }

  // If birthday is missing, we can only do a name-only check — returns special status
  if (!month || !day) {
    try {
      // Try name-only by passing empty month/day — server may still match by name
      const result = await ncscVerifyFn({ lastName: ln, firstName: fn, middleName: mn, month: '', day: '' });
      const { found, error } = result.data;
      if (error === 'ncsc_unreachable') return 'unreachable';
      // Even if found by name, birthday wasn't verified — use special status
      return found ? 'found_name_only' : 'not_found';
    } catch (err) {
      return runLocalNCSIDCheck(record);
    }
  }

  try {
    const result = await ncscVerifyFn({ lastName: ln, firstName: fn, middleName: mn, month, day });
    const { found, error } = result.data;
    if (error === 'ncsc_unreachable') return 'unreachable';
    return found ? 'found' : 'not_found';
  } catch (err) {
    return runLocalNCSIDCheck(record);
  }
}

async function runLocalNCSIDCheck(record) {
  try {
    let found = false;
    const idNum = record.idNumber || record.seniorId || record.controlNumber;
    if (idNum) {
      const q = await getDocs(query(collection(db, 'users'), where('oscaId', '==', idNum)));
      if (!q.empty) found = true;
    }
    if (!found && (record.fullName || record.seniorName)) {
      const name = (record.fullName || record.seniorName || '').trim().toUpperCase();
      const q = await getDocs(query(collection(db, 'users'), where('fullNameUpper', '==', name)));
      if (!q.empty) found = true;
    }
    if (!found && record.uid) {
      const q = await getDocs(query(collection(db, 'users'), where('uid', '==', record.uid)));
      if (!q.empty) found = true;
    }
    return found ? 'found' : 'not_found';
  } catch (e) { return 'not_found'; }
}

/* ─── Helpers ────────────────────────────────────────────────────────────────── */
const hasBirthday = r => !!(r.dob || r.dateOfBirth || r.birthday);

/* ─── Status Badge ───────────────────────────────────────────────────────────── */
const StatusBadge = ({ status }) => {
  const map = {
    pending:   { cls: 'bg-yellow-100 text-yellow-700',  label: 'Pending'   },
    approved:  { cls: 'bg-green-100 text-green-700',    label: 'Approved'  },
    rejected:  { cls: 'bg-red-100 text-red-700',        label: 'Rejected'  },
    verified:  { cls: 'bg-green-100 text-green-700',    label: 'Verified'  },
    released:  { cls: 'bg-blue-100 text-blue-700',      label: 'Released'  },
    notified:  { cls: 'bg-purple-100 text-purple-700',  label: 'Notified'  },
    collected: { cls: 'bg-gray-100 text-gray-700',      label: 'Collected' },
    void:      { cls: 'bg-gray-100 text-gray-500',      label: 'Void'      },
  };
  const { cls, label } = map[status] || map.pending;
  return <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cls}`}>{label}</span>;
};

/* ─── NCSC status indicator ──────────────────────────────────────────────────── */
function NCSCStatusBadge({ status }) {
  if (status === 'checking')        return <span className="flex items-center gap-1 text-xs text-blue-600 font-medium"><Loader2 size={11} className="animate-spin" /> Checking NCSC…</span>;
  if (status === 'found')           return <span className="flex items-center gap-1 text-xs text-green-700 font-semibold bg-green-50 px-2 py-0.5 rounded-full"><CheckCircle2 size={11} /> Registered in NCSC</span>;
  if (status === 'found_name_only') return <span className="flex items-center gap-1 text-xs text-orange-600 font-semibold bg-orange-50 px-2 py-0.5 rounded-full"><AlertTriangle size={11} /> Name Found — Birthday Unverified</span>;
  if (status === 'not_found')       return <span className="flex items-center gap-1 text-xs text-red-600 font-semibold bg-red-50 px-2 py-0.5 rounded-full"><XCircle size={11} /> NOT Registered in NCSC</span>;
  if (status === 'unreachable')     return <span className="flex items-center gap-1 text-xs text-orange-600 font-semibold bg-orange-50 px-2 py-0.5 rounded-full"><WifiOff size={11} /> NCSC Unreachable</span>;
  return null;
}

/* ─── NCSC Banner ────────────────────────────────────────────────────────────── */
function NCSCBanner({ status, onRecheck, missingBirthday }) {
  const bannerCls =
    status === 'found'            ? 'bg-green-50 border-green-200' :
    status === 'found_name_only'  ? 'bg-orange-50 border-orange-300' :
    status === 'not_found'        ? 'bg-red-50 border-red-300' :
    status === 'unreachable'      ? 'bg-orange-50 border-orange-200' :
    'bg-blue-50 border-blue-100';
  const iconCls =
    status === 'found'            ? 'text-green-600' :
    status === 'found_name_only'  ? 'text-orange-500' :
    status === 'not_found'        ? 'text-red-500' :
    status === 'unreachable'      ? 'text-orange-500' :
    'text-blue-500';

  return (
    <>
      <div className={`rounded-xl px-4 py-3 mb-4 flex items-center justify-between border ${bannerCls}`}>
        <div className="flex items-center gap-2">
          <Globe size={14} className={iconCls} />
          <span className="text-xs font-semibold text-gray-700">NCSC Live Registration Check</span>
        </div>
        <NCSCStatusBadge status={status} />
        <button onClick={onRecheck} title="Re-check" className="ml-2 text-gray-400 hover:text-gray-600">
          <RotateCcw size={12} />
        </button>
      </div>

      {status === 'found_name_only' && (
        <div className="mb-4 px-4 py-2.5 bg-orange-50 border border-orange-300 rounded-xl text-xs text-orange-700 font-semibold flex items-start gap-2">
          <AlertTriangle size={13} className="text-orange-500 mt-0.5 shrink-0" />
          <span>
            <strong>Cannot approve</strong> — NCSC found this senior by name only. Birthday is missing so full verification could not be completed. Please update the senior's birthday before approving.
          </span>
        </div>
      )}
      {status === 'not_found' && (
        <div className="mb-4 px-4 py-2.5 bg-red-50 border border-red-300 rounded-xl text-xs text-red-700 font-semibold flex items-start gap-2">
          <AlertTriangle size={13} className="text-red-500 mt-0.5 shrink-0" />
          <span>
            <strong>Cannot approve</strong> —{' '}
            {missingBirthday
              ? 'name and birthday are not registered in NCSC. Please update the senior\'s birthday and verify their identity before approving.'
              : 'this senior\'s name and birthday were not found in NCSC records. Please verify their identity before approving.'}
          </span>
        </div>
      )}
      {status === 'unreachable' && (
        <div className="mb-4 px-4 py-2.5 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-700 font-medium flex items-start gap-2">
          <WifiOff size={13} className="text-orange-500 mt-0.5 shrink-0" />
          <span>The NCSC website is currently <strong>unreachable</strong>. Falling back to local records. Proceed with caution.</span>
        </div>
      )}
    </>
  );
}

/* ─── Birthday warning pill ──────────────────────────────────────────────────── */
function BirthdayWarning() {
  return (
    <p className="text-xs text-orange-500 pl-5 font-semibold flex items-center gap-1">
      <AlertTriangle size={11} /> Birthday not on record — NCSC check used name only
    </p>
  );
}

/* ─── Delete confirm modal ───────────────────────────────────────────────────── */
function DeleteConfirmModal({ name, onClose, onConfirm, loading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 z-10 text-center">
        <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Trash2 size={24} className="text-red-500" />
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-1">Delete Request?</h2>
        <p className="text-sm text-gray-500 mb-1">You are about to delete the request from</p>
        <p className="text-sm font-bold text-gray-800 mb-4">"{name}"</p>
        <p className="text-xs text-red-500 font-semibold bg-red-50 rounded-xl px-4 py-2 mb-6">
          This will permanently remove the record from the system.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={onConfirm} disabled={loading} className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── OSCA ID Submission Review Modal ────────────────────────────────────────── */
function OSCASubmissionModal({ record, onClose, onDecision, processing }) {
  const [ncscStatus, setNcscStatus] = useState('checking');
  const missingBirthday = !hasBirthday(record);

  const doCheck = useCallback(() => {
    setNcscStatus('checking');
    runNCSCVerify(record).then(setNcscStatus);
  }, [record]);

  useEffect(() => { doCheck(); }, [doCheck]);

  // Block approve if birthday is missing OR NCSC says not found
  const canApprove = !processing && ncscStatus !== 'checking' && ncscStatus !== 'not_found' && ncscStatus !== 'found_name_only';

  const name = record.fullName || record.seniorName || 'Unknown';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-lg w-full max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck size={20} className="text-[#0f52ba]" />
              <h3 className="text-lg font-bold text-gray-900">OSCA ID Verification</h3>
            </div>
            <p className="text-xs text-gray-400">Verifying against live NCSC records using name & birthday.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={18} /></button>
        </div>

        <NCSCBanner status={ncscStatus} onRecheck={doCheck} missingBirthday={missingBirthday} />

        {/* Birthday missing — hard block (only shown when NCSC found by name only, not when not_found since banner covers that) */}
        {missingBirthday && ncscStatus !== 'not_found' && ncscStatus !== 'found_name_only' && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-300 rounded-xl text-xs text-red-700 font-semibold flex items-start gap-2">
            <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" />
            <span>
              <strong>Cannot approve</strong> — birthday is not on record. NCSC could only verify by name.
              Please update the senior's birthday before approving.
            </span>
          </div>
        )}

        {/* Senior info */}
        <div className="bg-gray-50 rounded-2xl px-4 py-3 mb-5 space-y-1.5">
          <div className="flex items-center gap-2">
            <User size={14} className="text-gray-400" />
            <span className="text-sm font-bold text-gray-800">{name}</span>
          </div>
          {record.idNumber && (
            <div className="flex items-center gap-2 pl-1">
              <ShieldCheck size={13} className="text-blue-400" />
              <span className="text-xs text-gray-600">OSCA ID on card: <strong className="text-blue-700">{record.idNumber}</strong></span>
            </div>
          )}
          {record.dob && <p className="text-xs text-gray-400 pl-5">🎂 DOB: <strong>{record.dob}</strong></p>}
          {record.email && <p className="text-xs text-gray-400 pl-5">{record.email}</p>}
          {record.address && <p className="text-xs text-gray-400 pl-5">📍 {record.address}</p>}
          {record.barangay && <p className="text-xs text-gray-400 pl-5">🏘 Barangay: <strong>{record.barangay}</strong></p>}
          {record.sex && <p className="text-xs text-gray-400 pl-5">Sex: {record.sex}</p>}
          {record.submittedAt && (
            <p className="text-xs text-gray-400 pl-5">Submitted: {record.submittedAt?.toDate?.()?.toLocaleDateString?.() || '—'}</p>
          )}
          {missingBirthday && <BirthdayWarning />}
        </div>

        {/* Uploaded ID photo */}
        <div className="mb-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
            <FileImage size={12} /> Uploaded OSCA ID Photo
          </p>
          {(record.idImageUrl || record.imageBase64) ? (
            <img
              src={record.idImageUrl ?? `data:image/jpeg;base64,${record.imageBase64}`}
              alt="Submitted OSCA ID"
              className="w-full rounded-xl border border-gray-200 object-contain max-h-64"
            />
          ) : (
            <div className="w-full rounded-xl border border-dashed border-gray-200 py-10 flex flex-col items-center gap-2 text-gray-400">
              <FileImage size={28} className="opacity-30" />
              <p className="text-xs">No ID image uploaded</p>
            </div>
          )}
        </div>

        {ncscStatus === 'found' && !missingBirthday && (
          <div className="mb-4 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 font-medium flex items-start gap-2">
            <CreditCard size={13} className="text-blue-500 mt-0.5 shrink-0" />
            <span>Approving will: ① verify the senior's account, ② create their digital ID, and ③ queue a physical ID for release.</span>
          </div>
        )}

        <div className="flex gap-3">
          <button
            disabled={processing}
            onClick={() => onDecision(record.id, 'rejected')}
            className="flex-1 py-3 rounded-xl border-2 border-red-200 text-red-600 font-semibold text-sm hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            Reject
          </button>
          <button
            disabled={!canApprove}
            onClick={() => onDecision(record.id, 'approved', 'id_verifications', record)}
            className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            title={missingBirthday ? 'Birthday required to approve' : ''}
          >
            {processing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Approve & Verify
          </button>
        </div>
        <button onClick={onClose} className="w-full mt-3 text-sm text-gray-400 hover:text-gray-600">Cancel</button>
      </div>
    </div>
  );
}

/* ─── Physical ID Request Review Modal ───────────────────────────────────────── */
function PhysicalIDModal({ record, onClose, onDecision, processing }) {
  const [ncscStatus, setNcscStatus] = useState('checking');
  const missingBirthday = !hasBirthday(record);

  const doCheck = useCallback(() => {
    setNcscStatus('checking');
    runNCSCVerify(record).then(setNcscStatus);
  }, [record]);

  useEffect(() => { doCheck(); }, [doCheck]);

  const name = record.seniorName || record.fullName || 'Unknown';
  // Block approve if birthday missing OR NCSC says not found
  const canApprove = !processing && ncscStatus !== 'checking' && ncscStatus !== 'not_found' && ncscStatus !== 'found_name_only';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <FileText size={18} className="text-[#0f52ba]" /> Physical ID Request
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">Live NCSC verification by name & birthday</p>
          </div>
          <button onClick={onClose}><X size={18} className="text-gray-400 hover:text-gray-600" /></button>
        </div>

        <NCSCBanner status={ncscStatus} onRecheck={doCheck} missingBirthday={missingBirthday} />

        {/* Birthday hard block — only show when found by name only (not when not_found, banner handles that) */}
        {missingBirthday && ncscStatus !== 'not_found' && ncscStatus !== 'found_name_only' && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-300 rounded-xl text-xs text-red-700 font-semibold flex items-start gap-2">
            <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" />
            <span>
              <strong>Cannot approve</strong> — birthday is not on record. NCSC could only verify by name.
              Please update the senior's birthday before approving.
            </span>
          </div>
        )}

        <div className="bg-gray-50 rounded-2xl p-4 space-y-1.5 mb-5">
          <div className="flex items-center gap-2">
            <User size={13} className="text-gray-400" />
            <span className="text-sm font-bold text-gray-800">{name}</span>
          </div>
          {record.seniorId      && <p className="text-xs text-gray-500 pl-5">OSCA ID: <strong className="text-blue-700">{record.seniorId}</strong></p>}
          {(record.dob || record.dateOfBirth) && <p className="text-xs text-gray-500 pl-5">🎂 DOB: <strong>{record.dob || record.dateOfBirth}</strong></p>}
          {record.address       && <p className="text-xs text-gray-500 pl-5 flex items-center gap-1"><MapPin size={10} />{record.address}</p>}
          {record.contactNumber && <p className="text-xs text-gray-500 pl-5 flex items-center gap-1"><Phone size={10} />{record.contactNumber}</p>}
          {/* Barangay field prominently shown */}
          <p className="text-xs text-gray-500 pl-5 flex items-center gap-1">
            🏘 Barangay: {record.barangay
              ? <strong>{record.barangay}</strong>
              : <span className="text-orange-500 font-semibold italic">Not specified</span>}
          </p>
          {record.reason    && <p className="text-xs text-gray-400 pl-5 italic">Reason: {record.reason}</p>}
          {record.createdAt && <p className="text-xs text-gray-400 pl-5">Requested: {record.createdAt?.toDate?.()?.toLocaleDateString?.() || '—'}</p>}
          {missingBirthday && <BirthdayWarning />}
        </div>

        <div className="flex gap-3">
          <button
            disabled={processing}
            onClick={() => onDecision(record.id, 'rejected', 'id_requests', record)}
            className="flex-1 py-3 rounded-xl border-2 border-red-200 text-red-600 font-semibold text-sm hover:bg-red-50 disabled:opacity-50 transition-colors"
          >
            Reject
          </button>
          <button
            disabled={!canApprove}
            onClick={() => onDecision(record.id, 'approved', 'id_requests', record)}
            className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-sm disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            title={missingBirthday ? 'Birthday required to approve' : ''}
          >
            {processing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Approve Request
          </button>
        </div>
        <button onClick={onClose} className="w-full mt-3 text-sm text-gray-400 hover:text-gray-600">Cancel</button>
      </div>
    </div>
  );
}

/* ─── OSCA ID Card (flippable) ───────────────────────────────────────────────── */
function OSCAIDCard({ record }) {
  const [flipped, setFlipped] = useState(false);
  const name       = (record.seniorName || record.fullName || 'UNKNOWN').toUpperCase();
  const address    = record.address || '—';
  const dob        = record.dob || record.dateOfBirth || '—';
  const sex        = record.sex || '—';
  const controlNo  = record.controlNumber || record.seniorId || (record.id?.slice(-6).toUpperCase()) || '——————';
  const dateIssued = record.releasedAt?.toDate?.()?.toLocaleDateString('en-PH') || new Date().toLocaleDateString('en-PH');

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="cursor-pointer select-none" style={{ perspective: 800, width: 340, height: 200 }} onClick={() => setFlipped(f => !f)} title="Click to flip">
        <div style={{ position: 'relative', width: '100%', height: '100%', transformStyle: 'preserve-3d', transition: 'transform 0.6s cubic-bezier(0.4,0,0.2,1)', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
          {/* FRONT */}
          <div style={{ position: 'absolute', width: '100%', height: '100%', backfaceVisibility: 'hidden', fontFamily: 'Arial, sans-serif', border: '1.5px solid #ccc', borderRadius: 10, overflow: 'hidden', background: '#fff', boxShadow: '0 4px 18px rgba(0,0,0,0.12)' }}>
            <div style={{ background: '#0f52ba', padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, background: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: '#0f52ba', fontWeight: 'bold' }}>🇵🇭</span>
              </div>
              <div style={{ color: '#fff' }}>
                <div style={{ fontSize: 7, opacity: 0.85 }}>Republic of the Philippines</div>
                <div style={{ fontSize: 11, fontWeight: 'bold' }}>CITY OF VALENZUELA</div>
                <div style={{ fontSize: 7, opacity: 0.85 }}>Office of the Senior Citizens Affairs (OSCA)</div>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <div style={{ width: 28, height: 28, background: 'rgba(255,255,255,0.2)', borderRadius: 4, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <div style={{ flex: 1, background: '#e63946' }} />
                  <div style={{ flex: 1, background: '#fff' }} />
                  <div style={{ flex: 1, background: '#0f52ba' }} />
                </div>
              </div>
            </div>
            <div style={{ padding: '8px 12px', display: 'flex', gap: 10 }}>
              <div style={{ width: 60, height: 72, background: '#e5e7eb', borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, border: '1px solid #d1d5db' }}>👤</div>
              <div style={{ flex: 1, fontSize: 9 }}>
                <div style={{ fontSize: 10, fontWeight: 'bold', color: '#111', marginBottom: 2 }}>Name: {name}</div>
                <div style={{ color: '#555', fontSize: 8, marginBottom: 4 }}>Address: {address}</div>
                <div style={{ display: 'flex', gap: 12, fontSize: 8, color: '#333' }}>
                  <div><div style={{ color: '#888', fontSize: 7 }}>Date of Birth</div><div style={{ fontWeight: 600 }}>{dob}</div></div>
                  <div><div style={{ color: '#888', fontSize: 7 }}>Sex</div><div style={{ fontWeight: 600 }}>{sex}</div></div>
                  <div><div style={{ color: '#888', fontSize: 7 }}>Date Issued</div><div style={{ fontWeight: 600 }}>{dateIssued}</div></div>
                </div>
              </div>
            </div>
            <div style={{ padding: '2px 12px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 7, color: '#888' }}>Control No. ___________</div>
                <div style={{ fontSize: 20, fontWeight: 'bold', color: '#e63946', letterSpacing: 2 }}>{controlNo}</div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 7, color: '#888' }}>
                <div style={{ marginBottom: 2 }}>Signature/Thumbmark</div>
                <div style={{ width: 60, height: 24, borderBottom: '1px solid #ccc' }} />
              </div>
            </div>
            <div style={{ background: '#0f52ba', padding: '4px 12px', textAlign: 'center', fontSize: 9, color: '#fff', letterSpacing: 0.5 }}>This card is non-transferable</div>
          </div>
          {/* BACK */}
          <div style={{ position: 'absolute', width: '100%', height: '100%', backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', fontFamily: 'Arial, sans-serif', border: '1.5px solid #ccc', borderRadius: 10, overflow: 'hidden', background: '#fff', boxShadow: '0 4px 18px rgba(0,0,0,0.12)' }}>
            <div style={{ padding: '8px 12px', fontSize: 8, color: '#333', lineHeight: 1.7 }}>
              <div style={{ fontWeight: 'bold', fontSize: 9, color: '#0f52ba', marginBottom: 4 }}>Benefits and Privileges under R.A. 9994</div>
              1. Free medical/dental, diagnostic &amp; laboratory services in all govt. facilities<br />
              2. 20% discount for medicines<br />3. 20% discount in hotels, restaurants &amp; recreation centers<br />
              4. 20% discount in theaters, cinema houses &amp; concert halls<br />5. 20% discount in medical/dental services in private facilities<br />
              6. 20% discount in fare for domestic air, sea &amp; land transportation<br />7. 5% discount in basic necessities &amp; primary commodities<br />
              8. 12% VAT-exemption on purchases with the 20% discount<br />9. 5% discount on monthly water &amp; electricity bills
            </div>
            <div style={{ fontSize: 7, color: '#666', padding: '0 12px 6px', fontStyle: 'italic' }}>Persons and corporations violating R.A. 9994 shall be penalized.</div>
            <div style={{ borderTop: '1px solid #e5e7eb', padding: '5px 12px', display: 'flex', justifyContent: 'space-between', fontSize: 8 }}>
              <div style={{ textAlign: 'center' }}><div style={{ width: 80, borderBottom: '1px solid #333', marginBottom: 2 }} /><div style={{ color: '#888' }}>OSCA Head</div></div>
              <div style={{ textAlign: 'center' }}><div style={{ width: 80, borderBottom: '1px solid #333', marginBottom: 2 }} /><div style={{ color: '#888' }}>City Mayor</div></div>
            </div>
            <div style={{ background: '#0f52ba', padding: '4px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ color: '#4ade80', fontSize: 8, fontWeight: 'bold' }}>Tuloy-PROGRESO, Valenzuela!</div>
              <div style={{ color: '#fff', fontSize: 7 }}>www.valenzuela.gov.ph</div>
            </div>
          </div>
        </div>
      </div>
      <p className="text-xs text-gray-400 flex items-center gap-1"><RotateCcw size={11} /> Click card to flip</p>
    </div>
  );
}

/* ─── Release Modal ──────────────────────────────────────────────────────────── */
function ReleaseModal({ record, onClose, onRelease, processing }) {
  const [verified, setVerified] = useState(false);
  const missingBirthday = !hasBirthday(record);

  const hasAllInfo = !!(
    (record.seniorName || record.fullName) &&
    record.address &&
    (record.seniorId || record.controlNumber || record.idNumber) &&
    (record.barangay || record.sub_admin_barangay) &&
    !missingBirthday   // birthday is now a required field for release
  );

  const checks = [
    { label: 'Full Name',            ok: !!(record.seniorName || record.fullName) },
    { label: 'Date of Birth',        ok: !missingBirthday },
    { label: 'Address',              ok: !!record.address },
    { label: 'OSCA ID / Control No.',ok: !!(record.seniorId || record.controlNumber || record.idNumber) },
    { label: 'Barangay Assignment',  ok: !!(record.barangay || record.sub_admin_barangay) },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-lg w-full max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Send size={18} className="text-[#0f52ba]" /> Release Physical ID
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">Final verification before releasing to sub-admin</p>
          </div>
          <button onClick={onClose}><X size={18} className="text-gray-400 hover:text-gray-600" /></button>
        </div>

        <div className="mb-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">ID Card Preview</p>
          <OSCAIDCard record={record} />
        </div>

        {/* Information check */}
        <div className={`rounded-xl px-4 py-3 mb-4 ${hasAllInfo ? 'bg-green-50 border border-green-200' : 'bg-orange-50 border border-orange-200'}`}>
          <p className="text-xs font-semibold mb-2 text-gray-700">Required Information Check</p>
          {checks.map(({ label, ok }) => (
            <div key={label} className="flex items-center gap-2 text-xs py-0.5">
              {ok ? <CheckCircle2 size={12} className="text-green-600" /> : <XCircle size={12} className="text-orange-500" />}
              <span className={ok ? 'text-gray-700' : 'text-orange-700 font-semibold'}>{label}</span>
              {!ok && <span className="text-orange-500 italic">— Missing</span>}
            </div>
          ))}
        </div>

        {/* Birthday-specific block */}
        {missingBirthday && (
          <div className="mb-4 px-4 py-2.5 bg-red-50 border border-red-300 rounded-xl text-xs text-red-700 font-semibold flex items-start gap-2">
            <AlertTriangle size={13} className="text-red-500 mt-0.5 shrink-0" />
            <span>
              <strong>Cannot release</strong> — birthday is not on record. Please update the senior's birthday before releasing the ID.
            </span>
          </div>
        )}

        {!hasAllInfo && !missingBirthday && (
          <div className="mb-4 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-semibold flex items-center gap-2">
            <AlertTriangle size={13} className="text-red-500" />
            Cannot release — required information is incomplete. Please update the senior's record first.
          </div>
        )}

        {hasAllInfo && (
          <label className="flex items-start gap-2 mb-5 cursor-pointer">
            <input type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)} className="mt-0.5 accent-blue-600" />
            <span className="text-xs text-gray-600">
              I confirm that all information on this physical ID is correct and complete. This ID will be sent to the assigned sub-admin for barangay distribution.
            </span>
          </label>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
          <button
            disabled={processing || !hasAllInfo || !verified}
            onClick={() => onRelease(record)}
            className="flex-1 py-3 rounded-xl bg-[#0f52ba] hover:bg-blue-700 text-white font-semibold text-sm disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
          >
            {processing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Release to Sub-Admin
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Release Request Detail Modal ──────────────────────────────────────────── */
function RequestDetailModal({ record, onClose, onApprove, onReject, processing }) {
  const missingBirthday = !hasBirthday(record);
  const name = record.seniorName || record.fullName || 'Unknown';
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><FileText size={18} className="text-[#0f52ba]" /> Physical ID Request</h3>
            <p className="text-xs text-gray-400 mt-0.5">Review and verify before approving</p>
          </div>
          <button onClick={onClose}><X size={18} className="text-gray-400 hover:text-gray-600" /></button>
        </div>

        {missingBirthday && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-300 rounded-xl text-xs text-red-700 font-semibold flex items-start gap-2">
            <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" />
            <span><strong>Cannot approve</strong> — birthday not on record. Update the senior's birthday first.</span>
          </div>
        )}

        <div className="bg-gray-50 rounded-2xl p-4 space-y-2 mb-5">
          <div className="flex items-center gap-2"><User size={13} className="text-gray-400" /><span className="text-sm font-bold text-gray-800">{name}</span></div>
          {record.seniorId      && <p className="text-xs text-gray-500 pl-5">OSCA ID: <strong className="text-blue-700">{record.seniorId}</strong></p>}
          {(record.dob || record.dateOfBirth) && <p className="text-xs text-gray-500 pl-5">🎂 DOB: <strong>{record.dob || record.dateOfBirth}</strong></p>}
          {record.address       && <p className="text-xs text-gray-500 pl-5 flex items-center gap-1"><MapPin size={10} />{record.address}</p>}
          {record.contactNumber && <p className="text-xs text-gray-500 pl-5 flex items-center gap-1"><Phone size={10} />{record.contactNumber}</p>}
          <p className="text-xs text-gray-500 pl-5">🏘 Barangay: {record.barangay ? <strong>{record.barangay}</strong> : <span className="text-orange-500 italic font-semibold">Not specified</span>}</p>
          {record.reason    && <p className="text-xs text-gray-400 pl-5 italic">Reason: {record.reason}</p>}
          {record.createdAt && <p className="text-xs text-gray-400 pl-5">Requested: {record.createdAt?.toDate?.()?.toLocaleDateString?.() || '—'}</p>}
          {missingBirthday && <BirthdayWarning />}
        </div>

        <div className="flex gap-3">
          <button disabled={processing} onClick={() => onReject(record.id)} className="flex-1 py-3 rounded-xl border-2 border-red-200 text-red-600 font-semibold text-sm hover:bg-red-50 disabled:opacity-50">Reject</button>
          <button disabled={processing || missingBirthday} onClick={() => onApprove(record)} className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2" title={missingBirthday ? 'Birthday required' : ''}>
            {processing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Approve Request
          </button>
        </div>
        <button onClick={onClose} className="w-full mt-3 text-sm text-gray-400 hover:text-gray-600">Cancel</button>
      </div>
    </div>
  );
}

/* ─── Stat card ──────────────────────────────────────────────────────────────── */
function StatCard({ label, value, icon: Icon, color, bg }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center gap-4">
      <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center`}>
        <Icon size={20} className={color} />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════════════════════ */
export default function IDManagement() {
  const { isSuperAdmin, isSubAdmin, adminData } = useAuth();

  /* ── Shared state ── */
  const [toast, setToast]           = useState({ msg: '', type: 'success' });
  const [mainTab, setMainTab]       = useState('verification'); // 'verification' | 'release'

  /* ── Verification state ── */
  const [submissions, setSubmissions]   = useState([]);
  const [physicalReqs, setPhysicalReqs] = useState([]);
  const [loadingVerif, setLoadingVerif] = useState(true);
  const [verifTab, setVerifTab]         = useState('submissions');
  const [selected, setSelected]         = useState(null);
  const [processing, setProcessing]     = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]         = useState(false);
  const [verifSearch, setVerifSearch]   = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  /* ── Release state ── */
  const [idRequests, setIdRequests]     = useState([]);
  const [releasedIDs, setReleasedIDs]   = useState([]);
  const [loadingRel, setLoadingRel]     = useState(true);
  const [releaseTab, setReleaseTab]     = useState(isSuperAdmin ? 'requests' : 'released');
  const [relSearch, setRelSearch]       = useState('');
  const [detailRecord, setDetailRecord] = useState(null);
  const [releaseRecord, setReleaseRecord] = useState(null);

  /* ── Listeners ── */
  useEffect(() => {
    const q = query(collection(db, 'id_verifications'), orderBy('submittedAt', 'desc'));
    return onSnapshot(q, snap => { setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoadingVerif(false); });
  }, []);
  useEffect(() => {
    const q = query(collection(db, 'id_requests'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => { setPhysicalReqs(snap.docs.map(d => ({ id: d.id, ...d.data() }))); });
  }, []);
  useEffect(() => {
    const q = query(collection(db, 'id_requests'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => { setIdRequests(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoadingRel(false); });
  }, []);
  useEffect(() => {
    let q;
    if (isSubAdmin && adminData?.barangay) {
      q = query(collection(db, 'released_ids'), where('barangay', '==', adminData.barangay), orderBy('releasedAt', 'desc'));
    } else {
      q = query(collection(db, 'released_ids'), orderBy('releasedAt', 'desc'));
    }
    return onSnapshot(q, snap => setReleasedIDs(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [isSubAdmin, adminData]);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: 'success' }), 3500);
  }

  /* ── Verification decision handler ── */
  async function handleDecision(id, decision, collectionName = 'id_verifications', record = null) {
    setProcessing(true);
    try {
      await updateDoc(doc(db, collectionName, id), { status: decision, reviewedAt: serverTimestamp() });

      if (decision === 'approved' && record) {
        if (collectionName === 'id_verifications') {
          const uid = record.uid;
          if (uid) {
            try { await updateDoc(doc(db, 'users', uid), { isVerified: true, status: 'VERIFIED', verifiedAt: serverTimestamp() }); } catch (e) {}
          }
          const digitalIdData = {
            uid: uid || null, fullName: record.fullName || record.seniorName || '',
            firstName: record.firstName || '', lastName: record.lastName || record.surname || '',
            middleName: record.middleName || '', dob: record.dob || record.dateOfBirth || '',
            sex: record.sex || '', address: record.address || '', barangay: record.barangay || '',
            email: record.email || '', idNumber: record.idNumber || record.seniorId || '',
            idImageUrl: record.idImageUrl || '', status: 'active', isVerified: true,
            createdAt: serverTimestamp(), verifiedAt: serverTimestamp(), sourceDocId: id,
          };
          if (uid) await setDoc(doc(db, 'digital_ids', uid), digitalIdData, { merge: true });

          const controlNumber = record.idNumber || record.seniorId || id.slice(-6).toUpperCase();
          try {
            const { addDoc: add } = await import('firebase/firestore');
            await add(collection(db, 'released_ids'), {
              requestId: id, uid: uid || null,
              seniorName: record.fullName || record.seniorName || '',
              seniorId: record.idNumber || record.seniorId || '',
              firstName: record.firstName || '', lastName: record.lastName || record.surname || '',
              middleName: record.middleName || '', dob: record.dob || record.dateOfBirth || '',
              sex: record.sex || '', address: record.address || '', barangay: record.barangay || '',
              controlNumber, status: 'notified', releasedAt: serverTimestamp(),
              releasedBy: 'auto_verification', notifiedAt: serverTimestamp(), sourceType: 'id_verification',
            });
          } catch (e) {}
        }

        if (collectionName === 'id_requests') {
          const controlNumber = record.controlNumber || record.seniorId || id.slice(-6).toUpperCase();
          try {
            const { addDoc: add } = await import('firebase/firestore');
            await add(collection(db, 'released_ids'), {
              requestId: id, uid: record.uid || null,
              seniorName: record.seniorName || record.fullName || '',
              seniorId: record.seniorId || record.idNumber || '',
              dob: record.dob || record.dateOfBirth || '', sex: record.sex || '',
              address: record.address || '',
              barangay: record.barangay || record.sub_admin_barangay || '',
              controlNumber, status: 'notified', releasedAt: serverTimestamp(),
              releasedBy: 'auto_physical_approval', notifiedAt: serverTimestamp(), sourceType: 'id_request',
            });
            await updateDoc(doc(db, 'id_requests', id), { status: 'released', releasedAt: serverTimestamp() });
          } catch (e) {}
        }
      }

      setSelected(null);
      showToast(decision === 'approved' ? 'Approved! Digital ID created & physical ID queued for release.' : 'Request rejected.');
    } finally { setProcessing(false); }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, deleteTarget.col, deleteTarget.id));
      showToast(`"${deleteTarget.name}" deleted.`);
      setDeleteTarget(null);
    } finally { setDeleting(false); }
  }

  /* ── Release handlers ── */
  async function handleApprove(record) {
    setProcessing(true);
    try {
      await updateDoc(doc(db, 'id_requests', record.id), { status: 'approved', reviewedAt: serverTimestamp() });
      setDetailRecord(null);
      showToast(`Request for ${record.seniorName || record.fullName} approved.`);
    } finally { setProcessing(false); }
  }

  async function handleReject(id) {
    setProcessing(true);
    try {
      await updateDoc(doc(db, 'id_requests', id), { status: 'rejected', reviewedAt: serverTimestamp() });
      setDetailRecord(null);
      showToast('Request rejected.');
    } finally { setProcessing(false); }
  }

  async function handleRelease(record) {
    setProcessing(true);
    try {
      await addDoc(collection(db, 'released_ids'), {
        requestId: record.id, seniorName: record.seniorName || record.fullName || '',
        seniorId: record.seniorId || record.idNumber || '', address: record.address || '',
        dob: record.dob || record.dateOfBirth || '', sex: record.sex || '',
        controlNumber: record.controlNumber || record.seniorId || record.id.slice(-6).toUpperCase(),
        barangay: record.barangay || record.sub_admin_barangay || '',
        status: 'notified', releasedAt: serverTimestamp(), releasedBy: 'super_admin', notifiedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'id_requests', record.id), { status: 'released', releasedAt: serverTimestamp() });
      setReleaseRecord(null);
      showToast(`Physical ID for ${record.seniorName || record.fullName} released to sub-admin.`);
    } finally { setProcessing(false); }
  }

  async function handleCollected(id) {
    setProcessing(true);
    try {
      await updateDoc(doc(db, 'released_ids', id), { status: 'collected', collectedAt: serverTimestamp() });
      showToast('Marked as collected.');
    } finally { setProcessing(false); }
  }

  /* ── Computed: verification ── */
  const activeList = verifTab === 'submissions' ? submissions : physicalReqs;
  const nameOf     = r => verifTab === 'submissions' ? (r.fullName || r.seniorName || '') : (r.seniorName || r.fullName || '');
  const idOf       = r => verifTab === 'submissions' ? (r.idNumber || '') : (r.seniorId || '');

  const filteredVerif = activeList.filter(r => {
    const matchS = !verifSearch || nameOf(r).toLowerCase().includes(verifSearch.toLowerCase()) || idOf(r).toLowerCase().includes(verifSearch.toLowerCase());
    const matchF = filterStatus === 'all' || r.status === filterStatus || (!r.status && filterStatus === 'pending');
    return matchS && matchF;
  });

  const verifPending  = filteredVerif.filter(r => !r.status || r.status === 'pending');
  const verifReviewed = filteredVerif.filter(r => r.status && r.status !== 'pending');

  const repeatKeys = (() => {
    const counts = {};
    submissions.forEach(r => { const k = r.email || r.fullName || r.seniorName; if (k) counts[k] = (counts[k] || 0) + 1; });
    return new Set(Object.keys(counts).filter(k => counts[k] > 1));
  })();
  const isRepeat = r => verifTab === 'submissions' && repeatKeys.has(r.email || r.fullName || r.seniorName);
  const voidVerifReqs = physicalReqs.filter(r => r.isVoid || (!r.seniorName && !r.fullName && !r.seniorId));

  /* ── Computed: release ── */
  const filteredRel = (list) => list.filter(r => {
    const name = (r.seniorName || r.fullName || '').toLowerCase();
    return !relSearch || name.includes(relSearch.toLowerCase()) || (r.seniorId || '').includes(relSearch);
  });

  const relPending  = filteredRel(idRequests.filter(r => !r.status || r.status === 'pending'));
  const relApproved = filteredRel(idRequests.filter(r => r.status === 'approved'));
  const relRejected = filteredRel(idRequests.filter(r => r.status === 'rejected'));
  const relReleased = filteredRel(idRequests.filter(r => r.status === 'released'));
  const myReleased  = filteredRel(releasedIDs);
  const notified    = myReleased.filter(r => r.status === 'notified');
  const collected   = myReleased.filter(r => r.status === 'collected');
  const voidRelReqs = idRequests.filter(r => r.isVoid || (!r.seniorName && !r.fullName && !r.seniorId));

  /* ── Top-level tabs ── */
  const topTabs = [
    { key: 'verification', label: 'ID Verification', badge: submissions.filter(r => !r.status || r.status === 'pending').length + physicalReqs.filter(r => !r.status || r.status === 'pending').length },
    { key: 'release',      label: 'ID Release',      badge: isSuperAdmin ? relPending.length : notified.length },
  ];

  const verifTabs = [
    { key: 'submissions', label: 'OSCA ID Submissions',  badge: submissions.filter(r => !r.status || r.status === 'pending').length },
    { key: 'physical',    label: 'Physical ID Requests', badge: physicalReqs.filter(r => !r.status || r.status === 'pending').length },
  ];

  const relTabs = [
    ...(isSuperAdmin ? [
      { key: 'requests',  label: 'ID Requests', badge: relPending.length },
      { key: 'approved',  label: 'Approved',    badge: relApproved.length },
      { key: 'released',  label: 'Released',    badge: 0 },
    ] : []),
    ...(isSubAdmin ? [{ key: 'released', label: 'My Released IDs', badge: notified.length }] : []),
  ];

  return (
    <div className="p-8 max-w-5xl mx-auto relative">

      {/* Toast */}
      {toast.msg && (
        <div className={`fixed top-6 right-6 z-50 text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-fade-in ${toast.type === 'error' ? 'bg-red-600' : 'bg-gray-900'}`}>
          <CheckCircle2 size={16} className="text-green-400" />
          {toast.msg}
          <button onClick={() => setToast({ msg: '', type: 'success' })}><X size={14} className="text-white/60 hover:text-white" /></button>
        </div>
      )}

      {deleteTarget && <DeleteConfirmModal name={deleteTarget.name} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} loading={deleting} />}
      {selected?.type === 'submission' && <OSCASubmissionModal record={selected.record} onClose={() => setSelected(null)} onDecision={handleDecision} processing={processing} />}
      {selected?.type === 'physical'   && <PhysicalIDModal     record={selected.record} onClose={() => setSelected(null)} onDecision={handleDecision} processing={processing} />}
      {detailRecord  && <RequestDetailModal record={detailRecord}  onClose={() => setDetailRecord(null)}  onApprove={handleApprove} onReject={handleReject} processing={processing} />}
      {releaseRecord && <ReleaseModal       record={releaseRecord} onClose={() => setReleaseRecord(null)} onRelease={handleRelease} processing={processing} />}

      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <CreditCard size={24} className="text-[#0f52ba]" /> ID Management
        </h1>
        <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
          <Globe size={13} className="text-[#0f52ba]" />
          Live NCSC verification · Birthday required to approve or release
        </p>
      </div>

      {/* Top-level tabs */}
      <div className="flex gap-1 mb-8 bg-gray-100 p-1 rounded-xl w-fit">
        {topTabs.map(t => (
          <button
            key={t.key}
            onClick={() => setMainTab(t.key)}
            className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${mainTab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t.label}
            {t.badge > 0 && <span className="ml-1.5 bg-[#0f52ba] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* ═══ VERIFICATION PANEL ═══ */}
      {mainTab === 'verification' && (
        <>
          {/* Stats */}
          {verifTab === 'submissions' ? (
            <div className="grid grid-cols-4 gap-4 mb-6">
              <StatCard label="Pending Review"  value={submissions.filter(r => !r.status || r.status === 'pending').length} icon={ClockIcon}    color="text-yellow-600" bg="bg-yellow-50" />
              <StatCard label="Approved"         value={submissions.filter(r => r.status === 'approved').length}             icon={CheckCircle2} color="text-green-600"  bg="bg-green-50"  />
              <StatCard label="Rejected"         value={submissions.filter(r => r.status === 'rejected').length}             icon={XCircle}      color="text-red-600"    bg="bg-red-50"    />
              <StatCard label="Total Submitted"  value={submissions.length}                                                  icon={FileImage}    color="text-blue-600"   bg="bg-blue-50"   />
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-4 mb-6">
              <StatCard label="Pending"          value={physicalReqs.filter(r => !r.status || r.status === 'pending').length} icon={ClockIcon}     color="text-yellow-600" bg="bg-yellow-50" />
              <StatCard label="Approved"          value={physicalReqs.filter(r => r.status === 'approved').length}             icon={CheckCircle2}  color="text-green-600"  bg="bg-green-50"  />
              <StatCard label="Rejected"          value={physicalReqs.filter(r => r.status === 'rejected').length}             icon={XCircle}       color="text-red-600"    bg="bg-red-50"    />
              <StatCard label="Void/Incomplete"   value={voidVerifReqs.length}                                                 icon={AlertTriangle} color="text-orange-600" bg="bg-orange-50" />
            </div>
          )}

          {/* Banners */}
          {verifTab === 'submissions' && repeatKeys.size > 0 && (
            <div className="flex items-center gap-2 mb-5 px-4 py-2.5 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-700 font-medium">
              <AlertTriangle size={14} className="text-orange-500 shrink-0" />
              {repeatKeys.size} user{repeatKeys.size > 1 ? 's have' : ' has'} submitted <strong className="mx-1">multiple requests</strong> — highlighted in orange.
            </div>
          )}
          {verifTab === 'physical' && voidVerifReqs.length > 0 && (
            <div className="flex items-center gap-2 mb-5 px-4 py-2.5 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-700 font-medium">
              <AlertTriangle size={14} className="text-orange-500 shrink-0" />
              <strong>{voidVerifReqs.length}</strong>&nbsp;request(s) are void — incomplete profile.
            </div>
          )}

          {/* Sub-tabs */}
          <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-xl w-fit">
            {verifTabs.map(t => (
              <button key={t.key} onClick={() => { setVerifTab(t.key); setVerifSearch(''); setFilterStatus('all'); }}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${verifTab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {t.label}
                {t.badge > 0 && <span className="ml-1.5 bg-[#0f52ba] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{t.badge}</span>}
              </button>
            ))}
          </div>

          {/* Search + filter */}
          <div className="flex gap-3 mb-6">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Search by name or OSCA ID…" value={verifSearch} onChange={e => setVerifSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 bg-white" />
            </div>
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
              {['all','pending','approved','rejected'].map(f => (
                <button key={f} onClick={() => setFilterStatus(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${filterStatus === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          {loadingVerif ? (
            <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
          ) : (
            <>
              {verifPending.length > 0 && (
                <div className="mb-6">
                  <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Pending Review ({verifPending.length})</h2>
                  <div className="space-y-3">
                    {verifPending.map(r => {
                      const repeat = isRepeat(r);
                      const isVoid = verifTab === 'physical' && (r.isVoid || (!r.seniorName && !r.fullName && !r.seniorId));
                      const rName  = nameOf(r) || 'Unknown';
                      const rId    = idOf(r);
                      const rDate  = (verifTab === 'submissions' ? r.submittedAt?.toDate?.()?.toLocaleDateString?.() : r.createdAt?.toDate?.()?.toLocaleDateString?.()) || null;
                      const noBday = !hasBirthday(r);
                      return (
                        <div key={r.id} className={`rounded-2xl p-5 flex items-center justify-between border ${
                          isVoid ? 'bg-gray-50 border-gray-200 opacity-60' :
                          repeat ? 'bg-orange-50 border-orange-300 ring-1 ring-orange-200' : 'bg-white border-yellow-200'}`}>
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            {verifTab === 'submissions' ? (
                              (r.idImageUrl || r.imageBase64)
                                ? <img src={r.idImageUrl ?? `data:image/jpeg;base64,${r.imageBase64}`} alt="ID" className="w-16 h-10 rounded-lg object-cover border border-gray-200 shrink-0" />
                                : <div className="w-16 h-10 rounded-lg bg-gray-100 border border-dashed border-gray-300 flex items-center justify-center shrink-0"><FileImage size={14} className="text-gray-400" /></div>
                            ) : (
                              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0"><FileText size={16} className="text-[#0f52ba]" /></div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-semibold text-gray-900">{rName}</p>
                                {repeat && <span className="flex items-center gap-1 text-[10px] font-bold bg-orange-500 text-white px-2 py-0.5 rounded-full"><AlertTriangle size={9} /> REPEAT</span>}
                                {isVoid && <span className="text-[10px] font-bold bg-gray-400 text-white px-2 py-0.5 rounded-full">VOID</span>}
                                {noBday && !isVoid && <span className="text-[10px] font-bold bg-red-500 text-white px-2 py-0.5 rounded-full flex items-center gap-1"><AlertTriangle size={8} /> NO BIRTHDAY</span>}
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {rId ? `OSCA ID: ${rId}` : ''}
                                {r.barangay ? ` · Brgy. ${r.barangay}` : ''}
                                {rDate ? ` · ${rDate}` : ''}
                              </p>
                              {r.reason && <p className="text-xs text-gray-400 mt-0.5 italic">Reason: {r.reason}</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-4 shrink-0">
                            <StatusBadge status={isVoid ? 'void' : (r.status || 'pending')} />
                            {!isVoid && (
                              <button onClick={() => setSelected({ record: r, type: verifTab === 'submissions' ? 'submission' : 'physical' })}
                                className="flex items-center gap-1.5 text-xs font-semibold text-[#0f52ba] hover:underline">
                                <Eye size={14} /> Review
                              </button>
                            )}
                            <button onClick={() => setDeleteTarget({ id: r.id, name: rName, col: verifTab === 'submissions' ? 'id_verifications' : 'id_requests' })}
                              className="p-1.5 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50"><Trash2 size={15} /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {verifReviewed.length > 0 && (
                <div>
                  <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Reviewed ({verifReviewed.length})</h2>
                  <div className="space-y-2">
                    {verifReviewed.map(r => {
                      const repeat = isRepeat(r);
                      const rName  = nameOf(r) || 'Unknown';
                      const rId    = idOf(r);
                      return (
                        <div key={r.id} className={`rounded-2xl p-4 flex items-center justify-between border ${repeat ? 'bg-orange-50/60 border-orange-200' : 'bg-white border-gray-100'}`}>
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            {verifTab === 'submissions'
                              ? ((r.idImageUrl || r.imageBase64) ? <img src={r.idImageUrl ?? `data:image/jpeg;base64,${r.imageBase64}`} alt="ID" className="w-12 h-8 rounded-md object-cover border border-gray-200 shrink-0" /> : <div className="w-12 h-8 rounded-md bg-gray-100 flex items-center justify-center shrink-0"><FileImage size={12} className="text-gray-300" /></div>)
                              : <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center shrink-0"><FileText size={13} className="text-gray-400" /></div>
                            }
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-medium text-gray-800">{rName}</p>
                                {repeat && <span className="flex items-center gap-1 text-[10px] font-bold bg-orange-400 text-white px-2 py-0.5 rounded-full"><AlertTriangle size={9} /> REPEAT</span>}
                              </div>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {rId ? `OSCA ID: ${rId}` : ''}
                                {r.reviewedAt && ` · Reviewed ${r.reviewedAt?.toDate?.()?.toLocaleDateString?.() || '—'}`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-4 shrink-0">
                            <StatusBadge status={r.status} />
                            <button onClick={() => setSelected({ record: r, type: verifTab === 'submissions' ? 'submission' : 'physical' })} className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-[#0f52ba]"><Eye size={13} /> View</button>
                            <button onClick={() => setDeleteTarget({ id: r.id, name: rName, col: verifTab === 'submissions' ? 'id_verifications' : 'id_requests' })} className="p-1.5 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50"><Trash2 size={15} /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {filteredVerif.length === 0 && (
                <div className="text-center py-20 text-gray-400">
                  <ShieldCheck size={40} className="mx-auto mb-3 opacity-40" />
                  <p className="font-medium">{verifSearch ? 'No results found' : verifTab === 'submissions' ? 'No verification requests yet' : 'No physical ID requests yet'}</p>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ═══ RELEASE PANEL ═══ */}
      {mainTab === 'release' && (
        <>
          {/* Stats */}
          {isSuperAdmin && (
            <div className="grid grid-cols-4 gap-4 mb-6">
              <StatCard label="Pending Requests"  value={relPending.length}   icon={ClockIcon}     color="text-yellow-600" bg="bg-yellow-50" />
              <StatCard label="Approved"           value={relApproved.length}  icon={CheckCircle2}  color="text-green-600"  bg="bg-green-50"  />
              <StatCard label="Released"           value={relReleased.length}  icon={Send}          color="text-blue-600"   bg="bg-blue-50"   />
              <StatCard label="Void / Incomplete"  value={voidRelReqs.length}  icon={AlertTriangle} color="text-orange-600" bg="bg-orange-50" />
            </div>
          )}
          {isSubAdmin && (
            <div className="grid grid-cols-3 gap-4 mb-6">
              <StatCard label="Awaiting Pickup" value={notified.length}   icon={Bell}         color="text-purple-600" bg="bg-purple-50" />
              <StatCard label="Collected"        value={collected.length}  icon={CheckCircle2} color="text-green-600"  bg="bg-green-50"  />
              <StatCard label="Total Released"   value={myReleased.length} icon={Package}      color="text-blue-600"   bg="bg-blue-50"   />
            </div>
          )}

          {/* Search */}
          <div className="flex gap-3 mb-5">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Search by name or OSCA ID…" value={relSearch} onChange={e => setRelSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white" />
            </div>
          </div>

          {/* Sub-tabs */}
          <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
            {relTabs.map(t => (
              <button key={t.key} onClick={() => setReleaseTab(t.key)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${releaseTab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {t.label}
                {t.badge > 0 && <span className="ml-1.5 bg-[#0f52ba] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{t.badge}</span>}
              </button>
            ))}
          </div>

          {loadingRel ? (
            <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
          ) : (
            <>
              {/* ─ Pending requests (super admin) */}
              {releaseTab === 'requests' && isSuperAdmin && (
                <div>
                  {voidRelReqs.length > 0 && (
                    <div className="mb-4 px-4 py-3 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-700 flex items-start gap-2">
                      <AlertTriangle size={13} className="mt-0.5 text-orange-500 shrink-0" />
                      <span><strong>{voidRelReqs.length}</strong> request(s) are void — user did not complete sign-up.</span>
                    </div>
                  )}
                  {relPending.length > 0 ? (
                    <div className="space-y-3">
                      <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Pending Requests ({relPending.length})</h2>
                      {relPending.map(r => {
                        const isVoid = r.isVoid || (!r.seniorName && !r.fullName && !r.seniorId);
                        const noBday = !hasBirthday(r);
                        return (
                          <div key={r.id} className={`rounded-2xl p-5 flex items-center justify-between border ${isVoid ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-white border-yellow-200'}`}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-semibold text-gray-900">{r.seniorName || r.fullName || 'Unknown'}</p>
                                {isVoid && <span className="text-[10px] font-bold bg-gray-400 text-white px-2 py-0.5 rounded-full">VOID</span>}
                                {noBday && !isVoid && <span className="text-[10px] font-bold bg-red-500 text-white px-2 py-0.5 rounded-full flex items-center gap-1"><AlertTriangle size={8} /> NO BIRTHDAY</span>}
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {r.seniorId ? `OSCA ID: ${r.seniorId}` : ''}
                                {r.barangay ? ` · Brgy. ${r.barangay}` : ''}
                              </p>
                              {r.reason && <p className="text-xs text-gray-400 mt-0.5 italic">Reason: {r.reason}</p>}
                            </div>
                            <div className="flex items-center gap-2 ml-4 shrink-0">
                              <StatusBadge status={isVoid ? 'void' : 'pending'} />
                              {!isVoid && <button onClick={() => setDetailRecord(r)} className="flex items-center gap-1.5 text-xs font-semibold text-[#0f52ba] hover:underline"><Eye size={14} /> Review</button>}
                              <button onClick={() => setDeleteTarget({ id: r.id, name: r.seniorName || 'Unknown', col: 'id_requests' })} className="p-1.5 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50"><Trash2 size={15} /></button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-20 text-gray-400">
                      <FileText size={40} className="mx-auto mb-3 opacity-40" />
                      <p className="font-medium">No pending ID requests</p>
                    </div>
                  )}
                  {relRejected.length > 0 && (
                    <div className="mt-6">
                      <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Rejected ({relRejected.length})</h2>
                      <div className="space-y-2">
                        {relRejected.map(r => (
                          <div key={r.id} className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center justify-between opacity-60">
                            <div>
                              <p className="font-medium text-gray-800">{r.seniorName || r.fullName || 'Unknown'}</p>
                              <p className="text-xs text-gray-400">{r.seniorId ? `OSCA ID: ${r.seniorId}` : ''}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <StatusBadge status="rejected" />
                              <button onClick={() => setDeleteTarget({ id: r.id, name: r.seniorName || 'Unknown', col: 'id_requests' })} className="p-1.5 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50"><Trash2 size={15} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ─ Approved, ready to release (super admin) */}
              {releaseTab === 'approved' && isSuperAdmin && (
                <div>
                  {relApproved.length > 0 ? (
                    <>
                      <div className="mb-4 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 flex items-center gap-2">
                        <ShieldCheck size={13} className="text-blue-500" />
                        Click "Release" to do a final verification of the ID card before sending to the sub-admin.
                      </div>
                      <div className="space-y-3">
                        {relApproved.map(r => (
                          <div key={r.id} className="bg-white border border-green-100 rounded-2xl p-5 flex items-center justify-between">
                            <div>
                              <p className="font-semibold text-gray-900">{r.seniorName || r.fullName || 'Unknown'}</p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {r.seniorId ? `OSCA ID: ${r.seniorId}` : ''}
                                {r.barangay ? ` · Brgy. ${r.barangay}` : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <StatusBadge status="approved" />
                              <button onClick={() => setReleaseRecord(r)} className="flex items-center gap-1.5 bg-[#0f52ba] hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors">
                                <Send size={13} /> Release
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-20 text-gray-400">
                      <CheckCircle2 size={40} className="mx-auto mb-3 opacity-40" />
                      <p className="font-medium">No approved IDs awaiting release</p>
                    </div>
                  )}
                </div>
              )}

              {/* ─ Released (super admin view) */}
              {releaseTab === 'released' && isSuperAdmin && (
                <div>
                  {relReleased.length > 0 ? (
                    <div className="space-y-2">
                      {relReleased.map(r => (
                        <div key={r.id} className="bg-gray-50 border border-gray-100 rounded-2xl p-4 flex items-center justify-between">
                          <div>
                            <p className="font-medium text-gray-800">{r.seniorName || r.fullName || 'Unknown'}</p>
                            <p className="text-xs text-gray-400">
                              {r.seniorId ? `OSCA ID: ${r.seniorId}` : ''}
                              {r.barangay ? ` · Brgy. ${r.barangay}` : ''}
                              {r.releasedAt && ` · Released ${r.releasedAt?.toDate?.()?.toLocaleDateString?.() || '—'}`}
                            </p>
                          </div>
                          <StatusBadge status="released" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-20 text-gray-400">
                      <Send size={40} className="mx-auto mb-3 opacity-40" />
                      <p className="font-medium">No IDs released yet</p>
                    </div>
                  )}
                </div>
              )}

              {/* ─ Sub-admin: My released IDs */}
              {releaseTab === 'released' && isSubAdmin && (
                <div>
                  {notified.length > 0 && (
                    <div className="mb-6">
                      <div className="flex items-center gap-2 mb-3 px-4 py-2.5 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-700 font-medium">
                        <Bell size={13} className="text-purple-500" />
                        You have <strong>{notified.length}</strong> physical ID(s) ready for distribution in your barangay.
                      </div>
                      <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Awaiting Pickup ({notified.length})</h2>
                      <div className="space-y-3">
                        {notified.map(r => (
                          <div key={r.id} className="bg-white border border-purple-100 rounded-2xl p-5 flex items-center justify-between">
                            <div>
                              <p className="font-semibold text-gray-900">{r.seniorName || 'Unknown'}</p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {r.seniorId ? `OSCA ID: ${r.seniorId}` : ''}
                                {r.address ? ` · ${r.address}` : ''}
                              </p>
                              {r.notifiedAt && <p className="text-xs text-purple-400 mt-0.5">Released: {r.notifiedAt?.toDate?.()?.toLocaleDateString?.() || '—'}</p>}
                            </div>
                            <div className="flex items-center gap-2">
                              <StatusBadge status="notified" />
                              <button disabled={processing} onClick={() => handleCollected(r.id)}
                                className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors">
                                <CheckCircle2 size={12} /> Mark Collected
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {collected.length > 0 && (
                    <div>
                      <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Collected ({collected.length})</h2>
                      <div className="space-y-2">
                        {collected.map(r => (
                          <div key={r.id} className="bg-gray-50 border border-gray-100 rounded-2xl p-4 flex items-center justify-between opacity-70">
                            <div>
                              <p className="font-medium text-gray-700">{r.seniorName || 'Unknown'}</p>
                              <p className="text-xs text-gray-400">Collected: {r.collectedAt?.toDate?.()?.toLocaleDateString?.() || '—'}</p>
                            </div>
                            <StatusBadge status="collected" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {myReleased.length === 0 && (
                    <div className="text-center py-20 text-gray-400">
                      <Package size={40} className="mx-auto mb-3 opacity-40" />
                      <p className="font-medium">No IDs assigned to your barangay yet</p>
                      <p className="text-xs mt-1">Super admin will release IDs to you when they're ready</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      <style>{`
        @keyframes fade-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fade-in 0.2s ease-out; }
      `}</style>
    </div>
  );
}
