// Display modes and voice narration for the dashboard (also used on the kiosk page).
// Meant for seniors and low-vision / colour-blind users and the staff who help them.
// Colour modes are applied as a CSS filter on <html>, so every page is covered without
// touching individual screens.
//
// The three colour-blind modes are CORRECTIONS (daltonization), not simulations: they push the
// colours a person cannot tell apart toward ones they can. They are approximations, not a medical
// device, which is why "High contrast" and "Grayscale" are offered too.

export const A11Y_KEY = 'a11y_v1';

// 3x3 colour matrices, flattened row by row (computed from the Machado 2009 simulation
// matrices plus the standard error-shift step).
const CORRECTION = {
  protanopia:   [1, 0, 0, 0.4789, 0.4769, 0.0442, 0.5973, -0.6887, 1.0914],
  deuteranopia: [1.4366, -0.6314, 0.1948, 0, 1, 0, -0.1842, 0.1863, 0.9979],
  tritanopia:   [0.7412, -0.4072, 0.666, 0.0751, 0.5852, 0.3397, 0, 0, 1],
};

export const MODES = [
  { id: 'standard',     label: 'Standard',                   hint: 'Normal colours' },
  { id: 'contrast',     label: 'High contrast',              hint: 'Stronger text and borders' },
  { id: 'protanopia',   label: 'Red-blind friendly',         hint: 'Protanopia' },
  { id: 'deuteranopia', label: 'Green-blind friendly',       hint: 'Deuteranopia' },
  { id: 'tritanopia',   label: 'Blue-blind friendly',        hint: 'Tritanopia' },
  { id: 'grayscale',    label: 'Grayscale',                  hint: 'Removes all colour' },
];

export const DEFAULTS = { mode: 'standard', narrate: false, voiceLang: 'tl' };

export function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(A11Y_KEY) || 'null');
    if (raw && MODES.some((m) => m.id === raw.mode)) {
      return { ...DEFAULTS, ...raw, narrate: !!raw.narrate, voiceLang: raw.voiceLang === 'en' ? 'en' : 'tl' };
    }
  } catch { /* private mode or bad JSON */ }
  return { ...DEFAULTS };
}

export function saveSettings(s) {
  try { localStorage.setItem(A11Y_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

/** SVG <filter> definitions for the colour-correction modes (rendered once, hidden). */
export function filterMatrixValues(id) {
  const m = CORRECTION[id];
  if (!m) return null;
  return `${m[0]} ${m[1]} ${m[2]} 0 0  ${m[3]} ${m[4]} ${m[5]} 0 0  ${m[6]} ${m[7]} ${m[8]} 0 0  0 0 0 1 0`;
}

export function cssFilterFor(mode) {
  if (CORRECTION[mode]) return `url(#a11y-${mode})`;
  if (mode === 'contrast') return 'contrast(1.35) saturate(1.1)';
  if (mode === 'grayscale') return 'grayscale(1) contrast(1.15)';
  return '';
}

export function applyMode(mode) {
  const root = document.documentElement;
  root.style.filter = cssFilterFor(mode);
  root.dataset.a11yMode = mode;
}

// ── Voice narration (Web Speech API): reads what the pointer or keyboard focus lands on ──
// Tagalog (default) or English. In Tagalog the element type and state are said in Tagalog, labels
// are translated (built-in dictionary first, then Vertex AI for anything left, cached), and the
// best Filipino voice the browser has is used. Edge has good Filipino voices built in; Chrome often
// has none, in which case the menu says so.
import { LANGUAGES } from '../context/LangContext';
import { BASIC_UI_TL } from './tagalogStyle';

const INTERACTIVE = 'button, a, [role="button"], [role="tab"], [role="menuitem"], input, select, textarea, label, summary, h1, h2, h3, [aria-label]';

const textOf = (n) => (n && (n.innerText ?? n.textContent)) || '';

// What each kind of control is called, and how its state is said.
const WORDS = {
  en: {
    link: 'link', button: 'button', select: 'drop-down list', textarea: 'text box', checkbox: 'check box',
    radio: 'option', file: 'file chooser', text: 'text field',
    checked: ', checked', unchecked: ', not checked', selected: ', selected: ', value: ', current value: ', disabled: ', unavailable',
  },
  tl: {
    link: 'link', button: 'button', select: 'listahan ng mapagpipilian', textarea: 'sulatan', checkbox: 'checkbox',
    radio: 'opsyon', file: 'pamili ng file', text: 'lagayan ng sulat',
    checked: ', may tsek', unchecked: ', walang tsek', selected: ', napili: ', value: ', laman: ', disabled: ', hindi magagamit',
  },
};

// ── Label translation: built-in dictionary (free, instant) -> cached AI result -> original ──
const norm = (t) => String(t).replace(/\s+/g, ' ').trim().toLowerCase();
const DICT = new Map(Object.entries(BASIC_UI_TL));
(() => {
  const en = LANGUAGES?.en || {};
  const tl = LANGUAGES?.fil || {};
  for (const k of Object.keys(en)) {
    if (typeof en[k] === 'string' && typeof tl[k] === 'string' && en[k] !== tl[k]) DICT.set(norm(en[k]), tl[k]);
  }
})();

const CACHE_KEY = 'a11y_tl_cache_v1';
const CACHE_MAX = 1500;
let aiCache = null;
function cache() {
  if (!aiCache) {
    try { aiCache = new Map(Object.entries(JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'))); }
    catch { aiCache = new Map(); }
  }
  return aiCache;
}
function persistCache() {
  try {
    const entries = [...cache().entries()].slice(-CACHE_MAX);
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch { /* storage unavailable */ }
}

export function localTagalog(label) {
  const key = norm(label);
  return DICT.get(key) || cache().get(key) || null;
}

// Only short interface wording is ever sent to the AI: no digits, no e-mail addresses, nothing
// inside tables, and nothing marked data-no-translate (use that on anything that shows a person's name).
function mayTranslate(label, el) {
  if (!label || label.length < 2 || label.length > 50) return false;
  if (/\d|@/.test(label) || !/[a-z]/i.test(label)) return false;
  if (el?.closest?.('table, tr, [role="row"], [data-no-translate]')) return false;
  return true;
}

function nameOf(el) {
  const tag = el.tagName.toLowerCase();
  let name = el.getAttribute('aria-label') || '';
  if (!name && el.id) {
    const lab = document.querySelector(`label[for="${(window.CSS && window.CSS.escape) ? window.CSS.escape(el.id) : el.id}"]`);
    if (lab) name = textOf(lab);
  }
  if (!name && (tag === 'input' || tag === 'select' || tag === 'textarea')) {
    const wrap = el.closest('label');
    name = (wrap && textOf(wrap)) || el.getAttribute('placeholder') || el.getAttribute('title') || '';
    if (!name) {
      // Labels in this dashboard sit just above the field.
      const prev = el.previousElementSibling;
      if (prev && /^(label|p|span|div)$/i.test(prev.tagName)) name = textOf(prev);
    }
  }
  if (!name) name = el.getAttribute('title') || textOf(el) || el.value || '';
  return String(name).replace(/\s+/g, ' ').trim().slice(0, 160);
}

let aiBusy = false;
let aiOff = false;     // set after a failure so we stop trying this session
let aiCalls = 0;
const AI_CALL_LIMIT = 40;

async function prefetchTranslations() {
  if (aiOff || aiBusy || aiCalls >= AI_CALL_LIMIT) return;
  const wanted = new Map();
  document.querySelectorAll(INTERACTIVE).forEach((el) => {
    const name = nameOf(el);
    if (!name || el.type === 'password' || localTagalog(name) || !mayTranslate(name, el)) return;
    wanted.set(norm(name), name);
  });
  const batch = [...wanted.values()].slice(0, 60);
  if (!batch.length) return;
  aiBusy = true;
  aiCalls += 1;
  try {
    const { translateLabels } = await import('./guideAI'); // loaded only when Tagalog narration is on
    const out = await translateLabels(batch);
    for (const [k, v] of Object.entries(out)) cache().set(norm(k), v);
    persistCache();
  } catch (e) {
    aiOff = true;
    console.warn('[guide] Label translation unavailable, using built-in Tagalog only:', e?.message || e);
  } finally {
    aiBusy = false;
  }
}

function describe(el, lang) {
  const w = WORDS[lang] || WORDS.en;
  const tag = el.tagName.toLowerCase();
  let kind = '';
  // Sidebar and menu links are just read by name; saying "link" every time is noise there.
  if (tag === 'a') kind = el.closest('nav, aside') ? '' : w.link;
  else if (tag === 'button' || el.getAttribute('role') === 'button') kind = w.button;
  else if (tag === 'select') kind = w.select;
  else if (tag === 'textarea') kind = w.textarea;
  else if (tag === 'input') {
    const t = (el.getAttribute('type') || 'text').toLowerCase();
    kind = t === 'checkbox' ? w.checkbox : t === 'radio' ? w.radio : t === 'file' ? w.file : w.text;
  }

  let name = nameOf(el);
  if (lang === 'tl' && name) name = localTagalog(name) || name;
  if (!name && !kind) return '';

  let extra = '';
  if (tag === 'input' && ['checkbox', 'radio'].includes((el.getAttribute('type') || '').toLowerCase())) extra = el.checked ? w.checked : w.unchecked;
  else if (tag === 'select' && el.selectedOptions && el.selectedOptions[0]) {
    const opt = el.selectedOptions[0].text;
    extra = `${w.selected}${lang === 'tl' ? (localTagalog(opt) || opt) : opt}`;
  } else if ((tag === 'input' || tag === 'textarea') && el.value && el.type !== 'password' && el.type !== 'file') extra = `${w.value}${String(el.value).slice(0, 60)}`;
  if (el.disabled) extra += w.disabled;
  return [name, kind].filter(Boolean).join(', ') + extra;
}

// ── Voice choice ──
let voicesReady = null;
export function whenVoicesReady() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return Promise.resolve([]);
  if (!voicesReady) {
    voicesReady = new Promise((resolve) => {
      const have = window.speechSynthesis.getVoices();
      if (have.length) { resolve(have); return; }
      const done = () => resolve(window.speechSynthesis.getVoices());
      window.speechSynthesis.addEventListener('voiceschanged', done, { once: true });
      setTimeout(done, 1500); // some browsers never fire the event
    });
  }
  return voicesReady;
}

const voiceScore = (v) =>
  (/natural|online|neural/i.test(v.name) ? 4 : 0) + (/microsoft|google/i.test(v.name) ? 1 : 0) + (v.localService ? 0 : 1);

export function pickVoice(lang, voices = (typeof window !== 'undefined' && window.speechSynthesis ? window.speechSynthesis.getVoices() : [])) {
  const groups = lang === 'tl' ? [/^(fil|tl)/i] : [/^en-PH/i, /^en-US/i, /^en-GB/i, /^en/i];
  for (const re of groups) {
    const m = voices.filter((v) => re.test(v.lang));
    if (m.length) return m.sort((a, b) => voiceScore(b) - voiceScore(a))[0];
  }
  return null;
}

export async function hasFilipinoVoice() {
  const voices = await whenVoicesReady();
  return !!pickVoice('tl', voices);
}

let speakGeneration = 0;
export function stopSpeaking() {
  speakGeneration += 1;
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
}

// Split only where a full stop is followed by a space, so "admin@x.com" or "Gen. T." are not cut in half.
const splitSentences = (text) => text.split(/(?<=[.!?…])\s+/).map((x) => x.trim()).filter(Boolean);

/** Speak text in the chosen language; resolves when finished or stopped. Long text goes sentence by sentence. */
export async function say(text, lang = 'tl', { interrupt = true } = {}) {
  if (!text || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const voices = await whenVoicesReady();
  if (interrupt) window.speechSynthesis.cancel();
  const mine = ++speakGeneration;
  const voice = pickVoice(lang, voices);
  for (const part of splitSentences(text)) {
    if (mine !== speakGeneration) return;
    await new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(part);
      u.rate = lang === 'tl' ? 0.88 : 0.92;
      u.lang = voice ? voice.lang : (lang === 'tl' ? 'fil-PH' : 'en-PH');
      if (voice) u.voice = voice;
      u.onend = resolve;
      u.onerror = resolve;
      window.speechSynthesis.speak(u);
    });
  }
}

export function startNarration({ lang = 'tl' } = {}) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return () => {};
  let timer = null;
  let last = null;
  let mutationTimer = null;

  const target = (node) => (node && node.closest ? node.closest(INTERACTIVE) : null);
  const onOver = (e) => {
    const el = target(e.target);
    if (!el || el === last) return;
    clearTimeout(timer);
    timer = setTimeout(() => { last = el; say(describe(el, lang), lang); }, 300); // short pause so sweeping the mouse is not noisy
  };
  const onOut = () => { clearTimeout(timer); last = null; };
  const onFocus = (e) => { const el = target(e.target); if (el) { last = el; say(describe(el, lang), lang); } };

  document.addEventListener('mouseover', onOver, true);
  document.addEventListener('mouseout', onOut, true);
  document.addEventListener('focusin', onFocus, true);

  // Tagalog: translate whatever English wording is on screen ahead of time, so hovering has no delay.
  let observer = null;
  if (lang === 'tl') {
    prefetchTranslations();
    observer = new MutationObserver(() => {
      clearTimeout(mutationTimer);
      mutationTimer = setTimeout(prefetchTranslations, 1200);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  return () => {
    clearTimeout(timer);
    clearTimeout(mutationTimer);
    observer?.disconnect();
    document.removeEventListener('mouseover', onOver, true);
    document.removeEventListener('mouseout', onOut, true);
    document.removeEventListener('focusin', onFocus, true);
    stopSpeaking();
  };
}

// ── "Explain this page" (Vertex AI) ──
// Sends only the page TITLE, headings and the NAMES of buttons and fields — never table rows or typed values.
function pageOutline() {
  const take = (selector, max, filter = () => true) => {
    const seen = new Set();
    const out = [];
    document.querySelectorAll(selector).forEach((el) => {
      if (el.closest('#a11y-panel, table, tr, [role="row"], [data-no-translate]')) return;
      const n = nameOf(el);
      if (!n || n.length > 50 || seen.has(n) || !filter(n)) return;
      seen.add(n); out.push(n);
    });
    return out.slice(0, max);
  };
  return {
    title: document.title,
    headings: take('h1, h2, h3', 10, (n) => !/\d/.test(n)),
    actions: take('button, a, [role="button"], [role="tab"]', 30, (n) => !/@/.test(n)),
    fields: take('input:not([type=password]), select, textarea', 15),
  };
}

export async function explainPage(lang = 'tl') {
  const outline = pageOutline();
  if (lang !== 'tl') {
    const text = `This is the ${outline.title || 'current'} page. ` +
      (outline.headings.length ? `Sections: ${outline.headings.slice(0, 5).join(', ')}. ` : '') +
      (outline.actions.length ? `You can use: ${outline.actions.slice(0, 8).join(', ')}.` : '');
    return text;
  }
  try {
    const { explainPageInTagalog } = await import('./guideAI');
    return await explainPageInTagalog(outline);
  } catch (e) {
    // The AI could not be reached (App Check, offline, quota). Say something useful anyway, built
    // only from the page's own headings and button names and the built-in Tagalog words.
    console.warn('[guide] AI explanation unavailable, using the built-in walkthrough:', e?.message || e);
    const tl = (x) => localTagalog(x) || x;
    return (
      `Ito po ang page na ${tl(outline.title || 'kasalukuyang page')}. ` +
      (outline.headings.length ? `Ang mga bahagi nito ay: ${outline.headings.slice(0, 5).map(tl).join(', ')}. ` : '') +
      (outline.actions.length ? `Maaari ninyong pindutin ang: ${outline.actions.slice(0, 8).map(tl).join(', ')}.` : '')
    );
  }
}
