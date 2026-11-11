import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';
import { Html5Qrcode } from 'html5-qrcode';
import { db, functions } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { ID_TYPES, idTypeLabel, RECORD_RE } from '../lib/seniorRecord';
import Code39 from '../components/Code39';
import vallogo from '../assets/vallogo.png';

const call = (name) => httpsCallable(functions, name);
const nameOf = (u) => [u.firstName, u.midName, u.lastName].filter(Boolean).join(' ');
const errMsg = (e) => e?.message?.replace(/^.*?:\s*/, '') || 'Something went wrong.';

// ── Printable ID (CR80 card, 85.6 x 54 mm). Opens a print window so nothing else prints. ──
function cardMarkup(r) {
  return renderToStaticMarkup(
    <div className="card">
      <div className="top">
        <img src={vallogo} alt="" />
        <div><b>CITY OF VALENZUELA</b><br />Office of Senior Citizens Affairs (OSCA)</div>
      </div>
      <div className="body">
        <div className="info">
          <div className="lbl">Name</div><div className="val">{r.fullName}</div>
          <div className="lbl">Barangay</div><div className="val">{r.barangay || '-'}</div>
          <div className="row">
            <div><div className="lbl">Birthdate</div><div className="val">{r.dob || '-'}</div></div>
            <div><div className="lbl">Sex</div><div className="val">{r.sex || '-'}</div></div>
          </div>
          <div className="lbl">Record No.</div><div className="val mono">{r.recordNo}</div>
        </div>
        <QRCodeSVG value={r.qrValue || r.recordNo} size={88} level="M" />
      </div>
      <div className="bar"><Code39 value={r.recordNo} height={26} /></div>
    </div>
  );
}

function printCard(r) {
  const w = window.open('', '_blank', 'width=520,height=360');
  if (!w) return false;
  w.document.write(`<html><head><title>${r.recordNo}</title><style>
    @page{size:85.6mm 54mm;margin:0} *{box-sizing:border-box} body{margin:0;font-family:Arial,sans-serif}
    .card{width:85.6mm;height:54mm;padding:3mm;border:.3mm solid #999;display:flex;flex-direction:column;justify-content:space-between}
    .top{display:flex;gap:2mm;align-items:center;font-size:7pt;border-bottom:.4mm solid #166534;padding-bottom:1mm}
    .top img{height:9mm}.body{display:flex;justify-content:space-between;gap:2mm}
    .info{flex:1;font-size:7pt}.lbl{font-size:5pt;color:#555;text-transform:uppercase;margin-top:.8mm}
    .val{font-weight:700;font-size:8pt}.mono{font-family:monospace}.row{display:flex;gap:4mm}
    .bar{height:7mm}
  </style></head><body>${cardMarkup(r)}<script>window.onload=()=>{window.print()}</script></body></html>`);
  w.document.close();
  return true;
}

// ── Verify & issue ──────────────────────────────────────────────────────────
function VerifyModal({ user, onClose, onDone }) {
  const [rows, setRows] = useState([{ type: 'philsys', number: '' }]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (i, patch) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const submit = async () => {
    setBusy(true); setErr('');
    try {
      const res = await call('verifyAndIssueSeniorRecord')({ uid: user.id, documents: rows, note });
      onDone(res.data);
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-lg p-5 space-y-3 max-h-[90vh] overflow-auto">
        <h2 className="text-lg font-bold">Verify &amp; issue record</h2>
        <p className="text-sm">{nameOf(user)} · {user.barangay || 'no barangay'} · DOB {user.dob || '?'}</p>
        <p className="text-xs opacity-70">Check the original document in person. Record every ID you checked.</p>
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2">
            <select className="border rounded p-2 flex-1" value={r.type} onChange={(e) => set(i, { type: e.target.value })}>
              {ID_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input className="border rounded p-2 w-40" placeholder={r.type === 'birth_certificate' ? 'Reg. no. (optional)' : 'ID number'}
              value={r.number} onChange={(e) => set(i, { number: e.target.value })} />
            {rows.length > 1 && <button onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove">✕</button>}
          </div>
        ))}
        <button className="text-sm underline" onClick={() => setRows([...rows, { type: 'birth_certificate', number: '' }])}>+ Add another document</button>
        <textarea className="border rounded p-2 w-full" rows={2} placeholder="Notes (required if the birthday on the ID is unclear)" value={note} onChange={(e) => setNote(e.target.value)} />
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <div className="flex justify-end gap-2">
          <button className="px-3 py-2 rounded border" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="px-3 py-2 rounded bg-green-700 text-white" onClick={submit} disabled={busy}>{busy ? 'Issuing…' : 'Verify & issue'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Scan / look up ──────────────────────────────────────────────────────────
function ScanPanel() {
  const [code, setCode] = useState('');
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [scanning, setScanning] = useState(false);
  const scanner = useRef(null);

  const lookup = async (value) => {
    const c = String(value || code).trim().toUpperCase();
    setErr(''); setRes(null);
    if (!RECORD_RE.test(c)) { setErr('Not an OSCA Valenzuela record code.'); return; }
    try { setRes((await call('lookupSeniorRecord')({ code: c })).data); } catch (e) { setErr(errMsg(e)); }
  };
  const stop = async () => { try { await scanner.current?.stop(); } catch { /* already stopped */ } setScanning(false); };
  const start = async () => {
    setScanning(true);
    scanner.current = new Html5Qrcode('scia-qr-reader');
    try {
      await scanner.current.start({ facingMode: 'environment' }, { fps: 10, qrbox: 240 }, (text) => { setCode(text); stop(); lookup(text); });
    } catch { setErr('Camera not available. Type the code instead.'); setScanning(false); }
  };
  useEffect(() => () => { scanner.current?.isScanning && scanner.current.stop().catch(() => {}); }, []);

  return (
    <div className="space-y-3 max-w-md">
      <div id="scia-qr-reader" />
      <button className="px-3 py-2 rounded bg-green-700 text-white" onClick={scanning ? stop : start}>{scanning ? 'Stop camera' : 'Scan QR'}</button>
      <div className="flex gap-2">
        <input className="border rounded p-2 flex-1 font-mono" placeholder="VAL-OSCA-2026-000001" value={code} onChange={(e) => setCode(e.target.value)} />
        <button className="px-3 py-2 rounded border" onClick={() => lookup()}>Check</button>
      </div>
      {err && <p className="text-red-600 text-sm">{err}</p>}
      {res && (!res.found
        ? <p className="font-semibold text-red-600">No such record in the OSCA Valenzuela registry.</p>
        : <div className={`rounded border-2 p-3 ${res.valid ? 'border-green-600' : 'border-red-600'}`}>
            <p className="font-bold">{res.valid ? '✔ VALID' : '✘ ' + res.status.toUpperCase()}</p>
            <p>{res.fullName} · {res.barangay}</p><p className="font-mono text-sm">{res.recordNo}</p>
          </div>)}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function SeniorRecords() {
  const { isSuperAdmin } = useAuth();
  const [tab, setTab] = useState(isSuperAdmin ? 'pending' : 'scan');
  const [pending, setPending] = useState([]);
  const [records, setRecords] = useState([]);
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!isSuperAdmin) return undefined;
    const u1 = onSnapshot(query(collection(db, 'users'), where('status', '==', 'PENDING')),
      (s) => setPending(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
    const u2 = onSnapshot(collection(db, 'senior_records'),
      (s) => setRecords(s.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.issuedAt?.toMillis?.() || 0) - (a.issuedAt?.toMillis?.() || 0))));
    return () => { u1(); u2(); };
  }, [isSuperAdmin]);

  const q = search.trim().toLowerCase();
  const fp = useMemo(() => pending.filter((u) => !q || nameOf(u).toLowerCase().includes(q)), [pending, q]);
  const fr = useMemo(() => records.filter((r) => !q || `${r.fullName} ${r.recordNo}`.toLowerCase().includes(q)), [records, q]);

  const print = async (r) => {
    if (printCard(r)) { try { await call('logSeniorIdPrint')({ uid: r.id }); } catch { /* log is best-effort */ } }
    else setToast('Allow pop-ups to print.');
  };
  const revoke = async (r) => {
    const reason = window.prompt(`Revoke ${r.recordNo}? Reason (lost card, deceased, fraud…):`);
    if (!reason) return;
    try { await call('revokeSeniorRecord')({ uid: r.id, reason }); } catch (e) { setToast(errMsg(e)); }
  };

  const Tab = ({ id, children }) => (
    <button onClick={() => setTab(id)} className={`px-4 py-2 rounded-t ${tab === id ? 'bg-green-700 text-white' : 'border'}`}>{children}</button>
  );

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Valenzuela Senior Citizen Records</h1>
        <p className="text-sm opacity-70">Local OSCA registry. Independent of the NCSC database.</p>
      </div>
      <div className="flex gap-2 flex-wrap">
        {isSuperAdmin && <Tab id="pending">Pending ({pending.length})</Tab>}
        {isSuperAdmin && <Tab id="registry">Registry ({records.length})</Tab>}
        <Tab id="scan">Scan / verify</Tab>
      </div>
      {toast && <p className="text-sm text-amber-700" onClick={() => setToast('')}>{toast}</p>}
      {tab !== 'scan' && <input className="border rounded p-2 w-full max-w-sm" placeholder="Search name or record no." value={search} onChange={(e) => setSearch(e.target.value)} />}

      {tab === 'pending' && (
        <div className="space-y-2">
          {fp.length === 0 && <p className="opacity-70">No seniors waiting for verification.</p>}
          {fp.map((u) => (
            <div key={u.id} className="border rounded p-3 flex justify-between items-center gap-2">
              <div><p className="font-semibold">{nameOf(u)}</p><p className="text-sm opacity-70">{u.barangay || '-'} · DOB {u.dob || '?'} · {u.phone || u.email || ''}</p></div>
              <button className="px-3 py-2 rounded bg-green-700 text-white" onClick={() => setTarget(u)}>Verify</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'registry' && (
        <div className="space-y-2">
          {fr.length === 0 && <p className="opacity-70">No records issued yet.</p>}
          {fr.map((r) => (
            <div key={r.id} className="border rounded p-3 flex justify-between items-center gap-2 flex-wrap">
              <div>
                <p className="font-semibold">{r.fullName} <span className={r.status === 'active' ? 'text-green-700' : 'text-red-600'}>({r.status})</span></p>
                <p className="text-sm font-mono">{r.recordNo}</p>
                <p className="text-xs opacity-70">{r.barangay} · checked: {(r.verification?.documents || []).map((d) => idTypeLabel(d.type)).join(', ')} · printed {r.printCount || 0}×</p>
              </div>
              <div className="flex gap-2">
                {r.status === 'active' && <button className="px-3 py-2 rounded border" onClick={() => print(r)}>Print ID</button>}
                {r.status === 'active' && <button className="px-3 py-2 rounded border text-red-600" onClick={() => revoke(r)}>Revoke</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'scan' && <ScanPanel />}

      {target && <VerifyModal user={target} onClose={() => setTarget(null)}
        onDone={(d) => { setTarget(null); setToast(`Issued ${d.recordNo}${d.digitalIdIssued ? '' : ' (digital ID pending)'}`); setTab('registry'); }} />}
    </div>
  );
}
