import { useEffect, useMemo, useState } from 'react';
import {
  collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where,
} from 'firebase/firestore';
import { ClipboardCheck, CheckCircle2, XCircle, Loader2, Trash2 } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'completed_claimed', label: 'Needs review' },
  { key: 'already', label: 'Already registered' },
  { key: 'started', label: 'Started' },
  { key: 'verified', label: 'Verified' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'cancelled', label: 'Cancelled' },
];

const BADGE = {
  started: 'bg-yellow-100 text-yellow-800',
  cancelled: 'bg-gray-200 text-gray-700',
  completed_claimed: 'bg-blue-100 text-blue-800',
  verified: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

const LABEL = {
  started: 'Started',
  cancelled: 'Cancelled',
  completed_claimed: 'Says finished',
  verified: 'Verified',
  rejected: 'Rejected',
};

const SOURCE = {
  mobile_app: 'Mobile app',
  assisted_signup: 'Assisted sign-up',
};

// 'already' is not a status: it is the seniors who answered "Yes, I'm registered"
const matches = (r, key) => (key === 'all' ? true : key === 'already' ? !!r.alreadyRegistered : r.status === key);

const fmt = (ts) => ts?.toDate?.()?.toLocaleString?.() || '-';

export default function NcscRegistrations() {
  const { adminData, isSuperAdmin } = useAuth();
  const myBarangay = adminData?.barangay || null;

  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('all');
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [toDelete, setToDelete] = useState(null); // one record at a time, never a batch

  useEffect(() => {
    if (!adminData) return undefined;
    const col = collection(db, 'ncsc_registrations');
    // Barangay-scoped admins must filter, otherwise the query fails the read rule
    const q = !isSuperAdmin && myBarangay
      ? query(col, where('barangay', '==', myBarangay))
      : col;

    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.updatedAt?.seconds ?? 0) - (a.updatedAt?.seconds ?? 0));
        setRows(list);
        setError('');
      },
      (e) => setError(e.message),
    );
  }, [adminData, isSuperAdmin, myBarangay]);

  const visible = useMemo(
    () => rows.filter((r) => matches(r, filter)),
    [rows, filter],
  );

  const review = async (row, status) => {
    setBusyId(row.id);
    try {
      await updateDoc(doc(db, 'ncsc_registrations', row.id), {
        status,
        reviewedBy: auth.currentUser?.uid ?? null,
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  // Single delete only. firestore.rules lets only the master admin delete.
  const confirmDelete = async () => {
    if (!toDelete) return;
    const row = toDelete;
    setBusyId(row.id);
    try {
      await deleteDoc(doc(db, 'ncsc_registrations', row.id));
      setToDelete(null);
    } catch (e) {
      setError(e.message);
      setToDelete(null);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto font-sans">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ClipboardCheck size={22} className="text-[#0f52ba]" /> NCSC Registrations
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Seniors who were sent to the NCSC Senior Citizens Data Form, and seniors who said they are
          already registered (their ID number is shown under their name). Verify a record only after
          you have checked the registration on NCSC yourself.
          {myBarangay && !isSuperAdmin && ` Showing Brgy. ${myBarangay} only.`}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
              filter === f.key
                ? 'bg-[#0f52ba] text-white border-[#0f52ba]'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {f.label}
            {f.key !== 'all' && (
              <span className="ml-1 opacity-70">
                ({rows.filter((r) => matches(r, f.key)).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto bg-white rounded-2xl border border-gray-100 shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Senior</th>
              <th className="px-4 py-3 font-semibold">Barangay</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Source</th>
              <th className="px-4 py-3 font-semibold">Started</th>
              <th className="px-4 py-3 font-semibold">Last update</th>
              <th className="px-4 py-3 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  No records
                </td>
              </tr>
            )}
            {visible.map((r) => (
              <tr key={r.id} className="border-t border-gray-100">
                <td className="px-4 py-3">
                  <div className="font-semibold text-gray-900">{r.fullName || 'Unknown'}</div>
                  <div className="text-xs text-gray-400 font-mono">{r.id}</div>
                  {r.alreadyRegistered && (
                    <div className="text-xs text-emerald-700 mt-0.5">
                      Already registered{r.idNumber ? ` · OSCA ID ${r.idNumber}` : ''}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">{r.barangay || '-'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${BADGE[r.status] || ''}`}>
                    {LABEL[r.status] || r.status}
                  </span>
                </td>
                <td className="px-4 py-3">{SOURCE[r.source] || '-'}</td>
                <td className="px-4 py-3">{fmt(r.startedAt)}</td>
                <td className="px-4 py-3">{fmt(r.updatedAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                  {r.status === 'completed_claimed' ? (
                    <>
                      <button
                        disabled={busyId === r.id}
                        onClick={() => review(r, 'verified')}
                        className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-bold flex items-center gap-1 disabled:opacity-50"
                      >
                        {busyId === r.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                        Verify
                      </button>
                      <button
                        disabled={busyId === r.id}
                        onClick={() => review(r, 'rejected')}
                        className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1 disabled:opacity-50"
                      >
                        <XCircle size={13} /> Reject
                      </button>
                    </>
                  ) : (
                    <span className="text-gray-300">-</span>
                  )}
                  {isSuperAdmin && (
                    <button
                      disabled={busyId === r.id}
                      onClick={() => setToDelete(r)}
                      title="Delete this record"
                      className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {toDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-gray-900">Delete this record?</h2>
            <p className="mt-2 text-sm text-gray-600">
              <span className="font-semibold">{toDelete.fullName || 'Unknown'}</span>
              {toDelete.idNumber ? ` (OSCA ID ${toDelete.idNumber})` : ''} will be removed from NCSC
              Registrations. This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setToDelete(null)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={busyId === toDelete.id}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-sm font-bold text-white flex items-center gap-1 disabled:opacity-50"
              >
                {busyId === toDelete.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
