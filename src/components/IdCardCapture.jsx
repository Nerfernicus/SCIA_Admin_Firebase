import { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, X, Check, Loader2, ImagePlus } from 'lucide-react';

// Same size ladder as the mobile app (lib/idImage.ts): a Firestore document is
// capped at 1 MiB, so the photo is shrunk until its base64 text is under this.
const MAX_BASE64_CHARS = 600000;
const ATTEMPTS = [
  { width: 1280, quality: 0.6 },
  { width: 1024, quality: 0.5 },
  { width: 800, quality: 0.45 },
];

// Draws `source` (a <video> or <img>) into a canvas and returns raw base64 JPEG
// (no "data:" prefix, which is the shape id_verifications.imageBase64 uses).
function compress(source, srcW, srcH) {
  for (const { width, quality } of ATTEMPTS) {
    const w = Math.min(srcW, width);
    const h = Math.round(srcH * (w / srcW));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(source, 0, 0, w, h);
    const base64 = canvas.toDataURL('image/jpeg', quality).split(',')[1] || '';
    if (base64 && base64.length <= MAX_BASE64_CHARS) return base64;
  }
  throw new Error('That photo is too large. Please move closer and retake it.');
}

const loadImage = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
    img.src = url;
  });

/**
 * Camera capture for the senior's physical OSCA ID.
 * value    = raw base64 JPEG ('' when nothing is taken yet)
 * onChange = called with the base64 string, or '' on retake
 * Falls back to the device's own camera / file picker when the browser blocks
 * live camera access (needs https, a camera and the person's permission).
 */
export default function IdCardCapture({ value, onChange }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);
  const [mode, setMode] = useState('idle'); // idle | starting | live
  const [error, setError] = useState('');

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  useEffect(() => stopStream, []);

  const openCamera = async () => {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser cannot open the camera here. Use "Upload / use phone camera" instead.');
      return;
    }
    setMode('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      setMode('live');
      // The <video> mounts after the state change; attach on the next frame.
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch (e) {
      stopStream();
      setMode('idle');
      setError(
        e && e.name === 'NotAllowedError'
          ? 'Camera access was blocked. Allow the camera for this site in the browser, then try again.'
          : 'No camera could be opened. Use "Upload / use phone camera" instead.',
      );
    }
  };

  const takePhoto = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) { setError('The camera is still starting. Try again in a second.'); return; }
    try {
      onChange(compress(v, v.videoWidth, v.videoHeight));
      stopStream();
      setMode('idle');
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };

  const cancelCamera = () => { stopStream(); setMode('idle'); };

  const onFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { img, url } = await loadImage(file);
      try {
        onChange(compress(img, img.naturalWidth, img.naturalHeight));
        setError('');
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const retake = () => { onChange(''); setError(''); };

  return (
    <div className="space-y-3">
      {error && <p role="alert" className="text-xs font-medium text-red-600">{error}</p>}

      {value ? (
        <div className="space-y-2">
          <img
            src={`data:image/jpeg;base64,${value}`}
            alt="Photo of the senior's OSCA ID"
            className="w-full max-h-64 object-contain rounded-xl border border-gray-200 bg-gray-50"
          />
          <p className="text-xs text-emerald-700 flex items-center gap-1"><Check size={14} /> Photo ready. Check that the number and name are readable.</p>
          <button type="button" onClick={retake} className="text-xs font-bold text-[#0f52ba] underline flex items-center gap-1">
            <RefreshCw size={12} /> Retake
          </button>
        </div>
      ) : mode === 'live' ? (
        <div className="space-y-2">
          <video ref={videoRef} playsInline muted className="w-full rounded-xl bg-black max-h-72 object-contain" />
          <p className="text-xs text-gray-500">Hold the card flat inside the frame so the whole card is visible and readable.</p>
          <div className="flex gap-3">
            <button type="button" onClick={cancelCamera} className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-2">
              <X size={16} /> Cancel
            </button>
            <button type="button" onClick={takePhoto} className="flex-1 py-2.5 rounded-xl bg-[#0f52ba] hover:bg-blue-700 text-white text-sm font-bold flex items-center justify-center gap-2">
              <Camera size={16} /> Take photo
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={openCamera}
            disabled={mode === 'starting'}
            className="flex-1 py-2.5 rounded-xl bg-[#0f52ba] hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-bold flex items-center justify-center gap-2"
          >
            {mode === 'starting' ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />} Open camera
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-2"
          >
            <ImagePlus size={16} /> Upload / use phone camera
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
        </div>
      )}
    </div>
  );
}
