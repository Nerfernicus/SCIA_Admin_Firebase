// src/lib/idTemplate.js
//
// OSCA ID template: data model, built-in default (= the old fixed design), validation,
// and a tiny cache so every ID on screen/print reads one template.
//
// Stored at Firestore  settings/idTemplate  (written only by the saveIdTemplate Cloud Function):
//   {
//     version: 1,
//     canvas: { width: 540, height: 340 },
//     front: { background: { color, image }, elements: [ ... ] },
//     back:  { background: { color, image }, elements: [ ... ] },
//     updatedAt, updatedBy, revision          // added by the server, ignored by the client
//   }
//
// Element: { id, type, x, y, width, height, rotation, zIndex, visibleIn, locked,
//            content?, src?, style: { fontFamily, fontSize, fontWeight, fontStyle, color, align, valign,
//                                     letterSpacing, lineHeight, paraGap, list, autoFit,
//                                     fill, fill2, gradient, gradientAngle,
//                                     borderColor, borderWidth, radius, opacity, objectFit } }
//
// Types: name, address, dateOfBirth, sex, dateIssued, controlNo, photo, barcode, qr  (filled from the senior)
//        text, image, rectangle, line, seal                                             (static)
// A "line" uses `height` as its thickness. `visibleIn` is 'all' | 'digital' | 'physical'.

import { useEffect, useSyncExternalStore } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import valLogo from '../assets/vallogo.png';

export const CARD_W = 540;
export const CARD_H = 340;
export const TEMPLATE_VERSION = 1;

export const DYNAMIC_TEXT_TYPES = ['name', 'address', 'dateOfBirth', 'sex', 'dateIssued', 'controlNo'];
export const DYNAMIC_TYPES = [...DYNAMIC_TEXT_TYPES, 'photo', 'barcode', 'qr'];
export const STATIC_TYPES = ['text', 'image', 'rectangle', 'line', 'seal'];
export const ELEMENT_TYPES = [...DYNAMIC_TYPES, ...STATIC_TYPES];

export const TYPE_LABELS = {
  name: 'Name', address: 'Address', dateOfBirth: 'Date of birth', sex: 'Sex', dateIssued: 'Date issued',
  controlNo: 'Control no.', photo: 'Photo', barcode: 'Barcode', qr: 'QR code',
  text: 'Text', image: 'Image', rectangle: 'Rectangle', line: 'Line', seal: 'Hologram seal',
};

// Print-safe fonts only (no web fonts), so screen and printer look the same.
export const FONT_FAMILIES = {
  Arial: 'Arial, Helvetica, sans-serif',
  'Arial Black': '"Arial Black", Arial, sans-serif',
  'Courier New': '"Courier New", Courier, monospace',
  'Times New Roman': '"Times New Roman", Times, serif',
  Georgia: 'Georgia, serif',
  Verdana: 'Verdana, Geneva, sans-serif',
  Tahoma: 'Tahoma, Geneva, sans-serif',
  'Trebuchet MS': '"Trebuchet MS", Helvetica, sans-serif',
};

// Images that ship with the app. A template refers to them as "builtin:<key>".
export const BUILTIN_IMAGES = { vallogo: valLogo };

export const MAX_IMAGE_CHARS = 450000; // per embedded image (base64 text)
export const MAX_ELEMENTS_PER_SIDE = 80;

export function resolveImageSrc(src) {
  if (typeof src !== 'string') return null;
  if (src.startsWith('builtin:')) return BUILTIN_IMAGES[src.slice(8)] || null;
  return src;
}

// ── validation helpers (the Cloud Function repeats these checks on the server) ──
const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(,\s*[\d.]+\s*)?\)|transparent)$/i;
const IMG_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

export const cleanColor = (v) => (typeof v === 'string' && COLOR_RE.test(v.trim()) ? v.trim() : null);
export const isColor = (v) => cleanColor(v) !== null;

export function cleanSrc(v) {
  if (typeof v !== 'string') return null;
  if (v.startsWith('builtin:')) return BUILTIN_IMAGES[v.slice(8)] ? v : null;
  return v.length <= MAX_IMAGE_CHARS && IMG_RE.test(v) ? v : null;
}

const clampNum = (v, min, max, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};
const pick = (v, list, d) => (list.includes(v) ? v : d);

function normalizeStyle(st = {}) {
  const s = {};
  ['color', 'fill', 'fill2', 'borderColor'].forEach((k) => {
    const c = cleanColor(st[k]);
    if (c) s[k] = c;
  });
  if (st.fontFamily in FONT_FAMILIES) s.fontFamily = st.fontFamily;
  if (st.fontSize != null) s.fontSize = clampNum(st.fontSize, 4, 120, 12);
  if (st.fontWeight != null) s.fontWeight = clampNum(st.fontWeight, 100, 900, 400);
  if (st.fontStyle != null) s.fontStyle = pick(st.fontStyle, ['normal', 'italic'], 'normal');
  if (st.align != null) s.align = pick(st.align, ['left', 'center', 'right'], 'left');
  if (st.valign != null) s.valign = pick(st.valign, ['top', 'middle', 'bottom'], 'top');
  if (st.letterSpacing != null) s.letterSpacing = clampNum(st.letterSpacing, -5, 30, 0);
  if (st.lineHeight != null) s.lineHeight = clampNum(st.lineHeight, 0.8, 3, 1.2);
  if (st.paraGap != null) s.paraGap = clampNum(st.paraGap, 0, 30, 0);
  if (st.list != null) s.list = pick(st.list, ['none', 'decimal'], 'none');
  if (st.autoFit != null) s.autoFit = !!st.autoFit;
  if (st.gradient != null) s.gradient = pick(st.gradient, ['none', 'linear', 'mirror'], 'none');
  if (st.gradientAngle != null) s.gradientAngle = clampNum(st.gradientAngle, -360, 360, 90);
  if (st.borderWidth != null) s.borderWidth = clampNum(st.borderWidth, 0, 20, 0);
  if (st.radius != null) s.radius = clampNum(st.radius, 0, 500, 0);
  if (st.opacity != null) s.opacity = clampNum(st.opacity, 0, 1, 1);
  if (st.objectFit != null) s.objectFit = pick(st.objectFit, ['contain', 'cover', 'fill'], 'contain');
  return s;
}

export function normalizeElement(raw, idx = 0) {
  if (!raw || typeof raw !== 'object' || !ELEMENT_TYPES.includes(raw.type)) return null;
  const el = {
    id: typeof raw.id === 'string' && raw.id && raw.id.length <= 64 ? raw.id : `el_${idx}`,
    type: raw.type,
    x: clampNum(raw.x, -1000, 1000, 0),
    y: clampNum(raw.y, -1000, 1000, 0),
    width: clampNum(raw.width, 1, 2000, 40),
    height: clampNum(raw.height, 0.5, 2000, 20),
    rotation: clampNum(raw.rotation, -360, 360, 0),
    zIndex: Math.round(clampNum(raw.zIndex, -999, 999, idx + 1)),
    visibleIn: pick(raw.visibleIn, ['all', 'digital', 'physical'], 'all'),
    locked: !!raw.locked,
    style: normalizeStyle(raw.style),
  };
  if (typeof raw.content === 'string') el.content = raw.content.slice(0, 2000);
  if (raw.type === 'image') el.src = cleanSrc(raw.src);
  if (raw.lockAspect != null) el.lockAspect = !!raw.lockAspect;
  return el;
}

function normalizeFace(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.elements)) return null;
  const bg = raw.background && typeof raw.background === 'object' ? raw.background : {};
  const seen = new Set();
  const elements = [];
  raw.elements.slice(0, MAX_ELEMENTS_PER_SIDE).forEach((r, i) => {
    const el = normalizeElement(r, i);
    if (!el || seen.has(el.id)) return;
    seen.add(el.id);
    elements.push(el);
  });
  return { background: { color: cleanColor(bg.color) || '#ffffff', image: cleanSrc(bg.image) }, elements };
}

/** Returns a clean template, or null when `raw` is not usable (caller then falls back to the default). */
export function normalizeTemplate(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const front = normalizeFace(raw.front);
  const back = normalizeFace(raw.back);
  if (!front || !back) return null;
  return { version: TEMPLATE_VERSION, canvas: { width: CARD_W, height: CARD_H }, front, back };
}

export const cloneTemplate = (t) => JSON.parse(JSON.stringify(t));

/** An empty design: white card, nothing on it (the "Create new design" start). */
export const blankTemplate = () => ({
  version: TEMPLATE_VERSION,
  canvas: { width: CARD_W, height: CARD_H },
  front: { background: { color: '#ffffff', image: null }, elements: [] },
  back: { background: { color: '#ffffff', image: null }, elements: [] },
});
export const templateJson = (t) => JSON.stringify(t);

// ── default template: the old hard-coded 540x340 design, as absolute elements ──
function mk(id, type, x, y, width, height, props = {}, style = {}) {
  return { id, type, x, y, width, height, rotation: 0, zIndex: 0, visibleIn: 'all', locked: false, ...props, style };
}
const text = (id, x, y, w, h, content, style, props = {}) =>
  mk(id, 'text', x, y, w, h, { content, ...props },
    { fontFamily: 'Arial', fontSize: 9, fontWeight: 400, color: '#111111', align: 'left', valign: 'top', lineHeight: 1.2, ...style });
const field = (id, type, x, y, w, h, style) =>
  mk(id, type, x, y, w, h, {},
    { fontFamily: 'Courier New', fontSize: 11, fontWeight: 700, color: '#111111', align: 'left', valign: 'top', lineHeight: 1.2, ...style });
const rect = (id, x, y, w, h, style, props = {}) => mk(id, 'rectangle', x, y, w, h, { locked: true, ...props }, style);
const line = (id, x, y, w, color, h = 1) => mk(id, 'line', x, y, w, h, {}, { color });
const stack = (items) => items.map((e, i) => ({ ...e, zIndex: i + 1 }));

const NAVY = '#1a3a6b';
const BLUE = '#1e4d99';

function buildDefaultTemplate() {
  const front = stack([
    rect('hdr-bg', 0, 0, 540, 72, { fill: NAVY, fill2: BLUE, gradient: 'mirror', gradientAngle: 90 }),
    mk('hdr-logo', 'image', 8, 10, 52, 52, { src: 'builtin:vallogo', lockAspect: true }, { objectFit: 'contain' }),
    text('hdr-republic', 68, 9, 404, 12, 'Republic of the Philippines', { fontSize: 9, color: '#ffffff', align: 'center', letterSpacing: 0.4 }),
    text('hdr-city', 68, 21, 404, 18, 'CITY OF VALENZUELA', { fontFamily: 'Arial Black', fontSize: 15, fontWeight: 900, color: '#ffd700', align: 'center', letterSpacing: 1.2, lineHeight: 1.1 }),
    text('hdr-osca', 68, 40, 404, 11, 'Office of the Senior Citizens Affairs (OSCA)', { fontSize: 8, color: '#ffffff', align: 'center', letterSpacing: 0.2 }),
    text('hdr-badge', 235, 54, 70, 14, 'DIGITAL ID', {
      fontSize: 7, fontWeight: 700, fontStyle: 'italic', color: '#ffffff', align: 'center', valign: 'middle', letterSpacing: 1,
      fill: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.5)', borderWidth: 1, radius: 3,
    }, { visibleIn: 'digital' }),

    text('lbl-name', 14, 129, 56, 14, 'Name:', { fontSize: 10, fontWeight: 700 }),
    field('f-name', 'name', 74, 128, 354, 15, { fontSize: 12, autoFit: true }),
    text('lbl-address', 14, 151, 56, 14, 'Address:', { fontSize: 10, fontWeight: 700 }),
    field('f-address', 'address', 74, 149, 354, 27, { fontSize: 10.5 }),
    line('meta-line', 14, 182, 414, '#cccccc'),
    field('f-dob', 'dateOfBirth', 14, 188, 138, 14, { align: 'center' }),
    field('f-sex', 'sex', 152, 188, 138, 14, { align: 'center' }),
    field('f-issued', 'dateIssued', 290, 188, 138, 14, { align: 'center' }),
    text('lbl-dob', 14, 203, 138, 9, 'Date of Birth', { fontSize: 7, color: '#555555', align: 'center' }),
    text('lbl-sex', 152, 203, 138, 9, 'Sex', { fontSize: 7, color: '#555555', align: 'center' }),
    text('lbl-issued', 290, 203, 138, 9, 'Date Issued', { fontSize: 7, color: '#555555', align: 'center' }),
    mk('f-photo', 'photo', 442, 122, 84, 100, {}, { fill: '#efefef', borderColor: '#aaaaaa', borderWidth: 1.5, radius: 2 }),

    line('bottom-line', 0, 273, 540, '#dddddd'),
    line('sig-line', 14, 303, 140, '#333333'),
    text('lbl-sig', 14, 306, 140, 10, 'Signature / Thumbmark', { fontSize: 7.5, color: '#333333' }),
    mk('seal', 'seal', 352, 281, 34, 34),
    field('f-control', 'controlNo', 366, 284, 160, 20, { fontSize: 20, color: '#cc1111', align: 'right', letterSpacing: 2, lineHeight: 1, autoFit: true }),
    text('lbl-control', 366, 306, 160, 10, 'Control No.', { fontSize: 7.5, color: '#333333', align: 'right' }),
    rect('ftr-bg', 0, 323, 540, 17, { fill: NAVY }),
    text('ftr-text', 0, 327, 540, 10, 'This card is non-transferable  ·  Verify at valid.valenzuela.gov.ph', { fontSize: 8, fontStyle: 'italic', color: '#ffffff', align: 'center', letterSpacing: 0.3 }),
  ]);

  const benefits = [
    'Free medical / dental, diagnostic & laboratory services in all government facilities',
    '20% discount for medicines',
    '20% discount in hotels, restaurants & recreation centers',
    '20% discount in theaters, cinema houses & concert halls',
    '20% discount in medical / dental services, diagnostic & laboratory fees in private facilities',
    '20% discount in fare for domestic air, sea travel & public land transportations',
    '5% discount in basic necessities & primary commodities',
    '12% VAT-exemption on the purchase of goods & services which are entitled to the 20% discount',
    '5% discount for the monthly utilization of water & electricity, provided that the water & electricity meter bases are under the name of the senior citizens.',
  ].join('\n');

  const back = stack([
    rect('top-stripe', 0, 0, 540, 6, { fill: NAVY, fill2: BLUE, gradient: 'mirror', gradientAngle: 90 }),
    text('title', 14, 14, 512, 16, 'Benefits and Privileges under R.A. 9994', { fontFamily: 'Arial Black', fontSize: 12.5, fontWeight: 900, align: 'center' }),
    line('title-line', 0, 34, 540, '#dddddd'),
    text('benefits', 14, 41, 512, 140, benefits, { fontSize: 8.5, lineHeight: 1.3, list: 'decimal', paraGap: 3 }),
    line('notice-line', 14, 184, 512, '#dddddd'),
    text('notice', 14, 188, 512, 24,
      'Persons and corporations violating R.A. 9994 shall be penalized.\nOnly for the exclusive use of senior citizens; abuse of privileges is punishable by law.',
      { fontSize: 7.5, fontStyle: 'italic', color: '#333333', lineHeight: 1.3 }),
    line('sign1-line', 24, 230, 160, '#333333'),
    text('sign1-name', 24, 234, 160, 11, 'Dorothy G. Evangelista', { fontSize: 8.5, fontWeight: 700, align: 'center' }),
    text('sign1-title', 24, 245, 160, 10, 'OSCA Head', { fontSize: 7.5, color: '#555555', align: 'center' }),
    line('sign2-line', 356, 230, 160, '#333333'),
    text('sign2-name', 356, 234, 160, 11, 'WES Gatchalian', { fontSize: 8.5, fontWeight: 700, align: 'center' }),
    text('sign2-title', 356, 245, 160, 10, 'City Mayor', { fontSize: 7.5, color: '#555555', align: 'center' }),
    rect('ftr-left', 0, 305, 155, 35, { fill: '#cc1111' }),
    text('ftr-tuloy', 12, 311, 135, 11, 'Tuloy-PROGRESO,', { fontSize: 8, fontWeight: 700, color: '#ffffff', lineHeight: 1.3 }),
    text('ftr-city', 12, 322, 135, 13, 'Valenzuela!', { fontFamily: 'Arial Black', fontSize: 9.5, fontWeight: 900, color: '#ffd700', lineHeight: 1.3 }),
    rect('ftr-right', 155, 305, 385, 35, { fill: BLUE, fill2: NAVY, gradient: 'linear', gradientAngle: 90 }),
    text('ftr-web', 155, 312, 373, 11, 'www.valenzuela.gov.ph', { fontSize: 8.5, fontWeight: 700, color: '#ffffff', align: 'right' }),
    text('ftr-social', 155, 324, 373, 9, '✉ info@valenzuela.gov.ph   f Valenzuela City   @ valenzuelacity', { fontSize: 7, color: 'rgba(255,255,255,0.8)', align: 'right' }),
  ]);

  return {
    version: TEMPLATE_VERSION,
    canvas: { width: CARD_W, height: CARD_H },
    front: { background: { color: '#ffffff', image: null }, elements: front },
    back: { background: { color: '#ffffff', image: null }, elements: back },
  };
}

export const DEFAULT_ID_TEMPLATE = buildDefaultTemplate();

// ── sample data for the designer's preview (never a real senior) ──
export function getSampleCardData() {
  return {
    name: 'JUAN DELA CRUZ',
    address: '123 Sample St., Brgy. Poblacion\nValenzuela City',
    dateOfBirth: '01-01-60',
    sex: 'M',
    dateIssued: new Date().toLocaleDateString('en-PH', { month: '2-digit', day: '2-digit', year: 'numeric' }),
    controlNo: 'SAMPLE-001',
    photoUrl: null,
    qrValue: 'SAMPLE-001',
    barcodeValue: 'SAMPLE-001',
  };
}

// ── mapping helpers shared by the card and the print path ──
export function formatDobForCard(dob) {
  if (!dob) return 'N/A';
  const iso = String(dob).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const slash = String(dob).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (iso) return `${iso[2]}-${iso[3]}-${iso[1].slice(2)}`;
  if (slash) return `${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}-${slash[3].slice(2)}`;
  return String(dob);
}

/** senior_records document -> template data (used by the print button in Senior Records). */
export function recordToCardData(r) {
  const issued = r.issuedAt?.toDate?.() || (r.issuedAt instanceof Date ? r.issuedAt : new Date());
  const no = r.recordNo || '';
  return {
    name: String(r.fullName || '').toUpperCase(),
    address: r.address || [r.barangay, 'Valenzuela City'].filter(Boolean).join(', '),
    dateOfBirth: formatDobForCard(r.dob),
    sex: String(r.sex || '').toUpperCase(),
    dateIssued: issued.toLocaleDateString('en-PH', { month: '2-digit', day: '2-digit', year: 'numeric' }),
    controlNo: no,
    photoUrl: r.photoURL || null,
    qrValue: r.qrValue || no,
    barcodeValue: no,
  };
}

// ── load + cache (falls back to the default when nothing is saved or the load fails) ──
let cached = null;
let inflight = null;
const subs = new Set();
const notify = () => subs.forEach((f) => f());

export const getCachedIdTemplate = () => cached || DEFAULT_ID_TEMPLATE;

export function setCachedIdTemplate(t) {
  cached = normalizeTemplate(t) || null;
  notify();
}

export async function loadIdTemplate({ force = false } = {}) {
  if (cached && !force) return cached;
  if (inflight && !force) return inflight;
  inflight = (async () => {
    try {
      const snap = await getDoc(doc(db, 'settings', 'idTemplate'));
      const t = snap.exists() ? normalizeTemplate(snap.data()) : null;
      cached = t || DEFAULT_ID_TEMPLATE;
      notify();
      return cached;
    } catch (e) {
      console.warn('ID template load failed, using the default design:', e?.message || e);
      return DEFAULT_ID_TEMPLATE; // not cached, so the next card tries again
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

const subscribe = (cb) => { subs.add(cb); return () => subs.delete(cb); };

/** React hook: the saved template, or the default design until/unless one loads. */
export function useIdTemplate() {
  const t = useSyncExternalStore(subscribe, getCachedIdTemplate, getCachedIdTemplate);
  useEffect(() => { loadIdTemplate(); }, []);
  return t;
}
