import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { UserPlus, Loader2, Copy, Printer, CheckCircle2, ShieldCheck, Eye } from 'lucide-react';
import { db, functions } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import MaskedName from './MaskedName';
import SeniorProfileModal from './SeniorProfileModal';
import { referenceCode } from '../lib/referenceCode';

const create = httpsCallable(functions, 'createAccountFromApplication');
const nameOf = (a) => [a.firstName, a.midName, a.lastName].filter(Boolean).join(' ');
const errMsg = (e) => (e?.message || 'Something went wrong.').replace(/^.*?:\s*/, '');

function slip(app, c) {
  const w = window.open('', '_blank', 'width=420,height=520');
  if (!w) return false;
  w.document.write(`<html><head><title>SCIA login</title><style>body{font-family:Arial,sans-serif;padding:24px}
    h2{margin:0 0 4px}.l{font-size:11px;color:#666;text-transform:uppercase;margin-top:14px}.v{font-size:22px;font-weight:700;font-family:monospace}
    .s{font-size:12px;color:#444;margin-top:18px}</style></head><body>
    <h2>SCIA Login Details</h2><div>Valenzuela City OSCA</div>
    <div class="l">Name</div><div class="v" style="font-family:Arial;font-size:16px">${nameOf(app).replace(/</g, '&lt;')}</div>
    <div class="l">OSCA number (login ID)</div><div class="v">${c.idNumber}</div>
    <div class="l">Temporary password</div><div class="v">${c.tempPassword}</div>
    <div class="s">Log in to the SCIA app with the OSCA number and this password, then change the password.</div>
    <script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
  return true;
}

// Seniors whose documents OSCA verified in Senior Records. Creating the login is a separate,
// confirmed step here: the credentials only exist (and are shown) after this.
export default function AccountCreationPanel() {
  const { isSuperAdmin } = useAuth();
  const [apps, setApps] = useState([]);
  const [target, setTarget] = useState(null);
  const [profileId, setProfileId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [creds, setCreds] = useState(null); // { app, idNumber, tempPassword }
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin) return undefined;
    return onSnapshot(query(collection(db, 'senior_applications'), where('status', '==', 'verified')),
      (s) => setApps(s.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.reviewedAt?.toMillis?.() || 0) - (b.reviewedAt?.toMillis?.() || 0))));
  }, [isSuperAdmin]);

  const confirm = async () => {
    setBusy(true); setErr('');
    try {
      const res = (await create({ applicationId: target.id })).data;
      setCreds({ app: target, idNumber: res.idNumber, tempPassword: res.tempPassword });
      setTarget(null);
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  const copy = () => navigator.clipboard.writeText(`SCIA Login\nOSCA No.: ${creds.idNumber}\nTemporary Password: ${creds.tempPassword}`)
    .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); });

  if (!isSuperAdmin || (apps.length === 0 && !creds)) return null;

  return (
    <div className="mb-8 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden touch-comfy">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
        <ShieldCheck size={18} className="text-green-600" />
        <div>
          <h2 className="font-bold text-gray-900">Verified, ready to create accounts ({apps.length})</h2>
          <p className="text-xs text-gray-500">OSCA verified these documents in Senior Records. Confirm to create the login.</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Senior</th>
              <th className="px-4 py-3 font-semibold">Barangay</th>
              <th className="px-4 py-3 font-semibold">OSCA No.</th>
              <th className="px-4 py-3 font-semibold">Verified by</th>
              <th className="px-4 py-3 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {apps.map((a) => (
              <tr key={a.id} className="border-t border-gray-100">
                <td className="px-4 py-3"><MaskedName className="font-semibold text-gray-900" id={a.id} name={nameOf(a)} /></td>
                <td className="px-4 py-3">{a.barangay || '-'}</td>
                <td className="px-4 py-3 font-mono font-semibold text-gray-900">{a.recordNo}</td>
                <td className="px-4 py-3">{a.reviewerName || '-'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                  <button onClick={() => setProfileId(a.id)}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-bold flex items-center gap-1 icon-btn"><Eye size={13} /> View</button>
                  <button onClick={() => { setErr(''); setTarget(a); }}
                    className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-bold flex items-center gap-1 icon-btn">
                    <UserPlus size={13} /> Create account
                  </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {profileId && <SeniorProfileModal target={{ applicationId: profileId }} onClose={() => setProfileId(null)} />}
      {target && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 transition-opacity duration-150 starting:opacity-0 motion-reduce:transition-none">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl transition duration-200 ease-out starting:opacity-0 starting:scale-[0.97] starting:translate-y-2 motion-reduce:transition-none touch-comfy">
            <h2 className="text-lg font-bold text-gray-900">Create this account?</h2>
            <p className="mt-2 text-sm text-gray-600">
              Reference <span className="font-semibold font-mono">{referenceCode(target.id)}</span> will get a SCIA login with OSCA No.{' '}
              <span className="font-semibold font-mono">{target.recordNo}</span>, marked verified, and a digital ID. The temporary password is shown once.
            </p>
            {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setTarget(null)} disabled={busy} className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={confirm} disabled={busy} className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-sm font-bold text-white flex items-center gap-1 disabled:opacity-50">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} Create account
              </button>
            </div>
          </div>
        </div>
      )}

      {creds && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 transition-opacity duration-150 starting:opacity-0 motion-reduce:transition-none">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl text-center transition duration-200 ease-out starting:opacity-0 starting:scale-[0.97] starting:translate-y-2 motion-reduce:transition-none touch-comfy">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3"><CheckCircle2 size={24} className="text-green-600" /></div>
            <h2 className="text-lg font-bold text-gray-900">Account created</h2>
            <p className="mt-1 text-sm text-gray-500">Give these to the senior. This is the only time the password is shown.</p>
            <div className="mt-4 bg-gray-50 rounded-xl border border-gray-100 p-4 text-left space-y-3">
              <div><p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">OSCA number (login ID)</p><p className="text-xl font-mono font-bold text-gray-900">{creds.idNumber}</p></div>
              <div><p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Temporary password</p><p className="text-xl font-mono font-bold text-gray-900">{creds.tempPassword}</p></div>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={copy} className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2 icon-btn"><Copy size={15} /> {copied ? 'Copied!' : 'Copy'}</button>
              <button onClick={() => slip(creds.app, creds)} className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2 icon-btn"><Printer size={15} /> Print slip</button>
            </div>
            <button onClick={() => setCreds(null)} className="mt-3 w-full py-2.5 rounded-lg bg-brand hover:bg-blue-700 text-white text-sm font-bold">Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
