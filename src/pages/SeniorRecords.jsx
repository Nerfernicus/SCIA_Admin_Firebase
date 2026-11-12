import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  ClipboardCheck, CheckCircle2, XCircle, Loader2, Printer, Ban, Search, QrCode, Plus, X, Download,
} from 'lucide-react';
import { db, functions } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { ID_TYPES, idTypeLabel, RECORD_RE } from '../lib/seniorRecord';
import Code39 from '../components/Code39';
import MaskedName from '../components/MaskedName';
import vallogo from '../assets/vallogo.png';

const call = (name) => httpsCallable(functions, name);
const nameOf = (u) => [u.firstName, u.midName, u.lastName].filter(Boolean).join(' ');
const errMsg = (e) => (e?.message || 'Something went wrong.').replace(/^.*?:\s*/, '');
const fmt = (ts) => (ts?.toDate ? ts.toDate().toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '-');

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'revoked', label: 'Revoked' },
];
const BADGE = { active: 'bg-green-100 text-green-800', revoked: 'bg-red-100 text-red-800' };

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0f52ba]/30 focus:border-[#0f52ba]';
const primaryBtn = 'px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-bold flex items-center gap-1 disabled:opacity-50';
const ghostBtn = 'px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50';

// ── Printable ID (CR80, 85.6 x 54 mm). Opens its own window so only the card prints. ──
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
          <div className="lbl">OSCA No.</div><div className="val mono">{r.recordNo}</div>
        </div>
        <QRCodeSVG value={r.qrValue || r.recordNo} size={88} level="M" />
      </div>
      <div className="bar"><Code39 value={r.recordNo} height={26} /></div>
    </div>,
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

function Modal({ children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={`w-full ${wide ? 'max-w-lg' : 'max-w-sm'} max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl`}>{children}</div>
    </div>
  );
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
    try { onDone((await call('verifyAndIssueSeniorRecord')({ uid: user.id, documents: rows, note })).data); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <Modal wide>
      <h2 className="text-lg font-bold text-gray-900">Verify &amp; issue OSCA number</h2>
      <p className="mt-1 text-sm text-gray-600">
        <MaskedName id={user.id} name={nameOf(user)} /> · {user.barangay || 'No barangay'} · Birthdate {user.dob || '?'}
      </p>
      <p className="mt-1 text-xs text-gray-500">Check the original document in person and record every ID you checked.</p>

      <div className="mt-4 space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2">
            <select className={`${inputCls} flex-1`} value={r.type} onChange={(e) => set(i, { type: e.target.value })}>
              {ID_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input className={`${inputCls} !w-40`} value={r.number} onChange={(e) => set(i, { number: e.target.value })}
              placeholder={r.type === 'birth_certificate' ? 'Reg. no. (optional)' : 'ID number'} />
            {rows.length > 1 && (
              <button onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove document"
                className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"><X size={14} /></button>
            )}
          </div>
        ))}
        <button onClick={() => setRows([...rows, { type: 'birth_certificate', number: '' }])}
          className="text-sm font-semibold text-[#0f52ba] flex items-center gap-1"><Plus size={14} /> Add another document</button>
      </div>

      <textarea className={`${inputCls} mt-3`} rows={2} value={note} onChange={(e) => setNote(e.target.value)}
        placeholder="Notes (required if the birthdate on the ID is unclear)" />
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}

      <div className="mt-5 flex justify-end gap-2">
        <button className={ghostBtn} onClick={onClose} disabled={busy}>Cancel</button>
        <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-sm font-bold text-white flex items-center gap-1 disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Verify &amp; issue
        </button>
      </div>
    </Modal>
  );
}

// ── Review an assisted-sign-up application (documents scanned at the desk) ──────────────────
function ReviewModal({ app, onClose, onDone }) {
  const [images, setImages] = useState(null);
  const [rows, setRows] = useState([]);
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    getDocs(collection(db, 'senior_applications', app.id, 'documents')).then((snap) => {
      const list = snap.docs.map((d) => d.data()).sort((a, b) => 0 + (a.uploadedAt?.seconds || 0) - (b.uploadedAt?.seconds || 0));
      setImages(list);
      setRows(list.map((d) => ({ type: d.kind === 'id' ? 'philsys' : 'birth_certificate', number: '' })));
    }).catch(() => { setImages([]); setErr('Could not load the documents.'); });
  }, [app.id]);

  const set = (i, patch) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const submit = async (action) => {
    setBusy(true); setErr('');
    try { onDone((await call('verifyApplication')({ applicationId: app.id, action, documents: rows, note })).data); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <Modal wide>
      <h2 className="text-lg font-bold text-gray-900">Review documents</h2>
      <p className="mt-1 text-sm text-gray-600">
        <MaskedName id={app.id} name={nameOf(app)} /> · {app.barangay || 'No barangay'} · Birthdate {app.dob || '?'}
      </p>
      <p className="mt-1 text-xs text-gray-500">Check each photo against the senior's details, choose what it is, and enter the ID number.</p>

      {images === null && <p className="mt-4 flex items-center gap-2 text-sm text-gray-500"><Loader2 size={14} className="animate-spin" /> Loading documents…</p>}
      <div className="mt-4 space-y-4">
        {(images || []).map((img, i) => (
          <div key={i} className="rounded-xl border border-gray-200 p-3">
            <a href={`data:image/jpeg;base64,${img.imageBase64}`} target="_blank" rel="noreferrer">
              <img src={`data:image/jpeg;base64,${img.imageBase64}`} alt={`Document ${i + 1}`} className="max-h-64 w-full rounded-lg object-contain bg-gray-50" />
            </a>
            <div className="mt-2 flex gap-2">
              <select className={`${inputCls} flex-1`} value={rows[i]?.type || ''} onChange={(e) => set(i, { type: e.target.value })}>
                {ID_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <input className={`${inputCls} !w-40`} value={rows[i]?.number || ''} onChange={(e) => set(i, { number: e.target.value })}
                placeholder={rows[i]?.type === 'birth_certificate' ? 'Reg. no. (optional)' : 'ID number'} />
            </div>
          </div>
        ))}
      </div>

      <textarea className={`${inputCls} mt-3`} rows={2} value={note} onChange={(e) => setNote(e.target.value)}
        placeholder={rejecting ? 'Reason for rejecting (required)' : 'Notes (optional)'} />
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button className={ghostBtn} onClick={onClose} disabled={busy}>Close</button>
        {rejecting ? (
          <button onClick={() => submit('reject')} disabled={busy || note.trim().length < 5}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-sm font-bold text-white flex items-center gap-1 disabled:opacity-50">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />} Confirm reject
          </button>
        ) : (
          <>
            <button onClick={() => setRejecting(true)} disabled={busy} className="px-4 py-2 rounded-lg border border-red-200 text-sm font-semibold text-red-600 hover:bg-red-50">Reject</button>
            <button onClick={() => submit('approve')} disabled={busy || !images?.length}
              className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-sm font-bold text-white flex items-center gap-1 disabled:opacity-50">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Verify
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

// ── Revoke ──────────────────────────────────────────────────────────────────
function RevokeModal({ record, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    setBusy(true); setErr('');
    try { await call('revokeSeniorRecord')({ uid: record.id, reason }); onDone(); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal>
      <h2 className="text-lg font-bold text-gray-900">Revoke this record?</h2>
      <p className="mt-2 text-sm text-gray-600">
        OSCA No. <span className="font-semibold font-mono">{record.recordNo}</span> will stop validating and the digital ID is deactivated. The number is never reused.
      </p>
      <textarea className={`${inputCls} mt-3`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (lost card, deceased, fraud…)" />
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button className={ghostBtn} onClick={onClose} disabled={busy}>Cancel</button>
        <button onClick={submit} disabled={busy || reason.trim().length < 5}
          className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-sm font-bold text-white flex items-center gap-1 disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />} Revoke
        </button>
      </div>
    </Modal>
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
    const c = String(value ?? code).trim();
    setErr(''); setRes(null);
    if (!RECORD_RE.test(c)) { setErr('Enter the 6-digit OSCA number.'); return; }
    try { setRes((await call('lookupSeniorRecord')({ code: c })).data); } catch (e) { setErr(errMsg(e)); }
  };
  const stop = async () => { try { await scanner.current?.stop(); } catch { /* already stopped */ } setScanning(false); };
  const start = async () => {
    setScanning(true); setErr('');
    scanner.current = new Html5Qrcode('scia-qr-reader');
    try {
      await scanner.current.start({ facingMode: 'environment' }, { fps: 10, qrbox: 240 },
        (text) => { setCode(text); stop(); lookup(text); });
    } catch { setErr('Camera not available. Type the number instead.'); setScanning(false); }
  };
  useEffect(() => () => { if (scanner.current?.isScanning) scanner.current.stop().catch(() => {}); }, []);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-bold text-gray-900 flex items-center gap-2"><QrCode size={18} className="text-[#0f52ba]" /> Scan an OSCA ID</h2>
        <div id="scia-qr-reader" className="mt-3" />
        <button onClick={scanning ? stop : start} className="mt-3 px-4 py-2 rounded-lg bg-[#0f52ba] hover:bg-[#0c3f91] text-white text-sm font-bold">
          {scanning ? 'Stop camera' : 'Start camera'}
        </button>
        <div className="mt-4 flex gap-2">
          <input className={`${inputCls} font-mono`} inputMode="numeric" maxLength={6} placeholder="OSCA No. (e.g. 000001)"
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && lookup()} />
          <button className={ghostBtn} onClick={() => lookup()}>Check</button>
        </div>
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-bold text-gray-900">Result</h2>
        {!res && <p className="mt-3 text-sm text-gray-400">Scan or type an OSCA number to check it against the local registry.</p>}
        {res && !res.found && (
          <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-red-600"><XCircle size={18} /> Not found in the OSCA Valenzuela registry.</p>
        )}
        {res?.found && (
          <div className="mt-3">
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1 ${res.valid ? BADGE.active : BADGE.revoked}`}>
              {res.valid ? <CheckCircle2 size={13} /> : <XCircle size={13} />} {res.valid ? 'Valid' : res.status}
            </span>
            <p className="mt-3 font-semibold text-gray-900"><MaskedName id={res.recordNo} name={res.fullName} /></p>
            <p className="text-sm text-gray-500">{res.barangay || '-'} · {res.sex || '-'}</p>
            <p className="mt-1 text-sm font-mono text-gray-700">OSCA No. {res.recordNo}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function SeniorRecords() {
  const { isSuperAdmin } = useAuth();
  const [tab, setTab] = useState(isSuperAdmin ? 'pending' : 'scan');
  const [filter, setFilter] = useState('all');
  const [pending, setPending] = useState([]);
  const [records, setRecords] = useState([]);
  const [verifiedUsers, setVerifiedUsers] = useState([]);
  const [apps, setApps] = useState([]);
  const [reviewTarget, setReviewTarget] = useState(null);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState('');
  const [verifyTarget, setVerifyTarget] = useState(null);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [notice, setNotice] = useState(null); // { ok, text }

  useEffect(() => {
    if (!isSuperAdmin) return undefined;
    const u1 = onSnapshot(query(collection(db, 'users'), where('status', '==', 'PENDING')),
      (s) => setPending(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
    const u2 = onSnapshot(collection(db, 'senior_records'),
      (s) => setRecords(s.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.issuedAt?.toMillis?.() || 0) - (a.issuedAt?.toMillis?.() || 0))));
    const u3 = onSnapshot(query(collection(db, 'users'), where('isVerified', '==', true)),
      (s) => setVerifiedUsers(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
    const u4 = onSnapshot(query(collection(db, 'senior_applications'), where('status', '==', 'pending')),
      (s) => setApps(s.docs.map((d) => ({ id: d.id, _app: true, ...d.data() }))
        .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0))));
    return () => { u1(); u2(); u3(); u4(); };
  }, [isSuperAdmin]);

  const q = search.trim().toLowerCase();
  const fp = useMemo(() => [...apps, ...pending].filter((u) => !q || nameOf(u).toLowerCase().includes(q)), [apps, pending, q]);
  const fr = useMemo(() => records.filter((r) =>
    (filter === 'all' || r.status === filter) && (!q || `${r.fullName} ${r.recordNo}`.toLowerCase().includes(q))), [records, filter, q]);

  // Accounts OSCA verified before this registry existed: verified, but no senior_records entry yet.
  const recordIds = useMemo(() => new Set(records.map((r) => r.id)), [records]);
  const existing = useMemo(() => verifiedUsers.filter((u) => !recordIds.has(u.id)
    && String(u.status || '').toUpperCase() !== 'SUSPENDED'
    && (!q || nameOf(u).toLowerCase().includes(q))), [verifiedUsers, recordIds, q]);

  const importUsers = async (list) => {
    setImporting(true); setNotice(null);
    const tally = { imported: 0, kept: 0, error: 0, skipped: 0 };
    let firstError = '';
    try {
      for (let i = 0; i < list.length; i += 25) {
        const res = (await call('migrateLegacySeniors')({ uids: list.slice(i, i + 25).map((u) => u.id) })).data;
        res.results.forEach((r) => {
          if (r.result === 'imported') { tally.imported += 1; if (r.kept) tally.kept += 1; }
          else if (r.result === 'error') { tally.error += 1; firstError ||= r.why; }
          else tally.skipped += 1;
        });
      }
    } catch (e) { tally.error += 1; firstError ||= errMsg(e); }
    setImporting(false);
    setNotice({
      ok: tally.error === 0,
      text: `Imported ${tally.imported} (${tally.kept} kept their existing number, ${tally.imported - tally.kept} got a new one)`
        + `${tally.skipped ? `, skipped ${tally.skipped}` : ''}${tally.error ? `, ${tally.error} failed: ${firstError}` : '.'}`,
    });
  };

  const print = async (r) => {
    if (printCard(r)) { try { await call('logSeniorIdPrint')({ uid: r.id }); } catch { /* log is best-effort */ } }
    else setNotice({ ok: false, text: 'Allow pop-ups to print the ID.' });
  };

  const tabs = [
    ...(isSuperAdmin ? [{ key: 'pending', label: `Pending (${pending.length + apps.length})` }, { key: 'registry', label: `Registry (${records.length})` }, { key: 'existing', label: `Existing accounts (${verifiedUsers.filter((u) => !recordIds.has(u.id) && String(u.status || '').toUpperCase() !== 'SUSPENDED').length})` }] : []),
    { key: 'scan', label: 'Scan / verify' },
  ];

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto font-sans">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ClipboardCheck size={22} className="text-[#0f52ba]" /> Senior Records
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          The OSCA Valenzuela local registry. Verify a senior against a valid ID or birth certificate, issue the OSCA number, and print the ID.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
              tab === t.key ? 'bg-[#0f52ba] text-white border-[#0f52ba]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {notice && (
        <div className={`mb-3 flex items-center justify-between rounded-lg px-3 py-2 text-sm ${notice.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss"><X size={14} /></button>
        </div>
      )}

      {tab !== 'scan' && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className={`${inputCls} !pl-9`} placeholder={tab !== 'registry' ? 'Search name' : 'Search name or OSCA No.'}
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {tab === 'registry' && FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                filter === f.key ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'pending' && (
        <div className="overflow-x-auto bg-white rounded-2xl border border-gray-100 shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Senior</th>
                <th className="px-4 py-3 font-semibold">Barangay</th>
                <th className="px-4 py-3 font-semibold">Birthdate</th>
                <th className="px-4 py-3 font-semibold">Source</th>
                <th className="px-4 py-3 font-semibold">Registered</th>
                <th className="px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {fp.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No seniors waiting for verification</td></tr>}
              {fp.map((u) => (
                <tr key={u.id} className="border-t border-gray-100">
                  <td className="px-4 py-3"><MaskedName className="font-semibold text-gray-900" id={u.id} name={nameOf(u) || 'Unknown'} /></td>
                  <td className="px-4 py-3">{u.barangay || '-'}</td>
                  <td className="px-4 py-3">{u.dob || '-'}</td>
                  <td className="px-4 py-3">{u._app ? 'Assisted sign-up' : 'Mobile app'}</td>
                  <td className="px-4 py-3">{fmt(u.createdAt)}</td>
                  <td className="px-4 py-3">
                    <button className={primaryBtn} onClick={() => (u._app ? setReviewTarget(u) : setVerifyTarget(u))}><CheckCircle2 size={13} /> {u._app ? 'Review documents' : 'Verify'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'registry' && (
        <div className="overflow-x-auto bg-white rounded-2xl border border-gray-100 shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-3 font-semibold">OSCA No.</th>
                <th className="px-4 py-3 font-semibold">Senior</th>
                <th className="px-4 py-3 font-semibold">Barangay</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Documents checked</th>
                <th className="px-4 py-3 font-semibold">Issued</th>
                <th className="px-4 py-3 font-semibold">Printed</th>
                <th className="px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {fr.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No records</td></tr>}
              {fr.map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-mono font-semibold text-gray-900">{r.recordNo}</td>
                  <td className="px-4 py-3"><MaskedName className="font-semibold text-gray-900" id={r.id} name={r.fullName || 'Unknown'} /></td>
                  <td className="px-4 py-3">{r.barangay || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${BADGE[r.status] || ''}`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">{(r.verification?.documents || []).map((d) => idTypeLabel(d.type)).join(', ') || (r.verification?.migrated ? 'Existing account (imported)' : '-')}</td>
                  <td className="px-4 py-3">{fmt(r.issuedAt)}</td>
                  <td className="px-4 py-3">{r.printCount || 0}×</td>
                  <td className="px-4 py-3">
                    {r.status === 'active' ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <button onClick={() => print(r)} className="px-3 py-1.5 rounded-lg bg-[#0f52ba] hover:bg-[#0c3f91] text-white text-xs font-bold flex items-center gap-1">
                          <Printer size={13} /> Print ID
                        </button>
                        <button onClick={() => setRevokeTarget(r)} title="Revoke this record"
                          className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"><Ban size={14} /></button>
                      </div>
                    ) : <span className="text-gray-300">-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'existing' && (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">
            <span>
              These seniors were verified before the local registry existed. Importing keeps a clean 6-digit OSCA number as it is
              (their printed card stays valid); anyone else gets a new number.
            </span>
            <button disabled={importing || existing.length === 0} onClick={() => importUsers(existing)}
              className="px-3 py-1.5 rounded-lg bg-[#0f52ba] hover:bg-[#0c3f91] text-white text-xs font-bold flex items-center gap-1 disabled:opacity-50">
              {importing ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Import all ({existing.length})
            </button>
          </div>
          <div className="overflow-x-auto bg-white rounded-2xl border border-gray-100 shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Senior</th>
                  <th className="px-4 py-3 font-semibold">Barangay</th>
                  <th className="px-4 py-3 font-semibold">Current ID no.</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {existing.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">All verified accounts are in the registry</td></tr>}
                {existing.map((u) => (
                  <tr key={u.id} className="border-t border-gray-100">
                    <td className="px-4 py-3"><MaskedName className="font-semibold text-gray-900" id={u.id} name={nameOf(u) || 'Unknown'} /></td>
                    <td className="px-4 py-3">{u.barangay || '-'}</td>
                    <td className="px-4 py-3 font-mono">{u.idNumber || '-'}</td>
                    <td className="px-4 py-3">
                      <button disabled={importing} className={primaryBtn} onClick={() => importUsers([u])}><Download size={13} /> Import</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'scan' && <ScanPanel />}

      {verifyTarget && (
        <VerifyModal user={verifyTarget} onClose={() => setVerifyTarget(null)}
          onDone={(d) => {
            setVerifyTarget(null); setTab('registry');
            setNotice({ ok: true, text: `OSCA No. ${d.recordNo} issued${d.digitalIdIssued ? '.' : '. The digital ID is not issued yet; use the Digital ID page.'}` });
          }} />
      )}
      {reviewTarget && (
        <ReviewModal app={reviewTarget} onClose={() => setReviewTarget(null)}
          onDone={(d) => {
            setReviewTarget(null);
            setNotice({ ok: true, text: d.status === 'rejected'
              ? 'Application rejected.'
              : `Verified. OSCA No. ${d.recordNo} is reserved. Confirm the account in User Management to give the senior their login.` });
          }} />
      )}
      {revokeTarget && (
        <RevokeModal record={revokeTarget} onClose={() => setRevokeTarget(null)}
          onDone={() => { setRevokeTarget(null); setNotice({ ok: true, text: 'Record revoked.' }); }} />
      )}
    </div>
  );
}
