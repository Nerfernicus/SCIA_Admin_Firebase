import React, { useEffect, useRef, useState } from 'react';
import {
  CreditCard, Loader2, Eye, Download,
  ShieldCheck, User2, Search, X, XCircle,
  Shield, RotateCcw,
} from 'lucide-react';
import { db } from '../lib/firebase';
import {
  collection, onSnapshot, query, orderBy, doc,
  updateDoc, setDoc, serverTimestamp, where,
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import OSCAIdCard from '../components/Oscaidcard';

const fmt = (ts) => ts?.toDate?.()?.toLocaleDateString('en-PH') ?? 'N/A';

/* Status badge */
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

/* Helper: normalise a senior record to OSCAIdCard props */
function seniorToCardProps(senior) {
  const dob = senior.dob || 'N/A';
  let dobFormatted = dob;
  if (dob && dob !== 'N/A') {
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
  const { t } = useLang();
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-6">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-sm font-semibold text-[#0f52ba] hover:text-blue-800 transition-colors"
      >
        <CreditCard size={15} />
        {open ? t.hideTemplate : t.viewTemplate}
        <span className="ml-1 text-xs font-normal text-gray-400">{t.blankSample}</span>
      </button>

      {open && (
        <div className="mt-4 bg-gray-50 border border-gray-200 rounded-2xl p-6 flex flex-col items-center gap-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
            {t.sampleDesignNoData}
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
            <RotateCcw size={11} /> {t.clickToFlip}
          </p>
          <div className="mt-2 px-4 py-2 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-600 text-center max-w-sm">
            {t.templateNote}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Wrapper with print/download button ───────────────────────────────────── */
function DigitalIDCard({ senior }) {
  const { t } = useLang();
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
        <RotateCcw size={11} /> {t.digitalIdPreview}
      </p>

      <button
        onClick={handlePrint}
        className="w-full flex items-center justify-center gap-2 bg-[#0a3d91] hover:bg-blue-800 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
      >
        <Download size={15} /> {t.downloadPrintId}
      </button>
    </div>
  );
}

/* Main page */
export default function DigitalID() {
  const { isSuperAdmin, isSubAdmin } = useAuth();
  const { t } = useLang();

  const [digitalIDs, setDigitalIDs] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [previewID, setPreviewID]   = useState(null);
  const [invalidating, setInvalidating] = useState(null);
  const [toast, setToast]           = useState('');

  // Seniors OSCA approved in ID Verification but with no digital ID yet get a "Release" button below
  const [verifiedPending, setVerifiedPending] = useState([]);
  const [releasing, setReleasing] = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'digital_ids'), orderBy('releasedAt', 'desc'));
    return onSnapshot(q, snap => {
      const ids = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setDigitalIDs(ids);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    const q = query(collection(db, 'id_verifications'), where('status', '==', 'approved'));
    return onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.reviewedAt?.toMillis?.() || 0) - (a.reviewedAt?.toMillis?.() || 0));
      setVerifiedPending(list);
    });
  }, [isSuperAdmin]);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3500); }

  // Builds the digital ID from the senior's verified record using the same OSCAIdCard template
  async function releaseDigitalId(record) {
    const uid = record.uid;
    if (!uid) { showToast(t.digitalIdNoLinkedAccount); return; }
    setReleasing(record.id);
    try {
      const controlNumber = record.idNumber || record.seniorId || uid.slice(-6).toUpperCase();
      await setDoc(doc(db, 'digital_ids', uid), {
        uid, fullName: record.fullName || record.seniorName || '',
        firstName: record.firstName || '', lastName: record.lastName || record.surname || '',
        middleName: record.middleName || '', dob: record.dob || record.dateOfBirth || '',
        sex: record.sex || '', address: record.address || '', barangay: record.barangay || '',
        email: record.email || '', idNumber: record.idNumber || record.seniorId || '',
        idImageUrl: record.idImageUrl || '', controlNumber,
        status: 'active', isVerified: true,
        createdAt: serverTimestamp(), releasedAt: serverTimestamp(), sourceDocId: record.id,
      }, { merge: true });
      showToast(`${t.digitalIdReleasedFor} ${record.fullName || record.seniorName}.`);
    } catch (err) {
      console.error(err);
      showToast(t.digitalIdReleaseFailed);
    } finally {
      setReleasing(null);
    }
  }

  async function handleInvalidate(record) {
    if (!window.confirm(`${t.invalidateConfirm} ${record.fullName}? ${t.invalidateConfirmSuffix}`)) return;
    setInvalidating(record.id);
    try {
      await updateDoc(doc(db, 'digital_ids', record.id), {
        status: 'invalidated',
        invalidatedAt: serverTimestamp(),
        invalidatedReason: 'Invalidated by OSCA admin',
      });
      showToast(`${t.digitalIdInvalidatedFor} ${record.fullName} ${t.digitalIdInvalidatedSuffix}`);
    } finally { setInvalidating(null); }
  }

  // Verified seniors who don't have a digital_ids doc yet (matched by uid)
  const readyToRelease = verifiedPending.filter(
    r => r.uid && !digitalIDs.some(d => d.id === r.uid)
  );

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
                <CreditCard size={18} className="text-[#0f52ba]" /> {t.digitalId}
              </h3>
              <button onClick={() => setPreviewID(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <DigitalIDCard senior={previewID} />

            {isSuperAdmin && previewID.status !== 'invalidated' && (
              <button
                onClick={() => handleInvalidate(previewID)}
                disabled={!!invalidating}
                className="mt-3 w-full py-2.5 rounded-xl border-2 border-red-200 text-red-600 font-semibold text-sm hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {invalidating === previewID.id ? <Loader2 size={14} className="animate-spin inline mr-2" /> : null}
                {t.invalidateThisId}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <CreditCard size={24} className="text-[#0f52ba]" /> {t.digitalIdsTitle}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {t.digitalIdsSubtitle}
        </p>
      </div>

      {/* ── ID Template Preview ── */}
      <IDTemplatePreview />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
          { label: t.statActiveIds,   value: active.length,      color: 'text-green-600', bg: 'bg-green-50', icon: Shield },
          { label: t.statInvalidated, value: invalidated.length, color: 'text-red-600',   bg: 'bg-red-50',   icon: XCircle },
          { label: t.statTotalIssued, value: digitalIDs.length,  color: 'text-blue-600',  bg: 'bg-blue-50',  icon: CreditCard },
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
        <div className="mb-6">
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">
            {t.readyForReleaseSection} ({readyToRelease.length})
          </h2>
          {readyToRelease.length === 0 ? (
            <p className="text-xs text-gray-400 mb-2">{t.noSeniorsReady}</p>
          ) : (
            <div className="space-y-3">
              {readyToRelease.map(record => (
                <div key={record.id} className="bg-white border border-gray-100 rounded-2xl p-5 flex items-center justify-between hover:border-green-200 transition-colors">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center shrink-0">
                      <ShieldCheck size={18} className="text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900">{record.fullName || record.seniorName}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {t.verifiedLabel} {fmt(record.reviewedAt)}{record.barangay ? ` · Brgy. ${record.barangay}` : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => releaseDigitalId(record)}
                    disabled={releasing === record.id}
                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors shrink-0"
                  >
                    {releasing === record.id ? <Loader2 size={13} className="animate-spin" /> : <CreditCard size={13} />}
                    {t.releaseDigitalId}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Search */}
      <div className="relative mb-6">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text" placeholder={t.searchByNameOrControl}
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
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">{t.activeDigitalIds} ({active.length})</h2>
              <div className="space-y-3">
                {active.map(r => (
                  <div key={r.id} className="bg-white border border-gray-100 rounded-2xl p-5 flex items-center justify-between hover:border-blue-200 transition-colors">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                        <User2 size={18} className="text-[#0f52ba]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900">{r.fullName}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {t.ctrlNo} <span className="font-bold text-red-500">{r.controlNumber}</span>
                          {' · '}{t.releasedLabel} {fmt(r.releasedAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4 shrink-0">
                      <StatusBadge status={r.status || 'released'} />
                      <button
                        onClick={() => setPreviewID(r)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-[#0f52ba] hover:underline"
                      >
                        <Eye size={14} /> {t.viewId}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {invalidated.length > 0 && (
            <div>
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">{t.invalidatedIds} ({invalidated.length})</h2>
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
                          {t.ctrlNo} {r.controlNumber} · {t.invalidatedLabel} {fmt(r.invalidatedAt)}
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
              <p className="font-medium">{search ? t.noResultsFound : t.noDigitalIdsYet}</p>
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
