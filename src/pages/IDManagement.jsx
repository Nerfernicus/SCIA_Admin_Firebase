import React, { useEffect, useState } from 'react';
import {
  ShieldCheck, Clock as ClockIcon, CheckCircle2, XCircle, Eye,
  Loader2, Trash2, AlertTriangle, X, User, Search, Database,
  FileImage, FileText, MapPin, Phone, CreditCard,
  Send, Bell, Package,
} from 'lucide-react';
import { db } from '../lib/firebase';
import {
  collection, onSnapshot, query, orderBy, where,
  doc, updateDoc, deleteDoc, serverTimestamp,
  getDocs, addDoc, getDoc, writeBatch,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import OSCAIdCard from '../components/Oscaidcard';
import { setIdRequestStatus, buildStatusPayload, ID_STATUS } from '../lib/idRequestStatus';

/* Helpers */
const hasBirthday = r => !!(r.dob || r.dateOfBirth || r.birthday);
const fmtDate = ts => ts?.toDate?.()?.toLocaleDateString?.() || null;

// New labels fall back to English until you add keys to LangContext.
const L = (t, key, fallback) => (t && t[key]) || fallback;

// Linked to id_requests unless it came from OSCA-ID verification (no physical request behind those)
const isLinkedRelease = r => !!r.requestId && r.sourceType !== 'id_verification';

// Requests where the senior followed up float to the top of a list.
const followUpsFirst = list =>
  [...list].sort((a, b) => ((b.followUpCount || 0) > 0) - ((a.followUpCount || 0) > 0));

/* ─── Status Badge ───────────────────────────────────────────────────────────── */
const StatusBadge = ({ status }) => {
  const { t } = useLang();
  const map = {
    pending:    { cls: 'bg-yellow-100 text-yellow-700',  label: t.statusPending   },
    approved:   { cls: 'bg-green-100 text-green-700',    label: t.statusApproved  },
    rejected:   { cls: 'bg-red-100 text-red-700',        label: t.statusRejected  },
    verified:   { cls: 'bg-green-100 text-green-700',    label: t.statusVerified  },
    released:   { cls: 'bg-blue-100 text-blue-700',      label: t.statusReleased  },
    notified:   { cls: 'bg-purple-100 text-purple-700',  label: t.statusNotified  },
    collected:  { cls: 'bg-gray-100 text-gray-700',      label: t.statusCollected },
    void:       { cls: 'bg-gray-100 text-gray-500',      label: t.statusVoid      },
    processing: { cls: 'bg-indigo-100 text-indigo-700',  label: L(t, 'statusProcessing', 'Processing') },
    delivered:  { cls: 'bg-blue-100 text-blue-700',      label: L(t, 'statusDelivered',  'Delivered to barangay') },
    received:   { cls: 'bg-teal-100 text-teal-700',      label: L(t, 'statusReceived',   'Received by barangay') },
    done:       { cls: 'bg-green-100 text-green-700',    label: L(t, 'statusClaimed',    'Claimed') },
    cancelled:  { cls: 'bg-red-100 text-red-700',        label: L(t, 'statusCancelled',  'Cancelled') },
  };
  const { cls, label } = map[status] || map.pending;
  return <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cls}`}>{label}</span>;
};

/* Follow-up badge + note (senior nudged OSCA about their request) */
function FollowUpBadge({ record }) {
  const { t } = useLang();
  const n = record.followUpCount || 0;
  if (!n) return null;
  const when = fmtDate(record.lastFollowUpAt);
  return (
    <span className="flex items-center gap-1 text-[10px] font-bold bg-amber-500 text-white px-2 py-0.5 rounded-full">
      <Bell size={9} /> {L(t, 'followUpLabel', 'Follow-up')} ×{n}{when ? ` · ${when}` : ''}
    </span>
  );
}

function FollowUpNote({ record }) {
  if (!record.followUpCount || !record.lastFollowUpNote) return null;
  return <p className="text-xs text-amber-600 mt-0.5 italic">"{record.lastFollowUpNote}"</p>;
}

/* Birthday warning pill */
function BirthdayWarning() {
  const { t } = useLang();
  return (
    <p className="text-xs text-orange-500 pl-5 font-semibold flex items-center gap-1">
      <AlertTriangle size={11} /> {t.birthdayNotOnRecordPill}
    </p>
  );
}

/* Delete confirm modal */
function DeleteConfirmModal({ name, onClose, onConfirm, loading }) {
  const { t } = useLang();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 z-10 text-center">
        <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Trash2 size={24} className="text-red-500" />
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-1">{t.deleteRequestTitle}</h2>
        <p className="text-sm text-gray-500 mb-1">{t.deleteRequestBody1}</p>
        <p className="text-sm font-bold text-gray-800 mb-4">"{name}"</p>
        <p className="text-xs text-red-500 font-semibold bg-red-50 rounded-xl px-4 py-2 mb-6">
          {t.deleteRequestWarning}
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50">{t.cancel}</button>
          <button onClick={onConfirm} disabled={loading} className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} {t.delete}
          </button>
        </div>
      </div>
    </div>
  );
}

/* Cancel request modal (OSCA) — asks for a reason the senior will see */
function CancelRequestModal({ record, onClose, onConfirm, processing }) {
  const { t } = useLang();
  const [reason, setReason] = useState('');
  const name = record.seniorName || record.fullName || t.unknownLabel;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 z-10">
        <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <XCircle size={24} className="text-red-500" />
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-1 text-center">{L(t, 'cancelRequestTitle', 'Cancel this ID request?')}</h2>
        <p className="text-sm font-bold text-gray-800 mb-3 text-center">"{name}"</p>
        <p className="text-xs text-gray-500 mb-2">{L(t, 'cancelReasonHint', 'The senior will be notified. Add a reason so they know what to do next.')}</p>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={3}
          maxLength={200}
          placeholder={L(t, 'cancelReasonPlaceholder', 'Reason (optional)')}
          className="w-full rounded-xl border border-gray-200 text-sm p-3 mb-5 focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-red-300"
        />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50">{L(t, 'keepRequest', 'Keep request')}</button>
          <button onClick={() => onConfirm(record, reason)} disabled={processing} className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2">
            {processing ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />} {L(t, 'cancelRequestAction', 'Cancel request')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── OSCA ID Submission Review Modal ────────────────────────────────────────── */
function OSCASubmissionModal({ record, onClose, onDecision, processing }) {
  const { t } = useLang();
  const missingBirthday = !hasBirthday(record);
  const canApprove = !processing;

  const name = record.fullName || record.seniorName || t.unknownLabel;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-lg w-full max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck size={20} className="text-[#0f52ba]" />
              <h3 className="text-lg font-bold text-gray-900">{t.oscaVerifTitle}</h3>
            </div>
            <p className="text-xs text-gray-400">{t.oscaVerifSubtitle}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={18} /></button>
        </div>

        {/* Senior info */}
        <div className="bg-gray-50 rounded-2xl px-4 py-3 mb-5 space-y-1.5">
          <div className="flex items-center gap-2">
            <User size={14} className="text-gray-400" />
            <span className="text-sm font-bold text-gray-800">{name}</span>
          </div>
          {record.idNumber && (
            <div className="flex items-center gap-2 pl-1">
              <ShieldCheck size={13} className="text-blue-400" />
              <span className="text-xs text-gray-600">{t.oscaIdOnCard}: <strong className="text-blue-700">{record.idNumber}</strong></span>
            </div>
          )}
          {record.dob && <p className="text-xs text-gray-400 pl-5"><span style={{display:'inline-flex',alignItems:'center',gap:'4px'}}><svg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'><rect x='3' y='10' width='18' height='12' rx='2'/><path d='M8 10V7a4 4 0 0 1 8 0v3'/><line x1='12' y1='14' x2='12' y2='18'/></svg> {t.dobLabel}:</span> <strong>{record.dob}</strong></p>}
          {record.email && <p className="text-xs text-gray-400 pl-5">{record.email}</p>}
          {record.address && <p className="text-xs text-gray-400 pl-5">{record.address}</p>}
          {record.barangay && <p className="text-xs text-gray-400 pl-5">{t.barangayLabel}: <strong>{record.barangay}</strong></p>}
          {record.sex && <p className="text-xs text-gray-400 pl-5">{t.sexLabel}: {record.sex}</p>}
          {record.submittedAt && (
            <p className="text-xs text-gray-400 pl-5">{t.submittedLabel}: {record.submittedAt?.toDate?.()?.toLocaleDateString?.() || 'N/A'}</p>
          )}
          {missingBirthday && <BirthdayWarning />}
        </div>

        {/* Uploaded ID photo */}
        <div className="mb-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
            <FileImage size={12} /> {t.uploadedIdPhoto}
          </p>
          {(record.idImageUrl || record.imageBase64) ? (
            <img
              src={record.idImageUrl ?? `data:image/jpeg;base64,${record.imageBase64}`}
              alt="Submitted OSCA ID"
              className="w-full rounded-xl border border-gray-200 object-contain max-h-64"
            />
          ) : (
            <div className="w-full rounded-xl border border-dashed border-gray-200 py-10 flex flex-col items-center gap-2 text-gray-400">
              <FileImage size={28} className="opacity-30" />
              <p className="text-xs">{t.noIdImageUploaded}</p>
            </div>
          )}
        </div>

        <div className="mb-4 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 font-medium flex items-start gap-2">
          <CreditCard size={13} className="text-blue-500 mt-0.5 shrink-0" />
          <span>{t.approveVerifyNote}</span>
        </div>

        <div className="flex gap-3">
          <button
            disabled={processing}
            onClick={() => onDecision(record.id, 'rejected')}
            className="flex-1 py-3 rounded-xl border-2 border-red-200 text-red-600 font-semibold text-sm hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {t.reject}
          </button>
          <button
            disabled={!canApprove}
            onClick={() => onDecision(record.id, 'approved', 'id_verifications', record)}
            className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {processing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {t.approveVerify}
          </button>
        </div>
        <button onClick={onClose} className="w-full mt-3 text-sm text-gray-400 hover:text-gray-600">{t.cancel}</button>
      </div>
    </div>
  );
}

/* Physical ID Request Review Modal */
function PhysicalIDModal({ record, onClose, onDecision, processing }) {
  const { t } = useLang();
  const missingBirthday = !hasBirthday(record);
  const name = record.seniorName || record.fullName || t.unknownLabel;
  const canApprove = !processing;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <FileText size={18} className="text-[#0f52ba]" /> {t.physicalIdReqTitle}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">{t.reviewReqDetails}</p>
          </div>
          <button onClick={onClose}><X size={18} className="text-gray-400 hover:text-gray-600" /></button>
        </div>

        <div className="bg-gray-50 rounded-2xl p-4 space-y-1.5 mb-5">
          <div className="flex items-center gap-2">
            <User size={13} className="text-gray-400" />
            <span className="text-sm font-bold text-gray-800">{name}</span>
          </div>
          {record.seniorId      && <p className="text-xs text-gray-500 pl-5">{t.oscaIdPrefix}: <strong className="text-blue-700">{record.seniorId}</strong></p>}
          {(record.dob || record.dateOfBirth) && <p className="text-xs text-gray-500 pl-5"><span style={{display:'inline-flex',alignItems:'center',gap:'4px'}}><svg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'><rect x='3' y='10' width='18' height='12' rx='2'/><path d='M8 10V7a4 4 0 0 1 8 0v3'/><line x1='12' y1='14' x2='12' y2='18'/></svg> {t.dobLabel}:</span> <strong>{record.dob || record.dateOfBirth}</strong></p>}
          {record.address       && <p className="text-xs text-gray-500 pl-5 flex items-center gap-1"><MapPin size={10} />{record.address}</p>}
          {record.contactNumber && <p className="text-xs text-gray-500 pl-5 flex items-center gap-1"><Phone size={10} />{record.contactNumber}</p>}
          <p className="text-xs text-gray-500 pl-5 flex items-center gap-1">
            {t.barangayLabel}: {record.barangay
              ? <strong>{record.barangay}</strong>
              : <span className="text-orange-500 font-semibold italic">{t.notSpecified}</span>}
          </p>
          {record.reason    && <p className="text-xs text-gray-400 pl-5 italic">{t.reasonLabel}: {record.reason}</p>}
          {record.createdAt && <p className="text-xs text-gray-400 pl-5">{t.requestedLabel}: {record.createdAt?.toDate?.()?.toLocaleDateString?.() || 'N/A'}</p>}
          {missingBirthday && <BirthdayWarning />}
        </div>

        <div className="flex gap-3">
          <button
            disabled={processing}
            onClick={() => onDecision(record.id, 'rejected', 'id_requests', record)}
            className="flex-1 py-3 rounded-xl border-2 border-red-200 text-red-600 font-semibold text-sm hover:bg-red-50 disabled:opacity-50 transition-colors"
          >
            {t.reject}
          </button>
          <button
            disabled={!canApprove}
            onClick={() => onDecision(record.id, 'approved', 'id_requests', record)}
            className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-sm disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {processing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {t.approveRequest}
          </button>
        </div>
        <button onClick={onClose} className="w-full mt-3 text-sm text-gray-400 hover:text-gray-600">{t.cancel}</button>
      </div>
    </div>
  );
}

/* OSCA ID Card adapter, uses shared Oscaidcard template */
function OSCAIDCard({ record }) {
  const dob = record.dob || record.dateOfBirth || 'N/A';
  let dobFormatted = dob;
  if (dob && dob !== 'N/A') {
    const isoM   = dob.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const slashM = dob.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (isoM)        dobFormatted = `${isoM[2]}-${isoM[3]}-${isoM[1].slice(2)}`;
    else if (slashM) dobFormatted = `${slashM[1].padStart(2,'0')}-${slashM[2].padStart(2,'0')}-${slashM[3].slice(2)}`;
  }
  const dateIssued = record.releasedAt?.toDate?.()
    ? record.releasedAt.toDate().toLocaleDateString('en-PH', { month: '2-digit', day: '2-digit', year: 'numeric' })
    : new Date().toLocaleDateString('en-PH', { month: '2-digit', day: '2-digit', year: 'numeric' });

  return (
    <div className="flex flex-col items-center gap-2">
      <OSCAIdCard
        mode="physical"
        name={(record.seniorName || record.fullName || 'UNKNOWN').toUpperCase()}
        address={record.address || '—'}
        dateOfBirth={dobFormatted}
        sex={(record.sex || '—').toUpperCase()}
        dateIssued={dateIssued}
        controlNo={record.controlNumber || record.seniorId || record.idNumber || (record.id?.slice(-6).toUpperCase()) || '——————'}
        photoUrl={record.photoURL || null}
      />
    </div>
  );
}

/* ─── Release (Mark delivered) Modal ─────────────────────────────────────────── */
function ReleaseModal({ record, onClose, onRelease, processing }) {
  const { t } = useLang();
  const [verified, setVerified] = useState(false);
  const missingBirthday = !hasBirthday(record);

  const hasAllInfo = !!(
    (record.seniorName || record.fullName) &&
    record.address &&
    (record.seniorId || record.controlNumber || record.idNumber) &&
    (record.barangay || record.sub_admin_barangay) &&
    !missingBirthday   // birthday is now a required field for release
  );

  const checks = [
    { label: t.fullName,               ok: !!(record.seniorName || record.fullName) },
    { label: t.dateOfBirthCheck,       ok: !missingBirthday },
    { label: t.addressCheck,           ok: !!record.address },
    { label: t.oscaIdControlNoCheck,   ok: !!(record.seniorId || record.controlNumber || record.idNumber) },
    { label: t.barangayAssignmentCheck,ok: !!(record.barangay || record.sub_admin_barangay) },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-lg w-full max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Send size={18} className="text-[#0f52ba]" /> {t.releasePhysicalId}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">{t.finalVerificationSubtitle}</p>
          </div>
          <button onClick={onClose}><X size={18} className="text-gray-400 hover:text-gray-600" /></button>
        </div>

        <div className="mb-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{t.idCardPreview}</p>
          <OSCAIDCard record={record} />
        </div>

        {/* Information check */}
        <div className={`rounded-xl px-4 py-3 mb-4 ${hasAllInfo ? 'bg-green-50 border border-green-200' : 'bg-orange-50 border border-orange-200'}`}>
          <p className="text-xs font-semibold mb-2 text-gray-700">{t.requiredInfoCheck}</p>
          {checks.map(({ label, ok }) => (
            <div key={label} className="flex items-center gap-2 text-xs py-0.5">
              {ok ? <CheckCircle2 size={12} className="text-green-600" /> : <XCircle size={12} className="text-orange-500" />}
              <span className={ok ? 'text-gray-700' : 'text-orange-700 font-semibold'}>{label}</span>
              {!ok && <span className="text-orange-500 italic">— {t.missing}</span>}
            </div>
          ))}
        </div>

        {/* Birthday-specific block */}
        {missingBirthday && (
          <div className="mb-4 px-4 py-2.5 bg-red-50 border border-red-300 rounded-xl text-xs text-red-700 font-semibold flex items-start gap-2">
            <AlertTriangle size={13} className="text-red-500 mt-0.5 shrink-0" />
            <span>
              <strong>{t.cannotRelease}</strong> — {t.birthdayNotOnRecordRelease}
            </span>
          </div>
        )}

        {!hasAllInfo && !missingBirthday && (
          <div className="mb-4 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-semibold flex items-center gap-2">
            <AlertTriangle size={13} className="text-red-500" />
            {t.cannotReleaseIncomplete}
          </div>
        )}

        {hasAllInfo && (
          <label className="flex items-start gap-2 mb-5 cursor-pointer">
            <input type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)} className="mt-0.5 accent-blue-600" />
            <span className="text-xs text-gray-600">
              {t.confirmReleaseCheckbox}
            </span>
          </label>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">{t.cancel}</button>
          <button
            disabled={processing || !hasAllInfo || !verified}
            onClick={() => onRelease(record)}
            className="flex-1 py-3 rounded-xl bg-[#0f52ba] hover:bg-blue-700 text-white font-semibold text-sm disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
          >
            {processing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {L(t, 'markDelivered', 'Mark as delivered')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Release Request Detail Modal ──────────────────────────────────────────── */
function RequestDetailModal({ record, onClose, onApprove, onReject, processing }) {
  const { t } = useLang();
  const missingBirthday = !hasBirthday(record);
  const name = record.seniorName || record.fullName || t.unknownLabel;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><FileText size={18} className="text-[#0f52ba]" /> {t.physicalIdReqTitle}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{t.reviewVerifyBeforeApproving}</p>
          </div>
          <button onClick={onClose}><X size={18} className="text-gray-400 hover:text-gray-600" /></button>
        </div>

        {missingBirthday && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-300 rounded-xl text-xs text-red-700 font-semibold flex items-start gap-2">
            <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" />
            <span><strong>{t.cannotApprove}</strong> — {t.birthdayNotOnRecordApprove}</span>
          </div>
        )}

        <div className="bg-gray-50 rounded-2xl p-4 space-y-2 mb-5">
          <div className="flex items-center gap-2"><User size={13} className="text-gray-400" /><span className="text-sm font-bold text-gray-800">{name}</span></div>
          {record.seniorId      && <p className="text-xs text-gray-500 pl-5">{t.oscaIdPrefix}: <strong className="text-blue-700">{record.seniorId}</strong></p>}
          {(record.dob || record.dateOfBirth) && <p className="text-xs text-gray-500 pl-5"><span style={{display:'inline-flex',alignItems:'center',gap:'4px'}}><svg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'><rect x='3' y='10' width='18' height='12' rx='2'/><path d='M8 10V7a4 4 0 0 1 8 0v3'/><line x1='12' y1='14' x2='12' y2='18'/></svg> {t.dobLabel}:</span> <strong>{record.dob || record.dateOfBirth}</strong></p>}
          {record.address       && <p className="text-xs text-gray-500 pl-5 flex items-center gap-1"><MapPin size={10} />{record.address}</p>}
          {record.contactNumber && <p className="text-xs text-gray-500 pl-5 flex items-center gap-1"><Phone size={10} />{record.contactNumber}</p>}
          <p className="text-xs text-gray-500 pl-5">{t.barangayLabel}: {record.barangay ? <strong>{record.barangay}</strong> : <span className="text-orange-500 italic font-semibold">{t.notSpecified}</span>}</p>
          {record.reason    && <p className="text-xs text-gray-400 pl-5 italic">{t.reasonLabel}: {record.reason}</p>}
          {record.createdAt && <p className="text-xs text-gray-400 pl-5">{t.requestedLabel}: {record.createdAt?.toDate?.()?.toLocaleDateString?.() || '—'}</p>}
          {missingBirthday && <BirthdayWarning />}
        </div>

        <div className="flex gap-3">
          <button disabled={processing} onClick={() => onReject(record.id)} className="flex-1 py-3 rounded-xl border-2 border-red-200 text-red-600 font-semibold text-sm hover:bg-red-50 disabled:opacity-50">{t.reject}</button>
          <button disabled={processing || missingBirthday} onClick={() => onApprove(record)} className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2" title={missingBirthday ? t.birthdayRequired : ''}>
            {processing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} {t.approveRequest}
          </button>
        </div>
        <button onClick={onClose} className="w-full mt-3 text-sm text-gray-400 hover:text-gray-600">{t.cancel}</button>
      </div>
    </div>
  );
}

/* ─── Stat card ──────────────────────────────────────────────────────────────── */
function StatCard({ label, value, icon: Icon, color, bg }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center gap-4">
      <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center`}>
        <Icon size={20} className={color} />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
}

/* ─── One row in the OSCA request lists (approved / processing / delivered / claimed) ─── */
function RequestRow({ r, status, sub, actions, tone = 'border-gray-100' }) {
  const { t } = useLang();
  return (
    <div className={`bg-white border ${tone} rounded-2xl p-5 flex items-center justify-between`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-gray-900">{r.seniorName || r.fullName || t.unknownLabel}</p>
          <FollowUpBadge record={r} />
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          {r.seniorId ? `${t.oscaIdPrefix}: ${r.seniorId}` : ''}
          {r.barangay ? ` · Brgy. ${r.barangay}` : ''}
          {sub ? ` · ${sub}` : ''}
        </p>
        <FollowUpNote record={r} />
      </div>
      <div className="flex items-center gap-2 ml-4 shrink-0">
        <StatusBadge status={status} />
        {actions}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════════════════════ */
export default function IDManagement() {
  const { isSuperAdmin, isSubAdmin, adminData } = useAuth();
  const { t } = useLang();

  /* ── Shared state ── */
  const [toast, setToast]           = useState({ msg: '', type: 'success' });
  const [mainTab, setMainTab]       = useState('verification'); // 'verification' | 'release'

  /* ── Verification state ── */
  const [submissions, setSubmissions]   = useState([]);
  const [physicalReqs, setPhysicalReqs] = useState([]);
  const [loadingVerif, setLoadingVerif] = useState(true);
  const [verifTab, setVerifTab]         = useState('submissions');
  const [selected, setSelected]         = useState(null);
  const [processing, setProcessing]     = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]         = useState(false);
  const [verifSearch, setVerifSearch]   = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  /* ── Release state ── */
  const [idRequests, setIdRequests]     = useState([]);
  const [releasedIDs, setReleasedIDs]   = useState([]);
  const [loadingRel, setLoadingRel]     = useState(true);
  const [releaseTab, setReleaseTab]     = useState(isSuperAdmin ? 'requests' : 'released');
  const [relSearch, setRelSearch]       = useState('');
  const [detailRecord, setDetailRecord] = useState(null);
  const [releaseRecord, setReleaseRecord] = useState(null);
  const [cancelRecord, setCancelRecord]   = useState(null);

  /* ── Listeners ── */
  useEffect(() => {
    const q = query(collection(db, 'id_verifications'), orderBy('submittedAt', 'desc'));
    return onSnapshot(q, snap => { setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoadingVerif(false); });
  }, []);
  useEffect(() => {
    // Single listener for id_requests, feeding both Verification and Release panels.
    // Barangay sub-admins may only read their own barangay's requests (see firestore.rules).
    let q;
    if (isSubAdmin && adminData?.barangay) {
      q = query(collection(db, 'id_requests'), where('barangay', '==', adminData.barangay), orderBy('createdAt', 'desc'));
    } else {
      q = query(collection(db, 'id_requests'), orderBy('createdAt', 'desc'));
    }
    return onSnapshot(
      q,
      snap => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setPhysicalReqs(data);
        setIdRequests(data);
        setLoadingRel(false);
      },
      err => {
        console.error('id_requests listener failed:', err);
        setLoadingRel(false);
      }
    );
  }, [isSubAdmin, adminData]);
  useEffect(() => {
    let q;
    if (isSubAdmin && adminData?.barangay) {
      q = query(collection(db, 'released_ids'), where('barangay', '==', adminData.barangay), orderBy('releasedAt', 'desc'));
    } else {
      q = query(collection(db, 'released_ids'), orderBy('releasedAt', 'desc'));
    }
    return onSnapshot(q, snap => setReleasedIDs(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [isSubAdmin, adminData]);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: 'success' }), 3500);
  }

  // Who is doing this action (stored in the request's statusHistory)
  const getActor = () => ({
    uid: getAuth().currentUser?.uid || null,
    role: isSuperAdmin ? 'super_admin' : 'sub_admin',
  });

  /* ── Verification decision handler ── */
  async function handleDecision(id, decision, collectionName = 'id_verifications', record = null) {
    setProcessing(true);
    try {
      await updateDoc(doc(db, collectionName, id), { status: decision, reviewedAt: serverTimestamp() });

      if (decision === 'approved' && record) {
        if (collectionName === 'id_verifications') {
          const uid = record.uid;
          if (uid) {
            try { await updateDoc(doc(db, 'users', uid), { isVerified: true, status: 'VERIFIED', verifiedAt: serverTimestamp() }); } catch (e) {}
          }
          // Digital ID creation is now a separate step, done from the Digital ID page

          const controlNumber = record.idNumber || record.seniorId || id.slice(-6).toUpperCase();
          try {
            await addDoc(collection(db, 'released_ids'), {
              requestId: id, uid: uid || null,
              seniorName: record.fullName || record.seniorName || '',
              seniorId: record.idNumber || record.seniorId || '',
              firstName: record.firstName || '', lastName: record.lastName || record.surname || '',
              middleName: record.middleName || '', dob: record.dob || record.dateOfBirth || '',
              sex: record.sex || '', address: record.address || '', barangay: record.barangay || '',
              controlNumber, status: 'notified', releasedAt: serverTimestamp(),
              releasedBy: 'auto_verification', notifiedAt: serverTimestamp(), sourceType: 'id_verification',
            });
          } catch (e) {}
        }

        // NOTE: approving a physical request no longer auto-releases it — it now goes Approved → Processing → Delivered → Received → Claimed
      }

      setSelected(null);
      showToast(decision === 'approved' ? t.toastApprovedQueued : t.toastRequestRejected);
    } finally { setProcessing(false); }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, deleteTarget.col, deleteTarget.id));
      showToast(`"${deleteTarget.name}" ${t.deleteRequestFor}`);
      setDeleteTarget(null);
    } finally { setDeleting(false); }
  }

  /* ── Release handlers ── */
  async function handleApprove(record) {
    setProcessing(true);
    try {
      await updateDoc(doc(db, 'id_requests', record.id), { status: 'approved', reviewedAt: serverTimestamp() });
      setDetailRecord(null);
      showToast(`${t.toastRequestForPrefix} ${record.seniorName || record.fullName} ${t.toastRequestForSuffix}`);
    } finally { setProcessing(false); }
  }

  async function handleReject(id) {
    setProcessing(true);
    try {
      await updateDoc(doc(db, 'id_requests', id), { status: 'rejected', reviewedAt: serverTimestamp() });
      setDetailRecord(null);
      showToast(t.toastRequestRejected);
    } finally { setProcessing(false); }
  }

  /* OSCA: approved → processing */
  async function handleStartProcessing(record) {
    setProcessing(true);
    try {
      await setIdRequestStatus(db, record.id, ID_STATUS.PROCESSING, getActor());
      showToast(`${record.seniorName || record.fullName || ''} — ${L(t, 'toastNowProcessing', 'now processing')}`);
    } catch (e) {
      console.error(e);
      showToast(L(t, 'toastStatusFailed', 'Could not update the status. Please try again.'), 'error');
    } finally { setProcessing(false); }
  }

  /* OSCA: approved / processing → cancelled (senior is notified by the Cloud Function) */
  async function handleCancelRequest(record, reason) {
    setProcessing(true);
    try {
      const cleaned = (reason || '').trim();
      await setIdRequestStatus(db, record.id, ID_STATUS.CANCELLED, getActor(), cleaned ? { cancelReason: cleaned } : {});
      setCancelRecord(null);
      showToast(L(t, 'toastRequestCancelled', 'Request cancelled'));
    } catch (e) {
      console.error(e);
      showToast(L(t, 'toastStatusFailed', 'Could not update the status. Please try again.'), 'error');
    } finally { setProcessing(false); }
  }

  /* OSCA: processing → delivered to the barangay.
     Creates the barangay's worklist entry (released_ids) AND flips the request
     status in one atomic batch. The Cloud Function then tells the senior their ID
     is ready for pick-up. */
  async function handleRelease(record) {
    setProcessing(true);
    try {
      const bgy = record.barangay || record.sub_admin_barangay || '';
      const batch = writeBatch(db);

      batch.set(doc(collection(db, 'released_ids')), {
        requestId: record.id, uid: record.uid || null, sourceType: 'id_request',
        seniorName: record.seniorName || record.fullName || '',
        seniorId: record.seniorId || record.idNumber || '', address: record.address || '',
        dob: record.dob || record.dateOfBirth || '', sex: record.sex || '',
        controlNumber: record.controlNumber || record.seniorId || record.id.slice(-6).toUpperCase(),
        barangay: bgy,
        status: 'notified', releasedAt: serverTimestamp(), releasedBy: 'super_admin', notifiedAt: serverTimestamp(),
      });

      // `barangay` is written onto the request too so the barangay admin is allowed to read/update it
      batch.update(
        doc(db, 'id_requests', record.id),
        buildStatusPayload(ID_STATUS.DELIVERED, getActor(), { barangay: bgy, releasedAt: serverTimestamp() })
      );

      await batch.commit();
      setReleaseRecord(null);
      showToast(`${t.toastPhysicalIdReleasedPrefix} ${record.seniorName || record.fullName} ${t.toastPhysicalIdReleasedSuffix}`);
    } catch (e) {
      console.error(e);
      showToast(L(t, 'toastStatusFailed', 'Could not update the status. Please try again.'), 'error');
    } finally { setProcessing(false); }
  }

  /* Keep the OSCA-side request in step with what the barangay did.
     Returns false if the request couldn't be updated (e.g. older request with no barangay field). */
  async function syncRequestStatus(release, status) {
    if (!isLinkedRelease(release)) return true;
    try {
      await setIdRequestStatus(db, release.requestId, status, getActor());
      return true;
    } catch (e) {
      console.warn('Could not sync id_requests status:', e);
      return false;
    }
  }

  /* Barangay: OSCA delivered it → "received" */
  async function handleReceived(release) {
    setProcessing(true);
    try {
      await updateDoc(doc(db, 'released_ids', release.id), { status: 'received', receivedAt: serverTimestamp() });
      const synced = await syncRequestStatus(release, ID_STATUS.RECEIVED);
      showToast(
        synced
          ? L(t, 'toastMarkedReceived', 'Marked as received')
          : L(t, 'toastReceivedNoSync', 'Marked as received here, but OSCA\'s request could not be updated.'),
        synced ? 'success' : 'error'
      );
    } catch (e) {
      console.error(e);
      showToast(L(t, 'toastStatusFailed', 'Could not update the status. Please try again.'), 'error');
    } finally { setProcessing(false); }
  }

  /* Barangay: senior picked it up → "claimed" (id_requests.status = done) */
  async function handleCollected(release) {
    setProcessing(true);
    try {
      await updateDoc(doc(db, 'released_ids', release.id), { status: 'collected', collectedAt: serverTimestamp() });
      const synced = await syncRequestStatus(release, ID_STATUS.DONE);
      showToast(
        synced
          ? t.toastMarkedCollected
          : L(t, 'toastCollectedNoSync', 'Marked as claimed here, but OSCA\'s request could not be updated.'),
        synced ? 'success' : 'error'
      );
    } catch (e) {
      console.error(e);
      showToast(L(t, 'toastStatusFailed', 'Could not update the status. Please try again.'), 'error');
    } finally { setProcessing(false); }
  }

  /* ── Computed: verification ── */
  const activeList = verifTab === 'submissions' ? submissions : physicalReqs;
  const nameOf     = r => verifTab === 'submissions' ? (r.fullName || r.seniorName || '') : (r.seniorName || r.fullName || '');
  const idOf       = r => verifTab === 'submissions' ? (r.idNumber || '') : (r.seniorId || '');

  const filteredVerif = activeList.filter(r => {
    const matchS = !verifSearch || nameOf(r).toLowerCase().includes(verifSearch.toLowerCase()) || idOf(r).toLowerCase().includes(verifSearch.toLowerCase());
    const matchF = filterStatus === 'all' || r.status === filterStatus || (!r.status && filterStatus === 'pending');
    return matchS && matchF;
  });

  const verifPending  = filteredVerif.filter(r => !r.status || r.status === 'pending');
  const verifReviewed = filteredVerif.filter(r => r.status && r.status !== 'pending');

  const repeatKeys = (() => {
    const counts = {};
    submissions.forEach(r => { const k = r.email || r.fullName || r.seniorName; if (k) counts[k] = (counts[k] || 0) + 1; });
    return new Set(Object.keys(counts).filter(k => counts[k] > 1));
  })();
  const isRepeat = r => verifTab === 'submissions' && repeatKeys.has(r.email || r.fullName || r.seniorName);
  const voidVerifReqs = physicalReqs.filter(r => r.isVoid || (!r.seniorName && !r.fullName && !r.seniorId));

  /* ── Computed: release ── */
  const filteredRel = (list) => list.filter(r => {
    const name = (r.seniorName || r.fullName || '').toLowerCase();
    return !relSearch || name.includes(relSearch.toLowerCase()) || (r.seniorId || '').includes(relSearch);
  });
  const relByStatus = (statuses) =>
    followUpsFirst(filteredRel(idRequests.filter(r => statuses.includes(r.status))));

  const relPending    = followUpsFirst(filteredRel(idRequests.filter(r => !r.status || r.status === 'pending')));
  const relApproved   = relByStatus(['approved']);
  const relProcessing = relByStatus(['processing']);
  // 'released' is the legacy name for 'delivered'
  const relDelivered  = relByStatus(['delivered', 'released', 'received']);
  const relDone       = relByStatus(['done']);
  const relCancelled  = relByStatus(['cancelled']);
  const relRejected   = filteredRel(idRequests.filter(r => r.status === 'rejected'));

  const myReleased  = filteredRel(releasedIDs);
  const incoming    = myReleased.filter(r => r.status === 'notified');   // delivered by OSCA, waiting for the barangay to confirm
  const atBarangay  = myReleased.filter(r => r.status === 'received');   // received, ready for the senior to pick up
  const collected   = myReleased.filter(r => r.status === 'collected');
  const voidRelReqs = idRequests.filter(r => r.isVoid || (!r.seniorName && !r.fullName && !r.seniorId));

  /* ── Top-level tabs ── */
  const topTabs = [
    { key: 'verification', label: t.tabIdVerification, badge: submissions.filter(r => !r.status || r.status === 'pending').length + physicalReqs.filter(r => !r.status || r.status === 'pending').length },
    { key: 'release',      label: t.tabIdRelease,      badge: isSuperAdmin ? relPending.length : incoming.length },
  ];

  const verifTabs = [
    { key: 'submissions', label: t.tabOscaSubmissions,  badge: submissions.filter(r => !r.status || r.status === 'pending').length },
    { key: 'physical',    label: t.tabPhysicalRequests, badge: physicalReqs.filter(r => !r.status || r.status === 'pending').length },
  ];

  const relTabs = [
    ...(isSuperAdmin ? [
      { key: 'requests',   label: t.tabIdRequests,                            badge: relPending.length },
      { key: 'approved',   label: t.tabApproved,                              badge: relApproved.length },
      { key: 'processing', label: L(t, 'tabProcessing', 'Processing'),        badge: relProcessing.length },
      { key: 'delivered',  label: L(t, 'tabDelivered',  'Delivered'),         badge: 0 },
      { key: 'done',       label: L(t, 'tabClaimed',    'Claimed'),           badge: 0 },
    ] : []),
    ...(isSubAdmin ? [{ key: 'released', label: t.tabMyReleasedIds, badge: incoming.length }] : []),
  ];

  /* Small action buttons reused in the OSCA lists */
  const CancelBtn = ({ r }) => (
    <button disabled={processing} onClick={() => setCancelRecord(r)}
      className="flex items-center gap-1.5 border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 text-xs font-bold px-3 py-2 rounded-xl transition-colors">
      <XCircle size={12} /> {L(t, 'cancelRequestAction', 'Cancel request')}
    </button>
  );

  return (
    <div className="p-8 max-w-5xl mx-auto relative">

      {/* Toast */}
      {toast.msg && (
        <div className={`fixed top-6 right-6 z-50 text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-fade-in ${toast.type === 'error' ? 'bg-red-600' : 'bg-gray-900'}`}>
          <CheckCircle2 size={16} className="text-green-400" />
          {toast.msg}
          <button onClick={() => setToast({ msg: '', type: 'success' })}><X size={14} className="text-white/60 hover:text-white" /></button>
        </div>
      )}

      {deleteTarget && <DeleteConfirmModal name={deleteTarget.name} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} loading={deleting} />}
      {selected?.type === 'submission' && <OSCASubmissionModal record={selected.record} onClose={() => setSelected(null)} onDecision={handleDecision} processing={processing} />}
      {selected?.type === 'physical'   && <PhysicalIDModal     record={selected.record} onClose={() => setSelected(null)} onDecision={handleDecision} processing={processing} />}
      {detailRecord  && <RequestDetailModal record={detailRecord}  onClose={() => setDetailRecord(null)}  onApprove={handleApprove} onReject={handleReject} processing={processing} />}
      {releaseRecord && <ReleaseModal       record={releaseRecord} onClose={() => setReleaseRecord(null)} onRelease={handleRelease} processing={processing} />}
      {cancelRecord  && <CancelRequestModal record={cancelRecord}  onClose={() => setCancelRecord(null)}  onConfirm={handleCancelRequest} processing={processing} />}

      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <CreditCard size={24} className="text-[#0f52ba]" /> {t.idManagement}
        </h1>
        <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
          <ShieldCheck size={13} className="text-[#0f52ba]" />
          {t.idMgmtSubtitle}
        </p>
      </div>

      {/* Top-level tabs */}
      <div className="flex gap-1 mb-8 bg-gray-100 p-1 rounded-xl w-fit">
        {topTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setMainTab(tab.key)}
            className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${mainTab === tab.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {tab.label}
            {tab.badge > 0 && <span className="ml-1.5 bg-[#0f52ba] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{tab.badge}</span>}
          </button>
        ))}
      </div>

      {/* ═══ VERIFICATION PANEL ═══ */}
      {mainTab === 'verification' && (
        <>
          {/* Stats */}
          {verifTab === 'submissions' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatCard label={t.statPendingReview} value={submissions.filter(r => !r.status || r.status === 'pending').length} icon={ClockIcon}    color="text-yellow-600" bg="bg-yellow-50" />
              <StatCard label={t.statApproved}       value={submissions.filter(r => r.status === 'approved').length}             icon={CheckCircle2} color="text-green-600"  bg="bg-green-50"  />
              <StatCard label={t.statRejected}       value={submissions.filter(r => r.status === 'rejected').length}             icon={XCircle}      color="text-red-600"    bg="bg-red-50"    />
              <StatCard label={t.statTotalSubmitted} value={submissions.length}                                                  icon={FileImage}    color="text-blue-600"   bg="bg-blue-50"   />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatCard label={t.statPending}         value={physicalReqs.filter(r => !r.status || r.status === 'pending').length} icon={ClockIcon}     color="text-yellow-600" bg="bg-yellow-50" />
              <StatCard label={t.statApproved}        value={physicalReqs.filter(r => r.status === 'approved').length}             icon={CheckCircle2}  color="text-green-600"  bg="bg-green-50"  />
              <StatCard label={t.statRejected}        value={physicalReqs.filter(r => r.status === 'rejected').length}             icon={XCircle}       color="text-red-600"    bg="bg-red-50"    />
              <StatCard label={t.statVoidIncomplete}  value={voidVerifReqs.length}                                                 icon={AlertTriangle} color="text-orange-600" bg="bg-orange-50" />
            </div>
          )}

          {/* Banners */}
          {verifTab === 'submissions' && repeatKeys.size > 0 && (
            <div className="flex items-center gap-2 mb-5 px-4 py-2.5 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-700 font-medium">
              <AlertTriangle size={14} className="text-orange-500 shrink-0" />
              {repeatKeys.size} {t.multipleReqsWarning}
            </div>
          )}
          {verifTab === 'physical' && voidVerifReqs.length > 0 && (
            <div className="flex items-center gap-2 mb-5 px-4 py-2.5 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-700 font-medium">
              <AlertTriangle size={14} className="text-orange-500 shrink-0" />
              <strong>{voidVerifReqs.length}</strong>&nbsp;{t.voidReqsWarning}
            </div>
          )}

          {/* Sub-tabs */}
          <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-xl w-fit">
            {verifTabs.map(tab => (
              <button key={tab.key} onClick={() => { setVerifTab(tab.key); setVerifSearch(''); setFilterStatus('all'); }}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${verifTab === tab.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {tab.label}
                {tab.badge > 0 && <span className="ml-1.5 bg-[#0f52ba] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{tab.badge}</span>}
              </button>
            ))}
          </div>

          {/* Search + filter */}
          <div className="flex gap-3 mb-6">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder={t.searchByNameOrOsca} value={verifSearch} onChange={e => setVerifSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 bg-white" />
            </div>
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
              {[
                { key: 'all', label: t.filterAll },
                { key: 'pending', label: t.filterPending },
                { key: 'approved', label: t.filterApproved },
                { key: 'rejected', label: t.filterRejected },
              ].map(f => (
                <button key={f.key} onClick={() => setFilterStatus(f.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filterStatus === f.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {loadingVerif ? (
            <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
          ) : (
            <>
              {verifPending.length > 0 && (
                <div className="mb-6">
                  <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">{t.statPendingReview} ({verifPending.length})</h2>
                  <div className="space-y-3">
                    {verifPending.map(r => {
                      const repeat = isRepeat(r);
                      const isVoid = verifTab === 'physical' && (r.isVoid || (!r.seniorName && !r.fullName && !r.seniorId));
                      const rName  = nameOf(r) || t.unknownLabel;
                      const rId    = idOf(r);
                      const rDate  = (verifTab === 'submissions' ? r.submittedAt?.toDate?.()?.toLocaleDateString?.() : r.createdAt?.toDate?.()?.toLocaleDateString?.()) || null;
                      const noBday = !hasBirthday(r);
                      return (
                        <div key={r.id} className={`rounded-2xl p-5 flex items-center justify-between border ${
                          isVoid ? 'bg-gray-50 border-gray-200 opacity-60' :
                          repeat ? 'bg-orange-50 border-orange-300 ring-1 ring-orange-200' : 'bg-white border-yellow-200'}`}>
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            {verifTab === 'submissions' ? (
                              (r.idImageUrl || r.imageBase64)
                                ? <img src={r.idImageUrl ?? `data:image/jpeg;base64,${r.imageBase64}`} alt="ID" className="w-16 h-10 rounded-lg object-cover border border-gray-200 shrink-0" />
                                : <div className="w-16 h-10 rounded-lg bg-gray-100 border border-dashed border-gray-300 flex items-center justify-center shrink-0"><FileImage size={14} className="text-gray-400" /></div>
                            ) : (
                              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0"><FileText size={16} className="text-[#0f52ba]" /></div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-semibold text-gray-900">{rName}</p>
                                {repeat && <span className="flex items-center gap-1 text-[10px] font-bold bg-orange-500 text-white px-2 py-0.5 rounded-full"><AlertTriangle size={9} /> {t.repeatBadge}</span>}
                                {isVoid && <span className="text-[10px] font-bold bg-gray-400 text-white px-2 py-0.5 rounded-full">{t.voidBadge}</span>}
                                {noBday && !isVoid && <span className="text-[10px] font-bold bg-red-500 text-white px-2 py-0.5 rounded-full flex items-center gap-1"><AlertTriangle size={8} /> {t.noBirthdayBadge}</span>}
                                {verifTab === 'physical' && <FollowUpBadge record={r} />}
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {rId ? `${t.oscaIdPrefix}: ${rId}` : ''}
                                {r.barangay ? ` · Brgy. ${r.barangay}` : ''}
                                {rDate ? ` · ${rDate}` : ''}
                              </p>
                              {r.reason && <p className="text-xs text-gray-400 mt-0.5 italic">{t.reasonLabel}: {r.reason}</p>}
                              {verifTab === 'physical' && <FollowUpNote record={r} />}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-4 shrink-0">
                            <StatusBadge status={isVoid ? 'void' : (r.status || 'pending')} />
                            {!isVoid && (
                              <button onClick={() => setSelected({ record: r, type: verifTab === 'submissions' ? 'submission' : 'physical' })}
                                className="flex items-center gap-1.5 text-xs font-semibold text-[#0f52ba] hover:underline">
                                <Eye size={14} /> {t.reviewAction}
                              </button>
                            )}
                            <button onClick={() => setDeleteTarget({ id: r.id, name: rName, col: verifTab === 'submissions' ? 'id_verifications' : 'id_requests' })}
                              className="p-1.5 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50"><Trash2 size={15} /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {verifReviewed.length > 0 && (
                <div>
                  <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">{t.reviewedSection} ({verifReviewed.length})</h2>
                  <div className="space-y-2">
                    {verifReviewed.map(r => {
                      const repeat = isRepeat(r);
                      const rName  = nameOf(r) || t.unknownLabel;
                      const rId    = idOf(r);
                      return (
                        <div key={r.id} className={`rounded-2xl p-4 flex items-center justify-between border ${repeat ? 'bg-orange-50/60 border-orange-200' : 'bg-white border-gray-100'}`}>
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            {verifTab === 'submissions'
                              ? ((r.idImageUrl || r.imageBase64) ? <img src={r.idImageUrl ?? `data:image/jpeg;base64,${r.imageBase64}`} alt="ID" className="w-12 h-8 rounded-md object-cover border border-gray-200 shrink-0" /> : <div className="w-12 h-8 rounded-md bg-gray-100 flex items-center justify-center shrink-0"><FileImage size={12} className="text-gray-300" /></div>)
                              : <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center shrink-0"><FileText size={13} className="text-gray-400" /></div>
                            }
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-medium text-gray-800">{rName}</p>
                                {repeat && <span className="flex items-center gap-1 text-[10px] font-bold bg-orange-400 text-white px-2 py-0.5 rounded-full"><AlertTriangle size={9} /> {t.repeatBadge}</span>}
                              </div>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {rId ? `${t.oscaIdPrefix}: ${rId}` : ''}
                                {r.reviewedAt && ` · ${t.reviewedSection} ${r.reviewedAt?.toDate?.()?.toLocaleDateString?.() || '—'}`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-4 shrink-0">
                            <StatusBadge status={r.status} />
                            <button onClick={() => setSelected({ record: r, type: verifTab === 'submissions' ? 'submission' : 'physical' })} className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-[#0f52ba]"><Eye size={13} /> {t.view}</button>
                            <button onClick={() => setDeleteTarget({ id: r.id, name: rName, col: verifTab === 'submissions' ? 'id_verifications' : 'id_requests' })} className="p-1.5 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50"><Trash2 size={15} /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {filteredVerif.length === 0 && (
                <div className="text-center py-20 text-gray-400">
                  <ShieldCheck size={40} className="mx-auto mb-3 opacity-40" />
                  <p className="font-medium">{verifSearch ? t.noResultsFound : verifTab === 'submissions' ? t.noVerificationYet : t.noPhysicalReqsYet}</p>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ═══ RELEASE PANEL ═══ */}
      {mainTab === 'release' && (
        <>
          {/* Stats — OSCA */}
          {isSuperAdmin && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatCard label={t.statPendingRequests}                     value={relPending.length}                              icon={ClockIcon}    color="text-yellow-600" bg="bg-yellow-50" />
              <StatCard label={L(t, 'statInProgress', 'In progress')}    value={relApproved.length + relProcessing.length}      icon={Package}      color="text-indigo-600" bg="bg-indigo-50" />
              <StatCard label={L(t, 'statWithBarangay', 'With barangay')} value={relDelivered.length}                            icon={Send}         color="text-blue-600"   bg="bg-blue-50"   />
              <StatCard label={L(t, 'statClaimed', 'Claimed by seniors')} value={relDone.length}                                 icon={CheckCircle2} color="text-green-600"  bg="bg-green-50"  />
            </div>
          )}
          {/* Stats — Barangay */}
          {isSubAdmin && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatCard label={L(t, 'statIncoming', 'Incoming from OSCA')}      value={incoming.length}   icon={Bell}         color="text-purple-600" bg="bg-purple-50" />
              <StatCard label={L(t, 'statReadyPickup', 'Ready for pick-up')}    value={atBarangay.length} icon={Package}      color="text-teal-600"   bg="bg-teal-50"   />
              <StatCard label={L(t, 'statClaimed', 'Claimed by seniors')}       value={collected.length}  icon={CheckCircle2} color="text-green-600"  bg="bg-green-50"  />
              <StatCard label={t.statTotalReleased}                             value={myReleased.length} icon={Send}         color="text-blue-600"   bg="bg-blue-50"   />
            </div>
          )}

          {/* Search */}
          <div className="flex gap-3 mb-5">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder={t.searchByNameOrOsca} value={relSearch} onChange={e => setRelSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white" />
            </div>
          </div>

          {/* Sub-tabs */}
          <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
            {relTabs.map(tab => (
              <button key={tab.key} onClick={() => setReleaseTab(tab.key)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${releaseTab === tab.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {tab.label}
                {tab.badge > 0 && <span className="ml-1.5 bg-[#0f52ba] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{tab.badge}</span>}
              </button>
            ))}
          </div>

          {loadingRel ? (
            <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
          ) : (
            <>
              {/* ─ Pending requests (super admin) */}
              {releaseTab === 'requests' && isSuperAdmin && (
                <div>
                  {voidRelReqs.length > 0 && (
                    <div className="mb-4 px-4 py-3 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-700 flex items-start gap-2">
                      <AlertTriangle size={13} className="mt-0.5 text-orange-500 shrink-0" />
                      <span><strong>{voidRelReqs.length}</strong> {t.voidSignupWarning}</span>
                    </div>
                  )}
                  {relPending.length > 0 ? (
                    <div className="space-y-3">
                      <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">{t.pendingRequestsSection} ({relPending.length})</h2>
                      {relPending.map(r => {
                        const isVoid = r.isVoid || (!r.seniorName && !r.fullName && !r.seniorId);
                        const noBday = !hasBirthday(r);
                        return (
                          <div key={r.id} className={`rounded-2xl p-5 flex items-center justify-between border ${isVoid ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-white border-yellow-200'}`}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-semibold text-gray-900">{r.seniorName || r.fullName || t.unknownLabel}</p>
                                {isVoid && <span className="text-[10px] font-bold bg-gray-400 text-white px-2 py-0.5 rounded-full">{t.voidBadge}</span>}
                                {noBday && !isVoid && <span className="text-[10px] font-bold bg-red-500 text-white px-2 py-0.5 rounded-full flex items-center gap-1"><AlertTriangle size={8} /> {t.noBirthdayBadge}</span>}
                                <FollowUpBadge record={r} />
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {r.seniorId ? `${t.oscaIdPrefix}: ${r.seniorId}` : ''}
                                {r.barangay ? ` · Brgy. ${r.barangay}` : ''}
                              </p>
                              {r.reason && <p className="text-xs text-gray-400 mt-0.5 italic">{t.reasonLabel}: {r.reason}</p>}
                              <FollowUpNote record={r} />
                            </div>
                            <div className="flex items-center gap-2 ml-4 shrink-0">
                              <StatusBadge status={isVoid ? 'void' : 'pending'} />
                              {!isVoid && <button onClick={() => setDetailRecord(r)} className="flex items-center gap-1.5 text-xs font-semibold text-[#0f52ba] hover:underline"><Eye size={14} /> {t.reviewAction}</button>}
                              <button onClick={() => setDeleteTarget({ id: r.id, name: r.seniorName || t.unknownLabel, col: 'id_requests' })} className="p-1.5 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50"><Trash2 size={15} /></button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-20 text-gray-400">
                      <FileText size={40} className="mx-auto mb-3 opacity-40" />
                      <p className="font-medium">{t.noPendingIdRequests}</p>
                    </div>
                  )}
                  {relRejected.length > 0 && (
                    <div className="mt-6">
                      <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">{t.rejectedSection} ({relRejected.length})</h2>
                      <div className="space-y-2">
                        {relRejected.map(r => (
                          <div key={r.id} className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center justify-between opacity-60">
                            <div>
                              <p className="font-medium text-gray-800">{r.seniorName || r.fullName || t.unknownLabel}</p>
                              <p className="text-xs text-gray-400">{r.seniorId ? `${t.oscaIdPrefix}: ${r.seniorId}` : ''}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <StatusBadge status="rejected" />
                              <button onClick={() => setDeleteTarget({ id: r.id, name: r.seniorName || t.unknownLabel, col: 'id_requests' })} className="p-1.5 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50"><Trash2 size={15} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {relCancelled.length > 0 && (
                    <div className="mt-6">
                      <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">{L(t, 'cancelledSection', 'Cancelled')} ({relCancelled.length})</h2>
                      <div className="space-y-2">
                        {relCancelled.map(r => (
                          <div key={r.id} className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center justify-between opacity-60">
                            <div>
                              <p className="font-medium text-gray-800">{r.seniorName || r.fullName || t.unknownLabel}</p>
                              <p className="text-xs text-gray-400">
                                {r.seniorId ? `${t.oscaIdPrefix}: ${r.seniorId}` : ''}
                                {r.cancelReason ? ` · ${r.cancelReason}` : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <StatusBadge status="cancelled" />
                              <button onClick={() => setDeleteTarget({ id: r.id, name: r.seniorName || t.unknownLabel, col: 'id_requests' })} className="p-1.5 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50"><Trash2 size={15} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ─ Approved → start processing (super admin) */}
              {releaseTab === 'approved' && isSuperAdmin && (
                <div>
                  {relApproved.length > 0 ? (
                    <>
                      <div className="mb-4 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 flex items-center gap-2">
                        <ShieldCheck size={13} className="text-blue-500" />
                        {L(t, 'startProcessingNote', 'Press "Start processing" when OSCA begins preparing the physical ID.')}
                      </div>
                      <div className="space-y-3">
                        {relApproved.map(r => (
                          <RequestRow key={r.id} r={r} status="approved" tone="border-green-100"
                            actions={
                              <>
                                <button disabled={processing} onClick={() => handleStartProcessing(r)}
                                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors">
                                  <Package size={13} /> {L(t, 'startProcessing', 'Start processing')}
                                </button>
                                <CancelBtn r={r} />
                              </>
                            } />
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-20 text-gray-400">
                      <CheckCircle2 size={40} className="mx-auto mb-3 opacity-40" />
                      <p className="font-medium">{t.noApprovedAwaitingRelease}</p>
                    </div>
                  )}
                </div>
              )}

              {/* ─ Processing → mark delivered (super admin) */}
              {releaseTab === 'processing' && isSuperAdmin && (
                <div>
                  {relProcessing.length > 0 ? (
                    <>
                      <div className="mb-4 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 flex items-center gap-2">
                        <ShieldCheck size={13} className="text-blue-500" />
                        {L(t, 'markDeliveredNote', 'Once the ID has been handed to the barangay, press "Mark delivered". The senior is notified that it is ready for pick-up.')}
                      </div>
                      <div className="space-y-3">
                        {relProcessing.map(r => (
                          <RequestRow key={r.id} r={r} status="processing" tone="border-indigo-100"
                            sub={fmtDate(r.processedAt) ? `${L(t, 'processingSince', 'Processing since')} ${fmtDate(r.processedAt)}` : ''}
                            actions={
                              <>
                                <button disabled={processing} onClick={() => setReleaseRecord(r)}
                                  className="flex items-center gap-1.5 bg-[#0f52ba] hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors">
                                  <Send size={13} /> {L(t, 'markDelivered', 'Mark as delivered')}
                                </button>
                                <CancelBtn r={r} />
                              </>
                            } />
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-20 text-gray-400">
                      <Package size={40} className="mx-auto mb-3 opacity-40" />
                      <p className="font-medium">{L(t, 'noProcessingRequests', 'No IDs are being processed right now')}</p>
                    </div>
                  )}
                </div>
              )}

              {/* ─ Delivered to barangay (super admin) — shows what the barangay has done */}
              {releaseTab === 'delivered' && isSuperAdmin && (
                <div>
                  {relDelivered.length > 0 ? (
                    <div className="space-y-3">
                      {relDelivered.map(r => {
                        const received = r.status === 'received';
                        const sub = received
                          ? `${L(t, 'receivedOn', 'Received by barangay')} ${fmtDate(r.receivedAt) || '—'}`
                          : `${L(t, 'deliveredOn', 'Delivered')} ${fmtDate(r.deliveredAt) || fmtDate(r.releasedAt) || '—'} · ${L(t, 'awaitingBarangay', 'waiting for barangay to confirm')}`;
                        return <RequestRow key={r.id} r={r} status={r.status} sub={sub} tone={received ? 'border-teal-100' : 'border-blue-100'} />;
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-20 text-gray-400">
                      <Send size={40} className="mx-auto mb-3 opacity-40" />
                      <p className="font-medium">{t.noIdsReleasedYet}</p>
                    </div>
                  )}
                </div>
              )}

              {/* ─ Claimed by the senior (super admin) */}
              {releaseTab === 'done' && isSuperAdmin && (
                <div>
                  {relDone.length > 0 ? (
                    <div className="space-y-3">
                      {relDone.map(r => (
                        <RequestRow key={r.id} r={r} status="done" tone="border-green-100"
                          sub={`${L(t, 'claimedOn', 'Claimed')} ${fmtDate(r.claimedAt) || '—'}`} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-20 text-gray-400">
                      <CheckCircle2 size={40} className="mx-auto mb-3 opacity-40" />
                      <p className="font-medium">{L(t, 'noClaimedYet', 'No IDs have been claimed yet')}</p>
                    </div>
                  )}
                </div>
              )}

              {/* ─ Sub-admin: My released IDs */}
              {releaseTab === 'released' && isSubAdmin && (
                <div>
                  {/* Incoming: OSCA says it delivered — barangay confirms receipt */}
                  {incoming.length > 0 && (
                    <div className="mb-6">
                      <div className="flex items-center gap-2 mb-3 px-4 py-2.5 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-700 font-medium">
                        <Bell size={13} className="text-purple-500" />
                        {L(t, 'incomingBanner', 'OSCA delivered these IDs to your barangay. Press "Mark received" once they arrive.')}
                      </div>
                      <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">{L(t, 'statIncoming', 'Incoming from OSCA')} ({incoming.length})</h2>
                      <div className="space-y-3">
                        {incoming.map(r => (
                          <div key={r.id} className="bg-white border border-purple-100 rounded-2xl p-5 flex items-center justify-between">
                            <div>
                              <p className="font-semibold text-gray-900">{r.seniorName || t.unknownLabel}</p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {r.seniorId ? `${t.oscaIdPrefix}: ${r.seniorId}` : ''}
                                {r.address ? ` · ${r.address}` : ''}
                              </p>
                              {r.notifiedAt && <p className="text-xs text-purple-400 mt-0.5">{L(t, 'deliveredOn', 'Delivered')}: {fmtDate(r.notifiedAt) || '—'}</p>}
                            </div>
                            <div className="flex items-center gap-2">
                              <StatusBadge status="delivered" />
                              <button disabled={processing} onClick={() => handleReceived(r)}
                                className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors">
                                <Package size={12} /> {L(t, 'markReceived', 'Mark received')}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Received: sitting at the barangay, waiting for the senior */}
                  {atBarangay.length > 0 && (
                    <div className="mb-6">
                      <div className="flex items-center gap-2 mb-3 px-4 py-2.5 bg-teal-50 border border-teal-200 rounded-xl text-xs text-teal-700 font-medium">
                        <CheckCircle2 size={13} className="text-teal-500" />
                        {L(t, 'readyBanner', 'These IDs are in your barangay. Press "Mark claimed" when the senior picks theirs up.')}
                      </div>
                      <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">{L(t, 'statReadyPickup', 'Ready for pick-up')} ({atBarangay.length})</h2>
                      <div className="space-y-3">
                        {atBarangay.map(r => (
                          <div key={r.id} className="bg-white border border-teal-100 rounded-2xl p-5 flex items-center justify-between">
                            <div>
                              <p className="font-semibold text-gray-900">{r.seniorName || t.unknownLabel}</p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {r.seniorId ? `${t.oscaIdPrefix}: ${r.seniorId}` : ''}
                                {r.address ? ` · ${r.address}` : ''}
                              </p>
                              {r.receivedAt && <p className="text-xs text-teal-500 mt-0.5">{L(t, 'receivedOn', 'Received by barangay')}: {fmtDate(r.receivedAt) || '—'}</p>}
                            </div>
                            <div className="flex items-center gap-2">
                              <StatusBadge status="received" />
                              <button disabled={processing} onClick={() => handleCollected(r)}
                                className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors">
                                <CheckCircle2 size={12} /> {L(t, 'markClaimed', 'Mark claimed')}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {collected.length > 0 && (
                    <div>
                      <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">{L(t, 'statClaimed', 'Claimed by seniors')} ({collected.length})</h2>
                      <div className="space-y-2">
                        {collected.map(r => (
                          <div key={r.id} className="bg-gray-50 border border-gray-100 rounded-2xl p-4 flex items-center justify-between opacity-70">
                            <div>
                              <p className="font-medium text-gray-700">{r.seniorName || t.unknownLabel}</p>
                              <p className="text-xs text-gray-400">{t.statCollected}: {fmtDate(r.collectedAt) || '—'}</p>
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
                      <p className="font-medium">{t.noIdsAssignedYet}</p>
                      <p className="text-xs mt-1">{t.superAdminWillRelease}</p>
                    </div>
                  )}
                </div>
              )}
            </>
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
