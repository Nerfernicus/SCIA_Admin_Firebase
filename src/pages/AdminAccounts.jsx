import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { ShieldCheck, Lock, Unlock, Search, X, Loader2, AlertCircle, CheckCircle2, Pencil, UserPlus, Copy } from 'lucide-react';
import { db, functions } from '../lib/firebase';
import { DISTRICTS, barangaysOf } from '../lib/barangay';
import Combobox from '../components/Combobox';

const setAdminLock = httpsCallable(functions, 'setAdminLock');
const createSubAdmin = httpsCallable(functions, 'createSubAdmin');
const updateSubAdmin = httpsCallable(functions, 'updateSubAdmin');

const errMsg = (e) => e?.message?.replace(/^.*?:\s*/, '') || 'Something went wrong. Please try again.';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const INPUT = 'w-full bg-white text-gray-900 border border-gray-200 rounded-xl py-2.5 px-3 text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300';
const LABEL = 'block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5';

const fmt = (t) => {
  const d = t?.toDate ? t.toDate() : null;
  return d ? d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
};

// The OSCA admin and any sub admin with no barangay oversee every barangay.
const isMasterRow = (a) => a.role === 'super_admin' || !a.barangay;

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
        <p className="text-xs text-gray-500 mb-4">{isMasterRow(admin) ? 'All barangays (Master)' : `Brgy. ${admin.barangay}`}</p>
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

// Add (admin = null) or edit (admin = row) an admin. After a successful
// create, the temporary password is shown once so OSCA can hand it over.
// A Master account oversees every barangay, so it has no barangay.
function AdminFormModal({ admin, onClose, onSaved }) {
  const editing = !!admin;
  const isOsca = admin?.role === 'super_admin';
  const [allBarangays, setAllBarangays] = useState(editing && !admin.barangay);
  const isMain = isOsca || allBarangays;
  const [form, setForm] = useState({
    name: admin?.name || '', email: admin?.email || '', barangay: admin?.barangay || '',
    contactNumber: admin?.contactNumber || '', position: admin?.position || '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (form.name.trim().length < 2) return setError('Enter the admin\'s full name.');
    if (!EMAIL_RE.test(form.email.trim())) return setError('Enter a valid email address.');
    if (!isMain && !form.barangay) return setError('Choose a barangay.');
    setBusy(true);
    setError('');
    try {
      if (editing) {
        await updateSubAdmin({ uid: admin.id, ...form, barangay: isMain ? '' : form.barangay, allBarangays: isMain });
        onSaved(`${form.name.trim()} updated.`);
      } else {
        const { data } = await createSubAdmin({ ...form, barangay: isMain ? '' : form.barangay, allBarangays: isMain });
        setCreated(data);
      }
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const copyPw = async () => {
    try { await navigator.clipboard.writeText(created.tempPassword); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
  };

  return (
    <div className="fixed inset-0 z-10000 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={busy ? undefined : (created ? () => onSaved(`${created.email} created.`) : onClose)} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 z-10 max-h-[90vh] overflow-y-auto">
        {created ? (
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={26} className="text-green-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Sub Admin account created</h2>
            <p className="text-sm text-gray-600 mb-4">{created.email}</p>
            <p className={LABEL}>Temporary password</p>
            <div className="flex items-center justify-center gap-2 mb-3">
              <span className="font-mono text-2xl font-bold tracking-wider text-gray-900">{created.tempPassword}</span>
              <button onClick={copyPw} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600" aria-label="Copy password">
                {copied ? <CheckCircle2 size={16} className="text-green-600" /> : <Copy size={16} />}
              </button>
            </div>
            <p className="text-xs font-semibold text-amber-700 bg-amber-50 rounded-xl px-4 py-2 mb-5">
              This password is shown only once. Give it to the admin securely.
            </p>
            <button onClick={() => onSaved(`${created.email} created.`)} className="w-full py-3 rounded-xl bg-brand hover:bg-blue-800 text-white text-sm font-bold">Done</button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                {editing ? <Pencil size={18} className="text-brand" /> : <UserPlus size={18} className="text-brand" />}
                {editing ? (isMain ? 'Edit Master Admin' : 'Edit Barangay Admin') : 'Add Sub Admin'}
              </h2>
              <button type="button" onClick={onClose} disabled={busy} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className={LABEL} htmlFor="sa-name">Full name</label>
                <input id="sa-name" className={INPUT} value={form.name} onChange={set('name')} maxLength={80} autoComplete="off" />
              </div>
              <div>
                <label className={LABEL} htmlFor="sa-email">Email (login)</label>
                <input id="sa-email" type="email" className={INPUT} value={form.email} onChange={set('email')} maxLength={120} autoComplete="off" />
              </div>
              {!isOsca && (
                <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={allBarangays}
                    onChange={(e) => setAllBarangays(e.target.checked)}
                  />
                  <span>
                    <span className="font-bold">Master account</span>
                    <span className="block text-xs text-gray-500">Oversees every barangay, so no barangay is assigned.</span>
                  </span>
                </label>
              )}
              {!isMain && (
                <div>
                  <label className={LABEL} htmlFor="sa-brgy">Barangay</label>
                  <Combobox ariaLabel="Barangay" className={INPUT} value={form.barangay}
                    onChange={(b) => set('barangay')({ target: { value: b } })}
                    options={DISTRICTS.flatMap((d) => barangaysOf(d))} placeholder="Search or select barangay" />
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={LABEL} htmlFor="sa-phone">Contact number</label>
                  <input id="sa-phone" className={INPUT} value={form.contactNumber} onChange={set('contactNumber')} placeholder="09XXXXXXXXX" inputMode="tel" maxLength={15} />
                </div>
                <div>
                  <label className={LABEL} htmlFor="sa-pos">Position</label>
                  <input id="sa-pos" className={INPUT} value={form.position} onChange={set('position')} maxLength={60} />
                </div>
              </div>
            </div>
            {!editing && <p className="text-xs text-gray-500 mt-4">A temporary password is generated when you create the account.</p>}
            {editing && form.email.trim().toLowerCase() !== (admin.email || '').toLowerCase() && (
              <p className="text-xs font-semibold text-amber-700 bg-amber-50 rounded-xl px-4 py-2 mt-4">Changing the email changes what this admin types to log in.</p>
            )}
            {error && (
              <p role="alert" className="text-xs font-medium text-red-600 mt-4 flex items-center gap-1"><AlertCircle size={12} /> {error}</p>
            )}
            <div className="flex gap-3 mt-5">
              <button type="button" onClick={onClose} disabled={busy} className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-60">Cancel</button>
              <button type="submit" disabled={busy} className="flex-1 py-3 rounded-xl bg-brand hover:bg-blue-800 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60">
                {busy && <Loader2 size={15} className="animate-spin" />}
                {editing ? 'Save changes' : 'Create account'}
              </button>
            </div>
          </form>
        )}
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
  const [lockedLocal, setLockedLocal] = useState(() => ({})); // optimistic lock states not yet confirmed: { [uid]: boolean }
  const [formFor, setFormFor] = useState(undefined); // undefined = closed, null = add, row = edit

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'admins'),
      (snap) => {
        setAdmins(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((a) => ['sub_admin', 'super_admin'].includes(String(a.role).trim()))
            .sort((a, b) =>
              isMasterRow(b) - isMasterRow(a) ||
              String(a.barangay || '').localeCompare(String(b.barangay || ''))),
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
    setTimeout(() => setToast(''), 4500);
  };

  const confirm = async () => {
    if (!target) return;
    setBusy(true);
    setError('');
    // Optimistic: the row flips and the dialog closes at once; if the server refuses, the row goes back and an error shows.
    const who = target.name || target.email;
    const next = !target.locked;
    const drop = () => setLockedLocal((p) => { const n = { ...p }; delete n[target.id]; return n; });
    setLockedLocal((p) => ({ ...p, [target.id]: next }));
    setTarget(null);
    showToast(`${who} ${next ? 'locked' : 'unlocked'}.`);
    try {
      await setAdminLock({ uid: target.id, locked: next });
      setTimeout(drop, 3000); // let the live snapshot catch up first
    } catch (e) {
      drop();
      showToast(`Could not ${next ? 'lock' : 'unlock'} ${who}, so it was restored. ${e?.message?.replace(/^.*?:\s*/, '') || 'Please try again.'}`);
    } finally {
      setBusy(false);
    }
  };

  const view = admins.map((a) => (a.id in lockedLocal ? { ...a, locked: lockedLocal[a.id] } : a));
  const s = search.trim().toLowerCase();
  const rows = view.filter(
    (a) =>
      !s ||
      String(a.name || '').toLowerCase().includes(s) ||
      String(a.email || '').toLowerCase().includes(s) ||
      String(a.barangay || '').toLowerCase().includes(s),
  );
  const lockedCount = view.filter((a) => a.locked).length;

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

      {formFor !== undefined && (
        <AdminFormModal
          admin={formFor}
          onClose={() => setFormFor(undefined)}
          onSaved={(msg) => { setFormFor(undefined); showToast(msg); }}
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
            <ShieldCheck size={22} className="text-brand" /> Barangay Admin Accounts
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Add Sub Admin accounts and edit their details. Lock an account that is unattended, compromised or no longer needed. Locked admins are signed out and cannot log in until unlocked.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setFormFor(null)}
          className="inline-flex items-center gap-2 bg-brand hover:bg-blue-800 text-white text-sm font-bold rounded-xl px-4 py-2.5 transition-colors icon-btn"
        >
          <UserPlus size={16} /> Add Sub Admin
        </button>
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
                  <td className="py-3.5 px-5 text-sm text-gray-700">
                    {isMasterRow(a) ? 'All barangays (Master)' : `Brgy. ${a.barangay}`}
                  </td>
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
                  <td className="py-3.5 px-5 text-right whitespace-nowrap">
                    <button
                      onClick={() => setFormFor(a)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 mr-2 rounded-lg text-xs font-bold border transition-colors bg-blue-50 hover:bg-blue-100 text-brand border-blue-200 icon-btn"
                    >
                      <Pencil size={13} /> Edit
                    </button>
                    {a.role !== 'super_admin' && (
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
                    )}
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
