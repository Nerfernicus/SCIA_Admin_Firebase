import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ShieldCheck } from 'lucide-react';
import Code39 from './Code39';
import {
  CARD_W, CARD_H, DYNAMIC_TEXT_TYPES, FONT_FAMILIES, TYPE_LABELS, resolveImageSrc,
} from '../lib/idTemplate';

// Pure (no hooks, no Firestore) so it works on screen, in the designer and inside
// renderToStaticMarkup() for printing. Everything is positioned absolutely on a 540x340 face.

export function fillCss(s = {}) {
  if (!s.fill) return undefined;
  const a = s.gradientAngle ?? 90;
  if (s.gradient === 'mirror' && s.fill2) return `linear-gradient(${a}deg, ${s.fill} 0%, ${s.fill2} 50%, ${s.fill} 100%)`;
  if (s.gradient === 'linear' && s.fill2) return `linear-gradient(${a}deg, ${s.fill} 0%, ${s.fill2} 100%)`;
  return s.fill;
}

// Shrinks a single-line value so a long name still fits its box (estimate: 0.6em per character).
export function fitFontSize(text, boxWidth, fontSize, letterSpacing = 0) {
  const len = String(text || '').length;
  if (!len) return fontSize;
  const need = len * (fontSize * 0.6 + letterSpacing);
  if (need <= boxWidth) return fontSize;
  const fs = (boxWidth / len - letterSpacing) / 0.6;
  return Math.max(6, Math.floor(Math.min(fontSize, fs) * 10) / 10);
}

export function dataValue(type, data = {}, placeholders = false) {
  if (placeholders) return `{{${TYPE_LABELS[type] || type}}}`;
  return String(data[type] ?? '');
}

function Silhouette() {
  return (
    <svg viewBox="0 0 50 60" width="55%" height="56%" aria-hidden="true">
      <circle cx="25" cy="20" r="14" fill="#bbb" />
      <ellipse cx="25" cy="54" rx="20" ry="12" fill="#bbb" />
    </svg>
  );
}

/** One element. `editor` (designer only) fades elements hidden in the current mode and shows empty-image boxes. */
function ElementViewBase({ el, data, mode = 'digital', placeholders = false, editor = false }) {
  const s = el.style || {};
  const hidden = (el.visibleIn === 'digital' && mode !== 'digital') || (el.visibleIn === 'physical' && mode !== 'physical');
  if (hidden && !editor) return null;

  const clips = ['text', 'photo', 'image', ...DYNAMIC_TEXT_TYPES].includes(el.type);
  const box = {
    position: 'absolute', left: el.x, top: el.y, width: el.width, height: el.height,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
    transformOrigin: '50% 50%',
    zIndex: el.zIndex,
    boxSizing: 'border-box',
    opacity: (s.opacity ?? 1) * (hidden ? 0.3 : 1),
    overflow: clips ? 'hidden' : 'visible',
    background: fillCss(s),
    border: s.borderWidth ? `${s.borderWidth}px solid ${s.borderColor || '#000'}` : undefined,
    borderRadius: s.radius || undefined,
  };

  const textCss = {
    width: '100%', margin: 0,
    fontFamily: FONT_FAMILIES[s.fontFamily] || FONT_FAMILIES.Arial,
    fontSize: s.fontSize || 12, fontWeight: s.fontWeight || 400, fontStyle: s.fontStyle || 'normal',
    color: s.color || '#111111', textAlign: s.align || 'left',
    letterSpacing: s.letterSpacing ? `${s.letterSpacing}px` : undefined,
    lineHeight: s.lineHeight || 1.2, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
  };
  const flex = { display: 'flex', alignItems: s.valign === 'middle' ? 'center' : s.valign === 'bottom' ? 'flex-end' : 'flex-start' };

  switch (el.type) {
    case 'rectangle':
      return <div style={box} />;

    case 'line':
      return <div style={{ ...box, background: s.color || '#000000' }} />;

    case 'seal':
      return (
        <div style={{ ...box, borderRadius: '50%', padding: 2, background: 'conic-gradient(from 90deg, #ff6ec4, #ffd76e, #6effa1, #6ecbff, #a16eff, #ff6ec4)', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }}>
          <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'rgba(255,255,255,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1a3a6b' }}>
            <ShieldCheck size={Math.max(8, Math.min(el.width, el.height) * 0.42)} />
          </div>
        </div>
      );

    case 'image': {
      const src = resolveImageSrc(el.src);
      return (
        <div style={box}>
          {src
            ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: s.objectFit || 'contain', display: 'block' }} />
            
            : editor && <div style={{ width: '100%', height: '100%', border: '1px dashed #999', color: '#999', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Image</div>}
        </div>
      );
    }

    case 'photo':
      return (
        <div style={{ ...box, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {data?.photoUrl && !placeholders
            ? <img src={data.photoUrl} alt="Member photo" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            : <Silhouette />}
        </div>
      );

    case 'barcode': {
      const v = placeholders ? 'SAMPLE' : (data?.barcodeValue || data?.controlNo || '');
      return (
        <div style={box}>
          {v ? <Code39 value={v} height={Math.max(4, el.height - 2 * (s.borderWidth || 0))} /> : null}
        </div>
      );
    }

    case 'qr': {
      const v = placeholders ? 'SAMPLE' : (data?.qrValue || data?.controlNo || '');
      const size = Math.max(8, Math.min(el.width, el.height) - 2 * (s.borderWidth || 0));
      return (
        <div style={{ ...box, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {v ? <QRCodeSVG value={String(v)} size={size} level="M" bgColor="transparent" /> : null}
        </div>
      );
    }

    case 'text': {
      const content = el.content || '';
      if (s.list === 'decimal') {
        const items = content.split('\n').filter((l) => l.trim());
        return (
          <div style={box}>
            <ol style={{ ...textCss, paddingLeft: 18, listStyle: 'decimal' }}>
              {items.map((l, i) => <li key={i} style={{ padding: `${(s.paraGap || 0) / 2}px 0` }}>{l}</li>)}
            </ol>
          </div>
        );
      }
      return <div style={{ ...box, ...flex }}><div style={textCss}>{content}</div></div>;
    }

    default: {
      // dynamic text fields: name, address, dateOfBirth, sex, dateIssued, controlNo
      const value = dataValue(el.type, data, placeholders);
      const fs = s.autoFit && !value.includes('\n') && !placeholders
        ? fitFontSize(value, el.width - 2 * (s.borderWidth || 0), s.fontSize || 12, s.letterSpacing || 0)
        : (s.fontSize || 12);
      return <div style={{ ...box, ...flex }}><div style={{ ...textCss, fontSize: fs }}>{value}</div></div>;
    }
  }
}

export const ElementView = React.memo(ElementViewBase);

/** One side of the card: background plus every element, sorted by zIndex. */
export function IdFace({ template, side = 'front', data, mode = 'digital', placeholders = false, editor = false, children }) {
  const face = template?.[side] || { background: { color: '#ffffff' }, elements: [] };
  const bgImg = resolveImageSrc(face.background?.image);
  const els = [...face.elements].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
  return (
    <div
      style={{
        position: 'relative', width: CARD_W, height: CARD_H, overflow: 'hidden',
        background: face.background?.color || '#ffffff',
        backgroundImage: bgImg ? `url("${bgImg}")` : undefined, backgroundSize: 'cover', backgroundPosition: 'center',
      }}
    >
      {els.map((el) => <ElementView key={el.id} el={el} data={data} mode={mode} placeholders={placeholders} editor={editor} />)}
      {children}
    </div>
  );
}
