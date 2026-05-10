import React, { useEffect, useRef, useState } from 'react';
import {
  CreditCard, CheckCircle2, Clock as ClockIcon, XCircle, Eye, Loader2,
  Download, Send, ShieldCheck, User2, RefreshCw,
} from 'lucide-react';
import { db } from '../lib/firebase';
import {
  collection, onSnapshot, query, orderBy, doc,
  updateDoc, serverTimestamp, where, addDoc, getDocs,
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

/* ─── helpers ─────────────────────────────────────────────────────────────── */
const fmt = (ts) => ts?.toDate?.()?.toLocaleDateString('en-PH') ?? '—';

const StatusBadge = ({ status }) => {
  const map = {
    pending:  'bg-yellow-100 text-yellow-700',
    verified: 'bg-green-100  text-green-700',
    approved: 'bg-green-100  text-green-700',
    rejected: 'bg-red-100    text-red-700',
    released: 'bg-blue-100   text-blue-700',
  };
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${map[status] ?? map.pending}`}>
      {status?.charAt(0).toUpperCase() + status?.slice(1) ?? 'Pending'}
    </span>
  );
};

/* ─── Digital ID Card (printable / downloadable) ──────────────────────────── */
function IDCard({ senior }) {
  const cardRef = useRef(null);

  const handlePrint = () => {
    const content = cardRef.current?.innerHTML;
    if (!content) return;
    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>OSCA Digital ID – ${senior.fullName}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; background: #f3f4f6; display: flex; justify-content: center; padding: 40px; }
        .card { width: 340px; }
      </style></head>
      <body><div class="card">${content}</div></body></html>
    `);
    w.document.close();
    w.print();
  };

  const today = senior.releasedAt
    ? fmt(senior.releasedAt)
    : new Date().toLocaleDateString('en-PH');

  return (
    <div>
      {/* Card front */}
      <div ref={cardRef}>
        <div style={{ width: 340, fontFamily: 'Arial, sans-serif', border: '1px solid #ccc', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
          {/* Header */}
          <div style={{ background: '#0f52ba', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, background: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 16, color: '#0f52ba', fontWeight: 'bold' }}>PH</span>
            </div>
            <div style={{ color: '#fff' }}>
              <div style={{ fontSize: 8, opacity: 0.85 }}>Republic of the Philippines</div>
              <div style={{ fontSize: 12, fontWeight: 'bold' }}>CITY OF VALENZUELA</div>
              <div style={{ fontSize: 8, opacity: 0.85 }}>Office of the Senior Citizens Affairs (OSCA)</div>
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: '10px 12px', display: 'flex', gap: 10 }}>
            {/* Photo placeholder */}
            <div style={{ width: 64, height: 78, background: '#e5e7eb', borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: '#9ca3af' }}>
              👤
            </div>
            <div style={{ flex: 1, fontSize: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 'bold', color: '#0f52ba', marginBottom: 4 }}>{senior.fullName?.toUpperCase()}</div>
              <div style={{ color: '#555', fontSize: 9, marginBottom: 6 }}>{senior.address}</div>
              <table style={{ fontSize: 9, color: '#333', width: '100%' }}>
                <tbody>
                  <tr><td style={{ color: '#888', paddingRight: 4 }}>Date of Birth:</td><td>{senior.dob || '—'}</td></tr>
                  <tr><td style={{ color: '#888', paddingRight: 4 }}>Sex:</td><td>{senior.sex || '—'}</td></tr>
                  <tr><td style={{ color: '#888', paddingRight: 4 }}>Date Issued:</td><td>{today}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Control number row */}
          <div style={{ padding: '4px 12px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 8, color: '#888' }}>Control No.</div>
              <div style={{ fontSize: 20, fontWeight: 'bold', color: '#e63946', letterSpacing: 1 }}>{senior.controlNumber || senior.id?.slice(-6).toUpperCase()}</div>
            </div>
            {/* Simple QR placeholder */}
            <div style={{ width: 48, height: 48, background: '#000', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 6 }}>QR</div>
          </div>

          {/* Valid seal */}
          <div style={{ background: '#16a34a', padding: '3px 12px', fontSize: 9, color: '#fff', display: 'flex', alignItems: 'center', gap: 4 }}>
            ✓ Digitally Verified — Valid ID
          </div>

          {/* Footer */}
          <div style={{ background: '#0f52ba', padding: '5px 12px', textAlign: 'center', fontSize: 9, color: '#fff' }}>
            This card is non-transferable
          </div>
        </div>

        {/* Card back */}
        <div style={{ width: 340, fontFamily: 'Arial, sans-serif', border: '1px solid #ccc', borderRadius: 10, overflow: 'hidden', background: '#fff', marginTop: 8 }}>
          <div style={{ padding: '10px 12px', fontSize: 9, color: '#333', lineHeight: 1.6 }}>
            <div style={{ fontWeight: 'bold', fontSize: 10, color: '#0f52ba', marginBottom: 4 }}>Benefits and Privileges under R.A. 9994</div>
            1. Free medical/dental, diagnostic &amp; laboratory services in all govt. facilities<br />
            2. 20% discount for medicines<br />
            3. 20% discount in hotels, restaurants &amp; recreation centers<br />
            4. 20% discount in theaters, cinema houses &amp; concert halls<br />
            5. 20% discount in medical/dental services in private facilities<br />
            6. 20% discount in fare for domestic air, sea &amp; land transportation<br />
            7. 5% discount in basic necessities &amp; primary commodities<br />
            8. 12% VAT-exemption on purchases with the 20% discount<br />
            9. 5% discount on monthly water &amp; electricity bills
          </div>
          <div style={{ borderTop: '1px solid #e5e7eb', padding: '6px 12px', display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#888' }}>
            <span>OSCA Head</span>
            <span>City Mayor</span>
          </div>
          <div style={{ background: '#0f52ba', padding: '4px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#fff', fontSize: 9 }}>www.valenzuela.gov.ph</span>
          </div>
        </div>
      </div>

      <button
        onClick={handlePrint}
        className="mt-4 w-full flex items-center justify-center gap-2 bg-[#0f52ba] hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
      >
        <Download size={15} /> Download / Print ID
      </button>
    </div>
  );
}

/* ─── Main page ───────────────────────────────────────────────────────────── */
export default function DigitalID() {
  const { isSuperAdmin, isSubAdmin } = useAuth();

  const [verifications, setVerifications] = useState([]);
  const [digitalIDs, setDigitalIDs]       = useState([]);
  const [loading, setLoading]             = useState(true);
  const [selected, setSelected]           = useState(null);   // for review modal
  const [previewID, setPreviewID]         = useState(null);   // for digital ID preview
  const [processing, setProcessing]       = useState(false);
  const [tab, setTab]                     = useState(isSuperAdmin ? 'verify' : 'release');

  /* listen to id_verifications */
  useEffect(() => {
    const q = query(collection(db, 'id_verifications'), orderBy('submittedAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setVerifications(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, []);

  /* listen to digital_ids */
  useEffect(() => {
    const q = query(collection(db, 'digital_ids'), orderBy('releasedAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setDigitalIDs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  /* super admin: approve / reject verification */
  async function handleVerify(id, decision) {
    setProcessing(true);
    try {
      await updateDoc(doc(db, 'id_verifications', id), {
        status: decision,
        reviewedAt: serverTimestamp(),
      });
      setSelected(null);
    } finally { setProcessing(false); }
  }

  /* sub admin (or super admin): release → create digital_ids document */
  async function handleRelease(record) {
    setProcessing(true);
    try {
      // check not already released
      const existing = await getDocs(
        query(collection(db, 'digital_ids'), where('verificationId', '==', record.id))
      );
      if (!existing.empty) {
        alert('Digital ID already released for this record.');
        return;
      }
      await addDoc(collection(db, 'digital_ids'), {
        verificationId: record.id,
        uid:            record.uid ?? null,
        fullName:       record.fullName ?? record.seniorName ?? '',
        address:        record.address ?? '',
        dob:            record.dob ?? '',
        sex:            record.sex ?? '',
        controlNumber:  record.controlNumber ?? record.id.slice(-6).toUpperCase(),
        releasedAt:     serverTimestamp(),
        releasedBy:     'admin',
      });
      await updateDoc(doc(db, 'id_verifications', record.id), {
        released:   true,
        releasedAt: serverTimestamp(),
      });
    } finally { setProcessing(false); }
  }

  /* derived lists */
  const pending   = verifications.filter(r => !r.status || r.status === 'pending');
  const verified  = verifications.filter(r => r.status === 'verified' || r.status === 'approved');
  const rejected  = verifications.filter(r => r.status === 'rejected');
  const readyToRelease = verified.filter(r => !r.released);
  const releasedIDs    = digitalIDs;

  /* ── tabs available per role */
  const tabs = [
    ...(isSuperAdmin ? [{ key: 'verify',  label: 'Verification',  icon: ShieldCheck, badge: pending.length }] : []),
    { key: 'release', label: 'ID Release',    icon: Send,         badge: readyToRelease.length },
    { key: 'ids',     label: 'Digital IDs',   icon: CreditCard,   badge: releasedIDs.length },
  ];

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Page heading */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <CreditCard size={24} className="text-[#0f52ba]" /> OSCA Digital ID
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {isSuperAdmin
            ? 'Verify registrations, release digital IDs, and view issued IDs.'
            : 'Release verified IDs and view issued digital IDs.'}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Pending',    value: pending.length,         icon: ClockIcon,         color: 'text-yellow-600', bg: 'bg-yellow-50' },
          { label: 'Verified',   value: verified.length,        icon: CheckCircle2,  color: 'text-green-600',  bg: 'bg-green-50'  },
          { label: 'Rejected',   value: rejected.length,        icon: XCircle,       color: 'text-red-600',    bg: 'bg-red-50'    },
          { label: 'IDs Issued', value: releasedIDs.length,     icon: CreditCard,    color: 'text-blue-600',   bg: 'bg-blue-50'   },
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

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5 ${
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <t.icon size={14} />
            {t.label}
            {t.badge > 0 && (
              <span className="ml-1 bg-[#0f52ba] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-blue-500" />
        </div>
      ) : (
        <>
          {/* ── TAB: Verification (super admin only) */}
          {tab === 'verify' && isSuperAdmin && (
            <>
              {pending.length > 0 && (
                <section className="mb-6">
                  <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Pending Review</h2>
                  <div className="space-y-3">
                    {pending.map(r => (
                      <div key={r.id} className="bg-white border border-yellow-200 rounded-2xl p-5 flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-gray-900">{r.fullName ?? r.seniorName ?? 'Unknown'}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {r.address} · {r.email} · Submitted {fmt(r.submittedAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status="pending" />
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
                </section>
              )}

              {verified.length > 0 && (
                <section className="mb-6">
                  <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Verified</h2>
                  <div className="space-y-2">
                    {verified.map(r => (
                      <div key={r.id} className="bg-white border border-green-100 rounded-2xl p-4 flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-800">{r.fullName ?? r.seniorName}</p>
                          <p className="text-xs text-gray-400">{r.email} · Reviewed {fmt(r.reviewedAt)}</p>
                        </div>
                        <StatusBadge status="verified" />
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {rejected.length > 0 && (
                <section>
                  <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Rejected</h2>
                  <div className="space-y-2">
                    {rejected.map(r => (
                      <div key={r.id} className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center justify-between opacity-60">
                        <div>
                          <p className="font-medium text-gray-700">{r.fullName ?? r.seniorName}</p>
                          <p className="text-xs text-gray-400">{r.email}</p>
                        </div>
                        <StatusBadge status="rejected" />
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {verifications.length === 0 && (
                <div className="text-center py-20 text-gray-400">
                  <ShieldCheck size={40} className="mx-auto mb-3 opacity-40" />
                  <p className="font-medium">No verification requests yet</p>
                </div>
              )}
            </>
          )}

          {/* ── TAB: ID Release (sub admin + super admin) */}
          {tab === 'release' && (
            <>
              {readyToRelease.length > 0 ? (
                <section className="mb-6">
                  <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Ready for Digital ID Release</h2>
                  <div className="space-y-3">
                    {readyToRelease.map(r => (
                      <div key={r.id} className="bg-white border border-blue-100 rounded-2xl p-5 flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-gray-900">{r.fullName ?? r.seniorName ?? 'Unknown'}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {r.address} · Verified {fmt(r.reviewedAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status="verified" />
                          <button
                            disabled={processing}
                            onClick={() => handleRelease(r)}
                            className="flex items-center gap-1.5 bg-[#0f52ba] hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors"
                          >
                            {processing ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                            Release Digital ID
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : (
                <div className="text-center py-20 text-gray-400">
                  <CheckCircle2 size={40} className="mx-auto mb-3 opacity-40" />
                  <p className="font-medium">No verified IDs awaiting release</p>
                  <p className="text-xs mt-1">Super admin must verify registrations first.</p>
                </div>
              )}

              {/* already released */}
              {verified.filter(r => r.released).length > 0 && (
                <section>
                  <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Already Released</h2>
                  <div className="space-y-2">
                    {verified.filter(r => r.released).map(r => (
                      <div key={r.id} className="bg-gray-50 border border-gray-100 rounded-2xl p-4 flex items-center justify-between opacity-70">
                        <div>
                          <p className="font-medium text-gray-700">{r.fullName ?? r.seniorName}</p>
                          <p className="text-xs text-gray-400">Released {fmt(r.releasedAt)}</p>
                        </div>
                        <StatusBadge status="released" />
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {/* ── TAB: Digital IDs */}
          {tab === 'ids' && (
            <>
              {releasedIDs.length === 0 ? (
                <div className="text-center py-20 text-gray-400">
                  <CreditCard size={40} className="mx-auto mb-3 opacity-40" />
                  <p className="font-medium">No digital IDs issued yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {releasedIDs.map(r => (
                    <div key={r.id} className="bg-white border border-gray-100 rounded-2xl p-5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                          <User2 size={18} className="text-[#0f52ba]" />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{r.fullName}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Ctrl No. <span className="font-bold text-red-500">{r.controlNumber}</span>
                            {' · '}Released {fmt(r.releasedAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status="released" />
                        <button
                          onClick={() => setPreviewID(r)}
                          className="flex items-center gap-1.5 text-xs font-semibold text-[#0f52ba] hover:underline"
                        >
                          <Eye size={14} /> View ID
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Review Modal (super admin) */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Review Registration</h3>
            <p className="text-sm text-gray-500 mb-4">
              {selected.fullName ?? selected.seniorName} · {selected.email}
            </p>

            {/* uploaded ID image */}
            {(selected.idImageUrl || selected.imageBase64) && (
              <img
                src={selected.idImageUrl ?? `data:image/jpeg;base64,${selected.imageBase64}`}
                alt="Submitted ID"
                className="w-full rounded-xl border border-gray-200 mb-4 object-cover"
              />
            )}

            {/* info */}
            <div className="grid grid-cols-2 gap-3 mb-6 text-sm">
              {[
                ['Address', selected.address],
                ['Date of Birth', selected.dob],
                ['Sex', selected.sex],
                ['Contact', selected.phone ?? selected.contactNumber],
                ['Submitted', fmt(selected.submittedAt)],
              ].map(([k, v]) => v ? (
                <div key={k} className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400">{k}</p>
                  <p className="font-medium text-gray-800 mt-0.5">{v}</p>
                </div>
              ) : null)}
            </div>

            <div className="flex gap-3">
              <button
                disabled={processing}
                onClick={() => handleVerify(selected.id, 'rejected')}
                className="flex-1 py-3 rounded-xl border-2 border-red-200 text-red-600 font-semibold text-sm hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                Reject
              </button>
              <button
                disabled={processing}
                onClick={() => handleVerify(selected.id, 'verified')}
                className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-sm transition-colors disabled:opacity-50"
              >
                {processing ? 'Saving…' : 'Verify & Approve'}
              </button>
            </div>
            <button onClick={() => setSelected(null)} className="w-full mt-3 text-sm text-gray-400 hover:text-gray-600">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Digital ID Preview Modal */}
      {previewID && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Digital ID</h3>
              <button onClick={() => setPreviewID(null)} className="text-gray-400 hover:text-gray-600 text-sm">✕ Close</button>
            </div>
            <IDCard senior={previewID} />
          </div>
        </div>
      )}
    </div>
  );
}
