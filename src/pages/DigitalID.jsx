import React, { useEffect, useRef, useState } from 'react';
import {
  CreditCard, CheckCircle2, Loader2, Eye, Download,
  ShieldCheck, User2, Search, AlertTriangle, X, XCircle,
  Database, RotateCcw, Shield,
} from 'lucide-react';
import { db } from '../lib/firebase';
import {
  collection, onSnapshot, query, orderBy, doc,
  updateDoc, serverTimestamp, getDocs, where, deleteDoc,
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import OSCAIdCard from '../components/Oscaidcard';

const fmt = (ts) => ts?.toDate?.()?.toLocaleDateString('en-PH') ?? '—';

/* ─── Status badge ─────────────────────────────────────────────────────────── */
const StatusBadge = ({ status }) => {
  const map = {
    released:    'bg-blue-100 text-blue-700',
    verified:    'bg-green-100 text-green-700',
    valid:       'bg-green-100 text-green-700',
    invalidated: 'bg-red-100 text-red-700',
    suspended:   'bg-orange-100 text-orange-700',
  };
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${map[status] ?? map.released}`}>
      {status?.charAt(0).toUpperCase() + status?.slice(1) ?? 'Active'}
    </span>
  );
};

/* ─── NCSID Check helper ────────────────────────────────────────────────────── */
async function checkNCSID(record) {
  try {
    let found = false;
    if (record.controlNumber) {
      const q = await getDocs(query(collection(db, 'users'), where('oscaId', '==', record.controlNumber)));
      if (!q.empty) found = true;
    }
    if (!found && record.fullName) {
      const name = record.fullName.trim().toUpperCase();
      const q = await getDocs(query(collection(db, 'users'), where('fullNameUpper', '==', name)));
      if (!q.empty) found = true;
    }
    if (!found && record.uid) {
      const q = await getDocs(query(collection(db, 'users'), where('uid', '==', record.uid)));
      if (!q.empty) found = true;
    }
    return found;
  } catch { return false; }
}

/* ─── Helper: normalise a senior record to OSCAIdCard props ─────────────────── */
function seniorToCardProps(senior) {
  const dob = senior.dob || '—';
  let dobFormatted = dob;
  if (dob && dob !== '—') {
    const isoM   = dob.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const slashM = dob.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (isoM)        dobFormatted = `${isoM[2]}-${isoM[3]}-${isoM[1].slice(2)}`;
    else if (slashM) dobFormatted = `${slashM[1].padStart(2,'0')}-${slashM[2].padStart(2,'0')}-${slashM[3].slice(2)}`;
  }

  return {
    mode: 'digital',
    name: (senior.fullName || 'UNKNOWN').toUpperCase(),
    address: senior.address || '—',
    dateOfBirth: dobFormatted,
    sex: (senior.sex || '—').toUpperCase(),
    dateIssued: fmt(senior.releasedAt),
    controlNo: senior.controlNumber || senior.id?.slice(-6).toUpperCase() || '——————',
    photoUrl: senior.photoURL || null,
  };
}

/* ─── Blank template preview — shows the ID design without personal data ──────── */
function IDTemplatePreview() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-6">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-sm font-semibold text-[#0f52ba] hover:text-blue-800 transition-colors"
      >
        <CreditCard size={15} />
        {open ? 'Hide' : 'View'} ID Card Template Design
        <span className="ml-1 text-xs font-normal text-gray-400">(blank sample)</span>
      </button>

      {open && (
        <div className="mt-4 bg-gray-50 border border-gray-200 rounded-2xl p-6 flex flex-col items-center gap-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
            Digital ID Template — Sample Design (No Personal Data)
          </p>
          <OSCAIdCard
            mode="digital"
            name="JUAN DELA CRUZ"
            address="123 Sample St., Valenzuela City"
            dateOfBirth="01-01-60"
            sex="M"
            dateIssued={new Date().toLocaleDateString('en-PH', { month: '2-digit', day: '2-digit', year: 'numeric' })}
            controlNo="SAMPLE-001"
            photoUrl={null}
          />
          <p className="text-xs text-gray-400 flex items-center gap-1.5">
            <RotateCcw size={11} /> Click the card to flip and see benefits layout
          </p>
          <div className="mt-2 px-4 py-2 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-600 text-center max-w-sm">
            This is the official OSCA Valenzuela digital ID template with real logos.
            Actual IDs will display the senior's personal information.
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Wrapper with print/download button ───────────────────────────────────── */
function DigitalIDCard({ senior }) {
  const cardRef = useRef(null);

  const handlePrint = () => {
    const content = cardRef.current?.innerHTML;
    if (!content) return;
    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>OSCA Digital ID – ${senior.fullName}</title>
      <style>* { box-sizing: border-box; margin: 0; padding: 0; } body { font-family: Arial, sans-serif; background: #f3f4f6; display: flex; justify-content: center; padding: 40px; }</style>
      </head><body><div>${content}</div></body></html>
    `);
    w.document.close();
    w.print();
  };

  const props = seniorToCardProps(senior);

  return (
    <div className="flex flex-col items-center gap-3">
      <div ref={cardRef}>
        <OSCAIdCard {...props} />
      </div>

      <p className="text-xs text-gray-400 flex items-center gap-1.5">
        <RotateCcw size={11} /> Digital ID Preview
      </p>

      <button
        onClick={handlePrint}
        className="w-full flex items-center justify-center gap-2 bg-[#0a3d91] hover:bg-blue-800 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
      >
        <Download size={15} /> Download / Print ID
      </button>
    </div>
  );
}

/* ─── Main page ─────────────────────────────────────────────────────────────── */
export default function DigitalID() {
  const { isSuperAdmin, isSubAdmin } = useAuth();

  const [digitalIDs, setDigitalIDs] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [previewID, setPreviewID]   = useState(null);
  const [ncsidMap, setNcsidMap]     = useState({}); // id -> true|false|'checking'
  const [invalidating, setInvalidating] = useState(null);
  const [toast, setToast]           = useState('');

  useEffect(() => {
    const q = query(collection(db, 'digital_ids'), orderBy('releasedAt', 'desc'));
    return onSnapshot(q, snap => {
      const ids = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setDigitalIDs(ids);
      setLoading(false);
    });
  }, []);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3500); }

  async function verifyNCSID(record) {
    setNcsidMap(m => ({ ...m, [record.id]: 'checking' }));
    const found = await checkNCSID(record);
    setNcsidMap(m => ({ ...m, [record.id]: found }));
    if (!found) showToast(`⚠️ ${record.fullName} may not be registered in NCSID.`);
  }

  async function handleInvalidate(record) {
    if (!window.confirm(`Invalidate digital ID for ${record.fullName}? This will mark it as revoked.`)) return;
    setInvalidating(record.id);
    try {
      await updateDoc(doc(db, 'digital_ids', record.id), {
        status: 'invalidated',
        invalidatedAt: serverTimestamp(),
        invalidatedReason: 'Not registered in NCSID',
      });
      showToast(`Digital ID for ${record.fullName} has been invalidated.`);
    } finally { setInvalidating(null); }
  }

  const filtered = digitalIDs.filter(r => {
    const name = (r.fullName || '').toLowerCase();
    return !search || name.includes(search.toLowerCase()) || (r.controlNumber || '').includes(search);
  });

  const active      = filtered.filter(r => !r.status || r.status === 'released' || r.status === 'valid');
  const invalidated = filtered.filter(r => r.status === 'invalidated');

  return (
    <div className="p-8 max-w-5xl mx-auto relative">

      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-fade-in">
          {toast}
          <button onClick={() => setToast('')}><X size={14} className="text-white/60 hover:text-white" /></button>
        </div>
      )}

      {/* ID preview modal */}
      {previewID && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-2xl w-full max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <CreditCard size={18} className="text-[#0f52ba]" /> Digital ID
              </h3>
              <button onClick={() => setPreviewID(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {ncsidMap[previewID.id] !== undefined && (
              <div className={`mb-4 px-4 py-2.5 rounded-xl text-xs font-medium flex items-center gap-2 ${
                ncsidMap[previewID.id] === 'checking' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                ncsidMap[previewID.id] === true ? 'bg-green-50 text-green-700 border border-green-200' :
                'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {ncsidMap[previewID.id] === 'checking' ? <><Loader2 size={12} className="animate-spin" /> Checking NCSID…</> :
                 ncsidMap[previewID.id] === true ? <><CheckCircle2 size={12} /> Confirmed registered in NCSID</> :
                 <><XCircle size={12} /> NOT found in NCSID — this ID may be invalid</>}
              </div>
            )}

            <DigitalIDCard senior={previewID} />

            {isSuperAdmin && previewID.status !== 'invalidated' && (
              <button
                onClick={() => handleInvalidate(previewID)}
                disabled={!!invalidating}
                className="mt-3 w-full py-2.5 rounded-xl border-2 border-red-200 text-red-600 font-semibold text-sm hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {invalidating === previewID.id ? <Loader2 size={14} className="animate-spin inline mr-2" /> : null}
                Invalidate This ID
              </button>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <CreditCard size={24} className="text-[#0f52ba]" /> Digital IDs
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          View all issued digital OSCA IDs · Verify registration status · Invalidate if not actually registered
        </p>
      </div>

      {/* ── ID Template Preview ── */}
      <IDTemplatePreview />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Active IDs',   value: active.length,      color: 'text-green-600', bg: 'bg-green-50', icon: Shield },
          { label: 'Invalidated',  value: invalidated.length, color: 'text-red-600',   bg: 'bg-red-50',   icon: XCircle },
          { label: 'Total Issued', value: digitalIDs.length,  color: 'text-blue-600',  bg: 'bg-blue-50',  icon: CreditCard },
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

      {isSuperAdmin && (
        <div className="mb-5 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 flex items-start gap-2">
          <Database size={13} className="text-blue-500 mt-0.5 shrink-0" />
          <span>
            As OSCA admin, you can verify each ID holder against the NCSID database. Click <strong>Check NCSID</strong> on any record. If not found, you may <strong>invalidate</strong> their digital ID.
          </span>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-6">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text" placeholder="Search by name or control number…"
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-blue-500" />
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Active Digital IDs ({active.length})</h2>
              <div className="space-y-3">
                {active.map(r => (
                  <div key={r.id} className="bg-white border border-gray-100 rounded-2xl p-5 flex items-center justify-between hover:border-blue-200 transition-colors">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                        <User2 size={18} className="text-[#0f52ba]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-gray-900">{r.fullName}</p>
                          {ncsidMap[r.id] === true && (
                            <span className="flex items-center gap-1 text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                              <CheckCircle2 size={9} /> NCSID ✓
                            </span>
                          )}
                          {ncsidMap[r.id] === false && (
                            <span className="flex items-center gap-1 text-[10px] font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                              <AlertTriangle size={9} /> Not in NCSID
                            </span>
                          )}
                          {ncsidMap[r.id] === 'checking' && (
                            <span className="text-[10px] text-blue-500 flex items-center gap-1"><Loader2 size={9} className="animate-spin" /> Checking…</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Ctrl No. <span className="font-bold text-red-500">{r.controlNumber}</span>
                          {' · '}Released {fmt(r.releasedAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4 shrink-0">
                      <StatusBadge status={r.status || 'released'} />
                      {isSuperAdmin && (
                        <button
                          onClick={() => verifyNCSID(r)}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:underline font-semibold"
                        >
                          <Database size={12} /> Check NCSID
                        </button>
                      )}
                      <button
                        onClick={() => { setPreviewID(r); if (isSuperAdmin) verifyNCSID(r); }}
                        className="flex items-center gap-1.5 text-xs font-semibold text-[#0f52ba] hover:underline"
                      >
                        <Eye size={14} /> View ID
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {invalidated.length > 0 && (
            <div>
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Invalidated IDs ({invalidated.length})</h2>
              <div className="space-y-2">
                {invalidated.map(r => (
                  <div key={r.id} className="bg-red-50/50 border border-red-100 rounded-2xl p-4 flex items-center justify-between opacity-60">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-red-100 rounded-xl flex items-center justify-center">
                        <XCircle size={15} className="text-red-500" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-700">{r.fullName}</p>
                        <p className="text-xs text-gray-400">
                          Ctrl No. {r.controlNumber} · Invalidated {fmt(r.invalidatedAt)}
                          {r.invalidatedReason && ` — ${r.invalidatedReason}`}
                        </p>
                      </div>
                    </div>
                    <StatusBadge status="invalidated" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {filtered.length === 0 && (
            <div className="text-center py-20 text-gray-400">
              <CreditCard size={40} className="mx-auto mb-3 opacity-40" />
              <p className="font-medium">{search ? 'No results found' : 'No digital IDs issued yet'}</p>
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
