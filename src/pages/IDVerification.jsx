import React, { useEffect, useState } from 'react';
import {
  ShieldCheck, Clock as ClockIcon, CheckCircle2, XCircle, Eye,
  Loader2, Trash2, AlertTriangle, X, User, Search, Database,
  FileImage, RotateCcw, FileText, MapPin, Phone,
} from 'lucide-react';
import { db } from '../lib/firebase';
import {
  collection, onSnapshot, query, orderBy,
  doc, updateDoc, deleteDoc, serverTimestamp, getDocs, where,
} from 'firebase/firestore';

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

/* ─── Delete confirm modal ─────────────────────────────────────────────────── */
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

/* ─── NCSID Check indicator ─────────────────────────────────────────────────── */
function NCSIDStatus({ status }) {
  if (status === 'checking') return (
    <span className="flex items-center gap-1 text-xs text-blue-600 font-medium">
      <Loader2 size={11} className="animate-spin" /> Checking NCSID…
    </span>
  );
  if (status === 'found') return (
    <span className="flex items-center gap-1 text-xs text-green-700 font-semibold bg-green-50 px-2 py-0.5 rounded-full">
      <CheckCircle2 size={11} /> Registered in NCSID
    </span>
  );
  if (status === 'not_found') return (
    <span className="flex items-center gap-1 text-xs text-red-600 font-semibold bg-red-50 px-2 py-0.5 rounded-full">
      <XCircle size={11} /> NOT in NCSID
    </span>
  );
  return null;
}

/* ─── NCSID check helper ─────────────────────────────────────────────────────── */
async function runNCSIDCheck(record) {
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
    console.warn('NCSID check failed:', e);
    return 'not_found';
  }
}

/* ─── OSCA ID Submission Review Modal ───────────────────────────────────────── */
function OSCASubmissionModal({ record, onClose, onDecision, processing }) {
  const [ncsidStatus, setNcsidStatus] = useState(null);

  useEffect(() => {
    setNcsidStatus('checking');
    runNCSIDCheck(record).then(setNcsidStatus);
  }, [record]);

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
              Review the submitted OSCA ID image and confirm the senior's details before approving.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X size={18} />
          </button>
        </div>

        {/* NCSID status banner */}
        <div className={`rounded-xl px-4 py-3 mb-4 flex items-center justify-between ${
          ncsidStatus === 'found'     ? 'bg-green-50 border border-green-200' :
          ncsidStatus === 'not_found' ? 'bg-red-50 border border-red-200' :
          'bg-blue-50 border border-blue-100'
        }`}>
          <div className="flex items-center gap-2">
            <Database size={14} className={
              ncsidStatus === 'found'     ? 'text-green-600' :
              ncsidStatus === 'not_found' ? 'text-red-500' :
              'text-blue-500'
            } />
            <span className="text-xs font-semibold text-gray-700">NCSID Registration Check</span>
          </div>
          <NCSIDStatus status={ncsidStatus} />
          <button
            onClick={() => { setNcsidStatus('checking'); runNCSIDCheck(record).then(setNcsidStatus); }}
            title="Re-check"
            className="ml-2 text-gray-400 hover:text-gray-600"
          >
            <RotateCcw size={12} />
          </button>
        </div>

        {ncsidStatus === 'not_found' && (
          <div className="mb-4 px-4 py-2.5 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-700 font-medium flex items-start gap-2">
            <AlertTriangle size={13} className="text-orange-500 mt-0.5 shrink-0" />
            <span>This senior was <strong>not found</strong> in the OSCA registration records (NCSID). Approving will grant them a digital ID even though they may not be officially registered. Proceed with caution.</span>
          </div>
        )}

        {/* Senior info */}
        <div className="bg-gray-50 rounded-2xl px-4 py-3 mb-5 space-y-2">
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
          {record.email   && <p className="text-xs text-gray-400 pl-5">{record.email}</p>}
          {record.address && <p className="text-xs text-gray-400 pl-5">📍 {record.address}</p>}
          {record.dob     && <p className="text-xs text-gray-400 pl-5">🎂 DOB: {record.dob}</p>}
          {record.sex     && <p className="text-xs text-gray-400 pl-5">Sex: {record.sex}</p>}
          {record.submittedAt && (
            <p className="text-xs text-gray-400 pl-5">
              Submitted: {record.submittedAt?.toDate?.()?.toLocaleDateString?.() || '—'}
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
            disabled={processing || ncsidStatus === 'checking'}
            onClick={() => onDecision(record.id, 'approved')}
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

/* ─── Physical ID Request Review Modal (with NCSID check before approve) ────── */
function PhysicalIDModal({ record, onClose, onDecision, processing }) {
  const [ncsidStatus, setNcsidStatus] = useState(null);

  useEffect(() => {
    setNcsidStatus('checking');
    runNCSIDCheck(record).then(setNcsidStatus);
  }, [record]);

  const name = record.seniorName || record.fullName || 'Unknown';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <FileText size={18} className="text-[#0f52ba]" /> Physical ID Request
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">Review and verify against NCSID before approving</p>
          </div>
          <button onClick={onClose}><X size={18} className="text-gray-400 hover:text-gray-600" /></button>
        </div>

        {/* NCSID check */}
        <div className={`rounded-xl px-4 py-3 mb-4 flex items-center justify-between ${
          ncsidStatus === 'found'     ? 'bg-green-50 border border-green-200' :
          ncsidStatus === 'not_found' ? 'bg-red-50 border border-red-200' :
          'bg-blue-50 border border-blue-100'
        }`}>
          <div className="flex items-center gap-2">
            <Database size={14} className="text-gray-500" />
            <span className="text-xs font-semibold text-gray-700">NCSID Registration Check</span>
          </div>
          <NCSIDStatus status={ncsidStatus} />
          <button
            onClick={() => { setNcsidStatus('checking'); runNCSIDCheck(record).then(setNcsidStatus); }}
            title="Re-check"
            className="ml-2 text-gray-400 hover:text-gray-600"
          >
            <RotateCcw size={12} />
          </button>
        </div>

        {ncsidStatus === 'not_found' && (
          <div className="mb-4 px-4 py-2.5 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-700 font-medium flex items-start gap-2">
            <AlertTriangle size={13} className="mt-0.5 text-orange-500 shrink-0" />
            This senior is not found in NCSID records. Please verify their identity manually before approving.
          </div>
        )}

        {/* Details */}
        <div className="bg-gray-50 rounded-2xl p-4 space-y-2 mb-5">
          <div className="flex items-center gap-2"><User size={13} className="text-gray-400" /><span className="text-sm font-bold text-gray-800">{name}</span></div>
          {record.seniorId      && <p className="text-xs text-gray-500 pl-5">OSCA ID: <strong className="text-blue-700">{record.seniorId}</strong></p>}
          {record.address       && <p className="text-xs text-gray-500 pl-5 flex items-center gap-1"><MapPin size={10} />{record.address}</p>}
          {record.contactNumber && <p className="text-xs text-gray-500 pl-5 flex items-center gap-1"><Phone size={10} />{record.contactNumber}</p>}
          {record.barangay      && <p className="text-xs text-gray-500 pl-5">Barangay: <strong>{record.barangay}</strong></p>}
          {record.reason        && <p className="text-xs text-gray-400 pl-5 italic">Reason: {record.reason}</p>}
          {record.createdAt     && <p className="text-xs text-gray-400 pl-5">Requested: {record.createdAt?.toDate?.()?.toLocaleDateString?.() || '—'}</p>}
        </div>

        <div className="flex gap-3">
          <button
            disabled={processing}
            onClick={() => onDecision(record.id, 'rejected', 'id_requests')}
            className="flex-1 py-3 rounded-xl border-2 border-red-200 text-red-600 font-semibold text-sm hover:bg-red-50 disabled:opacity-50 transition-colors"
          >
            Reject
          </button>
          <button
            disabled={processing || ncsidStatus === 'checking'}
            onClick={() => onDecision(record.id, 'approved', 'id_requests')}
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

/* ─── Stat Card ─────────────────────────────────────────────────────────────── */
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
  // OSCA ID Submissions (signup uploads) — collection: id_verifications
  const [submissions, setSubmissions]   = useState([]);
  // Physical ID Requests — collection: id_requests
  const [physicalReqs, setPhysicalReqs] = useState([]);

  const [loading, setLoading]           = useState(true);
  const [activeTab, setActiveTab]       = useState('submissions');
  const [selected, setSelected]         = useState(null); // { record, type: 'submission'|'physical' }
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
    setTimeout(() => setToast({ msg: '', type: 'success' }), 3000);
  }

  /* ── Handle approve/reject ── */
  async function handleDecision(id, decision, collectionName = 'id_verifications') {
    setProcessing(true);
    try {
      await updateDoc(doc(db, collectionName, id), {
        status: decision,
        reviewedAt: serverTimestamp(),
      });
      // If approving an OSCA ID submission, mark user as verified
      if (decision === 'approved' && collectionName === 'id_verifications' && selected?.record?.uid) {
        try {
          await updateDoc(doc(db, 'users', selected.record.uid), {
            isVerified: true,
            status: 'VERIFIED',
            verifiedAt: serverTimestamp(),
          });
        } catch (e) {
          console.warn('Could not update user isVerified:', e);
        }
      }
      setSelected(null);
      showToast(`Request ${decision} successfully.`);
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

  /* ── Filters for current tab ── */
  const activeList = activeTab === 'submissions' ? submissions : physicalReqs;
  const nameKey    = activeTab === 'submissions' ? (r) => r.fullName || r.seniorName : (r) => r.seniorName || r.fullName;
  const idKey      = activeTab === 'submissions' ? (r) => r.idNumber || '' : (r) => r.seniorId || '';

  const filtered = activeList.filter(r => {
    const name      = nameKey(r).toLowerCase();
    const id        = idKey(r).toLowerCase();
    const matchSrch = !search || name.includes(search.toLowerCase()) || id.includes(search.toLowerCase());
    const matchStat = filterStatus === 'all' || r.status === filterStatus || (!r.status && filterStatus === 'pending');
    return matchSrch && matchStat;
  });

  const pending  = filtered.filter(r => !r.status || r.status === 'pending');
  const reviewed = filtered.filter(r => r.status && r.status !== 'pending');

  // Repeat detection for submissions
  const repeatKeys = (() => {
    const counts = {};
    submissions.forEach(r => {
      const key = r.email || r.fullName || r.seniorName;
      if (key) counts[key] = (counts[key] || 0) + 1;
    });
    return new Set(Object.keys(counts).filter(k => counts[k] > 1));
  })();
  const isRepeat = (r) => activeTab === 'submissions' && repeatKeys.has(r.email || r.fullName || r.seniorName);

  // Void physical requests
  const voidReqs = physicalReqs.filter(r => r.isVoid || (!r.seniorName && !r.fullName && !r.seniorId));

  /* ── Tab counts ── */
  const submissionsPending = submissions.filter(r => !r.status || r.status === 'pending').length;
  const physicalPending    = physicalReqs.filter(r => !r.status || r.status === 'pending').length;

  const tabs = [
    { key: 'submissions', label: 'OSCA ID Submissions', badge: submissionsPending },
    { key: 'physical',    label: 'Physical ID Requests', badge: physicalPending },
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

      {/* Delete modal */}
      {deleteTarget && (
        <DeleteConfirmModal
          name={deleteTarget.name}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          loading={deleting}
        />
      )}

      {/* Review modals */}
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

      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ShieldCheck size={24} className="text-[#0f52ba]" /> ID Verification
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Review OSCA ID submissions from sign-up · Manage physical ID requests · Verify all against NCSID
        </p>
      </div>

      {/* Stats — context-aware */}
      {activeTab === 'submissions' ? (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard label="Pending Review"  value={submissions.filter(r => !r.status || r.status === 'pending').length} icon={ClockIcon}    color="text-yellow-600" bg="bg-yellow-50" />
          <StatCard label="Approved"        value={submissions.filter(r => r.status === 'approved').length}             icon={CheckCircle2} color="text-green-600"  bg="bg-green-50"  />
          <StatCard label="Rejected"        value={submissions.filter(r => r.status === 'rejected').length}             icon={XCircle}      color="text-red-600"    bg="bg-red-50"    />
          <StatCard label="Total Submitted" value={submissions.length}                                                  icon={FileImage}    color="text-blue-600"   bg="bg-blue-50"   />
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard label="Pending"         value={physicalReqs.filter(r => !r.status || r.status === 'pending').length} icon={ClockIcon}    color="text-yellow-600" bg="bg-yellow-50" />
          <StatCard label="Approved"        value={physicalReqs.filter(r => r.status === 'approved').length}              icon={CheckCircle2} color="text-green-600"  bg="bg-green-50"  />
          <StatCard label="Rejected"        value={physicalReqs.filter(r => r.status === 'rejected').length}              icon={XCircle}      color="text-red-600"    bg="bg-red-50"    />
          <StatCard label="Void/Incomplete" value={voidReqs.length}                                                       icon={AlertTriangle} color="text-orange-600" bg="bg-orange-50" />
        </div>
      )}

      {/* Repeat submitter warning (submissions only) */}
      {activeTab === 'submissions' && repeatKeys.size > 0 && (
        <div className="flex items-center gap-2 mb-5 px-4 py-2.5 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-700 font-medium">
          <AlertTriangle size={14} className="text-orange-500 shrink-0" />
          <span>
            {repeatKeys.size} user{repeatKeys.size > 1 ? 's have' : ' has'} submitted <strong>multiple requests</strong> — highlighted in orange. Review carefully.
          </span>
        </div>
      )}

      {/* Void notice (physical only) */}
      {activeTab === 'physical' && voidReqs.length > 0 && (
        <div className="flex items-center gap-2 mb-5 px-4 py-2.5 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-700 font-medium">
          <AlertTriangle size={14} className="text-orange-500 shrink-0" />
          <span><strong>{voidReqs.length}</strong> request(s) are void — the user did not complete their sign-up profile. These cannot be processed until the user fills in all required information.</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-xl w-fit">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => { setActiveTab(t.key); setSearch(''); setFilterStatus('all'); }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            {t.badge > 0 && (
              <span className="ml-1.5 bg-[#0f52ba] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search + filter */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder={activeTab === 'submissions' ? 'Search by name or OSCA ID number…' : 'Search by name or OSCA ID…'}
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
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                filterStatus === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
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
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">
                Pending Review ({pending.length})
              </h2>
              <div className="space-y-3">
                {pending.map(r => {
                  const repeat  = isRepeat(r);
                  const isVoid  = activeTab === 'physical' && (r.isVoid || (!r.seniorName && !r.fullName && !r.seniorId));
                  const rName   = activeTab === 'submissions' ? (r.fullName || r.seniorName || 'Unknown') : (r.seniorName || r.fullName || 'Unknown');
                  const rId     = activeTab === 'submissions' ? r.idNumber : r.seniorId;
                  const rDate   = activeTab === 'submissions'
                    ? r.submittedAt?.toDate?.()?.toLocaleDateString?.()
                    : r.createdAt?.toDate?.()?.toLocaleDateString?.();

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
                        {/* Thumbnail — submissions only */}
                        {activeTab === 'submissions' && (
                          (r.idImageUrl || r.imageBase64) ? (
                            <img
                              src={r.idImageUrl ?? `data:image/jpeg;base64,${r.imageBase64}`}
                              alt="ID"
                              className="w-16 h-10 rounded-lg object-cover border border-gray-200 shrink-0"
                            />
                          ) : (
                            <div className="w-16 h-10 rounded-lg bg-gray-100 border border-dashed border-gray-300 flex items-center justify-center shrink-0">
                              <FileImage size={14} className="text-gray-400" />
                            </div>
                          )
                        )}
                        {/* Physical ID icon */}
                        {activeTab === 'physical' && (
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
                          onClick={() => setDeleteTarget({
                            id: r.id,
                            name: rName,
                            col: activeTab === 'submissions' ? 'id_verifications' : 'id_requests',
                          })}
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
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">
                Reviewed ({reviewed.length})
              </h2>
              <div className="space-y-2">
                {reviewed.map(r => {
                  const repeat = isRepeat(r);
                  const rName  = activeTab === 'submissions' ? (r.fullName || r.seniorName || 'Unknown') : (r.seniorName || r.fullName || 'Unknown');
                  const rId    = activeTab === 'submissions' ? r.idNumber : r.seniorId;
                  return (
                    <div
                      key={r.id}
                      className={`rounded-2xl p-4 flex items-center justify-between border ${
                        repeat ? 'bg-orange-50/60 border-orange-200' : 'bg-white border-gray-100'
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {activeTab === 'submissions' && (
                          (r.idImageUrl || r.imageBase64) ? (
                            <img
                              src={r.idImageUrl ?? `data:image/jpeg;base64,${r.imageBase64}`}
                              alt="ID"
                              className="w-12 h-8 rounded-md object-cover border border-gray-200 shrink-0"
                            />
                          ) : (
                            <div className="w-12 h-8 rounded-md bg-gray-100 flex items-center justify-center shrink-0">
                              <FileImage size={12} className="text-gray-300" />
                            </div>
                          )
                        )}
                        {activeTab === 'physical' && (
                          <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
                            <FileText size={13} className="text-gray-400" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-gray-800">{rName}</p>
                            {repeat && (
                              <span className="flex items-center gap-1 text-[10px] font-bold bg-orange-400 text-white px-2 py-0.5 rounded-full whitespace-nowrap">
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
                          onClick={() => setDeleteTarget({
                            id: r.id,
                            name: rName,
                            col: activeTab === 'submissions' ? 'id_verifications' : 'id_requests',
                          })}
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
                {search ? 'No results found' :
                 activeTab === 'submissions' ? 'No verification requests yet' : 'No physical ID requests yet'}
              </p>
              {search && <p className="text-xs mt-1">Try a different name or OSCA ID number</p>}
            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in { animation: fade-in 0.2s ease-out; }
      `}</style>
    </div>
  );
}
