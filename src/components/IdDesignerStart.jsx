import { useRef, useState } from 'react';
import { FilePlus, Loader2, PenTool, Upload } from 'lucide-react';

/**
 * First screen of the ID Designer: start a blank design, upload an SVG to edit, or open the current design.
 * SVG is the only accepted file type (see src/lib/importSvg.js for why).
 */
export default function IdDesignerStart({ onBlank, onCurrent, onUpload, busy, error }) {
  const [side, setSide] = useState('front');
  const [over, setOver] = useState(false);
  const fileRef = useRef(null);

  const take = (file) => { if (file && !busy) onUpload(file, side); };

  return (
    <div className="mx-auto flex max-w-4xl flex-col items-center px-4 py-8 sm:py-12">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white"><PenTool size={22} /></span>
      <h1 className="mt-4 text-2xl font-bold text-gray-900">ID Designer</h1>
      <p className="mt-1 text-center text-sm text-gray-500">How do you want to start? Nothing changes for seniors until you press Save in the editor.</p>

      <div className="mt-8 grid w-full gap-5 md:grid-cols-2">
        {/* 1. new design */}
        <button
          type="button" onClick={onBlank} disabled={busy}
          className="group flex flex-col items-center rounded-2xl border border-gray-200 bg-white p-6 text-left shadow-sm transition hover:border-blue-400 hover:shadow-md disabled:opacity-60"
        >
          <div className="flex aspect-[540/340] w-full max-w-[260px] items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 text-gray-400 group-hover:border-blue-400 group-hover:text-blue-500">
            <FilePlus size={34} />
          </div>
          <p className="mt-4 text-base font-bold text-gray-900">Create new design</p>
          <p className="mt-1 text-center text-xs text-gray-500">Start from an empty card (85.6 × 54 mm, front and back) and add text, photo, logo and QR yourself.</p>
        </button>

        {/* 2. upload */}
        <div
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files?.[0]); }}
          className={`flex flex-col items-center rounded-2xl border bg-white p-6 shadow-sm transition ${over ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}
        >
          <div className="flex aspect-[540/340] w-full max-w-[260px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 text-gray-400">
            {busy ? <Loader2 size={34} className="animate-spin" /> : <Upload size={34} />}
            <span className="mt-2 text-[11px] font-semibold">{busy ? 'Reading file…' : 'Drop an SVG file here'}</span>
          </div>
          <p className="mt-4 text-base font-bold text-gray-900">Upload a file and edit it</p>
          <p className="mt-1 text-center text-xs text-gray-500">Only <b>SVG</b> files are accepted, because they keep text, shapes and pictures editable.</p>

          <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-gray-600">
            Put it on the
            <div className="inline-flex overflow-hidden rounded-lg border border-gray-200">
              {['front', 'back'].map((s) => (
                <button
                  key={s} type="button" onClick={() => setSide(s)} aria-pressed={side === s}
                  className={`px-3 py-1.5 ${side === s ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >{s === 'front' ? 'Front' : 'Back'}</button>
              ))}
            </div>
            <span className="text-gray-400">(other side starts empty)</span>
          </div>

          <input ref={fileRef} type="file" accept=".svg,image/svg+xml" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; take(f); }} />
          <button
            type="button" disabled={busy} onClick={() => fileRef.current?.click()}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60"
          ><Upload size={14} /> Choose SVG file</button>
        </div>
      </div>

      {error && <div role="alert" className="mt-5 w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      <details className="mt-6 w-full rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
        <summary className="cursor-pointer text-sm font-semibold text-gray-900">How do I get an SVG from my design?</summary>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-gray-600">
          <li><b>Figma</b> (free): select the card frame, Export → SVG → Export. Use a frame of 1012 × 638 px.</li>
          <li><b>Canva</b>: Share → Download → SVG (needs Canva Pro). Free accounts can design in Figma or Photopea instead.</li>
          <li><b>Photopea</b> (free, in the browser): File → Export as → SVG.</li>
          <li><b>Inkscape</b> (free) or <b>Illustrator</b>: Save as SVG (plain or optimized).</li>
          <li>Keep text as <b>real text</b>. If it is converted to outlines or curves it becomes a picture and cannot be edited.</li>
          <li>Best size is the ID size, 85.6 × 54 mm (1012 × 638 px). Other shapes are fitted inside the card.</li>
          <li>Gradients and curves are brought in as one background picture. Text, shapes, lines and embedded pictures stay editable.</li>
          <li>After importing, select a text or box and choose what it shows (name, address, photo, QR…) so it fills from each senior&apos;s record.</li>
        </ul>
      </details>

      <button type="button" onClick={onCurrent} disabled={busy} className="mt-6 text-sm font-semibold text-blue-700 hover:underline disabled:opacity-60">
        Or continue editing the current ID design →
      </button>
    </div>
  );
}
