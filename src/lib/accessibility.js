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

export const DEFAULTS = { mode: 'standard', narrate: false };

export function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(A11Y_KEY) || 'null');
    if (raw && MODES.some((m) => m.id === raw.mode)) return { ...DEFAULTS, ...raw, narrate: !!raw.narrate };
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
const INTERACTIVE = 'button, a, [role="button"], [role="tab"], [role="menuitem"], input, select, textarea, label, summary, h1, h2, h3, [aria-label]';

const textOf = (n) => (n && (n.innerText ?? n.textContent)) || '';

function describe(el) {
  const tag = el.tagName.toLowerCase();
  let kind = '';
  if (tag === 'a') kind = 'link';
  else if (tag === 'button' || el.getAttribute('role') === 'button') kind = 'button';
  else if (tag === 'select') kind = 'drop-down list';
  else if (tag === 'textarea') kind = 'text box';
  else if (tag === 'input') {
    const t = (el.getAttribute('type') || 'text').toLowerCase();
    kind = t === 'checkbox' ? 'check box' : t === 'radio' ? 'option' : t === 'file' ? 'file chooser' : 'text field';
  }

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
  name = String(name).replace(/\s+/g, ' ').trim().slice(0, 160);
  if (!name && !kind) return '';

  let extra = '';
  if (tag === 'input' && ['checkbox', 'radio'].includes((el.getAttribute('type') || '').toLowerCase())) extra = el.checked ? ', checked' : ', not checked';
  else if (tag === 'select' && el.selectedOptions && el.selectedOptions[0]) extra = `, selected: ${el.selectedOptions[0].text}`;
  else if ((tag === 'input' || tag === 'textarea') && el.value && el.type !== 'password' && el.type !== 'file') extra = `, current value: ${String(el.value).slice(0, 60)}`;
  if (el.disabled) extra += ', unavailable';
  return [name, kind].filter(Boolean).join(', ') + extra;
}

export function startNarration() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return () => {};
  let timer = null;
  let last = null;

  const say = (text) => {
    if (!text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.9;
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find((x) => /^(fil|tl)/i.test(x.lang)) || voices.find((x) => /^en-(PH|US|GB)/i.test(x.lang));
    if (v) { u.voice = v; u.lang = v.lang; }
    window.speechSynthesis.speak(u);
  };

  const target = (node) => (node && node.closest ? node.closest(INTERACTIVE) : null);
  const onOver = (e) => {
    const el = target(e.target);
    if (!el || el === last) return;
    clearTimeout(timer);
    timer = setTimeout(() => { last = el; say(describe(el)); }, 300); // short pause so sweeping the mouse is not noisy
  };
  const onOut = () => { clearTimeout(timer); last = null; };
  const onFocus = (e) => { const el = target(e.target); if (el) { last = el; say(describe(el)); } };

  document.addEventListener('mouseover', onOver, true);
  document.addEventListener('mouseout', onOut, true);
  document.addEventListener('focusin', onFocus, true);
  return () => {
    clearTimeout(timer);
    document.removeEventListener('mouseover', onOver, true);
    document.removeEventListener('mouseout', onOut, true);
    document.removeEventListener('focusin', onFocus, true);
    window.speechSynthesis.cancel();
  };
}
