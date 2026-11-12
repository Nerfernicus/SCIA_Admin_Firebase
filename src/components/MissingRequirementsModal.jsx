import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { BellRing, Loader2, Smartphone, Building2, Shuffle, Plus, X } from 'lucide-react';
import { functions } from '../lib/firebase';
import { referenceCode } from '../lib/referenceCode';

// "Request missing requirements": OSCA / barangay staff pick which ID or documents a senior
// still has to provide and whether the senior should send it in the app or bring it in person.
// Nothing is written from here: the requestMissingRequirements Cloud Function saves the list,
// notifies the senior in the app and records who asked.
const send = httpsCallable(functions, 'requestMissingRequirements');

const DOCS = [
  { kind: 'id', label: 'Valid ID' },
  { kind: 'birth_certificate', label: 'Birth certificate' },
  { kind: 'barangay_certificate', label: 'Barangay certificate' },
];
const METHODS = [
  { key: 'app', label: 'In the app', Icon: Smartphone },
  { key: 'in_person', label: 'In person', Icon: Building2 },
  { key: 'either', label: 'Either', Icon: Shuffle },
];

export default function MissingRequirementsModal({ user, onClose, onDone }) {
  const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.id;
  const [picked, setPicked] = useState({}); // kind -> method
  const [other, setOther] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const toggle = (kind) => setPicked((p) => {
    const next = { ...p };
    if (next[kind]) delete next[kind]; else next[kind] = 'either';
    return next;
  });
  const setMethod = (kind, method) => setPicked((p) => ({ ...p, [kind]: method }));

  const items = [
    ...DOCS.filter((d) => picked[d.kind]).map((d) => ({ kind: d.kind, method: picked[d.kind] })),
    ...(picked.other && other.trim().length >= 2 ? [{ kind: 'other', label: other.trim(), method: 'in_person' }] : []),
  ];
  const canSend = !busy && items.length > 0 && (!picked.other || other.trim().length >= 2);

  const submit = async () => {
    setBusy(true); setErr('');
    try {
      await send({ uid: user.id, action: 'request', items, note: note.trim() });
      onDone?.(items.length);
    } catch (e) {
      setErr((e?.message || 'Could not send the notice. Please try again.').replace(/^.*?:\s*/, ''));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-10000 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Request missing requirements">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 z-10 text-gray-900">
        <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 bg-amber-100 text-amber-600"><BellRing size={24} /></div>
        <h2 className="text-lg font-bold text-center mb-1">Request missing requirements</h2>
        <p className="text-sm font-bold text-center text-gray-800">&quot;{fullName}&quot;</p>
        <p className="text-xs font-mono text-center text-gray-500 mb-4">{referenceCode(user.id)}</p>
        <p className="text-sm text-gray-700 bg-gray-50 rounded-xl px-4 py-3 mb-4">
          The senior gets a notification in the SCIA app listing what is missing and how to submit it.
        </p>

        <p className="text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">What is missing?</p>
        <ul className="space-y-2 mb-3">
          {DOCS.map((d) => (
            <li key={d.kind} className={`rounded-xl border-2 p-3 ${picked[d.kind] ? 'border-[#0f52ba] bg-blue-50' : 'border-gray-200'}`}>
              <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                <input type="checkbox" checked={!!picked[d.kind]} onChange={() => toggle(d.kind)} className="w-4 h-4" /> {d.label}
              </label>
              {picked[d.kind] && (
                <div className="flex gap-1.5 mt-2" role="radiogroup" aria-label={`How to submit ${d.label}`}>
                  {METHODS.map(({ key, label, Icon }) => (
                    <button key={key} type="button" role="radio" aria-checked={picked[d.kind] === key} onClick={() => setMethod(d.kind, key)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 border ${picked[d.kind] === key ? 'bg-[#0f52ba] text-white border-[#0f52ba]' : 'bg-white text-gray-600 border-gray-200'}`}>
                      <Icon size={12} /> {label}
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
          <li className={`rounded-xl border-2 p-3 ${picked.other ? 'border-[#0f52ba] bg-blue-50' : 'border-gray-200'}`}>
            <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
              <input type="checkbox" checked={!!picked.other} onChange={() => toggle('other')} className="w-4 h-4" /> <Plus size={13} /> Other document
            </label>
            {picked.other && (
              <>
                <input value={other} onChange={(e) => setOther(e.target.value)} maxLength={80} placeholder="Name of the document"
                  className="mt-2 w-full rounded-lg border-2 border-gray-200 bg-white p-2 text-sm outline-none focus:border-[#0f52ba]" />
                <p className="text-xs text-gray-500 mt-1">Other documents are always brought in person.</p>
              </>
            )}
          </li>
        </ul>

        <label htmlFor="mr-note" className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">Note for the senior (optional)</label>
        <textarea id="mr-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2}
          placeholder="e.g. Please bring the original at the OSCA office, Mon–Fri."
          className="w-full rounded-xl border-2 border-gray-200 bg-gray-50 p-3 text-sm outline-none focus:border-[#0f52ba] mb-4" />

        {err && <p role="alert" className="mb-3 text-sm font-semibold text-red-700 bg-red-50 rounded-xl px-4 py-2 flex items-start gap-2"><X size={14} className="mt-0.5 shrink-0" />{err}</p>}

        <div className="flex gap-3">
          <button type="button" onClick={onClose} disabled={busy} className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-60">Cancel</button>
          <button type="button" onClick={submit} disabled={!canSend} className="flex-1 py-3 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 bg-amber-500 hover:bg-amber-600">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <BellRing size={15} />} Notify senior
          </button>
        </div>
      </div>
    </div>
  );
}
