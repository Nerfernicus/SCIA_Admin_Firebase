import React, { useEffect, useState } from 'react';
import { IdCard, CheckCircle2, Search, Loader2, Send } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, where, orderBy, doc, updateDoc, serverTimestamp } from 'firebase/firestore';

export default function IDRelease() {
  const [records, setRecords]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [releasing, setReleasing] = useState(null);

  useEffect(() => {
    // Show approved IDs that have not yet been released
    const q = query(
      collection(db, 'id_verifications'),
      where('status', '==', 'approved'),
      orderBy('reviewedAt', 'desc')
    );
    return onSnapshot(q, (snap) => {
      setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, []);

  async function markReleased(id) {
    setReleasing(id);
    try {
      await updateDoc(doc(db, 'id_verifications', id), {
        released: true,
        releasedAt: serverTimestamp(),
      });
    } finally {
      setReleasing(null);
    }
  }

  const filtered = records.filter(r =>
    !r.released &&
    (r.fullName?.toLowerCase().includes(search.toLowerCase()) ||
     r.email?.toLowerCase().includes(search.toLowerCase()))
  );
  const released = records.filter(r => r.released);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <IdCard size={24} className="text-[#0f52ba]" /> ID Release
        </h1>
        <p className="text-sm text-gray-500 mt-1">Release approved IDs to residents</p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-white border border-gray-100 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
            <IdCard size={20} className="text-[#0f52ba]" />
          </div>
          <div><p className="text-2xl font-bold text-gray-900">{filtered.length}</p><p className="text-xs text-gray-500">Awaiting Release</p></div>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
            <CheckCircle2 size={20} className="text-green-600" />
          </div>
          <div><p className="text-2xl font-bold text-gray-900">{released.length}</p><p className="text-xs text-gray-500">Released</p></div>
        </div>
      </div>

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
        <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
      ) : filtered.length === 0 && released.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <IdCard size={40} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium">No approved IDs to release</p>
        </div>
      ) : (
        <>
          {filtered.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Ready for Release</h2>
              <div className="space-y-3">
                {filtered.map(r => (
                  <div key={r.id} className="bg-white border border-blue-100 rounded-2xl p-5 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{r.fullName}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{r.email}</p>
                    </div>
                    <button
                      onClick={() => markReleased(r.id)}
                      disabled={releasing === r.id}
                      className="flex items-center gap-2 bg-[#0f52ba] hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors"
                    >
                      {releasing === r.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                      Release ID
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {released.length > 0 && (
            <div>
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Released</h2>
              <div className="space-y-2">
                {released.map(r => (
                  <div key={r.id} className="bg-gray-50 border border-gray-100 rounded-2xl p-4 flex items-center justify-between opacity-70">
                    <div>
                      <p className="font-medium text-gray-700">{r.fullName}</p>
                      <p className="text-xs text-gray-400">{r.email} · Released {r.releasedAt?.toDate?.()?.toLocaleDateString?.() || '—'}</p>
                    </div>
                    <CheckCircle2 size={18} className="text-green-500" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}