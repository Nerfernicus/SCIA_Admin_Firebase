import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { ShieldCheck, Lock, Unlock, Search, X, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { db, functions } from '../lib/firebase';

const setAdminLock = httpsCallable(functions, 'setAdminLock');

const fmt = (t) => {
  const d = t?.toDate ? t.toDate() : null;
  return d ? d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
};

function ConfirmModal({ admin, busy, error, onClose, onConfirm }) {
  const locking = !admin.locked;
  return (
    <div className="fixed inset-0 z-10000 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 z-10 text-center">
        <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${locking ? 'bg-red-100' : 'bg-green-100'}`}>
          {locking ? <Lock size={24} className="text-red-500" /> : <Unlock size={24} className="text-green-600" />}
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-1">{locking ? 'Lock this account?' : 'Unlock this account?'}</h2>
        <p className="text-sm font-bold text-gray-800">{admin.name || admin.email}</p>
        <p className="text-xs text-gray-500 mb-4">{admin.barangay ? `Brgy. ${admin.barangay}` : 'No barangay assigned'}</p>
        <p className={`text-xs font-semibold rounded-xl px-4 py-2 mb-5 ${locking ? 'text-red-600 bg-red-50' : 'text-green-700 bg-green-50'}`}>
          {locking
            ? 'They will be signed out right away and cannot log in until you unlock the account.'
            : 'They will be able to log in again.'}
        </p>
        {error && (
          <p role="alert" className="text-xs font-medium text-red-600 mb-3 flex items-center justify-center gap-1">
            <AlertCircle size={12} /> {error}
          </p>
        )}
        <div className="flex gap-3">
          <button onClick={onClose} disabled={busy} className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`flex-1 py-3 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 transition-colors ${locking ? 'bg-red-500 hover:bg-red-600' : 'bg-green-600 hover:bg-green-700'}`}
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : locking ? <Lock size={15} /> : <Unlock size={15} />}
            {locking ? 'Lock' : 'Unlock'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminAccounts() {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'admins'),
      (snap) => {
        setAdmins(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((a) => String(a.role).trim() === 'sub_admin')
            .sort((a, b) => String(a.barangay || '').localeCompare(String(b.barangay || ''))),
        );
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setLoadError('Could not load admin accounts.');
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const confirm = async () => {
    if (!target) return;
    setBusy(true);
    setError('');
    try {
      await setAdminLock({ uid: target.id, locked: !target.locked });
      showToast(`${target.name || target.email} ${target.locked ? 'unlocked' : 'locked'}.`);
      setTarget(null);
    } catch (e) {
      setError(e?.message?.replace(/^.*?:\s*/, '') || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const s = search.trim().toLowerCase();
  const rows = admins.filter(
    (a) =>
      !s ||
      String(a.name || '').toLowerCase().includes(s) ||
      String(a.email || '').toLowerCase().includes(s) ||
      String(a.barangay || '').toLowerCase().includes(s),
  );
  const lockedCount = admins.filter((a) => a.locked).length;

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto font-sans">
      {target && (
        <ConfirmModal
          admin={target}
          busy={busy}
          error={error}
          onClose={() => { setTarget(null); setError(''); }}
          onConfirm={confirm}
        />
      )}

      {toast && (
        <div className="fixed top-6 right-6 z-10001 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3">
          <CheckCircle2 size={16} className="text-green-400" /> {toast}
          <button onClick={() => setToast('')}><X size={14} className="text-white/60 hover:text-white" /></button>
        </div>
      )}

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck size={22} className="text-[#0f52ba]" /> Barangay Admin Accounts
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Lock an account that is unattended, compromised or no longer needed. Locked admins are signed out and cannot log in until unlocked.
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search admins..."
            className="bg-white text-gray-900 border border-gray-200 rounded-xl py-2.5 pl-9 pr-3 w-64 focus:ring-2 focus:ring-blue-100 focus:border-blue-300 outline-none text-sm"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 text-sm text-gray-500 font-medium">
          {loading ? 'Loading...' : `${rows.length} admin${rows.length !== 1 ? 's' : ''}`}
          {!loading && lockedCount > 0 && <span className="ml-2 text-red-600 font-semibold">{lockedCount} locked</span>}
        </div>

        {loadError && <p className="p-6 text-sm text-red-600">{loadError}</p>}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100">
                {['Admin', 'Barangay', 'Status', 'Action'].map((h, i) => (
                  <th key={h} className={`py-3 px-5 text-xs font-bold text-gray-400 uppercase tracking-wider ${i === 3 ? 'text-right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 && !loadError && (
                <tr><td colSpan={4} className="py-10 text-center text-gray-400 text-sm">No Barangay admin accounts found.</td></tr>
              )}
              {rows.map((a) => (
                <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="py-3.5 px-5">
                    <p className="font-bold text-gray-900 text-sm">{a.name || 'Unnamed admin'}</p>
                    <p className="text-xs text-gray-500">{a.email}</p>
                  </td>
                  <td className="py-3.5 px-5 text-sm text-gray-700">{a.barangay ? `Brgy. ${a.barangay}` : 'None'}</td>
                  <td className="py-3.5 px-5">
                    {a.locked ? (
                      <div>
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-600">
                          <span className="w-2 h-2 rounded-full bg-red-500" /> LOCKED
                        </span>
                        {a.lockedAt && <p className="text-[11px] text-gray-400 mt-0.5">{fmt(a.lockedAt)}</p>}
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-green-600">
                        <span className="w-2 h-2 rounded-full bg-green-500" /> ACTIVE
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-5 text-right">
                    <button
                      onClick={() => { setError(''); setTarget(a); }}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                        a.locked
                          ? 'bg-green-50 hover:bg-green-100 text-green-700 border-green-200'
                          : 'bg-red-50 hover:bg-red-100 text-red-600 border-red-200'
                      }`}
                    >
                      {a.locked ? <><Unlock size={13} /> Unlock</> : <><Lock size={13} /> Lock</>}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
