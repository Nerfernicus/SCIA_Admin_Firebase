import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, Check, Loader2, ImagePlus, CameraOff, Clock } from 'lucide-react';

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
 * Photo placement for the senior's physical OSCA ID (the web version of the
 * "Upload Senior Citizen ID Photo" card in the mobile app's sign-up).
 *
 *  - Detects whether this PC has a camera (and notices one being plugged in or
 *    removed). With a camera it opens the live view with a frame to guide the
 *    senior; without one it falls back to choosing a photo from the files.
 *  - value / onChange       raw base64 JPEG ('' = no photo yet)
 *  - later / onLaterChange  true = the senior didn't bring the ID and will send
 *                           a photo from the app at home (account stays unverified)
 */
export default function IdCardCapture({ value, onChange, later, onLaterChange }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);
  const autoTried = useRef(false);

  const [cameras, setCameras] = useState(null); // null = still checking, [] = none found
  const [deviceId, setDeviceId] = useState('');
  const [live, setLive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => { t.onended = null; t.stop(); });
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setLive(false);
  }, []);
  useEffect(() => stopStream, [stopStream]);

  // ── camera detection (and plug / unplug) ─────────────────────────────────
  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) { setCameras([]); return; }
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setCameras(all.filter((d) => d.kind === 'videoinput'));
    } catch {
      setCameras([]);
    }
  }, []);

  useEffect(() => {
    refreshDevices();
    const md = navigator.mediaDevices;
    md?.addEventListener?.('devicechange', refreshDevices);
    return () => md?.removeEventListener?.('devicechange', refreshDevices);
  }, [refreshDevices]);

  // ── live camera ──────────────────────────────────────────────────────────
  const startCamera = useCallback(async (id) => {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This page cannot use the camera (it needs a secure https connection). Choose a photo from the files instead.');
      return;
    }
    stopStream();
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          ...(id ? { deviceId: { exact: id } } : { facingMode: { ideal: 'environment' } }),
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      stream.getVideoTracks().forEach((t) => {
        // The camera was unplugged while open.
        t.onended = () => { stopStream(); setError('The camera was disconnected. Plug it back in or choose a photo from the files.'); refreshDevices(); };
      });
      setLive(true);
      refreshDevices(); // device names are only readable once permission is given
    } catch (e) {
      setError(
        e && e.name === 'NotAllowedError'
          ? 'Camera access was blocked. Allow the camera for this site in the browser, or choose a photo from the files.'
          : 'The camera could not be opened (it may be in use by another app). Choose a photo from the files instead.',
      );
    } finally {
      setStarting(false);
    }
  }, [stopStream, refreshDevices]);

  // Attach the stream once the <video> exists.
  useEffect(() => {
    if (live && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [live]);

  // A camera is there and nothing has been captured: open it by itself, once.
  // (If it fails or is refused we do not retry in a loop; "Start camera" is shown.)
  useEffect(() => {
    if (cameras && cameras.length === 0) autoTried.current = false; // plug one in later -> try again
  }, [cameras]);
  useEffect(() => {
    if (cameras && cameras.length > 0 && !value && !later && !live && !starting && !autoTried.current) {
      autoTried.current = true;
      startCamera(deviceId || undefined);
    }
  }, [cameras, value, later, live, starting, deviceId, startCamera]);

  // Photo taken, or "will send later" chosen: release the camera.
  useEffect(() => {
    if (value || later) stopStream();
  }, [value, later, stopStream]);

  // ── taking / choosing the photo ──────────────────────────────────────────
  const takePhoto = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) { setError('The camera is still starting. Try again in a second.'); return; }
    try {
      onChange(compress(v, v.videoWidth, v.videoHeight));
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Please choose an image file (JPG or PNG).'); return; }
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

  const onFilePicked = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    handleFile(file);
  };

  const hasCamera = !!cameras && cameras.length > 0;
  const retake = () => {
    onChange('');
    setError('');
    if (hasCamera) startCamera(deviceId || undefined);
  };
  const pickCamera = (id) => { setDeviceId(id); startCamera(id); };
  const filePicker = (
    <input ref={fileRef} type="file" accept="image/*" onChange={onFilePicked} className="hidden" />
  );

  // ── "didn't bring the ID" ────────────────────────────────────────────────
  if (later) {
    return (
      <div className="space-y-3">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
          <Clock size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            The account will still be created, but it stays <b>not verified</b> until the senior sends a photo of
            the physical ID from the app and OSCA approves it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { onLaterChange(false); autoTried.current = false; }}
          className="text-xs font-bold text-[#0f52ba] underline"
        >
          Take the photo now instead
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p role="alert" className="text-xs font-medium text-red-600">{error}</p>}
      {filePicker}

      {value ? (
        // ── photo ready ──
        <div className="space-y-2">
          <img
            src={`data:image/jpeg;base64,${value}`}
            alt="Photo of the senior's OSCA ID"
            className="w-full max-h-64 object-contain rounded-xl border border-gray-200 bg-gray-50"
          />
          <p className="text-xs text-emerald-700 flex items-center gap-1">
            <Check size={14} /> Photo ready. Check that the ID number and name can be read.
          </p>
          <div className="flex gap-4">
            <button type="button" onClick={retake} className="text-xs font-bold text-[#0f52ba] underline flex items-center gap-1">
              <RefreshCw size={12} /> Retake
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} className="text-xs font-bold text-[#0f52ba] underline flex items-center gap-1">
              <ImagePlus size={12} /> Choose a different file
            </button>
          </div>
        </div>
      ) : live ? (
        // ── live camera with a frame to guide the senior ──
        <div className="space-y-2">
          <p className="text-sm text-gray-600">
            Ask the senior to hold the physical OSCA ID flat in front of the camera, facing it, so the whole
            card fits inside the frame and the number and name can be read.
          </p>
          <div className="relative overflow-hidden rounded-xl bg-black">
            <video ref={videoRef} playsInline muted className="w-full max-h-80 object-contain" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="w-[78%] aspect-[1.586/1] rounded-xl border-2 border-dashed border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
            <span className="pointer-events-none absolute top-2 left-0 right-0 text-center text-xs font-bold text-white drop-shadow">
              Place the ID inside the frame
            </span>
          </div>

          {cameras && cameras.length > 1 && (
            <select
              value={deviceId}
              onChange={(e) => pickCamera(e.target.value)}
              aria-label="Choose camera"
              className="w-full text-sm rounded-xl border border-gray-200 bg-gray-50 py-2 px-3 text-gray-900"
            >
              <option value="">Default camera</option>
              {cameras.map((c, i) => (
                <option key={c.deviceId || i} value={c.deviceId}>{c.label || `Camera ${i + 1}`}</option>
              ))}
            </select>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <button type="button" onClick={takePhoto} className="flex-1 py-2.5 rounded-xl bg-[#0f52ba] hover:bg-blue-700 text-white text-sm font-bold flex items-center justify-center gap-2">
              <Camera size={16} /> Take photo
            </button>
            <button type="button" onClick={() => { stopStream(); fileRef.current?.click(); }} className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-2">
              <ImagePlus size={16} /> Choose from files instead
            </button>
          </div>
        </div>
      ) : (
        // ── placeholder card (same idea as the app's "Upload ID Photo" card) ──
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files && e.dataTransfer.files[0]); }}
            className={`w-full rounded-xl border-2 border-dashed p-6 flex flex-col items-center gap-2 text-center transition-colors ${dragging ? 'border-[#0f52ba] bg-blue-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'}`}
          >
            <span className="w-14 h-14 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-lg font-extrabold text-gray-500">
              {starting || cameras === null ? <Loader2 size={22} className="animate-spin text-[#0f52ba]" /> : 'ID'}
            </span>
            <span className="text-base font-bold text-gray-700">Upload ID Photo</span>
            <span className="text-xs text-gray-500">
              OSCA will check this photo against the ID number entered above. Click to choose a file, or drop it here.
            </span>
          </button>

          {cameras === null && <p className="text-xs text-gray-500">Checking for a camera…</p>}
          {hasCamera && !starting && (
            <button type="button" onClick={() => startCamera(deviceId || undefined)} className="text-xs font-bold text-[#0f52ba] underline flex items-center gap-1">
              <Camera size={12} /> Start camera
            </button>
          )}
          {cameras && cameras.length === 0 && (
            <p className="text-xs text-gray-500 flex items-center gap-1.5">
              <CameraOff size={12} /> No camera found on this PC. Plug one in and it will open here, or choose the photo from the files.{' '}
              <button type="button" onClick={() => startCamera()} className="font-bold text-[#0f52ba] underline">Try the camera anyway</button>
            </p>
          )}
        </div>
      )}

      {!value && (
        <button
          type="button"
          onClick={() => { stopStream(); onLaterChange(true); }}
          className="text-xs text-gray-500 underline"
        >
          The senior didn&apos;t bring the ID. They will send a photo from home.
        </button>
      )}
    </div>
  );
}
