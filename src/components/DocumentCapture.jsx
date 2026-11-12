import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, ImagePlus, Loader2, RefreshCw, Trash2, FileText, CreditCard } from 'lucide-react';

// Documents for the OSCA application: valid ID (card-shaped) and/or birth certificate (page-shaped).
//  - Camera: live view with an outline that FITS what it sees. The outline snaps to an ID-card
//    shape or a document shape; "Auto" detects it, "ID card" / "Document" force a fixed guide.
//  - Upload: pick one or more photos from this device.
// value = [{ kind: 'id' | 'document', imageBase64 }]  (raw base64 JPEG, same as id_verifications)
const MAX_DOCS = 3;
const MAX_BASE64_CHARS = 600000;
const ATTEMPTS = [{ width: 1400, quality: 0.65 }, { width: 1100, quality: 0.55 }, { width: 850, quality: 0.45 }];
const ID_RATIO = 85.6 / 54;     // CR80 card, landscape
const DOC_RATIO = 210 / 297;    // A4 page, portrait

// ── Camera outline tuning ─ change ONLY these while testing on the real device ──────────────
const TUNE = {
  detectWidth: 160,     // analysis width in px. Higher = finer edges, slower
  edgeFloor: 28,        // minimum edge strength. Raise if the outline jumps on a plain table; lower if it misses a pale card
  minEdgeSpan: 0.14,    // how much of the frame an edge line must span (0..1). Raise to ignore text/patterns
  minBoxSize: 0.2,      // smallest box (fraction of frame) accepted as a document
  idRatioMin: 1.25,     // box width/height that counts as an ID card...
  idRatioMax: 2.0,      // ...between these two
  idMaxArea: 0.7,       // an "ID card" box bigger than this share of the frame is treated as a document
  smoothing: 0.5,       // 0..1. Lower = steadier outline, higher = follows faster
  idGuideHeight: 0.62,  // fixed "ID card" guide height (fraction of frame)
  docGuideHeight: 0.9,  // fixed "Document" guide height
  steadyFrames: 8,      // frames (about 200 ms each) held still before auto-capture
  capturePad: 0.02,     // extra margin around the box when cropping
};

// Crop (sx,sy,sw,sh) of `source` into a JPEG whose base64 fits under the Firestore limit.
function toJpeg(source, sx, sy, sw, sh) {
  for (const { width, quality } of ATTEMPTS) {
    const w = Math.min(sw, width);
    const h = Math.round(sh * (w / sw));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(source, sx, sy, sw, sh, 0, 0, w, h);
    const b64 = c.toDataURL('image/jpeg', quality).split(',')[1] || '';
    if (b64 && b64.length <= MAX_BASE64_CHARS) return b64;
  }
  throw new Error('That photo is too large. Please move closer and retake it.');
}

// Find the dominant rectangle in the frame from edge strength (no libraries). Returns a box in
// 0..1 frame coordinates, or null when nothing document-like is in view.
function detect(video, work) {
  const W = TUNE.detectWidth;
  const H = Math.max(40, Math.round((W * video.videoHeight) / video.videoWidth));
  work.width = W; work.height = H;
  const ctx = work.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, W, H);
  const px = ctx.getImageData(0, 0, W, H).data;
  const g = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) g[i] = px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114;
  const mag = new Float32Array(W * H);
  let sum = 0, sum2 = 0, n = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const m = Math.abs(g[y * W + x + 1] - g[y * W + x - 1]) + Math.abs(g[(y + 1) * W + x] - g[(y - 1) * W + x]);
    mag[y * W + x] = m; sum += m; sum2 += m * m; n++;
  }
  const mean = sum / n;
  const thr = Math.max(TUNE.edgeFloor, mean + Math.sqrt(Math.max(0, sum2 / n - mean * mean)));
  const rows = new Uint16Array(H), cols = new Uint16Array(W);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (mag[y * W + x] > thr) { rows[y]++; cols[x]++; }
  const minRow = W * TUNE.minEdgeSpan, minCol = H * TUNE.minEdgeSpan;       // an edge of a card/page spans a good part of the frame
  let top = -1, bottom = -1, left = -1, right = -1;
  for (let y = 2; y < H - 2; y++) if (rows[y] >= minRow) { if (top < 0) top = y; bottom = y; }
  for (let x = 2; x < W - 2; x++) if (cols[x] >= minCol) { if (left < 0) left = x; right = x; }
  if (top < 0 || left < 0 || bottom - top < H * TUNE.minBoxSize || right - left < W * TUNE.minBoxSize) return null;
  return { x: left / W, y: top / H, w: (right - left) / W, h: (bottom - top) / H };
}

// Outline for a forced mode, centred, in 0..1 frame coordinates.
function fixedGuide(mode, vw, vh) {
  const ratio = mode === 'id' ? ID_RATIO : DOC_RATIO;
  let h = mode === 'id' ? TUNE.idGuideHeight : TUNE.docGuideHeight;
  let w = (h * vh * ratio) / vw;
  if (w > 0.9) { w = 0.9; h = (w * vw) / (ratio * vh); }
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

const classify = (box, vw, vh) => {
  const ratio = (box.w * vw) / (box.h * vh);
  return ratio >= TUNE.idRatioMin && ratio <= TUNE.idRatioMax && box.w * box.h < TUNE.idMaxArea ? 'id' : 'document';
};

export default function DocumentCapture({ value, onChange }) {
  const videoRef = useRef(null);
  const workRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);
  const stableRef = useRef({ n: 0, box: null });
  const votes = useRef([]);

  const [live, setLive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [mode, setMode] = useState('auto');         // auto | id | document
  const [autoShot, setAutoShot] = useState(true);
  const [box, setBox] = useState(null);             // outline now shown
  const [kind, setKind] = useState(null);           // what the outline currently fits
  const [aspect, setAspect] = useState(16 / 9);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const full = value.length >= MAX_DOCS;

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLive(false); setBox(null); setKind(null);
  }, []);
  useEffect(() => stop, [stop]);

  const start = async () => {
    setError(''); setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
      });
      streamRef.current = stream;
      setLive(true);
      requestAnimationFrame(() => {
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        v.onloadedmetadata = () => { v.play(); setAspect(v.videoWidth / v.videoHeight); };
      });
    } catch {
      setError('No camera available or access was blocked. Upload a photo from this device instead.');
    } finally { setStarting(false); }
  };

  const add = useCallback((kindOfDoc, b64) => onChange([...value, { kind: kindOfDoc, imageBase64: b64 }]), [onChange, value]);

  const capture = useCallback((useBox, useKind) => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    try {
      const b = useBox || { x: 0, y: 0, w: 1, h: 1 };
      const pad = TUNE.capturePad;
      const x = Math.max(0, b.x - pad), y = Math.max(0, b.y - pad);
      const w = Math.min(1 - x, b.w + 2 * pad), h = Math.min(1 - y, b.h + 2 * pad);
      add(useKind || 'document', toJpeg(v, x * v.videoWidth, y * v.videoHeight, w * v.videoWidth, h * v.videoHeight));
      stop();
    } catch (e) { setError(e.message); }
  }, [add, stop]);

  // Detection loop (about 5 frames a second).
  useEffect(() => {
    if (!live) return undefined;
    const id = setInterval(() => {
      const v = videoRef.current, work = workRef.current;
      if (!v || !work || !v.videoWidth) return;
      let b, k;
      if (mode === 'auto') {
        b = detect(v, work);
        if (b) {
          votes.current = [...votes.current.slice(-5), classify(b, v.videoWidth, v.videoHeight)];
          const ids = votes.current.filter((x) => x === 'id').length;
          k = ids >= 3 ? 'id' : 'document';
        } else { votes.current = []; k = null; }
      } else { k = mode; b = fixedGuide(mode, v.videoWidth, v.videoHeight); }
      setBox((prev) => (b && prev ? { x: prev.x + (b.x - prev.x) * TUNE.smoothing, y: prev.y + (b.y - prev.y) * TUNE.smoothing, w: prev.w + (b.w - prev.w) * TUNE.smoothing, h: prev.h + (b.h - prev.h) * TUNE.smoothing } : b));
      setKind(k);

      // Hold still ~1.5 s on the same shape -> take it.
      const st = stableRef.current;
      const moved = !b || !st.box || Math.abs(b.x - st.box.x) > 0.03 || Math.abs(b.y - st.box.y) > 0.03 || Math.abs(b.w - st.box.w) > 0.04;
      st.n = moved ? 0 : st.n + 1; st.box = b;
      if (autoShot && b && k && st.n >= TUNE.steadyFrames) { st.n = 0; capture(b, k); }
    }, 200);
    return () => clearInterval(id);
  }, [live, mode, autoShot, capture]);

  const onFiles = async (files) => {
    setError(''); setBusy(true);
    try {
      let next = [...value];
      for (const f of Array.from(files)) {
        if (next.length >= MAX_DOCS) break;
        if (!f.type.startsWith('image/')) { setError('Please choose image files (JPG or PNG).'); continue; }
        const url = URL.createObjectURL(f);
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not read that image.')); i.src = url; });
        const b64 = toJpeg(img, 0, 0, img.naturalWidth, img.naturalHeight);
        URL.revokeObjectURL(url);
        next = [...next, { kind: img.naturalWidth / img.naturalHeight >= 1.25 && img.naturalWidth / img.naturalHeight <= 2 ? 'id' : 'document', imageBase64: b64 }];
      }
      onChange(next);
    } catch (e) { setError(e.message); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const color = kind === 'id' ? '#16a34a' : '#0f52ba';
  const label = !box ? 'Point the camera at the ID or document' : kind === 'id' ? 'ID card detected' : 'Document detected';

  return (
    <div className="space-y-3">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {value.map((d, i) => (
            <div key={i} className="relative w-36 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
              <img src={`data:image/jpeg;base64,${d.imageBase64}`} alt={d.kind === 'id' ? 'ID' : 'Document'} className="h-24 w-full rounded-lg object-cover" />
              <div className="mt-1 flex items-center justify-between px-1 text-xs font-semibold text-gray-600">
                <span className="flex items-center gap-1">{d.kind === 'id' ? <CreditCard size={12} /> : <FileText size={12} />}{d.kind === 'id' ? 'ID' : 'Document'}</span>
                <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Remove" className="text-red-600"><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {live && (
        <div>
          <div className="relative mx-auto w-full max-w-xl overflow-hidden rounded-xl bg-black" style={{ aspectRatio: aspect }}>
            <video ref={videoRef} playsInline muted className="h-full w-full" />
            {box && (
              <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                <rect x={box.x * 100} y={box.y * 100} width={box.w * 100} height={box.h * 100} rx="1.2" fill="none" stroke={color} strokeWidth="0.7" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 3 }} />
              </svg>
            )}
            <div className="absolute left-2 top-2 rounded-full px-2.5 py-1 text-xs font-bold text-white" style={{ background: box ? color : '#475569' }}>{label}</div>
          </div>
          <canvas ref={workRef} className="hidden" />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {[['auto', 'Auto'], ['id', 'ID card'], ['document', 'Document']].map(([k, l]) => (
              <button key={k} type="button" onClick={() => { setMode(k); votes.current = []; }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${mode === k ? 'bg-[#0f52ba] text-white border-[#0f52ba]' : 'bg-white text-gray-600 border-gray-200'}`}>{l}</button>
            ))}
            <label className="ml-2 flex items-center gap-1 text-xs text-gray-600">
              <input type="checkbox" checked={autoShot} onChange={(e) => setAutoShot(e.target.checked)} /> Take it when steady
            </label>
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={stop} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700">Cancel</button>
              <button type="button" onClick={() => capture(box, kind)} className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-bold flex items-center gap-1"><Camera size={14} /> Capture</button>
            </div>
          </div>
        </div>
      )}

      {!live && (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={full || starting} onClick={start}
            className="px-4 py-2 rounded-lg bg-[#0f52ba] hover:bg-[#0c3f91] text-white text-sm font-bold flex items-center gap-2 disabled:opacity-50">
            {starting ? <Loader2 size={15} className="animate-spin" /> : value.length ? <RefreshCw size={15} /> : <Camera size={15} />} {value.length ? 'Scan another' : 'Scan with camera'}
          </button>
          <button type="button" disabled={full || busy} onClick={() => fileRef.current?.click()}
            className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />} Upload from device
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
        </div>
      )}
      {full && <p className="text-xs text-gray-500">Maximum of {MAX_DOCS} photos. Remove one to add another.</p>}
      {error && <p className="flex items-center gap-1 text-sm text-red-600"><CameraOff size={14} /> {error}</p>}
    </div>
  );
}
