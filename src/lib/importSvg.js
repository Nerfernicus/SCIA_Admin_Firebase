// src/lib/importSvg.js
//
// Turns an SVG file into one editable side (front or back) of the ID template.
// SVG is the only accepted import type: it is the one editable, open format that Canva, Figma,
// Illustrator, Inkscape, Affinity and Photopea can all export, and the browser can read it natively
// (no extra library). PDF/DOCX would need heavy parsers and JPG/PNG are flat pictures with nothing to edit.
//
//   <text>                         -> editable text element (font, size, colour, bold/italic, alignment kept)
//   <rect> / <ellipse> / <circle>  -> shape (fill, border, rounded corners)
//   <line>                         -> line
//   <image> (embedded PNG/JPG)     -> image element
//   full-card solid <rect>         -> card background colour
//   <path>, polygons, gradients,
//   <use>, anything else           -> drawn together as ONE background picture (not editable)
//
// Safety: scripts, foreignObject, event handlers and every external link are stripped before the file
// is measured, and nothing is fetched from the network.

import { CARD_W, CARD_H, FONT_FAMILIES, MAX_ELEMENTS_PER_SIDE, MAX_IMAGE_CHARS, cleanColor } from './idTemplate';

export const MAX_SVG_BYTES = 5 * 1024 * 1024;
const SKIP = 'defs, clipPath, mask, pattern, symbol, marker, linearGradient, radialGradient, filter, style, title, desc, metadata';
const DRAWABLE = 'text, rect, line, ellipse, circle, image, path, polygon, polyline, use';
const r1 = (n) => Math.round(n * 10) / 10;

function sanitize(root) {
  root.querySelectorAll('script, foreignObject, iframe, object, embed, audio, video, animate, set, animateTransform, animateMotion').forEach((n) => n.remove());
  [root, ...root.querySelectorAll('*')].forEach((n) => {
    [...n.attributes].forEach((a) => {
      const name = a.name.toLowerCase();
      const v = a.value;
      if (name.startsWith('on')) n.removeAttribute(a.name);
      else if (name === 'href' || name === 'xlink:href') {
        const ok = v.startsWith('#') || (n.localName === 'image' && /^data:image\/(png|jpeg|webp|gif);base64,/i.test(v));
        if (!ok) n.removeAttribute(a.name);
      } else if (/url\(\s*['"]?(?!#)/i.test(v)) n.removeAttribute(a.name);
    });
  });
  root.querySelectorAll('style').forEach((st) => {
    st.textContent = st.textContent.replace(/@import[^;]*;?/gi, '').replace(/url\(\s*['"]?(?!#)[^)]*\)/gi, 'none');
  });
}

const loadImage = (src) => new Promise((res, rej) => {
  const i = new Image();
  i.onload = () => res(i);
  i.onerror = () => rej(new Error('image'));
  i.src = src;
});

// Re-encode an embedded picture so it stays small enough for the template.
async function shrinkDataUrl(dataUrl, maxDim = 600) {
  const img = await loadImage(dataUrl);
  const keepAlpha = !/^data:image\/jpeg/i.test(dataUrl);
  let max = maxDim;
  for (let n = 0; n < 5; n += 1) {
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * k));
    c.height = Math.max(1, Math.round(img.height * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const out = keepAlpha ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.85);
    if (out.length <= MAX_IMAGE_CHARS) return out;
    max = Math.round(max * 0.7);
  }
  return null;
}

function rgba(cs, prop) {
  const v = cs[prop];
  if (!v || v === 'none' || v.startsWith('url(')) return null;
  const m = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (!m) return cleanColor(v);
  const op = Number(cs[prop === 'fill' ? 'fillOpacity' : 'strokeOpacity']);
  const own = Number(cs.opacity);
  const a = (m[4] !== undefined ? Number(m[4]) : 1) * (Number.isFinite(op) ? op : 1) * (Number.isFinite(own) ? own : 1);
  if (a <= 0) return null;
  return cleanColor(a >= 0.995 ? `rgb(${m[1]}, ${m[2]}, ${m[3]})` : `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${Math.round(a * 100) / 100})`);
}

function fontFor(family = '') {
  const f = family.toLowerCase();
  for (const name of ['Arial Black', 'Courier New', 'Times New Roman', 'Trebuchet MS', 'Georgia', 'Verdana', 'Tahoma', 'Arial']) {
    if (f.includes(name.toLowerCase())) return name;
  }
  if (/mono|courier|consolas/.test(f)) return 'Courier New';
  if (/serif/.test(f) && !/sans/.test(f)) return 'Times New Roman';
  return 'Arial';
}

const normAngle = (a) => { let x = ((a + 180) % 360 + 360) % 360 - 180; if (Math.abs(x) < 0.05) x = 0; return r1(x); };

export async function importSvgFile(file) {
  if (!file) throw new Error('No file was chosen.');
  if (!/\.svg$/i.test(file.name) && file.type !== 'image/svg+xml') throw new Error('Only SVG files are accepted. Export your design as SVG and try again.');
  if (file.size > MAX_SVG_BYTES) throw new Error('That file is too large (5 MB maximum).');

  const xml = new DOMParser().parseFromString(await file.text(), 'image/svg+xml');
  const parsed = xml.documentElement;
  if (!parsed || parsed.localName !== 'svg' || xml.querySelector('parsererror')) throw new Error('That is not a valid SVG file.');
  const svg = document.importNode(parsed, true);
  sanitize(svg);

  // size: viewBox, else width/height
  let vb = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || vb.some((n) => !Number.isFinite(n)) || vb[2] <= 0 || vb[3] <= 0) {
    const w = parseFloat(svg.getAttribute('width'));
    const h = parseFloat(svg.getAttribute('height'));
    if (!(w > 0) || !(h > 0)) throw new Error('This SVG has no size. Re-export it with a fixed width and height.');
    vb = [0, 0, w, h];
  }
  svg.setAttribute('viewBox', vb.join(' '));
  svg.setAttribute('width', String(CARD_W));
  svg.setAttribute('height', String(CARD_H));
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  const report = { text: 0, shapes: 0, lines: 0, images: 0, artwork: false, skipped: 0, warnings: [], truncated: false };
  if (Math.abs(vb[2] / vb[3] - CARD_W / CARD_H) > 0.03) report.warnings.push('The file is not the same shape as the ID card, so it was fitted inside it. Export at 85.6 × 54 mm (for example 1012 × 638 px) for a perfect fit.');

  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${CARD_W}px;height:${CARD_H}px;pointer-events:none;`;
  host.appendChild(svg);
  document.body.appendChild(host);

  try {
    const origin = svg.getBoundingClientRect();
    const toCard = (el, x, y) => { const p = new DOMPoint(x, y).matrixTransform(el.getScreenCTM()); return { x: p.x - origin.left, y: p.y - origin.top }; };
    const scaleOf = (el) => { const m = el.getScreenCTM(); return { sx: Math.hypot(m.a, m.b), sy: Math.hypot(m.c, m.d), rot: (Math.atan2(m.b, m.a) * 180) / Math.PI }; };
    const geom = (el) => {
      const bb = el.getBBox();
      const m = scaleOf(el);
      const c = toCard(el, bb.x + bb.width / 2, bb.y + bb.height / 2);
      const width = bb.width * m.sx;
      const height = bb.height * m.sy;
      return { cx: c.x, cy: c.y, width, height, m, bb };
    };

    const nodes = [...svg.querySelectorAll(DRAWABLE)].filter((n) => !n.closest(SKIP) && !n.parentElement?.closest('text'));
    const out = [];
    let bgColor = '#ffffff';
    let bgTaken = false;

    for (const n of nodes) {
      if (out.length >= MAX_ELEMENTS_PER_SIDE - 1) { report.truncated = true; break; }
      if (!n.getScreenCTM()) continue;
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) { n.setAttribute('data-conv', '1'); continue; }
      const tag = n.localName;
      const id = `imp_${out.length + 1}`;
      const base = { id, rotation: 0, visibleIn: 'all', locked: false };

      if (tag === 'text') {
        let lines = [''];
        const walk = (node) => node.childNodes.forEach((c) => {
          if (c.nodeType === 3) lines[lines.length - 1] += c.nodeValue.replace(/\s+/g, ' ');
          else if (c.localName === 'tspan') {
            if ((c.hasAttribute('x') || c.hasAttribute('y') || c.hasAttribute('dy')) && lines[lines.length - 1].trim() !== '') lines.push('');
            walk(c);
          }
        });
        walk(n);
        lines = lines.map((l) => l.trim()).filter(Boolean);
        if (!lines.length) { n.setAttribute('data-conv', '1'); continue; }
        const g = geom(n);
        const fs = Math.max(4, Math.min(120, parseFloat(cs.fontSize) * ((g.m.sx + g.m.sy) / 2) || 12));
        const anchor = cs.textAnchor;
        const pad = Math.max(4, g.width * 0.08);
        const W = g.width + pad;
        const H = Math.max(g.height, fs * 1.25);
        const x = anchor === 'middle' ? g.cx - W / 2 : anchor === 'end' ? g.cx + g.width / 2 - W : g.cx - g.width / 2;
        const weight = cs.fontWeight === 'bold' ? 700 : parseInt(cs.fontWeight, 10) || 400;
        const ls = parseFloat(cs.letterSpacing);
        out.push({
          ...base, type: 'text', content: lines.join('\n'),
          x: r1(x), y: r1(g.cy - H / 2), width: r1(W), height: r1(H), rotation: normAngle(g.m.rot),
          style: {
            fontFamily: fontFor(cs.fontFamily), fontSize: r1(fs), fontWeight: weight, fontStyle: /italic|oblique/.test(cs.fontStyle) ? 'italic' : 'normal',
            color: rgba(cs, 'fill') || '#000000', align: anchor === 'middle' ? 'center' : anchor === 'end' ? 'right' : 'left', valign: 'top',
            lineHeight: lines.length > 1 ? Math.min(2, Math.max(0.9, r1(g.height / (lines.length * fs)))) : 1.2,
            ...(Number.isFinite(ls) && ls ? { letterSpacing: r1(ls * ((g.m.sx + g.m.sy) / 2)) } : {}),
          },
        });
        n.setAttribute('data-conv', '1');
        report.text += 1;
      } else if (tag === 'rect' || tag === 'ellipse' || tag === 'circle') {
        const fill = rgba(cs, 'fill');
        const stroke = rgba(cs, 'stroke');
        const fillRaw = cs.fill;
        if (fillRaw && fillRaw.startsWith('url(')) continue;           // gradient: goes to the picture layer
        if (!fill && !stroke) { n.setAttribute('data-conv', '1'); continue; }
        const g = geom(n);
        const sw = stroke ? Math.max(0, parseFloat(cs.strokeWidth) * ((g.m.sx + g.m.sy) / 2)) || 0 : 0;
        const rot = normAngle(g.m.rot);
        const full = !bgTaken && !stroke && fill && Math.abs(rot) < 0.5 && g.cx - g.width / 2 <= 3 && g.cy - g.height / 2 <= 3 && g.width >= CARD_W - 6 && g.height >= CARD_H - 6;
        if (full) { bgColor = fill; bgTaken = true; n.setAttribute('data-conv', '1'); continue; }
        bgTaken = true;
        let radius = 0;
        if (tag !== 'rect') radius = 500;
        else { const rx = parseFloat(n.getAttribute('rx')); if (Number.isFinite(rx) && rx > 0) radius = r1(rx * g.m.sx); }
        out.push({
          ...base, type: 'rectangle', x: r1(g.cx - g.width / 2), y: r1(g.cy - g.height / 2), width: r1(Math.max(1, g.width)), height: r1(Math.max(1, g.height)), rotation: rot,
          style: { ...(fill ? { fill } : {}), ...(stroke && sw ? { borderColor: stroke, borderWidth: Math.min(20, r1(sw)) } : {}), ...(radius ? { radius } : {}) },
        });
        n.setAttribute('data-conv', '1');
        report.shapes += 1;
      } else if (tag === 'line') {
        const stroke = rgba(cs, 'stroke');
        if (!stroke) { n.setAttribute('data-conv', '1'); continue; }
        const p1 = toCard(n, n.x1.baseVal.value, n.y1.baseVal.value);
        const p2 = toCard(n, n.x2.baseVal.value, n.y2.baseVal.value);
        const m = scaleOf(n);
        const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const th = Math.max(0.5, Math.min(20, parseFloat(cs.strokeWidth) * ((m.sx + m.sy) / 2) || 1));
        const cx = (p1.x + p2.x) / 2;
        const cy = (p1.y + p2.y) / 2;
        out.push({ ...base, type: 'line', x: r1(cx - len / 2), y: r1(cy - th / 2), width: r1(Math.max(1, len)), height: r1(th), rotation: normAngle((Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI), style: { color: stroke } });
        n.setAttribute('data-conv', '1');
        report.lines += 1;
      } else if (tag === 'image') {
        const href = n.getAttribute('href') || n.getAttribute('xlink:href') || '';
        if (!href) { report.skipped += 1; n.setAttribute('data-conv', '1'); continue; } // external pictures were removed for safety
        let src = null;
        try { src = await shrinkDataUrl(href, 600); } catch { src = null; }
        if (!src) { report.skipped += 1; n.setAttribute('data-conv', '1'); report.warnings.push('A picture inside the file could not be used (too large or unreadable).'); continue; }
        const g = geom(n);
        const par = (n.getAttribute('preserveAspectRatio') || '').trim();
        out.push({
          ...base, type: 'image', src, lockAspect: true,
          x: r1(g.cx - g.width / 2), y: r1(g.cy - g.height / 2), width: r1(Math.max(1, g.width)), height: r1(Math.max(1, g.height)), rotation: normAngle(g.m.rot),
          style: { objectFit: par === 'none' ? 'fill' : /slice/.test(par) ? 'cover' : 'contain' },
        });
        n.setAttribute('data-conv', '1');
        report.images += 1;
      }
      // path / polygon / polyline / use: left for the picture layer
    }

    // everything that could not become an editable element is drawn once as a transparent background picture
    const clone = svg.cloneNode(true);
    clone.querySelectorAll('[data-conv]').forEach((n) => n.remove());
    const leftover = [...clone.querySelectorAll(DRAWABLE)].filter((n) => !n.closest(SKIP));
    let artwork = null;
    if (leftover.length) {
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
      try {
        for (const scale of [2, 1.5, 1, 0.75]) {
          clone.setAttribute('width', String(Math.round(CARD_W * scale)));
          clone.setAttribute('height', String(Math.round(CARD_H * scale)));
          const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`);
          const c = document.createElement('canvas');
          c.width = Math.round(CARD_W * scale);
          c.height = Math.round(CARD_H * scale);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          const url = c.toDataURL('image/png');
          if (url.length <= MAX_IMAGE_CHARS) { artwork = url; break; }
        }
      } catch { artwork = null; }
      if (artwork) report.artwork = true;
      else report.warnings.push('Some artwork (curves or gradients) was too complex to bring in and was left out.');
    }

    const elements = [];
    if (artwork) {
      elements.push({ id: 'imp_art', type: 'image', src: artwork, x: 0, y: 0, width: CARD_W, height: CARD_H, rotation: 0, visibleIn: 'all', locked: true, style: { objectFit: 'fill' } });
    }
    elements.push(...out);
    elements.forEach((e, i) => { e.zIndex = i + 1; });

    if (!elements.length && bgColor === '#ffffff') throw new Error('Nothing could be read from this file. Make sure the text is real text (not converted to outlines).');
    if (report.truncated) report.warnings.push(`Only the first ${MAX_ELEMENTS_PER_SIDE - 1} items were imported.`);
    return { face: { background: { color: bgColor, image: null }, elements }, report };
  } finally {
    host.remove();
  }
}

export function summarizeImport(r) {
  const parts = [];
  if (r.text) parts.push(`${r.text} text`);
  if (r.shapes) parts.push(`${r.shapes} shape${r.shapes > 1 ? 's' : ''}`);
  if (r.lines) parts.push(`${r.lines} line${r.lines > 1 ? 's' : ''}`);
  if (r.images) parts.push(`${r.images} image${r.images > 1 ? 's' : ''}`);
  let msg = `Imported ${parts.join(', ') || 'the background'}.`;
  if (r.artwork) msg += ' Curves and gradients came in as one background picture (not editable).';
  if (r.skipped) msg += ` ${r.skipped} picture${r.skipped > 1 ? 's were' : ' was'} skipped.`;
  if (r.warnings.length) msg += ` ${r.warnings.join(' ')}`;
  return `${msg} Now mark the name, photo and other fields: select a text or box and choose what it shows.`;
}
