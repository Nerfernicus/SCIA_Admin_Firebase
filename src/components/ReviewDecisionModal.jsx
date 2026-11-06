import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import {
  CheckCircle2, XCircle, AlertTriangle, Flag, ThumbsUp, ThumbsDown, Loader2, Info,
} from 'lucide-react';
import { db } from '../lib/firebase';
import { useLang } from '../context/LangContext';
import { checkEligibility } from '../lib/eligibility';
import { resolveBarangay } from '../lib/barangay';
import { referenceCode } from '../lib/referenceCode';

/**
 * Confirmation dialog for every decision on a senior's account (approve, reject, flag, unflag).
 * It names the senior, says what will happen, shows the eligibility and required-document
 * checklist, and asks for a reason where one is needed. Nothing is saved here: onConfirm(reason)
 * calls the reviewSenior Cloud Function, which records who decided, when and why.
 */
const META = {
  approve: { icon: ThumbsUp, tone: 'green', title: 'rvApproveTitle', body: 'rvApproveBody', confirm: 'rvConfirmApprove' },
  reject: { icon: ThumbsDown, tone: 'red', title: 'rvRejectTitle', body: 'rvRejectBody', confirm: 'rvConfirmReject' },
  flag: { icon: Flag, tone: 'amber', title: 'rvFlagTitle', body: 'rvFlagBody', confirm: 'rvConfirmFlag' },
  unflag: { icon: Flag, tone: 'blue', title: 'rvUnflagTitle', body: 'rvUnflagBody', confirm: 'rvConfirmUnflag' },
};
const TONE = {
  green: { bubble: 'bg-green-100 text-green-600', btn: 'bg-green-600 hover:bg-green-700' },
  red: { bubble: 'bg-red-100 text-red-600', btn: 'bg-red-600 hover:bg-red-700' },
  amber: { bubble: 'bg-amber-100 text-amber-600', btn: 'bg-amber-500 hover:bg-amber-600' },
  blue: { bubble: 'bg-blue-100 text-blue-600', btn: 'bg-[#0f52ba] hover:bg-blue-700' },
};

export default function ReviewDecisionModal({ action, user, users, busy, onClose, onConfirm }) {
  const { t } = useLang();
  const meta = META[action];
  const Icon = meta.icon;
  const tone = TONE[meta.tone];
  const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.id;
  const [reason, setReason] = useState('');
  const [hasPhoto, setHasPhoto] = useState(null); // null = still checking

  const showChecklist = action === 'approve' || action === 'reject';

  useEffect(() => {
    if (!showChecklist) return undefined;
    let alive = true;
    getDocs(query(collection(db, 'id_verifications'), where('uid', '==', user.id), limit(1)))
      .then((snap) => { if (alive) setHasPhoto(!snap.empty); })
      .catch(() => { if (alive) setHasPhoto(false); });
    return () => { alive = false; };
  }, [user.id, showChecklist]);

  const elig = useMemo(() => {
    if (!showChecklist || hasPhoto === null) return null;
    const id = String(user.idNumber || '').trim();
    const duplicateCount = id ? (users || []).filter((x) => x.id !== user.id && String(x.idNumber || '').trim() === id).length : 0;
    return checkEligibility(user, { hasIdPhoto: hasPhoto, duplicateCount, resolveBarangay });
  }, [showChecklist, hasPhoto, user, users]);

  const text = (item) => {
    const d = item.detail || '';
    switch (item.key) {
      case 'age':
        if (item.ok) return t.rvAgeOk.replace('{age}', d);
        if (d === 'missing') return t.rvAgeMissing;
        if (d === 'unclear') return t.rvAgeUnclear;
        return t.rvAgeUnder.replace('{age}', d.split(':')[1] || '?');
      case 'address': return item.ok ? t.rvCheckAddress : t.rvAddressOutside;
      case 'idPhoto': return item.ok ? t.rvCheckPhoto : t.rvPhotoMissing;
      case 'idFormat':
        if (item.ok) return t.rvCheckIdFormat;
        return d === 'temporary' ? t.rvIdTemp : d === 'missing' ? t.rvIdMissing : t.rvIdFormat;
      default: return item.ok ? t.rvCheckDuplicate : t.rvDupUsed;
    }
  };

  // A reason is required to reject or flag, and to approve when some check did not pass.
  const reasonRequired = action === 'reject' || action === 'flag' || (action === 'approve' && !!elig && elig.softFail);
  const minLen = action === 'flag' ? 3 : 5;
  const reasonOk = !reasonRequired || reason.trim().length >= minLen;
  const blocked = action === 'approve' && (!elig || elig.hardFail);
  const canConfirm = !busy && reasonOk && !blocked;
  const showReason = action !== 'unflag';
  const reasonLabel = action === 'flag' ? t.rvNoteRequired : reasonRequired ? t.rvReasonRequired : t.rvReasonOptional;

  return (
    <div className="fixed inset-0 z-10000 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={t[meta.title]}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 z-10 text-gray-900">
        <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${tone.bubble}`}>
          <Icon size={24} />
        </div>
        <h2 className="text-lg font-bold text-center mb-1">{t[meta.title]}</h2>
        <p className="text-sm font-bold text-center text-gray-800">&quot;{fullName}&quot;</p>
        <p className="text-xs font-mono text-center text-gray-500 mb-3">{referenceCode(user.id)}</p>
        <p className="text-sm text-gray-700 bg-gray-50 rounded-xl px-4 py-3 mb-4">{t[meta.body].replace('{name}', fullName)}</p>

        {showChecklist && (
          <div className="mb-4">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">{t.rvChecklist}</p>
            {!elig ? (
              <p className="text-sm text-gray-600 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> {t.rvChecking}</p>
            ) : (
              <ul className="space-y-1.5">
                {elig.items.map((item) => (
                  <li key={item.key} className="flex items-start gap-2 text-sm">
                    {item.ok
                      ? <CheckCircle2 size={16} className="text-green-600 shrink-0 mt-0.5" />
                      : item.hard
                        ? <XCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
                        : <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />}
                    <span className={item.ok ? 'text-gray-700' : item.hard ? 'text-red-700 font-semibold' : 'text-amber-800 font-semibold'}>{text(item)}</span>
                  </li>
                ))}
              </ul>
            )}
            {action === 'approve' && elig && elig.hardFail && (
              <p role="alert" className="mt-3 text-sm font-semibold text-red-700 bg-red-50 rounded-xl px-4 py-2">{t.rvHardBlock}</p>
            )}
            {action === 'approve' && elig && !elig.hardFail && elig.softFail && (
              <p className="mt-3 text-sm text-amber-800 bg-amber-50 rounded-xl px-4 py-2 flex items-start gap-2"><Info size={16} className="shrink-0 mt-0.5" />{t.rvSoftWarn}</p>
            )}
          </div>
        )}

        {showReason && (
          <div className="mb-5">
            <label htmlFor="rv-reason" className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">{reasonLabel}</label>
            <textarea
              id="rv-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder={t.rvReasonPlaceholder}
              className="w-full rounded-xl border-2 border-gray-200 bg-gray-50 p-3 text-sm text-gray-900 outline-none focus:border-[#0f52ba]"
            />
          </div>
        )}

        <div className="flex gap-3">
          <button type="button" onClick={onClose} disabled={busy} className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-60">
            {t.rvCancel}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason.trim())}
            disabled={!canConfirm}
            className={`flex-1 py-3 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 ${tone.btn}`}
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Icon size={15} />} {t[meta.confirm]}
          </button>
        </div>
      </div>
    </div>
  );
}
