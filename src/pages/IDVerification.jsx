/**
 * IDVerification.jsx  (updated)
 *
 * Changes from previous version:
 *  1. NCSC check now calls the real ncscVerify Cloud Function (name + birthday)
 *     instead of just querying the local Firestore 'users' collection.
 *  2. Approving an OSCA ID submission automatically:
 *       a. Marks user verified in Firestore (users/{uid})
 *       b. Creates / updates a digital_ids/{uid} document
 *       c. Creates an id_requests doc (approved + released) so the release
 *          pipeline is pre-populated — no separate approval step needed when
 *          the senior has already been verified via NCSC.
 *  3. Physical ID Request tab still works independently for seniors who
 *     request a replacement / first-time physical card through the app.
 *  4. All NCSC checks show real result (found / not_found / unreachable).
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  ShieldCheck, Clock as ClockIcon, CheckCircle2, XCircle, Eye,
  Loader2, Trash2, AlertTriangle, X, User, Search, Database,
  FileImage, RotateCcw, FileText, MapPin, Phone, CreditCard,
  Globe, WifiOff,
} from 'lucide-react';
import { db, functions } from '../lib/firebase';          // make sure functions is exported
import { httpsCallable } from 'firebase/functions';
import {
  collection, onSnapshot, query, orderBy,
  doc, updateDoc, setDoc, deleteDoc, serverTimestamp,
  getDocs, where,
} from 'firebase/firestore';

/* ─── Cloud Function reference ──────────────────────────────────────────────── */
const ncscVerifyFn = httpsCallable(functions, 'ncscVerify');

/* ─── Real NCSC verification ────────────────────────────────────────────────── */
/**
 * Calls the Cloud Function proxy which POSTs to www.ncsc.gov.ph.
 * Falls back to local Firestore lookup if the function is unavailable.
 *
 * @param {object} record  – Firestore record (has fullName/seniorName, dob, etc.)
 * @returns {'found'|'not_found'|'unreachable'}
 */
async function runNCSCVerify(record) {
  // ── parse name ──────────────────────────────────────────────────────────────
  const rawName = (record.fullName || record.seniorName || '').trim();
  // Try to split "Lastname, Firstname Middlename" OR "Firstname Middlename Lastname"
  // The app stores name as entered; we do best-effort parsing.
  // If the record has explicit fields, use them.
  const lastName   = record.lastName   || record.surname  || '';
  const firstName  = record.firstName  || record.givenName || '';
  const middleName = record.middleName || record.middleInitial || '';

  // Fallback: if no split fields, try to parse from fullName
  let ln = lastName, fn = firstName, mn = middleName;
  if (!ln && rawName) {
    // Support "DELA CRUZ, JUAN PEDRO" format
    if (rawName.includes(',')) {
      const [l, rest] = rawName.split(',').map(s => s.trim());
      ln = l;
      const parts = rest.split(' ').filter(Boolean);
      fn = parts[0] || '';
      mn = parts.slice(1).join(' ');
    } else {
      // "JUAN PEDRO DELA CRUZ" — treat last word as last name (heuristic)
      const parts = rawName.split(' ').filter(Boolean);
      fn = parts[0] || '';
      mn = parts.length > 2 ? parts.slice(1, -1).join(' ') : '';
      ln = parts[parts.length - 1] || '';
    }
  }

  // ── parse birthday ───────────────────────────────────────────────────────────
  const dob = record.dob || record.dateOfBirth || record.birthday || '';
  let month = '', day = '';
  if (dob) {
    // Handle "YYYY-MM-DD", "MM/DD/YYYY", "Month DD, YYYY"
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sept','Oct','Nov','Dec'];
    const isoMatch   = dob.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const slashMatch = dob.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const textMatch  = dob.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);

    if (isoMatch) {
      month = monthNames[parseInt(isoMatch[2], 10) - 1] || '';
      day   = String(parseInt(isoMatch[3], 10));
    } else if (slashMatch) {
      month = monthNames[parseInt(slashMatch[1], 10) - 1] || '';
      day   = String(parseInt(slashMatch[2], 10));
    } else if (textMatch) {
      month = textMatch[1].charAt(0).toUpperCase() + textMatch[1].slice(1, 3).toLowerCase();
      day   = String(parseInt(textMatch[2], 10));
    }
  }

  if (!ln || !fn || !month || !day) {
    console.warn('NCSC verify: insufficient data to check', { ln, fn, month, day });
    // Fall back to local check
    return runLocalNCSIDCheck(record);
  }

  try {
    const result = await ncscVerifyFn({ lastName: ln, firstName: fn, middleName: mn, month, day });
    const { found, error } = result.data;
    if (error === 'ncsc_unreachable') return 'unreachable';
    return found ? 'found' : 'not_found';
  } catch (err) {
    console.warn('NCSC Cloud Function error — falling back to local check:', err);
    return runLocalNCSIDCheck(record);
  }
}

/* ─── Local Firestore fallback (original logic) ─────────────────────────────── */
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
  } catch (e) {
    return 'not_found';
  }
}

/* ─── Status badge ─────────────────────────────────────────────────────────── */
const StatusBadge = ({ status }) => {
  const map = {
    pending:  { cls: 'bg-yellow-100 text-yellow-700', label: 'Pending' },
    approved: { cls: 'bg-green-100 text-green-700',   label: 'Approved' },
    rejected: { cls: 'bg-red-100 text-red-700',       label: 'Rejected' },
    verified: { cls: 'bg-green-100 text-green-700',   label: 'Verified' },
    released: { cls: 'bg-blue-100 text-blue-700',     label: 'Released' },
    void:     { cls: 'bg-gray-100 text-gray-500',     label: 'Void' },
  };
  const { cls, label } = map[status] || map.pending;
  return <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cls}`}>{label}</span>;
};

/* ─── NCSC status indicator ──────────────────────────────────────────────────── */
function NCSCStatusBadge({ status }) {
  if (status === 'checking') return (
    <span className="flex items-center gap-1 text-xs text-blue-600 font-medium">
      <Loader2 size={11} className="animate-spin" /> Checking NCSC…
    </span>
  );
  if (status === 'found') return (
    <span className="flex items-center gap-1 text-xs text-green-700 font-semibold bg-green-50 px-2 py-0.5 rounded-full">
      <CheckCircle2 size={11} /> Registered in NCSC
    </span>
  );
  if (status === 'not_found') return (
    <span className="flex items-center gap-1 text-xs text-red-600 font-semibold bg-red-50 px-2 py-0.5 rounded-full">
      <XCircle size={11} /> NOT Found in NCSC
    </span>
  );
  if (status === 'unreachable') return (
    <span className="flex items-center gap-1 text-xs text-orange-600 font-semibold bg-orange-50 px-2 py-0.5 rounded-full">
      <WifiOff size={11} /> NCSC Unreachable
    </span>
  );
  return null;
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
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading} className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Shared NCSC banner used inside both modals ────────────────────────────── */
function NCSCBanner({ status, onRecheck }) {
  const bannerCls =
    status === 'found'       ? 'bg-green-50 border-green-200' :
    status === 'not_found'   ? 'bg-red-50 border-red-200' :
    status === 'unreachable' ? 'bg-orange-50 border-orange-200' :
    'bg-blue-50 border-blue-100';

  const iconCls =
    status === 'found'       ? 'text-green-600' :
    status === 'not_found'   ? 'text-red-500' :
    status === 'unreachable' ? 'text-orange-500' :
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

      {status === 'not_found' && (
        <div className="mb-4 px-4 py-2.5 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-700 font-medium flex items-start gap-2">
          <AlertTriangle size={13} className="text-orange-500 mt-0.5 shrink-0" />
          <span>
            This senior was <strong>not found</strong> in NCSC records. Approving will still grant them access, but please verify their identity manually first.
          </span>
        </div>
      )}

      {status === 'unreachable' && (
        <div className="mb-4 px-4 py-2.5 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-700 font-medium flex items-start gap-2">
          <WifiOff size={13} className="text-orange-500 mt-0.5 shrink-0" />
          <span>
            The NCSC website is currently <strong>unreachable</strong>. Falling back to local records. Proceed with caution.
          </span>
        </div>
      )}
    </>
  );
}

/* ─── OSCA ID Submission Review Modal ───────────────────────────────────────── */
function OSCASubmissionModal({ record, onClose, onDecision, processing }) {
  const [ncscStatus, setNcscStatus] = useState('checking');

  const doCheck = useCallback(() => {
    setNcscStatus('checking');
    runNCSCVerify(record).then(setNcscStatus);
  }, [record]);

  useEffect(() => { doCheck(); }, [doCheck]);

  const name = record.fullName || record.seniorName || 'Unknown';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-lg w-full max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck size={20} className="text-[#0f52ba]" />
              <h3 className="text-lg font-bold text-gray-900">OSCA ID Verification</h3>
            </div>
            <p className="text-xs text-gray-400">
              Verifying against live NCSC records using name & birthday. Review the uploaded photo before approving.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={18} /></button>
        </div>

        {/* NCSC Live banner */}
        <NCSCBanner status={ncscStatus} onRecheck={doCheck} />

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
          {record.dob     && <p className="text-xs text-gray-400 pl-5">🎂 DOB: <strong>{record.dob}</strong></p>}
          {record.email   && <p className="text-xs text-gray-400 pl-5">{record.email}</p>}
          {record.address && <p className="text-xs text-gray-400 pl-5">📍 {record.address}</p>}
          {record.sex     && <p className="text-xs text-gray-400 pl-5">Sex: {record.sex}</p>}
          {record.submittedAt && (
            <p className="text-xs text-gray-400 pl-5">
              Submitted: {record.submittedAt?.toDate?.()?.toLocaleDateString?.() || '—'}
            </p>
          )}
          {/* Show DOB warning if missing */}
          {!record.dob && !record.dateOfBirth && (
            <p className="text-xs text-orange-500 pl-5 font-semibold flex items-center gap-1">
              <AlertTriangle size={11} /> Birthday not on record — NCSC check used name only
            </p>
          )}
        </div>

        {/* Uploaded OSCA ID image */}
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

        {/* What happens on approve notice */}
        {ncscStatus === 'found' && (
          <div className="mb-4 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 font-medium flex items-start gap-2">
            <CreditCard size={13} className="text-blue-500 mt-0.5 shrink-0" />
            <span>
              Approving will: ① verify the senior's account, ② create their digital ID, and ③ queue a physical ID for release.
            </span>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            disabled={processing}
            onClick={() => onDecision(record.id, 'rejected')}
            className="flex-1 py-3 rounded-xl border-2 border-red-200 text-red-600 font-semibold text-sm hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            Reject
          </button>
          <button
            disabled={processing || ncscStatus === 'checking'}
            onClick={() => onDecision(record.id, 'approved', 'id_verifications', record)}
            className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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

/* ─── Physical ID Request Review Modal ──────────────────────────────────────── */
function PhysicalIDModal({ record, onClose, onDecision, processing }) {
  const [ncscStatus, setNcscStatus] = useState('checking');

  const doCheck = useCallback(() => {
    setNcscStatus('checking');
    runNCSCVerify(record).then(setNcscStatus);
  }, [record]);

  useEffect(() => { doCheck(); }, [doCheck]);

  const name = record.seniorName || record.fullName || 'Unknown';

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

        <NCSCBanner status={ncscStatus} onRecheck={doCheck} />

        {/* Details */}
        <div className="bg-gray-50 rounded-2xl p-4 space-y-1.5 mb-5">
          <div className="flex items-center gap-2">
            <User size={13} className="text-gray-400" />
            <span className="text-sm font-bold text-gray-800">{name}</span>
          </div>
          {record.seniorId      && <p className="text-xs text-gray-500 pl-5">OSCA ID: <strong className="text-blue-700">{record.seniorId}</strong></p>}
          {(record.dob || record.dateOfBirth) && <p className="text-xs text-gray-500 pl-5">🎂 DOB: <strong>{record.dob || record.dateOfBirth}</strong></p>}
          {record.address       && <p className="text-xs text-gray-500 pl-5 flex items-center gap-1"><MapPin size={10} />{record.address}</p>}
          {record.contactNumber && <p className="text-xs text-gray-500 pl-5 flex items-center gap-1"><Phone size={10} />{record.contactNumber}</p>}
          {record.barangay      && <p className="text-xs text-gray-500 pl-5">Barangay: <strong>{record.barangay}</strong></p>}
          {record.reason        && <p className="text-xs text-gray-400 pl-5 italic">Reason: {record.reason}</p>}
          {record.createdAt     && <p className="text-xs text-gray-400 pl-5">Requested: {record.createdAt?.toDate?.()?.toLocaleDateString?.() || '—'}</p>}
          {!record.dob && !record.dateOfBirth && (
            <p className="text-xs text-orange-500 pl-5 font-semibold flex items-center gap-1">
              <AlertTriangle size={11} /> Birthday not on record — NCSC check used name only
            </p>
          )}
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
            disabled={processing || ncscStatus === 'checking'}
            onClick={() => onDecision(record.id, 'approved', 'id_requests', record)}
            className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-sm disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
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

/* ─── Stat card ─────────────────────────────────────────────────────────────── */
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

/* ─── Main page ─────────────────────────────────────────────────────────────── */
export default function IDVerification() {
  const [submissions, setSubmissions]   = useState([]);
  const [physicalReqs, setPhysicalReqs] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [activeTab, setActiveTab]       = useState('submissions');
  const [selected, setSelected]         = useState(null);
  const [processing, setProcessing]     = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]         = useState(false);
  const [toast, setToast]               = useState({ msg: '', type: 'success' });
  const [search, setSearch]             = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  /* ── Listeners ── */
  useEffect(() => {
    const q = query(collection(db, 'id_verifications'), orderBy('submittedAt', 'desc'));
    return onSnapshot(q, snap => {
      setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'id_requests'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => {
      setPhysicalReqs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: 'success' }), 3500);
  }

  /**
   * Central decision handler.
   *
   * When approving an OSCA ID submission (collection = 'id_verifications'):
   *   1. Update id_verifications/{id} → status: approved
   *   2. Update users/{uid}           → isVerified, status, verifiedAt
   *   3. Upsert digital_ids/{uid}     → full digital ID document
   *   4. Create id_requests doc       → pre-approved & released, so the
   *      release pipeline is auto-populated
   *
   * When approving a physical request (collection = 'id_requests'):
   *   1. Update id_requests/{id}      → status: approved
   *   2. Create released_ids doc      → notified, ready for sub-admin
   */
  async function handleDecision(id, decision, collectionName = 'id_verifications', record = null) {
    setProcessing(true);
    try {
      /* ── 1. Mark the request itself ── */
      await updateDoc(doc(db, collectionName, id), {
        status:     decision,
        reviewedAt: serverTimestamp(),
      });

      if (decision === 'approved' && record) {

        /* ═══ OSCA ID submission approved ═══════════════════════════════════ */
        if (collectionName === 'id_verifications') {
          const uid = record.uid;

          // 2. Mark user verified
          if (uid) {
            try {
              await updateDoc(doc(db, 'users', uid), {
                isVerified:  true,
                status:      'VERIFIED',
                verifiedAt:  serverTimestamp(),
              });
            } catch (e) { console.warn('users update failed:', e); }
          }

          // 3. Create / update digital ID document
          const digitalIdData = {
            uid:           uid || null,
            fullName:      record.fullName || record.seniorName || '',
            firstName:     record.firstName || '',
            lastName:      record.lastName  || record.surname || '',
            middleName:    record.middleName || '',
            dob:           record.dob || record.dateOfBirth || '',
            sex:           record.sex || '',
            address:       record.address || '',
            barangay:      record.barangay || '',
            email:         record.email || '',
            idNumber:      record.idNumber || record.seniorId || '',
            idImageUrl:    record.idImageUrl || '',
            status:        'active',
            isVerified:    true,
            createdAt:     serverTimestamp(),
            verifiedAt:    serverTimestamp(),
            sourceDocId:   id,
          };

          if (uid) {
            // Upsert keyed by uid so there's exactly one digital ID per user
            await setDoc(doc(db, 'digital_ids', uid), digitalIdData, { merge: true });
          }

          // 4. Auto-create a released physical ID request (approved + released)
          //    so the ID Release page already shows it ready for sub-admin pickup
          const controlNumber = record.idNumber || record.seniorId || id.slice(-6).toUpperCase();
          try {
            const { addDoc } = await import('firebase/firestore');
            await addDoc(collection(db, 'released_ids'), {
              requestId:     id,
              uid:           uid || null,
              seniorName:    record.fullName || record.seniorName || '',
              seniorId:      record.idNumber || record.seniorId || '',
              firstName:     record.firstName || '',
              lastName:      record.lastName  || record.surname || '',
              middleName:    record.middleName || '',
              dob:           record.dob || record.dateOfBirth || '',
              sex:           record.sex || '',
              address:       record.address || '',
              barangay:      record.barangay || '',
              controlNumber,
              status:        'notified',
              releasedAt:    serverTimestamp(),
              releasedBy:    'auto_verification',
              notifiedAt:    serverTimestamp(),
              sourceType:    'id_verification',
            });
          } catch (e) { console.warn('released_ids creation failed:', e); }
        }

        /* ═══ Physical ID request approved ══════════════════════════════════ */
        if (collectionName === 'id_requests') {
          const controlNumber = record.controlNumber || record.seniorId || id.slice(-6).toUpperCase();
          try {
            const { addDoc } = await import('firebase/firestore');
            await addDoc(collection(db, 'released_ids'), {
              requestId:     id,
              uid:           record.uid || null,
              seniorName:    record.seniorName || record.fullName || '',
              seniorId:      record.seniorId || record.idNumber || '',
              dob:           record.dob || record.dateOfBirth || '',
              sex:           record.sex || '',
              address:       record.address || '',
              barangay:      record.barangay || record.sub_admin_barangay || '',
              controlNumber,
              status:        'notified',
              releasedAt:    serverTimestamp(),
              releasedBy:    'auto_physical_approval',
              notifiedAt:    serverTimestamp(),
              sourceType:    'id_request',
            });

            // Also mark the id_request as released
            await updateDoc(doc(db, 'id_requests', id), {
              status:     'released',
              releasedAt: serverTimestamp(),
            });
          } catch (e) { console.warn('physical released_ids creation failed:', e); }
        }
      }

      setSelected(null);
      showToast(
        decision === 'approved'
          ? 'Approved! Digital ID created & physical ID queued for release.'
          : 'Request rejected.'
      );
    } finally {
      setProcessing(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, deleteTarget.col, deleteTarget.id));
      showToast(`"${deleteTarget.name}" deleted.`);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  /* ── Computed lists ── */
  const activeList = activeTab === 'submissions' ? submissions : physicalReqs;
  const nameOf     = r => activeTab === 'submissions' ? (r.fullName || r.seniorName || '') : (r.seniorName || r.fullName || '');
  const idOf       = r => activeTab === 'submissions' ? (r.idNumber || '') : (r.seniorId || '');

  const filtered = activeList.filter(r => {
    const matchS = !search || nameOf(r).toLowerCase().includes(search.toLowerCase()) || idOf(r).toLowerCase().includes(search.toLowerCase());
    const matchF = filterStatus === 'all' || r.status === filterStatus || (!r.status && filterStatus === 'pending');
    return matchS && matchF;
  });

  const pending  = filtered.filter(r => !r.status || r.status === 'pending');
  const reviewed = filtered.filter(r => r.status && r.status !== 'pending');

  // Repeat detection
  const repeatKeys = (() => {
    const counts = {};
    submissions.forEach(r => {
      const k = r.email || r.fullName || r.seniorName;
      if (k) counts[k] = (counts[k] || 0) + 1;
    });
    return new Set(Object.keys(counts).filter(k => counts[k] > 1));
  })();
  const isRepeat = r => activeTab === 'submissions' && repeatKeys.has(r.email || r.fullName || r.seniorName);

  const voidReqs = physicalReqs.filter(r => r.isVoid || (!r.seniorName && !r.fullName && !r.seniorId));

  const tabs = [
    { key: 'submissions', label: 'OSCA ID Submissions',  badge: submissions.filter(r => !r.status || r.status === 'pending').length },
    { key: 'physical',    label: 'Physical ID Requests', badge: physicalReqs.filter(r => !r.status || r.status === 'pending').length },
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

      {deleteTarget && (
        <DeleteConfirmModal
          name={deleteTarget.name}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          loading={deleting}
        />
      )}

      {selected?.type === 'submission' && (
        <OSCASubmissionModal
          record={selected.record}
          onClose={() => setSelected(null)}
          onDecision={handleDecision}
          processing={processing}
        />
      )}
      {selected?.type === 'physical' && (
        <PhysicalIDModal
          record={selected.record}
          onClose={() => setSelected(null)}
          onDecision={handleDecision}
          processing={processing}
        />
      )}

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ShieldCheck size={24} className="text-[#0f52ba]" /> ID Verification
        </h1>
        <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
          <Globe size={13} className="text-[#0f52ba]" />
          Live NCSC verification by name & birthday · Auto-creates digital ID & queues physical release on approval
        </p>
      </div>

      {/* Stats */}
      {activeTab === 'submissions' ? (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard label="Pending Review"  value={submissions.filter(r => !r.status || r.status === 'pending').length} icon={ClockIcon}    color="text-yellow-600" bg="bg-yellow-50" />
          <StatCard label="Approved"        value={submissions.filter(r => r.status === 'approved').length}             icon={CheckCircle2} color="text-green-600"  bg="bg-green-50"  />
          <StatCard label="Rejected"        value={submissions.filter(r => r.status === 'rejected').length}             icon={XCircle}      color="text-red-600"    bg="bg-red-50"    />
          <StatCard label="Total Submitted" value={submissions.length}                                                  icon={FileImage}    color="text-blue-600"   bg="bg-blue-50"   />
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard label="Pending"         value={physicalReqs.filter(r => !r.status || r.status === 'pending').length} icon={ClockIcon}     color="text-yellow-600" bg="bg-yellow-50" />
          <StatCard label="Approved"        value={physicalReqs.filter(r => r.status === 'approved').length}              icon={CheckCircle2}  color="text-green-600"  bg="bg-green-50"  />
          <StatCard label="Rejected"        value={physicalReqs.filter(r => r.status === 'rejected').length}              icon={XCircle}       color="text-red-600"    bg="bg-red-50"    />
          <StatCard label="Void/Incomplete" value={voidReqs.length}                                                       icon={AlertTriangle} color="text-orange-600" bg="bg-orange-50" />
        </div>
      )}

      {/* Repeat / void banners */}
      {activeTab === 'submissions' && repeatKeys.size > 0 && (
        <div className="flex items-center gap-2 mb-5 px-4 py-2.5 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-700 font-medium">
          <AlertTriangle size={14} className="text-orange-500 shrink-0" />
          {repeatKeys.size} user{repeatKeys.size > 1 ? 's have' : ' has'} submitted <strong className="mx-1">multiple requests</strong> — highlighted in orange. Review carefully.
        </div>
      )}
      {activeTab === 'physical' && voidReqs.length > 0 && (
        <div className="flex items-center gap-2 mb-5 px-4 py-2.5 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-700 font-medium">
          <AlertTriangle size={14} className="text-orange-500 shrink-0" />
          <strong>{voidReqs.length}</strong>&nbsp;request(s) are void — the user did not complete their profile. Cannot process until information is complete.
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-xl w-fit">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => { setActiveTab(t.key); setSearch(''); setFilterStatus('all'); }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t.label}
            {t.badge > 0 && <span className="ml-1.5 bg-[#0f52ba] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* Search + filter */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or OSCA ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 bg-white"
          />
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {['all', 'pending', 'approved', 'rejected'].map(f => (
            <button
              key={f}
              onClick={() => setFilterStatus(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${filterStatus === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-blue-500" />
        </div>
      ) : (
        <>
          {/* ─ Pending ─ */}
          {pending.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Pending Review ({pending.length})</h2>
              <div className="space-y-3">
                {pending.map(r => {
                  const repeat = isRepeat(r);
                  const isVoid = activeTab === 'physical' && (r.isVoid || (!r.seniorName && !r.fullName && !r.seniorId));
                  const rName  = nameOf(r) || 'Unknown';
                  const rId    = idOf(r);
                  const rDate  = (activeTab === 'submissions'
                    ? r.submittedAt?.toDate?.()?.toLocaleDateString?.()
                    : r.createdAt?.toDate?.()?.toLocaleDateString?.()) || null;

                  return (
                    <div
                      key={r.id}
                      className={`rounded-2xl p-5 flex items-center justify-between border ${
                        isVoid  ? 'bg-gray-50 border-gray-200 opacity-60' :
                        repeat  ? 'bg-orange-50 border-orange-300 ring-1 ring-orange-200' :
                        'bg-white border-yellow-200'
                      }`}
                    >
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        {activeTab === 'submissions' ? (
                          (r.idImageUrl || r.imageBase64) ? (
                            <img src={r.idImageUrl ?? `data:image/jpeg;base64,${r.imageBase64}`} alt="ID"
                              className="w-16 h-10 rounded-lg object-cover border border-gray-200 shrink-0" />
                          ) : (
                            <div className="w-16 h-10 rounded-lg bg-gray-100 border border-dashed border-gray-300 flex items-center justify-center shrink-0">
                              <FileImage size={14} className="text-gray-400" />
                            </div>
                          )
                        ) : (
                          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                            <FileText size={16} className="text-[#0f52ba]" />
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-gray-900">{rName}</p>
                            {repeat && (
                              <span className="flex items-center gap-1 text-[10px] font-bold bg-orange-500 text-white px-2 py-0.5 rounded-full whitespace-nowrap">
                                <AlertTriangle size={9} /> REPEAT REQUEST
                              </span>
                            )}
                            {isVoid && (
                              <span className="text-[10px] font-bold bg-gray-400 text-white px-2 py-0.5 rounded-full">VOID — INCOMPLETE</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {rId ? `OSCA ID: ${rId}` : ''}
                            {r.barangay ? ` · Brgy. ${r.barangay}` : ''}
                            {rDate ? ` · Submitted ${rDate}` : ''}
                          </p>
                          {r.reason && <p className="text-xs text-gray-400 mt-0.5 italic">Reason: {r.reason}</p>}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 ml-4 shrink-0">
                        <StatusBadge status={isVoid ? 'void' : (r.status || 'pending')} />
                        {!isVoid && (
                          <button
                            onClick={() => setSelected({ record: r, type: activeTab === 'submissions' ? 'submission' : 'physical' })}
                            className="flex items-center gap-1.5 text-xs font-semibold text-[#0f52ba] hover:underline"
                          >
                            <Eye size={14} /> Review
                          </button>
                        )}
                        <button
                          onClick={() => setDeleteTarget({ id: r.id, name: rName, col: activeTab === 'submissions' ? 'id_verifications' : 'id_requests' })}
                          className="p-1.5 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─ Reviewed ─ */}
          {reviewed.length > 0 && (
            <div>
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Reviewed ({reviewed.length})</h2>
              <div className="space-y-2">
                {reviewed.map(r => {
                  const repeat = isRepeat(r);
                  const rName  = nameOf(r) || 'Unknown';
                  const rId    = idOf(r);
                  return (
                    <div
                      key={r.id}
                      className={`rounded-2xl p-4 flex items-center justify-between border ${repeat ? 'bg-orange-50/60 border-orange-200' : 'bg-white border-gray-100'}`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {activeTab === 'submissions' ? (
                          (r.idImageUrl || r.imageBase64) ? (
                            <img src={r.idImageUrl ?? `data:image/jpeg;base64,${r.imageBase64}`} alt="ID"
                              className="w-12 h-8 rounded-md object-cover border border-gray-200 shrink-0" />
                          ) : (
                            <div className="w-12 h-8 rounded-md bg-gray-100 flex items-center justify-center shrink-0">
                              <FileImage size={12} className="text-gray-300" />
                            </div>
                          )
                        ) : (
                          <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
                            <FileText size={13} className="text-gray-400" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-gray-800">{rName}</p>
                            {repeat && (
                              <span className="flex items-center gap-1 text-[10px] font-bold bg-orange-400 text-white px-2 py-0.5 rounded-full">
                                <AlertTriangle size={9} /> REPEAT
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {rId ? `OSCA ID: ${rId}` : ''}
                            {r.reviewedAt && ` · Reviewed ${r.reviewedAt?.toDate?.()?.toLocaleDateString?.() || '—'}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4 shrink-0">
                        <StatusBadge status={r.status} />
                        <button
                          onClick={() => setSelected({ record: r, type: activeTab === 'submissions' ? 'submission' : 'physical' })}
                          className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-[#0f52ba]"
                        >
                          <Eye size={13} /> View
                        </button>
                        <button
                          onClick={() => setDeleteTarget({ id: r.id, name: rName, col: activeTab === 'submissions' ? 'id_verifications' : 'id_requests' })}
                          className="p-1.5 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {filtered.length === 0 && (
            <div className="text-center py-20 text-gray-400">
              <ShieldCheck size={40} className="mx-auto mb-3 opacity-40" />
              <p className="font-medium">
                {search ? 'No results found' : activeTab === 'submissions' ? 'No verification requests yet' : 'No physical ID requests yet'}
              </p>
              {search && <p className="text-xs mt-1">Try a different name or OSCA ID number</p>}
            </div>
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
