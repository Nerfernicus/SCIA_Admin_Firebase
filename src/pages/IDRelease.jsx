import React, { useEffect, useState } from 'react';
import { CreditCard, CheckCircle2, Search, Loader2, Send, Trash2, AlertTriangle, X } from 'lucide-react';
import { db } from '../lib/firebase';
import {
  collection, onSnapshot, query, where, orderBy,
  doc, updateDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';

function DeleteConfirmModal({ record, onClose, onConfirm, loading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 z-10 text-center">
        <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Trash2 size={24} className="text-red-500" />
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-1">Delete Record?</h2>
        <p className="text-sm text-gray-500 mb-1">You are about to delete</p>
        <p className="text-sm font-bold text-gray-800 mb-4">"{record?.fullName}"</p>
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

export default function IDRelease() {
  const [records, setRecords]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [releasing, setReleasing]       = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]         = useState(false);
  const [toast, setToast]               = useState('');

  useEffect(() => {
    const q = query(
      collection(db, 'id_verifications'),
      where('status', '==', 'approved'),
      orderBy('reviewedAt', 'desc'),
    );
    return onSnapshot(q, (snap) => {
      setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, []);

  // Detect users who appear more than once (repeat requests)
  const repeatKeys = (() => {
    const counts = {};
    records.forEach(r => {
      const key = r.email || r.fullName;
      if (key) counts[key] = (counts[key] || 0) + 1;
    });
    return new Set(Object.keys(counts).filter(k => counts[k] > 1));
  })();

  const isRepeat = (r) => repeatKeys.has(r.email || r.fullName);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  async function markReleased(id) {
    setReleasing(id);
    try {
      await updateDoc(doc(db, 'id_verifications', id), {
        released: true,
        releasedAt: serverTimestamp(),
      });
      showToast('ID released successfully.');
    } finally {
      setReleasing(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'id_verifications', deleteTarget.id));
      showToast(`Record for "${deleteTarget.fullName}" deleted.`);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  const searchLower = search.toLowerCase();
  const matchesSearch = (r) =>
    r.fullName?.toLowerCase().includes(searchLower) ||
    r.email?.toLowerCase().includes(searchLower);

  const filtered = records.filter(r => !r.released && matchesSearch(r));
  const released = records.filter(r =>  r.released && matchesSearch(r));

  return (
    <div className="p-8 max-w-5xl mx-auto relative">

      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-fade-in">
          <CheckCircle2 size={16} className="text-green-400" />
          {toast}
          <button onClick={() => setToast('')}><X size={14} className="text-white/60 hover:text-white" /></button>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteTarget && (
        <DeleteConfirmModal
          record={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          loading={deleting}
        />
      )}

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <CreditCard size={24} className="text-[#0f52ba]" /> ID Release
        </h1>
        <p className="text-sm text-gray-500 mt-1">Release approved IDs to residents</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-gray-100 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
            <CreditCard size={20} className="text-[#0f52ba]" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{filtered.length}</p>
            <p className="text-xs text-gray-500">Awaiting Release</p>
          </div>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
            <CheckCircle2 size={20} className="text-green-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{released.length}</p>
            <p className="text-xs text-gray-500">Released</p>
          </div>
        </div>
        <div className="bg-white border border-orange-100 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
            <AlertTriangle size={20} className="text-orange-500" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{repeatKeys.size}</p>
            <p className="text-xs text-gray-500">Repeat Requesters</p>
          </div>
        </div>
      </div>

      {/* Repeat warning banner */}
      {repeatKeys.size > 0 && (
        <div className="flex items-center gap-2 mb-5 px-4 py-2.5 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-700 font-medium">
          <AlertTriangle size={14} className="text-orange-500 shrink-0" />
          <span>Some users have submitted <strong>multiple requests</strong>. They are highlighted in orange — please review before releasing.</span>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-6">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-blue-500" />
        </div>
      ) : filtered.length === 0 && released.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <CreditCard size={40} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium">No approved IDs to release</p>
        </div>
      ) : (
        <>
          {/* Awaiting Release */}
          {filtered.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Ready for Release</h2>
              <div className="space-y-3">
                {filtered.map(r => {
                  const repeat = isRepeat(r);
                  return (
                    <div
                      key={r.id}
                      className={`rounded-2xl p-5 flex items-center justify-between border transition-all ${
                        repeat
                          ? 'bg-orange-50 border-orange-300 ring-1 ring-orange-200'
                          : 'bg-white border-blue-100'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-gray-900">{r.fullName}</p>
                          {repeat && (
                            <span className="flex items-center gap-1 text-[10px] font-bold bg-orange-500 text-white px-2 py-0.5 rounded-full whitespace-nowrap">
                              <AlertTriangle size={9} /> REPEAT REQUEST
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{r.email}</p>
                        {r.reviewedAt && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            Approved {r.reviewedAt?.toDate?.()?.toLocaleDateString?.() || '—'}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-4 shrink-0">
                        <button
                          onClick={() => markReleased(r.id)}
                          disabled={releasing === r.id}
                          className="flex items-center gap-2 bg-[#0f52ba] hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors"
                        >
                          {releasing === r.id
                            ? <Loader2 size={14} className="animate-spin" />
                            : <Send size={14} />}
                          Release ID
                        </button>
                        <button
                          onClick={() => setDeleteTarget(r)}
                          title="Delete record"
                          className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Released history */}
          {released.length > 0 && (
            <div>
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Released</h2>
              <div className="space-y-2">
                {released.map(r => {
                  const repeat = isRepeat(r);
                  return (
                    <div
                      key={r.id}
                      className={`rounded-2xl p-4 flex items-center justify-between border ${
                        repeat
                          ? 'bg-orange-50/60 border-orange-200'
                          : 'bg-gray-50 border-gray-100'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-gray-700">{r.fullName}</p>
                          {repeat && (
                            <span className="flex items-center gap-1 text-[10px] font-bold bg-orange-400 text-white px-2 py-0.5 rounded-full whitespace-nowrap">
                              <AlertTriangle size={9} /> REPEAT
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">
                          {r.email} · Released {r.releasedAt?.toDate?.()?.toLocaleDateString?.() || '—'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-4 shrink-0">
                        <CheckCircle2 size={18} className="text-green-500" />
                        <button
                          onClick={() => setDeleteTarget(r)}
                          title="Delete record"
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
