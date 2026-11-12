import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { Loader2, X, User, CreditCard, FileCheck2, ShieldCheck, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { functions } from '../lib/firebase';

// "View Senior Profile": personal / family details and a STATUS for each document.
// By design it never shows an ID image or a download link. The photos are only opened in the
// verification step (Senior Records > Verify / Review documents).
const getProfile = httpsCallable(functions, 'getSeniorProfile');

const BADGES = {
  verified:  { cls: 'bg-green-100 text-green-800', Icon: CheckCircle2 },
  submitted: { cls: 'bg-blue-100 text-blue-800',   Icon: Clock },
  missing:   { cls: 'bg-red-100 text-red-800',     Icon: XCircle },
};
function Badge({ status, children }) {
  const { cls, Icon } = BADGES[status] || BADGES.missing;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>
      <Icon size={13} /> {children}
    </span>
  );
}

function Category({ icon: Icon, title, children }) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-500">
        <Icon size={16} className="text-[#0f52ba]" /> {title}
      </h3>
      {children}
    </section>
  );
}
const Field = ({ label, value }) => (
  <div>
    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
    <p className="text-sm font-semibold text-gray-900">{value || '-'}</p>
  </div>
);

const primaryText = (p) => {
  if (p.status === 'verified') return `Primary ID: Submitted${p.type ? ` (${p.type})` : ''}, Verified`;
  if (p.status === 'submitted') return 'Primary ID: Submitted, awaiting OSCA review';
  return 'Primary ID: Missing';
};
const docBadge = (s) => (s === 'verified' ? 'On File, Verified' : s === 'submitted' ? 'Available / Submitted' : 'Not Provided');

export default function SeniorProfileModal({ target, onClose }) {
  const [p, setP] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    getProfile(target).then((r) => live && setP(r.data))
      .catch((e) => live && setErr((e?.message || 'Could not load this profile.').replace(/^.*?:\s*/, '')));
    return () => { live = false; };
  }, [target]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-[#f8f9fa] p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Senior Profile</h2>
            {p && (
              <p className="mt-0.5 text-xs text-gray-500">
                {p.recordNo ? <>OSCA No. <span className="font-mono font-semibold">{p.recordNo}</span> · </> : null}
                Status: <span className="font-semibold">{p.accountStatus}</span>
              </p>
            )}
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>

        {!p && !err && <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 size={15} className="animate-spin" /> Loading profile…</p>}
        {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

        {p && (
          <div className="space-y-4">
            <Category icon={User} title="Personal & Family Information">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Full name" value={p.personal.fullName} />
                <Field label="Age" value={p.personal.age != null ? `${p.personal.age} years old` : ''} />
                <Field label="Birth date" value={p.personal.dob} />
                <Field label="Sex" value={p.personal.sex} />
                <div className="sm:col-span-2"><Field label="Address (Valenzuela City)" value={p.personal.address || p.personal.barangay} /></div>
              </div>
              <p className="mb-2 mt-4 text-[10px] font-bold uppercase tracking-wider text-gray-400">Relatives / emergency contacts</p>
              {p.contacts.length === 0 ? <p className="text-sm text-gray-400">None on file</p> : (
                <div className="space-y-2">
                  {p.contacts.map((c, i) => (
                    <div key={i} className="grid grid-cols-1 gap-1 rounded-lg bg-gray-50 px-3 py-2 sm:grid-cols-3">
                      <Field label="Name" value={c.name} />
                      <Field label="Relationship" value={c.relationship} />
                      <Field label="Contact number" value={c.phone} />
                    </div>
                  ))}
                </div>
              )}
            </Category>

            <Category icon={CreditCard} title="Primary Identification">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900">{primaryText(p.primaryId)}</p>
                <Badge status={p.primaryId.status}>{p.primaryId.status === 'missing' ? 'Missing' : 'Submitted / Present'}</Badge>
              </div>
            </Category>

            <Category icon={FileCheck2} title="Other Related Documents">
              <div className="divide-y divide-gray-100">
                {p.documents.map((d) => (
                  <div key={d.key} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                    <p className="text-sm font-semibold text-gray-900">{d.label}</p>
                    <Badge status={d.status}>{docBadge(d.status)}</Badge>
                  </div>
                ))}
              </div>
            </Category>

            <p className="flex items-start gap-2 text-xs text-gray-500">
              <ShieldCheck size={14} className="mt-0.5 shrink-0" />
              ID images and documents are not shown here, to protect the senior's personal data. OSCA reviews them only during verification.
            </p>
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Close</button>
        </div>
      </div>
    </div>
  );
}
