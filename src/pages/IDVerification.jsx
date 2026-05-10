import React, { useEffect, useState } from 'react';
import { ShieldCheck, Clock as ClockIcon, CheckCircle2, XCircle, Eye, Loader2, FileText, Trash2, AlertTriangle, X } from 'lucide-react';
import { db } from '../lib/firebase';
import {
  collection, onSnapshot, query, orderBy,
  doc, updateDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';

const StatusBadge = ({ status }) => {
  const map = {
    pending:  { cls: 'bg-yellow-100 text-yellow-700', label: 'Pending' },
    approved: { cls: 'bg-green-100 text-green-700',   label: 'Approved' },
    rejected: { cls: 'bg-red-100 text-red-700',       label: 'Rejected' },
  };
  const { cls, label } = map[status] || map.pending;
  return <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cls}`}>{label}</span>;
};

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
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default function IDVerification() {
  const [requests, setRequests]         = useState([]);
  const [idRequests, setIdRequests]     = useState([]);
  const [loading, setLoading]           = useState(true);
  const [selected, setSelected]         = useState(null);
  const [processing, setProcessing]     = useState(false);
  const [activeTab, setActiveTab]       = useState('verifications');
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, name, collection }
  const [deleting, setDeleting]         = useState(false);
  const [toast, setToast]               = useState({ msg: '', type: 'success' });

  useEffect(() => {
    const q = query(collection(db, 'id_verifications'), orderBy('submittedAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'id_requests'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setIdRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  // Detect repeat submitters in id_verifications
  const repeatVerifKeys = (() => {
    const counts = {};
    requests.forEach(r => {
      const key = r.email || r.fullName || r.seniorName;
      if (key) counts[key] = (counts[key] || 0) + 1;
    });
    return new Set(Object.keys(counts).filter(k => counts[k] > 1));
  })();

  // Detect repeat submitters in id_requests
  const repeatReqKeys = (() => {
    const counts = {};
    idRequests.forEach(r => {
      const key = r.seniorId || r.seniorName;
      if (key) counts[key] = (counts[key] || 0) + 1;
    });
    return new Set(Object.keys(counts).filter(k => counts[k] > 1));
  })();

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: 'success' }), 3000);
  }

  async function handleDecision(id, decision) {
    setProcessing(true);
    try {
      await updateDoc(doc(db, 'id_verifications', id), {
        status: decision,
        reviewedAt: serverTimestamp(),
      });
      setSelected(null);
      showToast(`Request ${decision} successfully.`);
    } finally {
      setProcessing(false);
    }
  }

  async function handleIDRequestDecision(id, decision) {
    setProcessing(true);
    try {
      await updateDoc(doc(db, 'id_requests', id), {
        status: decision,
        reviewedAt: serverTimestamp(),
      });
      showToast(`ID request ${decision}.`);
    } finally {
      setProcessing(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, deleteTarget.collection, deleteTarget.id));
      showToast(`"${deleteTarget.name}" deleted.`);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  const pending        = requests.filter(r => r.status === 'pending');
  const reviewed       = requests.filter(r => r.status !== 'pending');
  const pendingIDReqs  = idRequests.filter(r => !r.status || r.status === 'pending');
  const processedIDReqs = idRequests.filter(r => r.status && r.status !== 'pending');

  const isVerifRepeat = (r) => repeatVerifKeys.has(r.email || r.fullName || r.seniorName);
  const isReqRepeat   = (r) => repeatReqKeys.has(r.seniorId || r.seniorName);

  const totalRepeats = repeatVerifKeys.size + repeatReqKeys.size;

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

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ShieldCheck size={24} className="text-[#0f52ba]" /> ID Verification
        </h1>
        <p className="text-sm text-gray-500 mt-1">Review resident ID submissions and physical ID card requests</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Pending Review',   value: pending.length,                                  icon: ClockIcon,    color: 'text-yellow-600', bg: 'bg-yellow-50' },
          { label: 'Approved',         value: requests.filter(r=>r.status==='approved').length, icon: CheckCircle2, color: 'text-green-600',  bg: 'bg-green-50' },
          { label: 'Rejected',         value: requests.filter(r=>r.status==='rejected').length, icon: XCircle,      color: 'text-red-600',    bg: 'bg-red-50' },
          { label: 'ID Card Requests', value: pendingIDReqs.length,                             icon: FileText,     color: 'text-blue-600',   bg: 'bg-blue-50' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center gap-4">
            <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center`}>
              <s.icon size={20} className={s.color} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Repeat warning banner */}
      {totalRepeats > 0 && (
        <div className="flex items-center gap-2 mb-5 px-4 py-2.5 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-700 font-medium">
          <AlertTriangle size={14} className="text-orange-500 shrink-0" />
          <span>
            {totalRepeats} user{totalRepeats > 1 ? 's have' : ' has'} submitted <strong>multiple requests</strong>. They are highlighted in orange — please review carefully.
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('verifications')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'verifications' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          ID Submissions {pending.length > 0 && <span className="ml-1 bg-yellow-400 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pending.length}</span>}
        </button>
        <button
          onClick={() => setActiveTab('id_requests')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'id_requests' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Physical ID Requests {pendingIDReqs.length > 0 && <span className="ml-1 bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pendingIDReqs.length}</span>}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-blue-500" />
        </div>
      ) : activeTab === 'verifications' ? (
        <>
          {/* Pending */}
          {pending.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Pending Review</h2>
              <div className="space-y-3">
                {pending.map(r => {
                  const repeat = isVerifRepeat(r);
                  return (
                    <div
                      key={r.id}
                      className={`rounded-2xl p-5 flex items-center justify-between border ${
                        repeat ? 'bg-orange-50 border-orange-300 ring-1 ring-orange-200' : 'bg-white border-yellow-200'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-gray-900">{r.fullName || r.seniorName || 'Unknown'}</p>
                          {repeat && (
                            <span className="flex items-center gap-1 text-[10px] font-bold bg-orange-500 text-white px-2 py-0.5 rounded-full whitespace-nowrap">
                              <AlertTriangle size={9} /> REPEAT REQUEST
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {r.email} · Submitted {r.submittedAt?.toDate?.()?.toLocaleDateString?.() || '—'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-4 shrink-0">
                        <StatusBadge status={r.status} />
                        <button
                          onClick={() => setSelected(r)}
                          className="flex items-center gap-1.5 text-xs font-semibold text-[#0f52ba] hover:underline"
                        >
                          <Eye size={14} /> Review
                        </button>
                        <button
                          onClick={() => setDeleteTarget({ id: r.id, name: r.fullName || r.seniorName || 'Unknown', collection: 'id_verifications' })}
                          title="Delete request"
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

          {/* Reviewed */}
          {reviewed.length > 0 && (
            <div>
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Reviewed</h2>
              <div className="space-y-2">
                {reviewed.map(r => {
                  const repeat = isVerifRepeat(r);
                  return (
                    <div
                      key={r.id}
                      className={`rounded-2xl p-4 flex items-center justify-between border ${
                        repeat ? 'bg-orange-50/60 border-orange-200' : 'bg-white border-gray-100'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-gray-800">{r.fullName || r.seniorName || 'Unknown'}</p>
                          {repeat && (
                            <span className="flex items-center gap-1 text-[10px] font-bold bg-orange-400 text-white px-2 py-0.5 rounded-full whitespace-nowrap">
                              <AlertTriangle size={9} /> REPEAT
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{r.email}</p>
                      </div>
                      <div className="flex items-center gap-2 ml-4 shrink-0">
                        <StatusBadge status={r.status} />
                        <button
                          onClick={() => setDeleteTarget({ id: r.id, name: r.fullName || r.seniorName || 'Unknown', collection: 'id_verifications' })}
                          title="Delete request"
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

          {requests.length === 0 && (
            <div className="text-center py-20 text-gray-400">
              <ShieldCheck size={40} className="mx-auto mb-3 opacity-40" />
              <p className="font-medium">No verification requests yet</p>
            </div>
          )}
        </>
      ) : (
        /* Physical ID Requests */
        <>
          {pendingIDReqs.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Pending ID Card Requests</h2>
              <div className="space-y-3">
                {pendingIDReqs.map(r => {
                  const repeat = isReqRepeat(r);
                  return (
                    <div
                      key={r.id}
                      className={`rounded-2xl p-5 flex items-center justify-between border ${
                        repeat ? 'bg-orange-50 border-orange-300 ring-1 ring-orange-200' : 'bg-white border-blue-100'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-gray-900">{r.seniorName || 'Unknown'}</p>
                          {repeat && (
                            <span className="flex items-center gap-1 text-[10px] font-bold bg-orange-500 text-white px-2 py-0.5 rounded-full whitespace-nowrap">
                              <AlertTriangle size={9} /> REPEAT REQUEST
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          ID: {r.seniorId} · {r.address} · {r.contactNumber}
                        </p>
                        {r.reason && <p className="text-xs text-gray-400 mt-0.5 italic">Reason: {r.reason}</p>}
                      </div>
                      <div className="flex items-center gap-2 ml-4 shrink-0">
                        <button
                          disabled={processing}
                          onClick={() => handleIDRequestDecision(r.id, 'approved')}
                          className="text-xs bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-xl font-semibold transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          disabled={processing}
                          onClick={() => handleIDRequestDecision(r.id, 'rejected')}
                          className="text-xs bg-red-100 hover:bg-red-200 disabled:opacity-50 text-red-600 px-3 py-1.5 rounded-xl font-semibold transition-colors"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => setDeleteTarget({ id: r.id, name: r.seniorName || 'Unknown', collection: 'id_requests' })}
                          title="Delete request"
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

          {processedIDReqs.length > 0 && (
            <div>
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Processed Requests</h2>
              <div className="space-y-2">
                {processedIDReqs.map(r => {
                  const repeat = isReqRepeat(r);
                  return (
                    <div
                      key={r.id}
                      className={`rounded-2xl p-4 flex items-center justify-between border ${
                        repeat ? 'bg-orange-50/60 border-orange-200' : 'bg-white border-gray-100'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-gray-800">{r.seniorName || 'Unknown'}</p>
                          {repeat && (
                            <span className="flex items-center gap-1 text-[10px] font-bold bg-orange-400 text-white px-2 py-0.5 rounded-full whitespace-nowrap">
                              <AlertTriangle size={9} /> REPEAT
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">ID: {r.seniorId}</p>
                      </div>
                      <div className="flex items-center gap-2 ml-4 shrink-0">
                        <StatusBadge status={r.status} />
                        <button
                          onClick={() => setDeleteTarget({ id: r.id, name: r.seniorName || 'Unknown', collection: 'id_requests' })}
                          title="Delete request"
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

          {idRequests.length === 0 && (
            <div className="text-center py-20 text-gray-400">
              <FileText size={40} className="mx-auto mb-3 opacity-40" />
              <p className="font-medium">No physical ID requests yet</p>
              <p className="text-xs mt-1">Requests submitted from the mobile app will appear here</p>
            </div>
          )}
        </>
      )}

      {/* Review Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Review ID Submission</h3>
            <p className="text-sm text-gray-500 mb-6">{selected.fullName || selected.seniorName} · {selected.email}</p>
            {selected.idImageUrl && (
              <img src={selected.idImageUrl} alt="ID" className="w-full rounded-xl border border-gray-200 mb-6 object-cover" />
            )}
            {selected.imageBase64 && (
              <img src={`data:image/jpeg;base64,${selected.imageBase64}`} alt="ID" className="w-full rounded-xl border border-gray-200 mb-6 object-cover" />
            )}
            <div className="flex gap-3">
              <button
                disabled={processing}
                onClick={() => handleDecision(selected.id, 'rejected')}
                className="flex-1 py-3 rounded-xl border-2 border-red-200 text-red-600 font-semibold text-sm hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                Reject
              </button>
              <button
                disabled={processing}
                onClick={() => handleDecision(selected.id, 'approved')}
                className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-sm transition-colors disabled:opacity-50"
              >
                {processing ? 'Saving…' : 'Approve'}
              </button>
            </div>
            <button onClick={() => setSelected(null)} className="w-full mt-3 text-sm text-gray-400 hover:text-gray-600">Cancel</button>
          </div>
        </div>
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
