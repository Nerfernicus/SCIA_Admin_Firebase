import { renderToStaticMarkup } from 'react-dom/server';
import { IdFace } from '../components/IdTemplateFace';
import { CARD_W, getCachedIdTemplate } from './idTemplate';

// CR80 / ISO ID-1 card: 85.6 x 54 mm. The 540x340 design is scaled down to exactly that size,
// so one design serves the screen, the digital ID and the printer.
export const CR80_W_MM = 85.6;
export const CR80_H_MM = 54;
const PX_PER_MM = 96 / 25.4;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Opens a print window with one CR80 page per side (front, then back).
 * Call it straight from a click handler (pop-up blockers). Returns false if the pop-up was blocked.
 * Uses the template already loaded in memory (saved one, or the default).
 */
export function printIdCard({ data, mode = 'physical', sides = ['front', 'back'], template, title = 'OSCA ID' }) {
  const tpl = template || getCachedIdTemplate();
  const scale = (CR80_W_MM * PX_PER_MM) / CARD_W;

  const pages = sides.map((side) => {
    const face = renderToStaticMarkup(<IdFace template={tpl} side={side} data={data} mode={mode} />);
    return `<section class="page"><div class="inner">${face}</div></section>`;
  }).join('');

  const w = window.open('', '_blank', 'width=520,height=360');
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    @page { size: ${CR80_W_MM}mm ${CR80_H_MM}mm; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { margin: 0; padding: 0; background: #fff; }
    .page { position: relative; width: ${CR80_W_MM}mm; height: ${CR80_H_MM}mm; overflow: hidden; break-after: page; page-break-after: always; }
    .page:last-child { break-after: auto; page-break-after: auto; }
    .inner { width: ${CARD_W}px; height: 340px; transform: scale(${scale}); transform-origin: 0 0; }
  </style></head><body>${pages}<script>window.onload=function(){setTimeout(function(){window.print()},150)}</script></body></html>`);
  w.document.close();
  return true;
}
