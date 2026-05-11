import React, { useEffect, useState } from 'react';
import {
  CreditCard, CheckCircle2, Search, Loader2, Send, Trash2,
  AlertTriangle, X, FileText, ShieldCheck, Bell, Database,
  ChevronRight, RotateCcw, XCircle, Clock, MapPin, Phone,
  User, Eye, Package,
} from 'lucide-react';
import { db } from '../lib/firebase';
import {
  collection, onSnapshot, query, where, orderBy,
  doc, updateDoc, deleteDoc, serverTimestamp, getDocs,
  addDoc, getDoc,
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

/* ─── Status badge ─────────────────────────────────────────────────────────── */
const StatusBadge = ({ status }) => {
  const map = {
    pending:   { cls: 'bg-yellow-100 text-yellow-700', label: 'Pending' },
    approved:  { cls: 'bg-green-100 text-green-700',   label: 'Approved' },
    rejected:  { cls: 'bg-red-100 text-red-700',       label: 'Rejected' },
    released:  { cls: 'bg-blue-100 text-blue-700',     label: 'Released' },
    notified:  { cls: 'bg-purple-100 text-purple-700', label: 'Notified' },
    collected: { cls: 'bg-gray-100 text-gray-700',     label: 'Collected' },
    void:      { cls: 'bg-gray-100 text-gray-500',     label: 'Void' },
  };
  const { cls, label } = map[status] || map.pending;
  return <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cls}`}>{label}</span>;
};

/* ─── NCSID Check ───────────────────────────────────────────────────────────── */
async function checkNCSIDRegistration(record) {
  try {
    let found = false;
    const idNum = record.seniorId || record.idNumber;
    if (idNum) {
      const q = await getDocs(query(collection(db, 'users'), where('oscaId', '==', idNum)));
      if (!q.empty) found = true;
    }
    if (!found && (record.seniorName || record.fullName)) {
      const name = (record.seniorName || record.fullName || '').trim().toUpperCase();
      const q = await getDocs(query(collection(db, 'users'), where('fullNameUpper', '==', name)));
      if (!q.empty) found = true;
    }
    if (!found && record.uid) {
      const q = await getDocs(query(collection(db, 'users'), where('uid', '==', record.uid)));
      if (!q.empty) found = true;
    }
    return found;
  } catch (e) {
    console.warn('NCSID check error:', e);
    return false;
  }
}

/* ─── OSCA ID Card template (flippable) ─────────────────────────────────────── */
function OSCAIDCard({ record }) {
  const [flipped, setFlipped] = useState(false);
  const name = (record.seniorName || record.fullName || 'UNKNOWN').toUpperCase();
  const address = record.address || '—';
  const dob = record.dob || record.dateOfBirth || '—';
  const sex = record.sex || '—';
  const controlNo = record.controlNumber || record.seniorId || (record.id?.slice(-6).toUpperCase()) || '——————';
  const dateIssued = record.releasedAt?.toDate?.()?.toLocaleDateString('en-PH') || new Date().toLocaleDateString('en-PH');

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="cursor-pointer select-none"
        style={{ perspective: 800, width: 340, height: 200 }}
        onClick={() => setFlipped(f => !f)}
        title="Click to flip"
      >
        <div style={{
          position: 'relative', width: '100%', height: '100%',
          transformStyle: 'preserve-3d',
          transition: 'transform 0.6s cubic-bezier(0.4,0,0.2,1)',
          transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}>
          {/* FRONT */}
          <div style={{
            position: 'absolute', width: '100%', height: '100%', backfaceVisibility: 'hidden',
            fontFamily: 'Arial, sans-serif', border: '1.5px solid #ccc', borderRadius: 10,
            overflow: 'hidden', background: '#fff', boxShadow: '0 4px 18px rgba(0,0,0,0.12)',
          }}>
            {/* Header */}
            <div style={{ background: '#0f52ba', padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, background: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: '#0f52ba', fontWeight: 'bold', lineHeight: 1 }}>🇵🇭</span>
              </div>
              <div style={{ color: '#fff' }}>
                <div style={{ fontSize: 7, opacity: 0.85 }}>Republic of the Philippines</div>
                <div style={{ fontSize: 11, fontWeight: 'bold' }}>CITY OF VALENZUELA</div>
                <div style={{ fontSize: 7, opacity: 0.85 }}>Office of the Senior Citizens Affairs (OSCA)</div>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <div style={{ width: 28, height: 28, background: 'rgba(255,255,255,0.2)', borderRadius: 4, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <div style={{ flex: 1, background: '#e63946' }} />
                  <div style={{ flex: 1, background: '#fff' }} />
                  <div style={{ flex: 1, background: '#0f52ba' }} />
                </div>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '8px 12px', display: 'flex', gap: 10 }}>
              <div style={{ width: 60, height: 72, background: '#e5e7eb', borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, border: '1px solid #d1d5db' }}>
                👤
              </div>
              <div style={{ flex: 1, fontSize: 9 }}>
                <div style={{ fontSize: 10, fontWeight: 'bold', color: '#111', marginBottom: 2 }}>Name: {name}</div>
                <div style={{ color: '#555', fontSize: 8, marginBottom: 4 }}>Address: {address}</div>
                <div style={{ display: 'flex', gap: 12, fontSize: 8, color: '#333' }}>
                  <div>
                    <div style={{ color: '#888', fontSize: 7 }}>Date of Birth</div>
                    <div style={{ fontWeight: 600 }}>{dob}</div>
                  </div>
                  <div>
                    <div style={{ color: '#888', fontSize: 7 }}>Sex</div>
                    <div style={{ fontWeight: 600 }}>{sex}</div>
                  </div>
                  <div>
                    <div style={{ color: '#888', fontSize: 7 }}>Date Issued</div>
                    <div style={{ fontWeight: 600 }}>{dateIssued}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Control number row */}
            <div style={{ padding: '2px 12px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 7, color: '#888' }}>Control No. ___________</div>
                <div style={{ fontSize: 20, fontWeight: 'bold', color: '#e63946', letterSpacing: 2 }}>{controlNo}</div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 7, color: '#888' }}>
                <div style={{ marginBottom: 2 }}>Signature/Thumbmark</div>
                <div style={{ width: 60, height: 24, borderBottom: '1px solid #ccc' }} />
              </div>
            </div>

            {/* Footer */}
            <div style={{ background: '#0f52ba', padding: '4px 12px', textAlign: 'center', fontSize: 9, color: '#fff', letterSpacing: 0.5 }}>
              This card is non-transferable
            </div>
          </div>

          {/* BACK */}
          <div style={{
            position: 'absolute', width: '100%', height: '100%', backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            fontFamily: 'Arial, sans-serif', border: '1.5px solid #ccc', borderRadius: 10,
            overflow: 'hidden', background: '#fff', boxShadow: '0 4px 18px rgba(0,0,0,0.12)',
          }}>
            <div style={{ padding: '8px 12px', fontSize: 8, color: '#333', lineHeight: 1.7 }}>
              <div style={{ fontWeight: 'bold', fontSize: 9, color: '#0f52ba', marginBottom: 4 }}>Benefits and Privileges under R.A. 9994</div>
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
            <div style={{ fontSize: 7, color: '#666', padding: '0 12px 6px', fontStyle: 'italic' }}>
              Persons and corporations violating R.A. 9994 shall be penalized.
            </div>
            <div style={{ borderTop: '1px solid #e5e7eb', padding: '5px 12px', display: 'flex', justifyContent: 'space-between', fontSize: 8 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 80, borderBottom: '1px solid #333', marginBottom: 2 }} />
                <div style={{ color: '#888' }}>OSCA Head</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 80, borderBottom: '1px solid #333', marginBottom: 2 }} />
                <div style={{ color: '#888' }}>City Mayor</div>
              </div>
            </div>
            <div style={{ background: '#0f52ba', padding: '4px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: '#4ade80', fontSize: 8, fontWeight: 'bold' }}>Tuloy-PROGRESO, Valenzuela!</div>
              </div>
              <div style={{ color: '#fff', fontSize: 7 }}>www.valenzuela.gov.ph</div>
            </div>
          </div>
        </div>
      </div>
      <p className="text-xs text-gray-400 flex items-center gap-1">
        <RotateCcw size={11} /> Click card to flip
      </p>
    </div>
  );
}

/* ─── Delete Confirm Modal ──────────────────────────────────────────────────── */
function DeleteConfirmModal({ name, onClose, onConfirm, loading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 z-10 text-center">
        <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Trash2 size={24} className="text-red-500" />
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-1">Delete Request?</h2>
        <p className="text-sm text-gray-800 font-semibold mb-4">"{name}"</p>
        <p className="text-xs text-red-500 font-semibold bg-red-50 rounded-xl px-4 py-2 mb-6">
          This will permanently remove the record.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={onConfirm} disabled={loading} className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Request Detail Modal (super admin approve/reject) ─────────────────────── */
function RequestDetailModal({ record, onClose, onApprove, onReject, processing }) {
  const [ncsidStatus, setNcsidStatus] = useState(null);

  useEffect(() => {
    setNcsidStatus('checking');
    checkNCSIDRegistration(record).then(found => setNcsidStatus(found ? 'found' : 'not_found'));
  }, [record]);

  const name = record.seniorName || record.fullName || 'Unknown';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <FileText size={18} className="text-[#0f52ba]" /> Physical ID Request
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">Review and verify before approving</p>
          </div>
          <button onClick={onClose}><X size={18} className="text-gray-400 hover:text-gray-600" /></button>
        </div>

        {/* NCSID check */}
        <div className={`rounded-xl px-4 py-3 mb-4 flex items-center justify-between ${
          ncsidStatus === 'found' ? 'bg-green-50 border border-green-200' :
          ncsidStatus === 'not_found' ? 'bg-red-50 border border-red-200' :
          'bg-blue-50 border border-blue-100'
        }`}>
          <div className="flex items-center gap-2">
            <Database size={14} className="text-gray-500" />
            <span className="text-xs font-semibold text-gray-700">NCSID Registration Check</span>
          </div>
          {ncsidStatus === 'checking' && <span className="text-xs text-blue-600 flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Checking…</span>}
          {ncsidStatus === 'found' && <span className="text-xs text-green-700 font-semibold flex items-center gap-1"><CheckCircle2 size={11} /> Registered</span>}
          {ncsidStatus === 'not_found' && <span className="text-xs text-red-600 font-semibold flex items-center gap-1"><XCircle size={11} /> NOT Found in NCSID</span>}
        </div>

        {ncsidStatus === 'not_found' && (
          <div className="mb-4 px-4 py-2.5 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-700 font-medium flex items-start gap-2">
            <AlertTriangle size={13} className="mt-0.5 text-orange-500 shrink-0" />
            This senior is not found in NCSID records. Please verify their identity manually before approving.
          </div>
        )}

        {/* Details */}
        <div className="bg-gray-50 rounded-2xl p-4 space-y-2 mb-5">
          <div className="flex items-center gap-2"><User size={13} className="text-gray-400" /><span className="text-sm font-bold text-gray-800">{name}</span></div>
          {record.seniorId && <p className="text-xs text-gray-500 pl-5">OSCA ID: <strong className="text-blue-700">{record.seniorId}</strong></p>}
          {record.address && <p className="text-xs text-gray-500 pl-5 flex items-center gap-1"><MapPin size={10} />{record.address}</p>}
          {record.contactNumber && <p className="text-xs text-gray-500 pl-5 flex items-center gap-1"><Phone size={10} />{record.contactNumber}</p>}
          {record.barangay && <p className="text-xs text-gray-500 pl-5">Barangay: <strong>{record.barangay}</strong></p>}
          {record.reason && <p className="text-xs text-gray-400 pl-5 italic">Reason: {record.reason}</p>}
          {record.createdAt && <p className="text-xs text-gray-400 pl-5">Requested: {record.createdAt?.toDate?.()?.toLocaleDateString?.() || '—'}</p>}
        </div>

        <div className="flex gap-3">
          <button disabled={processing} onClick={() => onReject(record.id)} className="flex-1 py-3 rounded-xl border-2 border-red-200 text-red-600 font-semibold text-sm hover:bg-red-50 disabled:opacity-50 transition-colors">
            Reject
          </button>
          <button disabled={processing || ncsidStatus === 'checking'} onClick={() => onApprove(record)} className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-sm disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
            {processing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Approve Request
          </button>
        </div>
        <button onClick={onClose} className="w-full mt-3 text-sm text-gray-400 hover:text-gray-600">Cancel</button>
      </div>
    </div>
  );
}

/* ─── Release Modal (super admin: final verify before releasing to sub-admin) ── */
function ReleaseModal({ record, onClose, onRelease, processing }) {
  const [verified, setVerified] = useState(false);
  const name = record.seniorName || record.fullName || 'Unknown';
  const hasAllInfo = !!(
    (record.seniorName || record.fullName) &&
    (record.address) &&
    (record.seniorId || record.controlNumber || record.idNumber) &&
    (record.barangay || record.sub_admin_barangay)
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-lg w-full max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Send size={18} className="text-[#0f52ba]" /> Release Physical ID
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">Final verification before releasing to sub-admin</p>
          </div>
          <button onClick={onClose}><X size={18} className="text-gray-400 hover:text-gray-600" /></button>
        </div>

        {/* ID Card preview */}
        <div className="mb-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">ID Card Preview</p>
          <OSCAIDCard record={record} />
        </div>

        {/* Information completeness check */}
        <div className={`rounded-xl px-4 py-3 mb-4 ${hasAllInfo ? 'bg-green-50 border border-green-200' : 'bg-orange-50 border border-orange-200'}`}>
          <p className="text-xs font-semibold mb-2 text-gray-700">Required Information Check</p>
          {[
            { label: 'Full Name', ok: !!(record.seniorName || record.fullName) },
            { label: 'Address', ok: !!record.address },
            { label: 'OSCA ID / Control No.', ok: !!(record.seniorId || record.controlNumber || record.idNumber) },
            { label: 'Barangay Assignment', ok: !!(record.barangay || record.sub_admin_barangay) },
          ].map(({ label, ok }) => (
            <div key={label} className="flex items-center gap-2 text-xs py-0.5">
              {ok ? <CheckCircle2 size={12} className="text-green-600" /> : <XCircle size={12} className="text-orange-500" />}
              <span className={ok ? 'text-gray-700' : 'text-orange-700 font-semibold'}>{label}</span>
              {!ok && <span className="text-orange-500 italic">— Missing</span>}
            </div>
          ))}
        </div>

        {!hasAllInfo && (
          <div className="mb-4 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-semibold flex items-center gap-2">
            <AlertTriangle size={13} className="text-red-500" />
            Cannot release — required information is incomplete. Please update the senior's record first.
          </div>
        )}

        {/* Final verify checkbox */}
        {hasAllInfo && (
          <label className="flex items-start gap-2 mb-5 cursor-pointer">
            <input type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)} className="mt-0.5 accent-blue-600" />
            <span className="text-xs text-gray-600">
              I confirm that all information on this physical ID is correct and complete. This ID will be sent to the assigned sub-admin for barangay distribution.
            </span>
          </label>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button
            disabled={processing || !hasAllInfo || !verified}
            onClick={() => onRelease(record)}
            className="flex-1 py-3 rounded-xl bg-[#0f52ba] hover:bg-blue-700 text-white font-semibold text-sm disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
          >
            {processing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Release to Sub-Admin
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main page ─────────────────────────────────────────────────────────────── */
export default function IDRelease() {
  const { isSuperAdmin, isSubAdmin, adminData } = useAuth();

  const [idRequests, setIdRequests]       = useState([]);
  const [releasedIDs, setReleasedIDs]     = useState([]);
  const [loading, setLoading]             = useState(true);
  const [search, setSearch]               = useState('');
  const [processing, setProcessing]       = useState(false);
  const [toast, setToast]                 = useState('');
  const [activeTab, setActiveTab]         = useState(isSuperAdmin ? 'requests' : 'released');
  const [deleteTarget, setDeleteTarget]   = useState(null);
  const [deleting, setDeleting]           = useState(false);
  const [detailRecord, setDetailRecord]   = useState(null);
  const [releaseRecord, setReleaseRecord] = useState(null);

  // Physical ID requests
  useEffect(() => {
    const q = query(collection(db, 'id_requests'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => {
      setIdRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, []);

  // Released IDs (physical)
  useEffect(() => {
    let q;
    if (isSubAdmin && adminData?.barangay) {
      q = query(collection(db, 'released_ids'), where('barangay', '==', adminData.barangay), orderBy('releasedAt', 'desc'));
    } else {
      q = query(collection(db, 'released_ids'), orderBy('releasedAt', 'desc'));
    }
    return onSnapshot(q, snap => setReleasedIDs(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [isSubAdmin, adminData]);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3500); }

  // Super admin: approve request
  async function handleApprove(record) {
    setProcessing(true);
    try {
      await updateDoc(doc(db, 'id_requests', record.id), {
        status: 'approved',
        reviewedAt: serverTimestamp(),
      });
      setDetailRecord(null);
      showToast(`Request for ${record.seniorName || record.fullName} approved.`);
    } finally { setProcessing(false); }
  }

  // Super admin: reject request
  async function handleReject(id) {
    setProcessing(true);
    try {
      await updateDoc(doc(db, 'id_requests', id), { status: 'rejected', reviewedAt: serverTimestamp() });
      setDetailRecord(null);
      showToast('Request rejected.');
    } finally { setProcessing(false); }
  }

  // Super admin: release approved ID to sub-admin (creates released_ids doc, notifies)
  async function handleRelease(record) {
    setProcessing(true);
    try {
      await addDoc(collection(db, 'released_ids'), {
        requestId: record.id,
        seniorName: record.seniorName || record.fullName || '',
        seniorId: record.seniorId || record.idNumber || '',
        address: record.address || '',
        dob: record.dob || '',
        sex: record.sex || '',
        controlNumber: record.controlNumber || record.seniorId || record.id.slice(-6).toUpperCase(),
        barangay: record.barangay || record.sub_admin_barangay || '',
        status: 'notified',
        releasedAt: serverTimestamp(),
        releasedBy: 'super_admin',
        notifiedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'id_requests', record.id), {
        status: 'released',
        releasedAt: serverTimestamp(),
      });
      setReleaseRecord(null);
      showToast(`Physical ID for ${record.seniorName || record.fullName} released to sub-admin.`);
    } finally { setProcessing(false); }
  }

  // Sub-admin: confirm ID collected by senior
  async function handleCollected(id) {
    setProcessing(true);
    try {
      await updateDoc(doc(db, 'released_ids', id), { status: 'collected', collectedAt: serverTimestamp() });
      showToast('Marked as collected.');
    } finally { setProcessing(false); }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, deleteTarget.col, deleteTarget.id));
      showToast(`"${deleteTarget.name}" deleted.`);
      setDeleteTarget(null);
    } finally { setDeleting(false); }
  }

  // Filtered
  const filtered = (list) => list.filter(r => {
    const name = (r.seniorName || r.fullName || '').toLowerCase();
    return !search || name.includes(search.toLowerCase()) || (r.seniorId || '').includes(search);
  });

  const pending   = filtered(idRequests.filter(r => !r.status || r.status === 'pending'));
  const approved  = filtered(idRequests.filter(r => r.status === 'approved'));
  const rejected  = filtered(idRequests.filter(r => r.status === 'rejected'));
  const released  = filtered(idRequests.filter(r => r.status === 'released'));
  const myReleased = filtered(releasedIDs);
  const notified  = myReleased.filter(r => r.status === 'notified');
  const collected = myReleased.filter(r => r.status === 'collected');

  // Check for void requests: if user didn't complete sign-up
  const voidRequests = idRequests.filter(r => r.isVoid || (!r.seniorName && !r.fullName && !r.seniorId));

  const tabs = [
    ...(isSuperAdmin ? [
      { key: 'requests',  label: 'ID Requests',    badge: pending.length },
      { key: 'approved',  label: 'Approved',        badge: approved.length },
      { key: 'released',  label: 'Released',        badge: 0 },
    ] : []),
    ...(isSubAdmin ? [
      { key: 'released',  label: 'My Released IDs', badge: notified.length },
    ] : []),
  ];

  return (
    <div className="p-8 max-w-5xl mx-auto relative">

      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-fade-in">
          <CheckCircle2 size={16} className="text-green-400" /> {toast}
          <button onClick={() => setToast('')}><X size={14} className="text-white/60 hover:text-white" /></button>
        </div>
      )}

      {deleteTarget && <DeleteConfirmModal name={deleteTarget.name} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} loading={deleting} />}
      {detailRecord && <RequestDetailModal record={detailRecord} onClose={() => setDetailRecord(null)} onApprove={handleApprove} onReject={handleReject} processing={processing} />}
      {releaseRecord && <ReleaseModal record={releaseRecord} onClose={() => setReleaseRecord(null)} onRelease={handleRelease} processing={processing} />}

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <CreditCard size={24} className="text-[#0f52ba]" /> Physical ID Release
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {isSuperAdmin
            ? 'Review physical ID requests, verify against NCSID, approve and release to sub-admins by barangay.'
            : 'View and manage physical IDs assigned to your barangay for distribution.'}
        </p>
      </div>

      {/* Stats */}
      {isSuperAdmin && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Pending Requests', value: pending.length,   icon: Clock,         color: 'text-yellow-600', bg: 'bg-yellow-50' },
            { label: 'Approved',         value: approved.length,  icon: CheckCircle2,  color: 'text-green-600',  bg: 'bg-green-50'  },
            { label: 'Released',         value: released.length,  icon: Send,          color: 'text-blue-600',   bg: 'bg-blue-50'   },
            { label: 'Void / Incomplete',value: voidRequests.length, icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-50' },
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
      )}

      {isSubAdmin && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Awaiting Pickup',  value: notified.length,  icon: Bell,         color: 'text-purple-600', bg: 'bg-purple-50' },
            { label: 'Collected',        value: collected.length, icon: CheckCircle2, color: 'text-green-600',  bg: 'bg-green-50'  },
            { label: 'Total Released',   value: myReleased.length,icon: Package,      color: 'text-blue-600',   bg: 'bg-blue-50'   },
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
      )}

      {/* Search + tabs */}
      <div className="flex gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search by name or OSCA ID…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white"
          />
        </div>
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t.label}
            {t.badge > 0 && <span className="ml-1.5 bg-[#0f52ba] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{t.badge}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
      ) : (
        <>
          {/* ─ Physical ID Requests (super admin) */}
          {activeTab === 'requests' && isSuperAdmin && (
            <div>
              {/* Void notice */}
              {voidRequests.length > 0 && (
                <div className="mb-4 px-4 py-3 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-700 flex items-start gap-2">
                  <AlertTriangle size={13} className="mt-0.5 text-orange-500 shrink-0" />
                  <span><strong>{voidRequests.length}</strong> request(s) are void — the user did not complete their sign-up profile. These cannot be processed until the user fills in all required information.</span>
                </div>
              )}

              {pending.length > 0 ? (
                <div className="space-y-3">
                  <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Pending Requests ({pending.length})</h2>
                  {pending.map(r => {
                    const isVoid = r.isVoid || (!r.seniorName && !r.fullName && !r.seniorId);
                    return (
                      <div key={r.id} className={`rounded-2xl p-5 flex items-center justify-between border ${isVoid ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-white border-yellow-200'}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-gray-900">{r.seniorName || r.fullName || 'Unknown'}</p>
                            {isVoid && <span className="text-[10px] font-bold bg-gray-400 text-white px-2 py-0.5 rounded-full">VOID — INCOMPLETE</span>}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {r.seniorId ? `OSCA ID: ${r.seniorId}` : ''}
                            {r.address ? ` · 📍 ${r.address}` : ''}
                            {r.barangay ? ` · Brgy. ${r.barangay}` : ''}
                          </p>
                          {r.reason && <p className="text-xs text-gray-400 mt-0.5 italic">Reason: {r.reason}</p>}
                        </div>
                        <div className="flex items-center gap-2 ml-4 shrink-0">
                          <StatusBadge status={isVoid ? 'void' : 'pending'} />
                          {!isVoid && (
                            <button onClick={() => setDetailRecord(r)} className="flex items-center gap-1.5 text-xs font-semibold text-[#0f52ba] hover:underline">
                              <Eye size={14} /> Review
                            </button>
                          )}
                          <button onClick={() => setDeleteTarget({ id: r.id, name: r.seniorName || 'Unknown', col: 'id_requests' })}
                            className="p-1.5 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-20 text-gray-400">
                  <FileText size={40} className="mx-auto mb-3 opacity-40" />
                  <p className="font-medium">No pending ID requests</p>
                  <p className="text-xs mt-1">Requests submitted from the app will appear here</p>
                </div>
              )}

              {/* Rejected */}
              {rejected.length > 0 && (
                <div className="mt-6">
                  <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Rejected ({rejected.length})</h2>
                  <div className="space-y-2">
                    {rejected.map(r => (
                      <div key={r.id} className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center justify-between opacity-60">
                        <div>
                          <p className="font-medium text-gray-800">{r.seniorName || r.fullName || 'Unknown'}</p>
                          <p className="text-xs text-gray-400">{r.seniorId ? `OSCA ID: ${r.seniorId}` : ''}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status="rejected" />
                          <button onClick={() => setDeleteTarget({ id: r.id, name: r.seniorName || 'Unknown', col: 'id_requests' })} className="p-1.5 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50"><Trash2 size={15} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─ Approved, ready for release (super admin) */}
          {activeTab === 'approved' && isSuperAdmin && (
            <div>
              {approved.length > 0 ? (
                <>
                  <div className="mb-4 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 flex items-center gap-2">
                    <ShieldCheck size={13} className="text-blue-500" />
                    Click "Release" to do a final verification of the ID card before sending to the sub-admin.
                  </div>
                  <div className="space-y-3">
                    {approved.map(r => (
                      <div key={r.id} className="bg-white border border-green-100 rounded-2xl p-5 flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-gray-900">{r.seniorName || r.fullName || 'Unknown'}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {r.seniorId ? `OSCA ID: ${r.seniorId}` : ''}
                            {r.barangay ? ` · Brgy. ${r.barangay}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status="approved" />
                          <button
                            onClick={() => setReleaseRecord(r)}
                            className="flex items-center gap-1.5 bg-[#0f52ba] hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors"
                          >
                            <Send size={13} /> Release
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center py-20 text-gray-400">
                  <CheckCircle2 size={40} className="mx-auto mb-3 opacity-40" />
                  <p className="font-medium">No approved IDs awaiting release</p>
                </div>
              )}
            </div>
          )}

          {/* ─ Released (super admin) */}
          {activeTab === 'released' && isSuperAdmin && (
            <div>
              {released.length > 0 ? (
                <div className="space-y-2">
                  {released.map(r => (
                    <div key={r.id} className="bg-gray-50 border border-gray-100 rounded-2xl p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-800">{r.seniorName || r.fullName || 'Unknown'}</p>
                        <p className="text-xs text-gray-400">
                          {r.seniorId ? `OSCA ID: ${r.seniorId}` : ''}
                          {r.barangay ? ` · Brgy. ${r.barangay}` : ''}
                          {r.releasedAt && ` · Released ${r.releasedAt?.toDate?.()?.toLocaleDateString?.() || '—'}`}
                        </p>
                      </div>
                      <StatusBadge status="released" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-20 text-gray-400">
                  <Send size={40} className="mx-auto mb-3 opacity-40" />
                  <p className="font-medium">No IDs released yet</p>
                </div>
              )}
            </div>
          )}

          {/* ─ Sub-admin: My released IDs */}
          {activeTab === 'released' && isSubAdmin && (
            <div>
              {notified.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3 px-4 py-2.5 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-700 font-medium">
                    <Bell size={13} className="text-purple-500" />
                    You have <strong>{notified.length}</strong> physical ID(s) ready for distribution in your barangay.
                  </div>
                  <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Awaiting Pickup ({notified.length})</h2>
                  <div className="space-y-3">
                    {notified.map(r => (
                      <div key={r.id} className="bg-white border border-purple-100 rounded-2xl p-5 flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-gray-900">{r.seniorName || 'Unknown'}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {r.seniorId ? `OSCA ID: ${r.seniorId}` : ''}
                            {r.address ? ` · ${r.address}` : ''}
                          </p>
                          {r.notifiedAt && (
                            <p className="text-xs text-purple-400 mt-0.5">Released: {r.notifiedAt?.toDate?.()?.toLocaleDateString?.() || '—'}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status="notified" />
                          <button
                            disabled={processing}
                            onClick={() => handleCollected(r.id)}
                            className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors"
                          >
                            <CheckCircle2 size={12} /> Mark Collected
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {collected.length > 0 && (
                <div>
                  <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Collected ({collected.length})</h2>
                  <div className="space-y-2">
                    {collected.map(r => (
                      <div key={r.id} className="bg-gray-50 border border-gray-100 rounded-2xl p-4 flex items-center justify-between opacity-70">
                        <div>
                          <p className="font-medium text-gray-700">{r.seniorName || 'Unknown'}</p>
                          <p className="text-xs text-gray-400">Collected: {r.collectedAt?.toDate?.()?.toLocaleDateString?.() || '—'}</p>
                        </div>
                        <StatusBadge status="collected" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {myReleased.length === 0 && (
                <div className="text-center py-20 text-gray-400">
                  <Package size={40} className="mx-auto mb-3 opacity-40" />
                  <p className="font-medium">No IDs assigned to your barangay yet</p>
                  <p className="text-xs mt-1">Super admin will release IDs to you when they're ready</p>
                </div>
              )}
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
