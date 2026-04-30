import React, { useEffect, useState } from 'react';
import { ShieldCheck, Clock, CheckCircle2, XCircle, Eye, Loader2 } from 'lucide-react';
import { db, storage } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, serverTimestamp } from 'firebase/firestore';

const StatusBadge = ({ status }) => {
  const map = {
    pending:  { cls: 'bg-yellow-100 text-yellow-700', label: 'Pending' },
    approved: { cls: 'bg-green-100 text-green-700',  label: 'Approved' },
    rejected: { cls: 'bg-red-100 text-red-700',      label: 'Rejected' },
  };
  const { cls, label } = map[status] || map.pending;
  return <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cls}`}>{label}</span>;
};

export default function IDVerification() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'id_verifications'), orderBy('submittedAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, []);

  async function handleDecision(id, decision) {
    setProcessing(true);
    try {
      await updateDoc(doc(db, 'id_verifications', id), {
        status: decision,
        reviewedAt: serverTimestamp(),
      });
      setSelected(null);
    } finally {
      setProcessing(false);
    }
  }

  const pending  = requests.filter(r => r.status === 'pending');
  const reviewed = requests.filter(r => r.status !== 'pending');

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ShieldCheck size={24} className="text-[#0f52ba]" /> ID Verification
        </h1>
        <p className="text-sm text-gray-500 mt-1">Review and approve resident ID submissions</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Pending Review', value: pending.length, icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50' },
          { label: 'Approved',       value: requests.filter(r=>r.status==='approved').length, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Rejected',       value: requests.filter(r=>r.status==='rejected').length, icon: XCircle,      color: 'text-red-600',   bg: 'bg-red-50' },
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

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-blue-500" />
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Pending Review</h2>
              <div className="space-y-3">
                {pending.map(r => (
                  <div key={r.id} className="bg-white border border-yellow-200 rounded-2xl p-5 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{r.fullName || 'Unknown'}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{r.email} · Submitted {r.submittedAt?.toDate?.()?.toLocaleDateString?.() || '—'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={r.status} />
                      <button
                        onClick={() => setSelected(r)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-[#0f52ba] hover:underline"
                      >
                        <Eye size={14} /> Review
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {reviewed.length > 0 && (
            <div>
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Reviewed</h2>
              <div className="space-y-2">
                {reviewed.map(r => (
                  <div key={r.id} className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-800">{r.fullName || 'Unknown'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{r.email}</p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                ))}
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
      )}

      {/* Review Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Review ID Submission</h3>
            <p className="text-sm text-gray-500 mb-6">{selected.fullName} · {selected.email}</p>
            {selected.idImageUrl && (
              <img src={selected.idImageUrl} alt="ID" className="w-full rounded-xl border border-gray-200 mb-6 object-cover" />
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
    </div>
  );
}