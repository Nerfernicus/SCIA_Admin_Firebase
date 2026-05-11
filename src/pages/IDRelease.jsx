import React, { useEffect, useState } from 'react';
import { CreditCard, CheckCircle2, Search, Loader2, Send, Trash2, AlertTriangle, X, FileText, ShieldCheck } from 'lucide-react';
import { db } from '../lib/firebase';
import {
  collection, onSnapshot, query, where, orderBy,
  doc, updateDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';

function DeleteConfirmModal({ record, onClose, onConfirm, loading }) {
  const name = record?.displayName || record?.fullName || 'Unknown';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 z-10 text-center">
        <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Trash2 size={24} className="text-red-500" />
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-1">Delete Record?</h2>
        <p className="text-sm text-gray-500 mb-1">You are about to delete</p>
        <p className="text-sm font-bold text-gray-800 mb-4">"{name}"</p>
        <p className="text-xs text-red-500 font-semibold bg-red-50 rounded-xl px-4 py-2 mb-6">
          This will permanently remove the record from the system.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={onConfirm} disabled={loading} className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default function IDRelease() {
  const [verifRecords, setVerifRecords] = useState([]);
  const [reqRecords, setReqRecords]     = useState([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [releasing, setReleasing]       = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]         = useState(false);
  const [toast, setToast]               = useState('');
  const [activeTab, setActiveTab]       = useState('requests');

  /* ── id_verifications: approved ── */
  useEffect(() => {
    const q = query(
      collection(db, 'id_verifications'),
      where('status', '==', 'approved'),
      orderBy('reviewedAt', 'desc'),
    );
    return onSnapshot(q, (snap) => {
      setVerifRecords(snap.docs.map(d => ({
        id: d.id, ...d.data(),
        _source: 'id_verifications',
        displayName: d.data().fullName || d.data().seniorName || 'Unknown',
        displaySub:  d.data().idNumber ? `OSCA ID: ${d.data().idNumber}` : (d.data().email || ''),
      })));
      setLoading(false);
    });
  }, []);

  /* ── id_requests: approved ── */
  useEffect(() => {
    const q = query(
      collection(db, 'id_requests'),
      where('status', '==', 'approved'),
      orderBy('reviewedAt', 'desc'),
    );
    return onSnapshot(q, (snap) => {
      setReqRecords(snap.docs.map(d => ({
        id: d.id, ...d.data(),
        _source: 'id_requests',
        displayName: d.data().seniorName || 'Unknown',
        displaySub:  d.data().seniorId ? `OSCA ID: ${d.data().seniorId}` : (d.data().address || ''),
      })));
    });
  }, []);

  const repeatReqKeys = (() => {
    const counts = {};
    reqRecords.forEach(r => { const k = r.seniorName || r.seniorId; if (k) counts[k] = (counts[k]||0)+1; });
    return new Set(Object.keys(counts).filter(k => counts[k] > 1));
  })();
  const repeatVerifKeys = (() => {
    const counts = {};
    verifRecords.forEach(r => { const k = r.email || r.fullName; if (k) counts[k] = (counts[k]||0)+1; });
    return new Set(Object.keys(counts).filter(k => counts[k] > 1));
  })();
  const isReqRepeat   = (r) => repeatReqKeys.has(r.seniorName || r.seniorId);
  const isVerifRepeat = (r) => repeatVerifKeys.has(r.email || r.fullName);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  async function markReleased(record) {
    const key = `${record._source}:${record.id}`;
    setReleasing(key);
    try {
      await updateDoc(doc(db, record._source, record.id), { released: true, releasedAt: serverTimestamp() });
      showToast(`ID released for "${record.displayName}".`);
    } finally { setReleasing(null); }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, deleteTarget._source, deleteTarget.id));
      showToast(`Record for "${deleteTarget.displayName}" deleted.`);
      setDeleteTarget(null);
    } finally { setDeleting(false); }
  }

  const searchLower = search.toLowerCase();
  const matches = (r) =>
    r.displayName?.toLowerCase().includes(searchLower) ||
    r.displaySub?.toLowerCase().includes(searchLower) ||
    r.seniorName?.toLowerCase().includes(searchLower) ||
    r.seniorId?.toLowerCase().includes(searchLower) ||
    r.fullName?.toLowerCase().includes(searchLower);

  const pendingReqs   = reqRecords.filter(r => !r.released && matches(r));
  const releasedReqs  = reqRecords.filter(r =>  r.released && matches(r));
  const pendingVerifs  = verifRecords.filter(r => !r.released && matches(r));
  const releasedVerifs = verifRecords.filter(r =>  r.released && matches(r));

  const totalReleased = releasedReqs.length + releasedVerifs.length;
  const totalRepeats  = repeatReqKeys.size + repeatVerifKeys.size;

  function RecordRow({ r, isRepeat }) {
    const key = `${r._source}:${r.id}`;
    return (
      <div className={`rounded-2xl p-5 flex items-center justify-between border transition-all ${isRepeat ? 'bg-orange-50 border-orange-300 ring-1 ring-orange-200' : 'bg-white border-blue-100'}`}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-gray-900">{r.displayName}</p>
            {r._source === 'id_requests'
              ? <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full flex items-center gap-1"><FileText size={9}/> Physical ID Request</span>
              : <span className="text-[10px] font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full flex items-center gap-1"><ShieldCheck size={9}/> OSCA Verification</span>
            }
            {isRepeat && <span className="flex items-center gap-1 text-[10px] font-bold bg-orange-500 text-white px-2 py-0.5 rounded-full whitespace-nowrap"><AlertTriangle size={9}/> REPEAT REQUEST</span>}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{r.displaySub}</p>
          {r.address && r._source === 'id_requests' && <p className="text-xs text-gray-400 mt-0.5">📍 {r.address}</p>}
          {r.reason && <p className="text-xs text-gray-400 mt-0.5 italic">Reason: {r.reason}</p>}
          {r.reviewedAt && <p className="text-xs text-gray-400 mt-0.5">Approved {r.reviewedAt?.toDate?.()?.toLocaleDateString?.() || '—'}</p>}
        </div>
        <div className="flex items-center gap-2 ml-4 shrink-0">
          <button onClick={() => markReleased(r)} disabled={releasing === key}
            className="flex items-center gap-2 bg-[#0f52ba] hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors">
            {releasing === key ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>} Release ID
          </button>
          <button onClick={() => setDeleteTarget(r)} title="Delete record" className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
            <Trash2 size={16}/>
          </button>
        </div>
      </div>
    );
  }

  function ReleasedRow({ r, isRepeat }) {
    return (
      <div className={`rounded-2xl p-4 flex items-center justify-between border ${isRepeat ? 'bg-orange-50/60 border-orange-200' : 'bg-gray-50 border-gray-100'}`}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-gray-700">{r.displayName}</p>
            {r._source === 'id_requests'
              ? <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Physical ID</span>
              : <span className="text-[10px] font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">OSCA Verified</span>
            }
            {isRepeat && <span className="flex items-center gap-1 text-[10px] font-bold bg-orange-400 text-white px-2 py-0.5 rounded-full whitespace-nowrap"><AlertTriangle size={9}/> REPEAT</span>}
          </div>
          <p className="text-xs text-gray-400">{r.displaySub} · Released {r.releasedAt?.toDate?.()?.toLocaleDateString?.() || '—'}</p>
        </div>
        <div className="flex items-center gap-2 ml-4 shrink-0">
          <CheckCircle2 size={18} className="text-green-500"/>
          <button onClick={() => setDeleteTarget(r)} title="Delete record" className="p-1.5 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
            <Trash2 size={15}/>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto relative">

      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-fade-in">
          <CheckCircle2 size={16} className="text-green-400"/> {toast}
          <button onClick={() => setToast('')}><X size={14} className="text-white/60 hover:text-white"/></button>
        </div>
      )}
      {deleteTarget && <DeleteConfirmModal record={deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} loading={deleting}/>}

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <CreditCard size={24} className="text-[#0f52ba]"/> ID Release
        </h1>
        <p className="text-sm text-gray-500 mt-1">Release approved IDs to residents — search by username or OSCA ID</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'ID Card Requests', value: pendingReqs.length,   icon: FileText,      color: 'text-[#0f52ba]', bg: 'bg-blue-50' },
          { label: 'OSCA Verifications', value: pendingVerifs.length, icon: ShieldCheck,  color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Released',          value: totalReleased,         icon: CheckCircle2, color: 'text-green-600',  bg: 'bg-green-50' },
          { label: 'Repeat Requesters', value: totalRepeats,          icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-50' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-100 rounded-2xl p-5 flex items-center gap-4">
            <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center`}><s.icon size={20} className={s.color}/></div>
            <div><p className="text-2xl font-bold text-gray-900">{s.value}</p><p className="text-xs text-gray-500">{s.label}</p></div>
          </div>
        ))}
      </div>

      {totalRepeats > 0 && (
        <div className="flex items-center gap-2 mb-5 px-4 py-2.5 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-700 font-medium">
          <AlertTriangle size={14} className="text-orange-500 shrink-0"/>
          <span>Some users have submitted <strong>multiple requests</strong>. Highlighted in orange — review carefully before releasing.</span>
        </div>
      )}

      {/* Search by username */}
      <div className="relative mb-6">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"/>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by username / name / OSCA ID…"
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"/>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        <button onClick={() => setActiveTab('requests')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${activeTab === 'requests' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          <FileText size={14}/> Physical ID Requests
          {pendingReqs.length > 0 && <span className="bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pendingReqs.length}</span>}
        </button>
        <button onClick={() => setActiveTab('verifications')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${activeTab === 'verifications' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          <ShieldCheck size={14}/> OSCA Verifications
          {pendingVerifs.length > 0 && <span className="bg-purple-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pendingVerifs.length}</span>}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-blue-500"/></div>
      ) : activeTab === 'requests' ? (
        <>
          {pendingReqs.length === 0 && releasedReqs.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <FileText size={40} className="mx-auto mb-3 opacity-40"/>
              <p className="font-medium">No approved ID card requests</p>
              <p className="text-xs mt-1">Approve requests from ID Verification → Physical ID Requests</p>
            </div>
          ) : (
            <>
              {pendingReqs.length > 0 && (
                <div className="mb-6">
                  <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Ready for Release</h2>
                  <div className="space-y-3">{pendingReqs.map(r => <RecordRow key={r.id} r={r} isRepeat={isReqRepeat(r)}/>)}</div>
                </div>
              )}
              {releasedReqs.length > 0 && (
                <div>
                  <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Released</h2>
                  <div className="space-y-2">{releasedReqs.map(r => <ReleasedRow key={r.id} r={r} isRepeat={isReqRepeat(r)}/>)}</div>
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <>
          {pendingVerifs.length === 0 && releasedVerifs.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <ShieldCheck size={40} className="mx-auto mb-3 opacity-40"/>
              <p className="font-medium">No approved OSCA verifications</p>
              <p className="text-xs mt-1">Approve submissions from ID Verification → ID Submissions</p>
            </div>
          ) : (
            <>
              {pendingVerifs.length > 0 && (
                <div className="mb-6">
                  <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Ready for Release</h2>
                  <div className="space-y-3">{pendingVerifs.map(r => <RecordRow key={r.id} r={r} isRepeat={isVerifRepeat(r)}/>)}</div>
                </div>
              )}
              {releasedVerifs.length > 0 && (
                <div>
                  <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Released</h2>
                  <div className="space-y-2">{releasedVerifs.map(r => <ReleasedRow key={r.id} r={r} isRepeat={isVerifRepeat(r)}/>)}</div>
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
