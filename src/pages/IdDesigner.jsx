import { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Navigate, useBlocker } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, Barcode, Copy, Image as ImageIcon, Layers, Loader2,
  Lock, Minus, QrCode, RotateCcw, Save, Square, Stamp, Trash2, Type, Undo2, Redo2, Unlock, UserSquare,
  ZoomIn, ZoomOut, Maximize,
} from 'lucide-react';
import { db, functions } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { IdFace } from '../components/IdTemplateFace';
import {
  CARD_W, CARD_H, DEFAULT_ID_TEMPLATE, DYNAMIC_TEXT_TYPES, DYNAMIC_TYPES, FONT_FAMILIES, MAX_ELEMENTS_PER_SIDE,
  MAX_IMAGE_CHARS, TYPE_LABELS, cloneTemplate, getSampleCardData, isColor, normalizeTemplate, setCachedIdTemplate,
} from '../lib/idTemplate';

const GRID = 5;          // snap step, in card pixels
const SNAP_PX = 6;       // alignment-guide pull, in screen pixels
const MAX_HISTORY = 100;
const r1 = (n) => Math.round(n * 10) / 10;

// ── history (undo / redo) ────────────────────────────────────────────────────
// `live` changes (drags) are not recorded one by one: gestureStart/gestureEnd turn a whole drag into one step.
// `commit` changes with the same key within 0.9 s (typing, nudging) merge into one step.
function reducer(s, a) {
  switch (a.type) {
    case 'load':
      return { tpl: a.tpl, past: [], future: [], lastKey: null, lastAt: 0, gesture: null };
    case 'commit': {
      const next = a.fn(s.tpl);
      if (next === s.tpl) return s;
      const merge = a.key && s.lastKey === a.key && a.now - s.lastAt < 900;
      return { ...s, tpl: next, past: merge ? s.past : [...s.past, s.tpl].slice(-MAX_HISTORY), future: [], lastKey: a.key || null, lastAt: a.now };
    }
    case 'live':
      return { ...s, tpl: a.fn(s.tpl) };
    case 'gestureStart':
      return { ...s, gesture: s.tpl };
    case 'gestureEnd':
      if (s.gesture && s.gesture !== s.tpl) return { ...s, past: [...s.past, s.gesture].slice(-MAX_HISTORY), future: [], gesture: null, lastKey: null };
      return { ...s, gesture: null };
    case 'undo':
      if (!s.past.length) return s;
      return { ...s, tpl: s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [s.tpl, ...s.future], lastKey: null };
    case 'redo':
      if (!s.future.length) return s;
      return { ...s, tpl: s.future[0], past: [...s.past, s.tpl], future: s.future.slice(1), lastKey: null };
    default:
      return s;
  }
}

const mapEls = (t, side, fn) => ({ ...t, [side]: { ...t[side], elements: t[side].elements.map(fn) } });
const newId = () => `el_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const maxZ = (els) => els.reduce((m, e) => Math.max(m, e.zIndex || 0), 0);

function makeElement(type, zIndex) {
  const text = { fontFamily: 'Arial', fontSize: 12, fontWeight: 400, color: '#111111', align: 'left', valign: 'top', lineHeight: 1.2 };
  const field = { ...text, fontFamily: 'Courier New', fontWeight: 700 };
  const base = { id: newId(), type, x: 0, y: 0, width: 160, height: 20, rotation: 0, zIndex, visibleIn: 'all', locked: false, style: {} };
  let el;
  switch (type) {
    case 'text': el = { ...base, content: 'New text', style: text }; break;
    case 'photo': el = { ...base, width: 84, height: 100, style: { fill: '#efefef', borderColor: '#aaaaaa', borderWidth: 1.5, radius: 2 } }; break;
    case 'barcode': el = { ...base, width: 160, height: 30 }; break;
    case 'qr': el = { ...base, width: 70, height: 70 }; break;
    case 'rectangle': el = { ...base, width: 100, height: 40, style: { fill: '#1a3a6b' } }; break;
    case 'line': el = { ...base, width: 140, height: 1, style: { color: '#333333' } }; break;
    case 'seal': el = { ...base, width: 34, height: 34 }; break;
    case 'image': el = { ...base, width: 100, height: 60, src: null, lockAspect: true, style: { objectFit: 'contain' } }; break;
    default: el = { ...base, style: { ...field, autoFit: type === 'name' || type === 'controlNo' } };
  }
  return { ...el, x: Math.round((CARD_W - el.width) / 2), y: Math.round((CARD_H - el.height) / 2) };
}

// ── image upload: shrink in the browser so the template stays small ──────────
async function readImage(file, maxDim = 600) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Use a PNG, JPG or WebP image.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('Could not read that image.'));
      i.src = url;
    });
    const keepAlpha = file.type !== 'image/jpeg';
    let max = maxDim;
    for (let n = 0; n < 5; n += 1) {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * k));
      c.height = Math.max(1, Math.round(img.height * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const out = keepAlpha ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.85);
      if (out.length <= MAX_IMAGE_CHARS) return { src: out, ratio: img.width / img.height };
      max = Math.round(max * 0.7);
    }
    throw new Error('That image is too large. Try a smaller or simpler one.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ── snapping helpers ─────────────────────────────────────────────────────────
function guideTargets(others) {
  const x = [0, CARD_W / 2, CARD_W];
  const y = [0, CARD_H / 2, CARD_H];
  others.forEach((o) => {
    x.push(o.x, o.x + o.width / 2, o.x + o.width);
    y.push(o.y, o.y + o.height / 2, o.y + o.height);
  });
  return { x, y };
}
function snapAxis(edges, targets, thr) {
  let best = null;
  edges.forEach((e) => targets.forEach((t) => {
    const d = t - e;
    if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, at: t };
  }));
  return best;
}

const HANDLES = [
  { k: 'nw', cx: 0, cy: 0, cur: 'nwse-resize' }, { k: 'n', cx: 0.5, cy: 0, cur: 'ns-resize' },
  { k: 'ne', cx: 1, cy: 0, cur: 'nesw-resize' }, { k: 'e', cx: 1, cy: 0.5, cur: 'ew-resize' },
  { k: 'se', cx: 1, cy: 1, cur: 'nwse-resize' }, { k: 's', cx: 0.5, cy: 1, cur: 'ns-resize' },
  { k: 'sw', cx: 0, cy: 1, cur: 'nesw-resize' }, { k: 'w', cx: 0, cy: 0.5, cur: 'ew-resize' },
];

// ── small UI pieces ──────────────────────────────────────────────────────────
const inputCls = 'w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 bg-white';
const btnCls = 'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed';
const labelCls = 'block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1';

function Section({ title, children }) {
  return (
    <div className="border-t border-gray-100 pt-3 mt-3 first:border-0 first:pt-0 first:mt-0">
      <p className="text-xs font-bold text-gray-800 mb-2">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Num({ label, value, onChange, min, max, step = 1 }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      <input
        type="number" className={inputCls} value={Number.isFinite(value) ? r1(value) : ''} min={min} max={max} step={step}
        onChange={(e) => { if (e.target.value === '') return; const n = Number(e.target.value); if (Number.isFinite(n)) onChange(n); }}
      />
    </label>
  );
}

function ColorField({ label, value, onChange, clearable }) {
  const [draft, setDraft] = useState(value || '');
  useEffect(() => { setDraft(value || ''); }, [value]);
  const hex = /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#000000';
  return (
    <div>
      <span className={labelCls}>{label}</span>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={label} className="h-8 w-9 shrink-0 rounded border border-gray-200 p-0.5 bg-white" value={hex} onChange={(e) => onChange(e.target.value)} />
        <input
          className={inputCls} value={draft} placeholder="none" spellCheck={false}
          onChange={(e) => { setDraft(e.target.value); if (isColor(e.target.value)) onChange(e.target.value.trim()); }}
        />
        {clearable && value ? <button type="button" className={btnCls} onClick={() => onChange(undefined)} aria-label={`Clear ${label}`}>✕</button> : null}
      </div>
    </div>
  );
}

const Seg = ({ value, options, onChange }) => (
  <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden bg-white">
    {options.map((o) => (
      <button
        key={o.v} type="button" title={o.title} aria-pressed={value === o.v}
        onClick={() => onChange(o.v)}
        className={`px-2.5 py-1.5 text-xs font-semibold ${value === o.v ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
      >{o.label}</button>
    ))}
  </div>
);

// One transparent hit target per element. Memoized, so while you drag only the moving one re-renders.
const HitBox = memo(function HitBox({ el, zoom, onDown, onEnter, onLeave, onDouble }) {
  const hh = Math.max(el.height, 10 / zoom);
  return (
    <div
      onPointerDown={(ev) => onDown(ev, el, 'move')}
      onPointerEnter={() => onEnter(el.id)}
      onPointerLeave={onLeave}
      onDoubleClick={() => onDouble(el)}
      style={{
        position: 'absolute', left: el.x, top: el.y - (hh - el.height) / 2, width: el.width, height: hh,
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined, zIndex: el.zIndex,
        cursor: el.locked ? 'default' : 'move',
      }}
    />
  );
});

// ═════════════════════════════════════════════════════════════════════════════
export default function IdDesigner() {
  const { isSuperAdmin, loading: authLoading } = useAuth();

  const [state, dispatch] = useReducer(reducer, null, () => ({
    tpl: cloneTemplate(DEFAULT_ID_TEMPLATE), past: [], future: [], lastKey: null, lastAt: 0, gesture: null,
  }));
  const { tpl } = state;
  const [saved, setSaved] = useState(null);          // the template object as last saved/loaded (reference compare)
  const [loadState, setLoadState] = useState('loading'); // loading | ready | error
  const [loadError, setLoadError] = useState('');
  const [side, setSide] = useState('front');
  const [selId, setSelId] = useState(null);
  const [zoom, setZoom] = useState(1.5);
  const [preview, setPreview] = useState(true);
  const [mode, setMode] = useState('digital');
  const [snap, setSnap] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [guides, setGuides] = useState(null);
  const [hoverId, setHoverId] = useState(null);
  const [editingId, setEditingId] = useState(null); // inline text editing (double-click / Enter)
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const sample = useMemo(() => getSampleCardData(), []);
  const els = tpl[side].elements;
  const sel = els.find((e) => e.id === selId) || null;
  const dirty = saved !== null && tpl !== saved;

  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const fileRef = useRef(null);
  const fileTarget = useRef(null); // 'add' | 'replace' | 'background'
  const dragRef = useRef(null);
  const pinch = useRef({ pts: new Map(), dist: 1, zoom: 1 });
  const live = useRef({});
  live.current = { tpl, side, zoom, snap, selId };

  // ── load the saved template (never silently fall back to the default here, or a failed load could be saved over a real one) ──
  const load = useCallback(async () => {
    setLoadState('loading'); setLoadError('');
    try {
      const snap0 = await getDoc(doc(db, 'settings', 'idTemplate'));
      const t = (snap0.exists() ? normalizeTemplate(snap0.data()) : null) || cloneTemplate(DEFAULT_ID_TEMPLATE);
      dispatch({ type: 'load', tpl: t });
      setSaved(t);
      setLoadState('ready');
    } catch (e) {
      setLoadError(e?.message || 'Could not load the saved template.');
      setLoadState('error');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const fitZoom = useCallback(() => {
    const w = stageRef.current?.clientWidth || 600;
    setZoom(Math.max(0.5, Math.min(3, Math.floor(((w - 56) / CARD_W) * 20) / 20)));
  }, []);
  useEffect(() => { if (loadState === 'ready') fitZoom(); }, [loadState, fitZoom]);

  // leaving with unsaved changes
  useEffect(() => {
    if (!dirty) return undefined;
    const h = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm('You have unsaved changes to the ID design. Leave without saving?')) blocker.proceed();
    else blocker.reset();
  }, [blocker]);

  // ── edit operations ─────────────────────────────────────────────────────────
  const commit = useCallback((fn, key) => dispatch({ type: 'commit', fn, key, now: Date.now() }), []);
  const patchEl = useCallback((id, patch, key) => {
    const sd = live.current.side;
    commit((t) => mapEls(t, sd, (e) => (e.id === id ? { ...e, ...patch } : e)), key || `${id}:${Object.keys(patch).join(',')}`);
  }, [commit]);
  const patchStyle = useCallback((id, sp, key) => {
    const sd = live.current.side;
    commit((t) => mapEls(t, sd, (e) => (e.id === id ? { ...e, style: { ...e.style, ...sp } } : e)), key || `${id}:s:${Object.keys(sp).join(',')}`);
  }, [commit]);

  const addElement = (type, extra = {}) => {
    const sd = live.current.side;
    const cur = live.current.tpl[sd].elements;
    if (cur.length >= MAX_ELEMENTS_PER_SIDE) { setMsg({ ok: false, text: `A side can hold at most ${MAX_ELEMENTS_PER_SIDE} elements.` }); return; }
    const el = { ...makeElement(type, maxZ(cur) + 1), ...extra };
    commit((t) => ({ ...t, [sd]: { ...t[sd], elements: [...t[sd].elements, el] } }));
    setSelId(el.id);
  };

  const removeSel = useCallback(() => {
    const { selId: id, side: sd } = live.current;
    if (!id) return;
    commit((t) => ({ ...t, [sd]: { ...t[sd], elements: t[sd].elements.filter((e) => e.id !== id) } }));
    setSelId(null);
  }, [commit]);

  const duplicateSel = useCallback(() => {
    const { tpl: t, side: sd, selId: id } = live.current;
    const src = t[sd].elements.find((e) => e.id === id);
    if (!src || t[sd].elements.length >= MAX_ELEMENTS_PER_SIDE) return;
    const copy = { ...cloneTemplate(src), id: newId(), x: src.x + 10, y: src.y + 10, zIndex: maxZ(t[sd].elements) + 1, locked: false };
    commit((tt) => ({ ...tt, [sd]: { ...tt[sd], elements: [...tt[sd].elements, copy] } }));
    setSelId(copy.id);
  }, [commit]);

  const reorder = (id, dir) => commit((t) => {
    const sorted = [...t[side].elements].sort((a, b) => a.zIndex - b.zIndex);
    const i = sorted.findIndex((e) => e.id === id);
    if (i < 0) return t;
    const [it] = sorted.splice(i, 1);
    const j = dir === 'front' ? sorted.length : dir === 'back' ? 0 : dir === 'up' ? Math.min(sorted.length, i + 1) : Math.max(0, i - 1);
    sorted.splice(j, 0, it);
    const z = new Map(sorted.map((e, k) => [e.id, k + 1]));
    return mapEls(t, side, (e) => ({ ...e, zIndex: z.get(e.id) }));
  });

  const nudge = useCallback((dx, dy) => {
    const { selId: id, side: sd } = live.current;
    if (!id) return;
    commit((t) => mapEls(t, sd, (e) => (e.id === id && !e.locked ? { ...e, x: r1(e.x + dx), y: r1(e.y + dy) } : e)), `nudge:${id}`);
  }, [commit]);

  const resetToDefault = () => {
    if (!window.confirm('Replace the design with the original OSCA design? You can undo this, and nothing changes for seniors until you press Save.')) return;
    commit(() => cloneTemplate(DEFAULT_ID_TEMPLATE));
    setSelId(null);
  };

  const save = useCallback(async () => {
    const t = live.current.tpl;
    const clean = normalizeTemplate(t);
    if (!clean) { setMsg({ ok: false, text: 'This design is not valid and cannot be saved.' }); return; }
    if (JSON.stringify(clean).length > 900000) { setMsg({ ok: false, text: 'The design is too large. Use smaller images.' }); return; }
    setSaving(true); setMsg(null);
    try {
      await httpsCallable(functions, 'saveIdTemplate')({ template: clean });
      setCachedIdTemplate(clean);
      setSaved(t);
      setMsg({ ok: true, text: 'Saved. New and reopened IDs now use this design.' });
    } catch (e) {
      setMsg({ ok: false, text: (e?.message || 'Could not save.').replace(/^.*?:\s*/, '') });
    }
    setSaving(false);
  }, []);

  // ── images ──────────────────────────────────────────────────────────────────
  const pickImage = (target) => { fileTarget.current = target; fileRef.current?.click(); };
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMsg(null);
    try {
      const target = fileTarget.current;
      if (target === 'background') {
        const { src } = await readImage(file, 1080);
        commit((t) => ({ ...t, [side]: { ...t[side], background: { ...t[side].background, image: src } } }));
      } else if (target === 'replace' && sel) {
        const { src, ratio } = await readImage(file);
        patchEl(sel.id, { src, ...(sel.lockAspect ? { height: r1(sel.width / ratio) } : {}) }, `${sel.id}:src`);
      } else {
        const { src, ratio } = await readImage(file);
        const w = ratio >= 1 ? 120 : Math.round(120 * ratio);
        addElement('image', { src, width: w, height: Math.max(8, Math.round(w / ratio)), x: Math.round((CARD_W - w) / 2), y: Math.round((CARD_H - w / ratio) / 2) });
      }
    } catch (err) {
      setMsg({ ok: false, text: err.message || 'Could not use that image.' });
    }
  };

  // ── pointer gestures (move / resize / rotate) ───────────────────────────────
  const toDoc = useCallback((e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: (e.clientX - r.left) / live.current.zoom, y: (e.clientY - r.top) / live.current.zoom };
  }, []);

  const startGesture = useCallback((e, el, kind, handle) => {
    if (e.button > 0 || pinch.current.pts.size >= 2) return; // primary button / one finger only
    e.preventDefault();
    e.stopPropagation();
    document.activeElement?.blur?.(); // so arrow keys / Delete act on the card, not a text box
    setSelId(el.id);
    if (el.locked) return;
    dispatch({ type: 'gestureStart' });
    dragRef.current = { kind, handle, id: el.id, orig: { ...el }, start: toDoc(e), active: kind !== 'move' };
  }, [toDoc]);

  const onHoverEnter = useCallback((id) => { if (!dragRef.current) setHoverId(id); }, []);
  const onHoverLeave = useCallback(() => setHoverId(null), []);
  const onDouble = useCallback((el) => { if (el.type === 'text' && !el.locked) setEditingId(el.id); }, []);
  const startEdit = useCallback(() => {
    const { tpl: t, side: sd, selId: id } = live.current;
    const el = t[sd].elements.find((x) => x.id === id);
    if (el && el.type === 'text' && !el.locked) setEditingId(id);
  }, []);

  useEffect(() => {
    const process = (e) => {
      const d = dragRef.current;
      if (!d) return;
      const { side: sd, zoom: z, snap: sn, tpl: t } = live.current;
      const o = d.orig;
      const p = toDoc(e);
      const dx = p.x - d.start.x;
      const dy = p.y - d.start.y;
      if (!d.active) { // a click is not a drag: ignore the first 3 screen pixels
        if (Math.hypot(dx, dy) * z < 3) return;
        d.active = true;
      }
      const free = e.altKey; // hold Alt to move without snapping
      const targets = guideTargets(t[sd].elements.filter((x) => x.id !== d.id));
      const thr = SNAP_PX / z;
      const g = { v: [], h: [] };
      let patch;

      if (d.kind === 'move') {
        let nx = o.x + dx;
        let ny = o.y + dy;
        if (!free) {
          const sx = snapAxis([nx, nx + o.width / 2, nx + o.width], targets.x, thr);
          if (sx) { nx += sx.delta; g.v.push(sx.at); } else if (sn) nx = Math.round(nx / GRID) * GRID;
          const sy = snapAxis([ny, ny + o.height / 2, ny + o.height], targets.y, thr);
          if (sy) { ny += sy.delta; g.h.push(sy.at); } else if (sn) ny = Math.round(ny / GRID) * GRID;
        }
        patch = { x: r1(nx), y: r1(ny) };
      } else if (d.kind === 'rotate') {
        const cx = o.x + o.width / 2;
        const cy = o.y + o.height / 2;
        let ang = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 90;
        ang = ((((ang + 180) % 360) + 360) % 360) - 180;
        if (e.shiftKey || (sn && !free)) {
          const step = Math.round(ang / 15) * 15;
          if (e.shiftKey || Math.abs(ang - step) < 4) ang = step;
        }
        patch = { rotation: r1(ang) };
      } else {
        const rad = ((o.rotation || 0) * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const ldx = dx * cos + dy * sin;
        const ldy = -dx * sin + dy * cos;
        const h = d.handle;
        let L = -o.width / 2; let R = o.width / 2; let T = -o.height / 2; let B = o.height / 2;
        if (h.includes('e')) R += ldx;
        if (h.includes('w')) L += ldx;
        if (h.includes('s')) B += ldy;
        if (h.includes('n')) T += ldy;
        const cx0 = o.x + o.width / 2;
        const cy0 = o.y + o.height / 2;

        if (!o.rotation && !free) { // snap the edges being dragged (unrotated elements only)
          const edge = (wv, tg, apply) => {
            const s1 = snapAxis([wv], tg, thr);
            if (s1) { apply(s1.delta); return s1.at; }
            if (sn) { apply(Math.round(wv / GRID) * GRID - wv); }
            return null;
          };
          let at;
          if (h.includes('e')) { at = edge(cx0 + R, targets.x, (dl) => { R += dl; }); if (at != null) g.v.push(at); }
          if (h.includes('w')) { at = edge(cx0 + L, targets.x, (dl) => { L += dl; }); if (at != null) g.v.push(at); }
          if (h.includes('s')) { at = edge(cy0 + B, targets.y, (dl) => { B += dl; }); if (at != null) g.h.push(at); }
          if (h.includes('n')) { at = edge(cy0 + T, targets.y, (dl) => { T += dl; }); if (at != null) g.h.push(at); }
        }

        const minW = 4;
        const minH = o.type === 'line' ? 0.5 : 4;
        if (R - L < minW) { if (h.includes('w')) L = R - minW; else R = L + minW; }
        if (B - T < minH) { if (h.includes('n')) T = B - minH; else B = T + minH; }

        if ((o.lockAspect || e.shiftKey) && h.length === 2) { // corner + keep proportions
          const s2 = Math.max((R - L) / o.width, (B - T) / o.height);
          const nw = o.width * s2;
          const nh = o.height * s2;
          if (h.includes('e')) R = L + nw; else L = R - nw;
          if (h.includes('s')) B = T + nh; else T = B - nh;
        }

        const w = R - L;
        const hh = B - T;
        const lcx = (L + R) / 2;
        const lcy = (T + B) / 2;
        const ncx = cx0 + lcx * cos - lcy * sin;
        const ncy = cy0 + lcx * sin + lcy * cos;
        patch = { x: r1(ncx - w / 2), y: r1(ncy - hh / 2), width: r1(w), height: r1(hh) };
      }

      dispatch({ type: 'live', fn: (tt) => mapEls(tt, sd, (x) => (x.id === d.id ? { ...x, ...patch } : x)) });
      setGuides(g.v.length || g.h.length ? g : null);
    };
    let raf = 0;
    let pendingEv = null;
    // At most one update per screen frame, however fast the pointer reports.
    const onMove = (e) => {
      if (pinch.current.pts.size >= 2 || !dragRef.current) return;
      pendingEv = { clientX: e.clientX, clientY: e.clientY, altKey: e.altKey, shiftKey: e.shiftKey };
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; const ev = pendingEv; pendingEv = null; if (ev) process(ev); });
    };
    const onUp = () => {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (pendingEv && dragRef.current) process(pendingEv);
      pendingEv = null;
      if (!dragRef.current) return;
      dragRef.current = null;
      dispatch({ type: 'gestureEnd' });
      setGuides(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  // ── keyboard: arrows nudge, Delete, Ctrl+Z / Y / D / S ──────────────────────
  const actions = useRef({});
  actions.current = { removeSel, duplicateSel, nudge, save, startEdit };
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (t && (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable)) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') { e.preventDefault(); dispatch({ type: e.shiftKey ? 'redo' : 'undo' }); return; }
      if (mod && k === 'y') { e.preventDefault(); dispatch({ type: 'redo' }); return; }
      if (mod && k === 's') { e.preventDefault(); actions.current.save(); return; }
      if (!live.current.selId) return;
      if (mod && k === 'd') { e.preventDefault(); actions.current.duplicateSel(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); actions.current.removeSel(); return; }
      if (e.key === 'Escape') { setSelId(null); return; }
      if (e.key === 'Enter') { e.preventDefault(); actions.current.startEdit(); return; }
      const step = e.shiftKey ? 10 : 1;
      const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (mv) { e.preventDefault(); actions.current.nudge(mv[0], mv[1]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Ctrl/Cmd + wheel (and trackpad pinch) zooms; two fingers pinch-zoom on touch screens.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const P = pinch.current;
    const clampZ = (z) => Math.min(3, Math.max(0.5, Math.round(z * 100) / 100));
    const dist = () => { const [a, b] = [...P.pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => clampZ(z * Math.exp(-e.deltaY * 0.01)));
    };
    const down = (e) => {
      if (e.pointerType !== 'touch') return;
      P.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (P.pts.size === 2) {
        if (dragRef.current) { dragRef.current = null; dispatch({ type: 'gestureEnd' }); setGuides(null); }
        P.dist = dist();
        P.zoom = live.current.zoom;
      }
    };
    const move = (e) => {
      if (!P.pts.has(e.pointerId)) return;
      P.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (P.pts.size === 2) setZoom(clampZ((P.zoom * dist()) / P.dist));
    };
    const up = (e) => { P.pts.delete(e.pointerId); };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', down, true);
    el.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', down, true);
      el.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [loadState]);

  if (!authLoading && !isSuperAdmin) return <Navigate to="/unauthorized" replace />;

  // ── render ──────────────────────────────────────────────────────────────────
  const hs = 11 / zoom;      // visible handle size (constant on screen)
  const hit = 26 / zoom;     // touch target
  const face = tpl[side];
  const sortedLayers = [...els].sort((a, b) => b.zIndex - a.zIndex);
  const isText = sel && (sel.type === 'text' || DYNAMIC_TEXT_TYPES.includes(sel.type));
  const hasBox = sel && !['line', 'seal'].includes(sel.type);
  const st = sel?.style || {};
  const editEl = editingId ? els.find((e) => e.id === editingId && e.type === 'text') || null : null;
  const hoverEl = hoverId && hoverId !== selId ? els.find((e) => e.id === hoverId) : null;

  if (loadState !== 'ready') {
    return (
      <div className="p-8 max-w-xl mx-auto text-center">
        {loadState === 'loading' ? (
          <p className="text-sm text-gray-500 flex items-center justify-center gap-2"><Loader2 className="animate-spin" size={16} /> Loading the ID design…</p>
        ) : (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
            <p className="text-sm font-semibold text-red-800">Could not load the saved ID design.</p>
            <p className="text-xs text-red-700 mt-1">{loadError}</p>
            <p className="text-xs text-red-700 mt-1">The designer stays closed so an unloaded design is never saved over the real one.</p>
            <button type="button" className={`${btnCls} mt-3`} onClick={load}>Try again</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto">
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onFile} />

      {/* top bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h1 className="text-xl font-bold text-gray-900">ID Designer</h1>
          <p className="text-xs text-gray-500">Design the OSCA ID (85.6 × 54 mm). Nothing changes for seniors until you press Save.</p>
        </div>
        {dirty && <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">Unsaved changes</span>}
        <button type="button" className={btnCls} onClick={() => dispatch({ type: 'undo' })} disabled={!state.past.length} title="Undo (Ctrl+Z)"><Undo2 size={14} /> Undo</button>
        <button type="button" className={btnCls} onClick={() => dispatch({ type: 'redo' })} disabled={!state.future.length} title="Redo (Ctrl+Y)"><Redo2 size={14} /> Redo</button>
        <button type="button" className={btnCls} onClick={resetToDefault}><RotateCcw size={14} /> Reset to default</button>
        <button
          type="button" onClick={save} disabled={saving || !dirty}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
        </button>
      </div>

      {msg && (
        <div role="status" className={`mt-3 rounded-xl border px-4 py-2.5 text-sm ${msg.ok ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'}`}>{msg.text}</div>
      )}

      {/* option bar */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-gray-200 bg-white px-4 py-2.5">
        <Seg value={side} onChange={(v) => { setSide(v); setSelId(null); setEditingId(null); }} options={[{ v: 'front', label: 'Front' }, { v: 'back', label: 'Back' }]} />
        <Seg value={mode} onChange={setMode} options={[{ v: 'digital', label: 'Digital' }, { v: 'physical', label: 'Physical' }]} />
        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700"><input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} /> Preview with sample data</label>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700"><input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> Snap to grid</label>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700"><input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> Show grid</label>
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" className={btnCls} onClick={() => setZoom((z) => Math.max(0.5, r1(z - 0.25)))} aria-label="Zoom out"><ZoomOut size={14} /></button>
          <select className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-semibold bg-white" value={String(zoom)} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Zoom">
            {[...new Set([0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, zoom])].sort((a, b) => a - b).map((z) => <option key={z} value={z}>{Math.round(z * 100)}%</option>)}
          </select>
          <button type="button" className={btnCls} onClick={() => setZoom((z) => Math.min(3, r1(z + 0.25)))} aria-label="Zoom in"><ZoomIn size={14} /></button>
          <button type="button" className={btnCls} onClick={fitZoom} aria-label="Fit to screen"><Maximize size={14} /></button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[230px_minmax(0,1fr)_300px] items-start">
        {/* left: add + layers */}
        <aside className="order-2 lg:order-1 rounded-2xl border border-gray-200 bg-white p-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          <Section title="Filled from the senior">
            <div className="grid grid-cols-2 gap-1.5">
              {DYNAMIC_TYPES.map((tp) => (
                <button key={tp} type="button" className={`${btnCls} justify-start`} onClick={() => addElement(tp)}>
                  {tp === 'photo' ? <UserSquare size={13} /> : tp === 'barcode' ? <Barcode size={13} /> : tp === 'qr' ? <QrCode size={13} /> : <Type size={13} />}
                  {TYPE_LABELS[tp]}
                </button>
              ))}
            </div>
          </Section>
          <Section title="Static items">
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" className={`${btnCls} justify-start`} onClick={() => addElement('text')}><Type size={13} /> Text</button>
              <button type="button" className={`${btnCls} justify-start`} onClick={() => pickImage('add')}><ImageIcon size={13} /> Image</button>
              <button type="button" className={`${btnCls} justify-start`} onClick={() => addElement('rectangle')}><Square size={13} /> Rectangle</button>
              <button type="button" className={`${btnCls} justify-start`} onClick={() => addElement('line')}><Minus size={13} /> Line</button>
              <button type="button" className={`${btnCls} justify-start col-span-2`} onClick={() => addElement('seal')}><Stamp size={13} /> Hologram seal</button>
            </div>
            <p className="text-[11px] text-gray-500">Images are shrunk automatically. Use a logo or a signature (PNG with a clear background works best).</p>
          </Section>
          <Section title={`Layers (${els.length})`}>
            <ul className="max-h-64 overflow-y-auto -mx-1 space-y-0.5">
              {sortedLayers.map((e) => (
                <li key={e.id}>
                  <button
                    type="button" onClick={() => setSelId(e.id)}
                    className={`w-full text-left px-2 py-1.5 rounded-lg text-xs flex items-center gap-1.5 ${e.id === selId ? 'bg-blue-50 text-blue-800 font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}
                  >
                    <Layers size={12} className="shrink-0 opacity-60" />
                    <span className="truncate">{e.type === 'text' ? (e.content || '').split('\n')[0] || 'Text' : TYPE_LABELS[e.type]}</span>
                    {e.locked && <Lock size={11} className="ml-auto shrink-0 opacity-60" />}
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        </aside>

        {/* centre: canvas */}
        <main className="order-1 lg:order-2 min-w-0">
          <div
            ref={stageRef}
            className="overflow-auto rounded-2xl border border-gray-200 p-6"
            style={{ background: 'repeating-conic-gradient(#f3f4f6 0% 25%, #e9ebef 0% 50%) 0 0 / 20px 20px', touchAction: 'pan-x pan-y' }}
          >
            <div
              ref={canvasRef}
              className="mx-auto select-none"
              style={{ width: CARD_W * zoom, height: CARD_H * zoom, touchAction: 'none', position: 'relative' }}
              onPointerDown={() => { document.activeElement?.blur?.(); setSelId(null); }}
            >
              <div style={{ width: CARD_W, height: CARD_H, transform: `scale(${zoom})`, transformOrigin: 'top left', position: 'absolute', left: 0, top: 0, boxShadow: '0 4px 20px rgba(0,0,0,0.25)' }}>
                <IdFace template={tpl} side={side} data={sample} mode={mode} placeholders={!preview} editor />
                {/* overlays live outside the clipped card face so edge handles stay visible */}
                <div style={{ position: 'absolute', inset: 0 }}>
                  {/* hit targets: same stacking order as the artwork */}
                  {els.map((e) => (
                    <HitBox key={e.id} el={e} zoom={zoom} onDown={startGesture} onEnter={onHoverEnter} onLeave={onHoverLeave} onDouble={onDouble} />
                  ))}
                  {hoverEl && (
                    <div style={{
                      position: 'absolute', left: hoverEl.x, top: hoverEl.y, width: hoverEl.width, height: hoverEl.height, pointerEvents: 'none', zIndex: 99980,
                      transform: hoverEl.rotation ? `rotate(${hoverEl.rotation}deg)` : undefined, outline: `${1.5 / zoom}px solid rgba(37,99,235,0.55)`,
                    }} />
                  )}
                  {editEl && (
                    <textarea
                      autoFocus
                      value={editEl.content || ''}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => patchEl(editEl.id, { content: e.target.value.slice(0, 2000) }, `${editEl.id}:content`)}
                      onBlur={() => setEditingId(null)}
                      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setEditingId(null); }}
                      onPointerDown={(e) => e.stopPropagation()}
                      style={{
                        position: 'absolute', left: editEl.x, top: editEl.y, width: editEl.width, height: editEl.height, zIndex: 100001,
                        transform: editEl.rotation ? `rotate(${editEl.rotation}deg)` : undefined, boxSizing: 'border-box',
                        margin: 0, padding: 0, border: 0, resize: 'none', overflow: 'hidden', touchAction: 'auto',
                        outline: `${1.5 / zoom}px solid #2563eb`, background: 'rgba(255,255,255,0.95)',
                        fontFamily: FONT_FAMILIES[editEl.style?.fontFamily] || FONT_FAMILIES.Arial, fontSize: editEl.style?.fontSize || 12,
                        fontWeight: editEl.style?.fontWeight || 400, fontStyle: editEl.style?.fontStyle || 'normal', color: editEl.style?.color || '#111111',
                        textAlign: editEl.style?.align || 'left', letterSpacing: editEl.style?.letterSpacing ? `${editEl.style.letterSpacing}px` : undefined,
                        lineHeight: editEl.style?.lineHeight || 1.2,
                      }}
                    />
                  )}
                  {showGrid && (
                    <div style={{
                      position: 'absolute', inset: 0, zIndex: 99990, pointerEvents: 'none',
                      backgroundImage: 'linear-gradient(to right, rgba(37,99,235,.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(37,99,235,.15) 1px, transparent 1px)',
                      backgroundSize: `${GRID * 2}px ${GRID * 2}px`,
                    }} />
                  )}
                  {guides && (
                    <div style={{ position: 'absolute', inset: 0, zIndex: 99995, pointerEvents: 'none' }}>
                      {guides.v.map((x) => <div key={`v${x}`} style={{ position: 'absolute', left: x, top: 0, bottom: 0, width: 1 / zoom, background: '#ec4899' }} />)}
                      {guides.h.map((y) => <div key={`h${y}`} style={{ position: 'absolute', top: y, left: 0, right: 0, height: 1 / zoom, background: '#ec4899' }} />)}
                    </div>
                  )}
                  {sel && (
                    <div
                      style={{
                        position: 'absolute', left: sel.x, top: sel.y, width: sel.width, height: sel.height, zIndex: 100000, pointerEvents: 'none',
                        transform: sel.rotation ? `rotate(${sel.rotation}deg)` : undefined, outline: `${1.5 / zoom}px solid #2563eb`,
                      }}
                    >
                      {!sel.locked && !editEl && HANDLES.map((h) => (
                        <div
                          key={h.k}
                          onPointerDown={(ev) => startGesture(ev, sel, 'resize', h.k)}
                          style={{
                            position: 'absolute', left: `${h.cx * 100}%`, top: `${h.cy * 100}%`, width: hit, height: hit, marginLeft: -hit / 2, marginTop: -hit / 2,
                            pointerEvents: 'auto', cursor: h.cur, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <div style={{ width: hs, height: hs, background: '#fff', border: `${1.5 / zoom}px solid #2563eb`, borderRadius: 2 / zoom }} />
                        </div>
                      ))}
                      {!sel.locked && !editEl && (
                        <div
                          onPointerDown={(ev) => startGesture(ev, sel, 'rotate')}
                          title="Rotate (Shift = 15° steps)"
                          style={{
                            position: 'absolute', left: '50%', top: -34 / zoom, width: hit, height: hit, marginLeft: -hit / 2, marginTop: -hit / 2,
                            pointerEvents: 'auto', cursor: 'grab', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <div style={{ width: hs, height: hs, background: '#2563eb', borderRadius: '50%' }} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-gray-500">
            Drag to move · double-click text (or Enter) to type on the card · Ctrl + wheel or two-finger pinch zooms · corner/edge handles resize (Shift keeps proportions) · top dot rotates · arrow keys nudge 1 px (Shift = 10) · Alt = move without snapping · Delete removes · Ctrl+Z / Ctrl+Y undo / redo · Ctrl+D duplicates.
          </p>
        </main>

        {/* right: properties */}
        <aside className="order-3 rounded-2xl border border-gray-200 bg-white p-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          {!sel ? (
            <>
              <Section title={`${side === 'front' ? 'Front' : 'Back'} background`}>
                <ColorField label="Colour" value={face.background.color} onChange={(c) => commit((t) => ({ ...t, [side]: { ...t[side], background: { ...t[side].background, color: c || '#ffffff' } } }), `bg:${side}`)} />
                <div className="flex gap-2">
                  <button type="button" className={btnCls} onClick={() => pickImage('background')}><ImageIcon size={13} /> {face.background.image ? 'Replace image' : 'Background image'}</button>
                  {face.background.image && <button type="button" className={btnCls} onClick={() => commit((t) => ({ ...t, [side]: { ...t[side], background: { ...t[side].background, image: null } } }))}>Remove</button>}
                </div>
              </Section>
              <p className="text-xs text-gray-500 mt-4">Select an element on the card (or in Layers) to edit it.</p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-3">
                <p className="text-sm font-bold text-gray-900 mr-auto">{TYPE_LABELS[sel.type]}</p>
                <button type="button" className={btnCls} onClick={() => patchEl(sel.id, { locked: !sel.locked }, `${sel.id}:lock`)} title={sel.locked ? 'Unlock' : 'Lock (cannot be moved by accident)'} aria-label="Lock">
                  {sel.locked ? <Lock size={13} /> : <Unlock size={13} />}
                </button>
                <button type="button" className={btnCls} onClick={duplicateSel} title="Duplicate (Ctrl+D)" aria-label="Duplicate"><Copy size={13} /></button>
                <button type="button" className={`${btnCls} text-red-600`} onClick={removeSel} title="Delete" aria-label="Delete"><Trash2 size={13} /></button>
              </div>

              <Section title="Position and size">
                <div className="grid grid-cols-2 gap-2">
                  <Num label="X" value={sel.x} onChange={(v) => patchEl(sel.id, { x: v })} />
                  <Num label="Y" value={sel.y} onChange={(v) => patchEl(sel.id, { y: v })} />
                  <Num label="Width" value={sel.width} min={1} onChange={(v) => patchEl(sel.id, { width: Math.max(1, v) })} />
                  <Num label={sel.type === 'line' ? 'Thickness' : 'Height'} value={sel.height} min={0.5} step={0.5} onChange={(v) => patchEl(sel.id, { height: Math.max(0.5, v) })} />
                  <Num label="Rotation °" value={sel.rotation} min={-180} max={180} onChange={(v) => patchEl(sel.id, { rotation: v })} />
                  <Num label="Opacity %" value={Math.round((st.opacity ?? 1) * 100)} min={0} max={100} onChange={(v) => patchStyle(sel.id, { opacity: Math.min(1, Math.max(0, v / 100)) })} />
                </div>
              </Section>

              <Section title="Layer">
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" className={btnCls} onClick={() => reorder(sel.id, 'front')}>To front</button>
                  <button type="button" className={btnCls} onClick={() => reorder(sel.id, 'up')} aria-label="Forward"><ArrowUp size={13} /></button>
                  <button type="button" className={btnCls} onClick={() => reorder(sel.id, 'down')} aria-label="Backward"><ArrowDown size={13} /></button>
                  <button type="button" className={btnCls} onClick={() => reorder(sel.id, 'back')}>To back</button>
                </div>
                <label className="block">
                  <span className={labelCls}>Show on</span>
                  <select className={inputCls} value={sel.visibleIn} onChange={(e) => patchEl(sel.id, { visibleIn: e.target.value })}>
                    <option value="all">Digital and physical ID</option>
                    <option value="digital">Digital ID only</option>
                    <option value="physical">Printed ID only</option>
                  </select>
                </label>
              </Section>

              {sel.type === 'text' && (
                <Section title="Text">
                  <textarea className={`${inputCls} min-h-24`} value={sel.content || ''} onChange={(e) => patchEl(sel.id, { content: e.target.value.slice(0, 2000) }, `${sel.id}:content`)} />
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                    <input type="checkbox" checked={st.list === 'decimal'} onChange={(e) => patchStyle(sel.id, { list: e.target.checked ? 'decimal' : 'none' })} /> Numbered list (one item per line)
                  </label>
                </Section>
              )}
              {DYNAMIC_TEXT_TYPES.includes(sel.type) && (
                <Section title="Data">
                  <p className="text-xs text-gray-600">Filled from the senior&apos;s record: {TYPE_LABELS[sel.type]}.</p>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                    <input type="checkbox" checked={!!st.autoFit} onChange={(e) => patchStyle(sel.id, { autoFit: e.target.checked })} /> Shrink long values to fit (one line)
                  </label>
                </Section>
              )}
              {(sel.type === 'barcode' || sel.type === 'qr') && <Section title="Data"><p className="text-xs text-gray-600">Encodes the senior&apos;s control / OSCA number.</p></Section>}

              {isText && (
                <Section title="Font">
                  <label className="block">
                    <span className={labelCls}>Family</span>
                    <select className={inputCls} value={st.fontFamily || 'Arial'} onChange={(e) => patchStyle(sel.id, { fontFamily: e.target.value })}>
                      {Object.keys(FONT_FAMILIES).map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <Num label="Size" value={st.fontSize ?? 12} min={4} max={120} step={0.5} onChange={(v) => patchStyle(sel.id, { fontSize: Math.min(120, Math.max(4, v)) })} />
                    <Num label="Letter spacing" value={st.letterSpacing ?? 0} min={-5} max={30} step={0.1} onChange={(v) => patchStyle(sel.id, { letterSpacing: v })} />
                    <Num label="Line height" value={st.lineHeight ?? 1.2} min={0.8} max={3} step={0.05} onChange={(v) => patchStyle(sel.id, { lineHeight: v })} />
                    {st.list === 'decimal' && <Num label="Item gap" value={st.paraGap ?? 0} min={0} max={30} onChange={(v) => patchStyle(sel.id, { paraGap: v })} />}
                  </div>
                  <ColorField label="Text colour" value={st.color} onChange={(c) => patchStyle(sel.id, { color: c || '#111111' }, `${sel.id}:color`)} />
                  <div className="flex flex-wrap gap-2">
                    <Seg value={(st.fontWeight || 400) >= 600 ? 'b' : 'n'} onChange={(v) => patchStyle(sel.id, { fontWeight: v === 'b' ? 700 : 400 })} options={[{ v: 'n', label: 'Regular' }, { v: 'b', label: 'Bold' }]} />
                    <Seg value={st.fontStyle || 'normal'} onChange={(v) => patchStyle(sel.id, { fontStyle: v })} options={[{ v: 'normal', label: 'Normal' }, { v: 'italic', label: 'Italic' }]} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Seg value={st.align || 'left'} onChange={(v) => patchStyle(sel.id, { align: v })} options={[{ v: 'left', label: <AlignLeft size={13} />, title: 'Left' }, { v: 'center', label: <AlignCenter size={13} />, title: 'Centre' }, { v: 'right', label: <AlignRight size={13} />, title: 'Right' }]} />
                    <Seg value={st.valign || 'top'} onChange={(v) => patchStyle(sel.id, { valign: v })} options={[{ v: 'top', label: 'Top' }, { v: 'middle', label: 'Middle' }, { v: 'bottom', label: 'Bottom' }]} />
                  </div>
                </Section>
              )}

              {sel.type === 'image' && (
                <Section title="Image">
                  <div className="flex gap-2">
                    <button type="button" className={btnCls} onClick={() => pickImage('replace')}><ImageIcon size={13} /> {sel.src ? 'Replace' : 'Choose image'}</button>
                  </div>
                  <label className="block">
                    <span className={labelCls}>Fit</span>
                    <select className={inputCls} value={st.objectFit || 'contain'} onChange={(e) => patchStyle(sel.id, { objectFit: e.target.value })}>
                      <option value="contain">Fit inside</option>
                      <option value="cover">Fill (crop)</option>
                      <option value="fill">Stretch</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                    <input type="checkbox" checked={!!sel.lockAspect} onChange={(e) => patchEl(sel.id, { lockAspect: e.target.checked })} /> Keep proportions when resizing
                  </label>
                </Section>
              )}

              {sel.type === 'line' && (
                <Section title="Line"><ColorField label="Colour" value={st.color} onChange={(c) => patchStyle(sel.id, { color: c || '#000000' }, `${sel.id}:color`)} /></Section>
              )}

              {hasBox && (
                <>
                  <Section title="Fill">
                    <ColorField label="Colour" value={st.fill} clearable onChange={(c) => patchStyle(sel.id, { fill: c }, `${sel.id}:fill`)} />
                    {st.fill && (
                      <>
                        <label className="block">
                          <span className={labelCls}>Gradient</span>
                          <select className={inputCls} value={st.gradient || 'none'} onChange={(e) => patchStyle(sel.id, { gradient: e.target.value, ...(e.target.value !== 'none' && !st.fill2 ? { fill2: st.fill } : {}) })}>
                            <option value="none">None</option>
                            <option value="linear">Two colours</option>
                            <option value="mirror">Mirrored (A–B–A)</option>
                          </select>
                        </label>
                        {st.gradient && st.gradient !== 'none' && (
                          <>
                            <ColorField label="Second colour" value={st.fill2} onChange={(c) => patchStyle(sel.id, { fill2: c }, `${sel.id}:fill2`)} />
                            <Num label="Angle °" value={st.gradientAngle ?? 90} min={-360} max={360} onChange={(v) => patchStyle(sel.id, { gradientAngle: v })} />
                          </>
                        )}
                      </>
                    )}
                  </Section>
                  <Section title="Border">
                    <div className="grid grid-cols-2 gap-2">
                      <Num label="Width" value={st.borderWidth ?? 0} min={0} max={20} step={0.5} onChange={(v) => patchStyle(sel.id, { borderWidth: Math.min(20, Math.max(0, v)) })} />
                      <Num label="Corner radius" value={st.radius ?? 0} min={0} max={500} onChange={(v) => patchStyle(sel.id, { radius: Math.min(500, Math.max(0, v)) })} />
                    </div>
                    <ColorField label="Border colour" value={st.borderColor} clearable onChange={(c) => patchStyle(sel.id, { borderColor: c }, `${sel.id}:bc`)} />
                  </Section>
                </>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
