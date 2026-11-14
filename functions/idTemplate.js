// functions/idTemplate.js
//
//   saveIdTemplate   super admin saves the OSCA ID design to settings/idTemplate
//
// Browsers cannot write settings/idTemplate or admin_audit (see firestore.rules). This callable
// checks the caller is an unlocked super admin, validates the design (shape, size, colours,
// fonts, images), and writes the template and an admin_audit entry in ONE batch, so a save
// is never un-logged. The same rules live in src/lib/idTemplate.js (normalizeTemplate).

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

const db = admin.firestore();
const REGION = { region: "asia-southeast1" };
const FV = admin.firestore.FieldValue;

const W = 540;
const H = 340;
const MAX_DOC_BYTES = 900 * 1024;     // Firestore's limit is 1 MiB
const MAX_IMAGE_CHARS = 450000;
const MAX_ELEMENTS = 80;
const TYPES = ["name", "address", "dateOfBirth", "sex", "dateIssued", "controlNo", "photo", "barcode", "qr",
  "text", "image", "rectangle", "line", "seal"];
const FONTS = ["Arial", "Arial Black", "Courier New", "Times New Roman", "Georgia", "Verdana", "Tahoma", "Trebuchet MS"];
const BUILTIN = ["vallogo"];
const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(,\s*[\d.]+\s*)?\)|transparent)$/i;
const IMG_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

async function requireSuperAdmin(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
  const snap = await db.collection("admins").doc(request.auth.uid).get();
  const data = snap.exists ? snap.data() : null;
  if (!data || String(data.role).trim() !== "super_admin" || data.locked === true) {
    throw new HttpsError("permission-denied", "Only the OSCA Super Admin can do this.");
  }
  return { uid: request.auth.uid, data };
}

const bad = (msg) => { throw new HttpsError("invalid-argument", msg); };
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const num = (v, min, max, label) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) bad(`${label} must be a number between ${min} and ${max}.`);
  return v;
};
const color = (v, label) => {
  if (typeof v !== "string" || !COLOR_RE.test(v.trim())) bad(`${label} is not a valid colour.`);
  return v.trim();
};
function image(v, label) {
  if (typeof v !== "string") bad(`${label} is not a valid image.`);
  if (v.startsWith("builtin:")) {
    if (!BUILTIN.includes(v.slice(8))) bad(`${label} refers to an unknown built-in image.`);
    return v;
  }
  if (v.length > MAX_IMAGE_CHARS || !IMG_RE.test(v)) bad(`${label} must be a PNG, JPG or WebP image under about 330 KB.`);
  return v;
}

function cleanStyle(st, label) {
  if (st === undefined) return {};
  if (!isObj(st)) bad(`${label}: style is invalid.`);
  const s = {};
  for (const k of ["color", "fill", "fill2", "borderColor"]) if (st[k] !== undefined) s[k] = color(st[k], `${label}: ${k}`);
  if (st.fontFamily !== undefined) { if (!FONTS.includes(st.fontFamily)) bad(`${label}: font not allowed.`); s.fontFamily = st.fontFamily; }
  const ranges = {
    fontSize: [4, 120], fontWeight: [100, 900], letterSpacing: [-5, 30], lineHeight: [0.8, 3], paraGap: [0, 30],
    gradientAngle: [-360, 360], borderWidth: [0, 20], radius: [0, 500], opacity: [0, 1],
  };
  for (const [k, [lo, hi]] of Object.entries(ranges)) if (st[k] !== undefined) s[k] = num(st[k], lo, hi, `${label}: ${k}`);
  const enums = {
    fontStyle: ["normal", "italic"], align: ["left", "center", "right"], valign: ["top", "middle", "bottom"],
    list: ["none", "decimal"], gradient: ["none", "linear", "mirror"], objectFit: ["contain", "cover", "fill"],
  };
  for (const [k, list] of Object.entries(enums)) if (st[k] !== undefined) { if (!list.includes(st[k])) bad(`${label}: ${k} is invalid.`); s[k] = st[k]; }
  if (st.autoFit !== undefined) s.autoFit = st.autoFit === true;
  return s;
}

function cleanElement(e, i, side) {
  const label = `${side} element ${i + 1}`;
  if (!isObj(e)) bad(`${label} is invalid.`);
  if (!TYPES.includes(e.type)) bad(`${label}: unknown type.`);
  if (typeof e.id !== "string" || !e.id || e.id.length > 64) bad(`${label}: bad id.`);
  const out = {
    id: e.id, type: e.type,
    x: num(e.x, -1000, 1000, `${label}: x`), y: num(e.y, -1000, 1000, `${label}: y`),
    width: num(e.width, 1, 2000, `${label}: width`), height: num(e.height, 0.5, 2000, `${label}: height`),
    rotation: num(e.rotation ?? 0, -360, 360, `${label}: rotation`),
    zIndex: Math.round(num(e.zIndex ?? 0, -999, 999, `${label}: zIndex`)),
    visibleIn: ["all", "digital", "physical"].includes(e.visibleIn) ? e.visibleIn : "all",
    locked: e.locked === true,
    style: cleanStyle(e.style, label),
  };
  if (e.content !== undefined) {
    if (typeof e.content !== "string" || e.content.length > 2000) bad(`${label}: text is too long.`);
    out.content = e.content;
  }
  if (e.type === "image" && e.src !== undefined && e.src !== null) out.src = image(e.src, label);
  if (e.lockAspect !== undefined) out.lockAspect = e.lockAspect === true;
  return out;
}

function cleanFace(f, side) {
  if (!isObj(f) || !Array.isArray(f.elements)) bad(`The ${side} side is missing.`);
  if (f.elements.length > MAX_ELEMENTS) bad(`The ${side} side has too many elements (max ${MAX_ELEMENTS}).`);
  const bg = isObj(f.background) ? f.background : {};
  const ids = new Set();
  const elements = f.elements.map((e, i) => {
    const c = cleanElement(e, i, side);
    if (ids.has(c.id)) bad(`${side}: duplicate element id.`);
    ids.add(c.id);
    return c;
  });
  return {
    background: {
      color: bg.color === undefined ? "#ffffff" : color(bg.color, `${side} background`),
      image: bg.image ? image(bg.image, `${side} background image`) : null,
    },
    elements,
  };
}

exports.saveIdTemplate = onCall(REGION, async (request) => {
  const caller = await requireSuperAdmin(request);
  const t = request.data && request.data.template;
  if (!isObj(t)) bad("No template was sent.");
  if (t.version !== 1) bad("Unsupported template version.");
  if (!isObj(t.canvas) || t.canvas.width !== W || t.canvas.height !== H) bad(`The card size must be ${W} x ${H}.`);

  const front = cleanFace(t.front, "front");
  const back = cleanFace(t.back, "back");
  const body = { version: 1, canvas: { width: W, height: H }, front, back };
  const bytes = Buffer.byteLength(JSON.stringify(body));
  if (bytes > MAX_DOC_BYTES) bad("The design is too large. Use smaller images.");

  const ref = db.collection("settings").doc("idTemplate");
  const prev = await ref.get();
  const revision = ((prev.exists && prev.data().revision) || 0) + 1;

  const batch = db.batch();
  batch.set(ref, { ...body, revision, updatedAt: FV.serverTimestamp(), updatedBy: caller.uid });
  batch.set(db.collection("admin_audit").doc(), {
    action: "id_template_saved", actorUid: caller.uid, actorName: caller.data.name || null, actorRole: "super_admin",
    revision, bytes, frontElements: front.elements.length, backElements: back.elements.length,
    at: FV.serverTimestamp(),
  });
  await batch.commit();
  return { ok: true, revision, bytes };
});
