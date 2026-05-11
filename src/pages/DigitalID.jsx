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

/* ─── Flippable OSCA Digital ID Card ───────────────────────────────────────── */
function DigitalIDCard({ senior }) {
  const [flipped, setFlipped] = useState(false);
  const cardRef = useRef(null);

  const name       = (senior.fullName || 'UNKNOWN').toUpperCase();
  const address    = senior.address || '—';
  const dob        = senior.dob || '—';
  const sex        = senior.sex || '—';
  const controlNo  = senior.controlNumber || senior.id?.slice(-6).toUpperCase() || '——————';
  const dateIssued = fmt(senior.releasedAt);

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

  return (
    <div className="flex flex-col items-center gap-3">
      <div ref={cardRef}>
        {/* 3D flip container */}
        <div
          style={{ perspective: 900, width: 340, height: 210, cursor: 'pointer' }}
          onClick={() => setFlipped(f => !f)}
          title="Click to flip"
        >
          <div style={{
            position: 'relative', width: '100%', height: '100%',
            transformStyle: 'preserve-3d',
            transition: 'transform 0.65s cubic-bezier(0.4,0,0.2,1)',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}>
            {/* ── FRONT ── */}
            <div style={{
              position: 'absolute', width: '100%', height: '100%', backfaceVisibility: 'hidden',
              fontFamily: 'Arial, sans-serif', border: '1.5px solid #bbb',
              borderRadius: 10, overflow: 'hidden', background: '#fff',
              boxShadow: '0 6px 24px rgba(0,0,0,0.14)',
            }}>
              {/* Blue header */}
              <div style={{ background: '#0f52ba', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, background: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18 }}>
                  🇵🇭
                </div>
                <div style={{ color: '#fff', flex: 1 }}>
                  <div style={{ fontSize: 7.5, opacity: 0.88 }}>Republic of the Philippines</div>
                  <div style={{ fontSize: 12, fontWeight: 'bold', letterSpacing: 0.3 }}>CITY OF VALENZUELA</div>
                  <div style={{ fontSize: 7.5, opacity: 0.88 }}>Office of the Senior Citizens Affairs (OSCA)</div>
                </div>
                {/* Colorful logo placeholder */}
                <div style={{ width: 30, height: 30, borderRadius: 4, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.4)', flexShrink: 0 }}>
                  <div style={{ height: '33%', background: '#e63946' }} />
                  <div style={{ height: '33%', background: '#fff' }} />
                  <div style={{ height: '34%', background: '#0f52ba' }} />
                </div>
              </div>

              {/* Body */}
              <div style={{ padding: '9px 12px', display: 'flex', gap: 10 }}>
                <div style={{ width: 64, height: 78, background: '#e5e7eb', borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, border: '1px solid #d1d5db', color: '#9ca3af' }}>
                  👤
                </div>
                <div style={{ flex: 1, fontSize: 9 }}>
                  <div style={{ fontSize: 9.5, fontWeight: 'bold', color: '#111', marginBottom: 3 }}>Name: <span style={{ color: '#0f52ba' }}>{name}</span></div>
                  <div style={{ color: '#555', fontSize: 8, marginBottom: 5 }}>Address: {address}</div>
                  <div style={{ display: 'flex', gap: 14, fontSize: 8 }}>
                    <div>
                      <div style={{ color: '#888', fontSize: 7 }}>Date of Birth</div>
                      <div style={{ fontWeight: 600, color: '#333' }}>{dob}</div>
                    </div>
                    <div>
                      <div style={{ color: '#888', fontSize: 7 }}>Sex</div>
                      <div style={{ fontWeight: 600, color: '#333' }}>{sex}</div>
                    </div>
                    <div>
                      <div style={{ color: '#888', fontSize: 7 }}>Date Issued</div>
                      <div style={{ fontWeight: 600, color: '#333' }}>{dateIssued}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Control number row */}
              <div style={{ padding: '2px 12px 7px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: 7, color: '#888', marginBottom: 1 }}>Control No. ___________</div>
                  <div style={{ fontSize: 22, fontWeight: 'bold', color: '#e63946', letterSpacing: 2 }}>{controlNo}</div>
                </div>
                <div style={{ textAlign: 'right', fontSize: 7, color: '#888' }}>
                  <div style={{ marginBottom: 2 }}>Signature / Thumbmark</div>
                  <div style={{ width: 70, height: 22, borderBottom: '1px solid #bbb' }} />
                </div>
              </div>

              {/* Green verified bar */}
              <div style={{ background: '#16a34a', padding: '3px 12px', fontSize: 8, color: '#fff', display: 'flex', alignItems: 'center', gap: 5 }}>
                ✓ Digitally Verified — Valid OSCA ID
              </div>

              {/* Blue footer */}
              <div style={{ background: '#0f52ba', padding: '4px 12px', textAlign: 'center', fontSize: 8.5, color: '#fff', letterSpacing: 0.5 }}>
                This card is non-transferable
              </div>
            </div>

            {/* ── BACK ── */}
            <div style={{
              position: 'absolute', width: '100%', height: '100%', backfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              fontFamily: 'Arial, sans-serif', border: '1.5px solid #bbb',
              borderRadius: 10, overflow: 'hidden', background: '#fff',
              boxShadow: '0 6px 24px rgba(0,0,0,0.14)',
            }}>
              <div style={{ padding: '9px 12px', fontSize: 8, color: '#333', lineHeight: 1.75 }}>
                <div style={{ fontWeight: 'bold', fontSize: 9.5, color: '#0f52ba', marginBottom: 5 }}>Benefits and Privileges under R.A. 9994</div>
                1. Free medical / dental, diagnostic &amp; laboratory services in all government facilities<br />
                2. 20% discount for medicines<br />
                3. 20% discount in hotels, restaurants &amp; recreation centers<br />
                4. 20% discount in theaters, cinema houses &amp; concert halls<br />
                5. 20% discount in medical / dental services, diagnostic &amp; laboratory fees in private facilities<br />
                6. 20% discount in fare for domestic air, sea travel &amp; public land transportations<br />
                7. 5% discount in basic necessities &amp; primary commodities<br />
                8. 12% VAT-exemption on the purchase of goods &amp; services entitled to the 20% discount<br />
                9. 5% discount for monthly water &amp; electricity (meter under senior's name)
              </div>
              <div style={{ fontSize: 7, color: '#666', padding: '0 12px 5px', fontStyle: 'italic' }}>
                Persons and corporations violating R.A. 9994 shall be penalized.<br />
                Only for the exclusive use of senior citizens; abuse of privileges is punishable by law.
              </div>
              <div style={{ borderTop: '1px solid #e5e7eb', padding: '5px 12px', display: 'flex', justifyContent: 'space-between', fontSize: 8 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ width: 90, borderBottom: '1px solid #444', marginBottom: 2 }} />
                  <div style={{ color: '#555', fontWeight: 600 }}>OSCA Head</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ width: 90, borderBottom: '1px solid #444', marginBottom: 2 }} />
                  <div style={{ color: '#555', fontWeight: 600 }}>City Mayor</div>
                </div>
              </div>
              <div style={{ background: '#0f52ba', padding: '5px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ color: '#4ade80', fontSize: 8, fontWeight: 'bold' }}>Tuloy-PROGRESO, Valenzuela!</div>
                <div style={{ color: '#fff', fontSize: 7.5 }}>www.valenzuela.gov.ph</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Flip hint */}
      <p className="text-xs text-gray-400 flex items-center gap-1.5">
        <RotateCcw size={11} /> Click the card to flip and see benefits
      </p>

      {/* Print/download */}
      <button
        onClick={handlePrint}
        className="w-full flex items-center justify-center gap-2 bg-[#0f52ba] hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
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

  // Verify a single record against NCSID
  async function verifyNCSID(record) {
    setNcsidMap(m => ({ ...m, [record.id]: 'checking' }));
    const found = await checkNCSID(record);
    setNcsidMap(m => ({ ...m, [record.id]: found }));
    if (!found) {
      showToast(`⚠️ ${record.fullName} may not be registered in NCSID.`);
    }
  }

  // Super admin: invalidate a digital ID (senior not actually registered)
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
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <CreditCard size={18} className="text-[#0f52ba]" /> Digital ID
              </h3>
              <button onClick={() => setPreviewID(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {/* NCSID status in modal */}
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

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Active IDs',      value: active.length,      color: 'text-green-600', bg: 'bg-green-50',  icon: Shield },
          { label: 'Invalidated',     value: invalidated.length, color: 'text-red-600',   bg: 'bg-red-50',    icon: XCircle },
          { label: 'Total Issued',    value: digitalIDs.length,  color: 'text-blue-600',  bg: 'bg-blue-50',   icon: CreditCard },
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

      {/* NCSID verification banner */}
      {isSuperAdmin && (
        <div className="mb-5 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 flex items-start gap-2">
          <Database size={13} className="text-blue-500 mt-0.5 shrink-0" />
          <span>
            As super admin, you can verify each ID holder against the NCSID database. Click the <strong>Check NCSID</strong> button on any record. If a holder is not found, you may <strong>invalidate</strong> their digital ID.
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
          {/* Active IDs */}
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
                          {/* NCSID status inline */}
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

          {/* Invalidated IDs */}
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
// comment