// requestMissingRequirements: OSCA / barangay staff tell a senior which ID or documents are
// still missing, and whether to send them in the app or bring them in person.
//
//  - writes /notifications/{id} (type "missing_requirements") so it shows in the app's home bell
//  - keeps the open list on users/{uid}.missingRequirements so the app can show a checklist
//  - writes an admin_audit entry (a reference code, never the senior's name)
//
// A senior can't write any of this (see firestore.rules): only this function can.
// onSeniorDocumentSubmitted ticks an item off when the senior uploads that document in the app.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const { resolveBarangay } = require("./barangays");
const { referenceCode } = require("./referenceCode");

const KINDS = ["id", "birth_certificate", "barangay_certificate", "other"];
const METHODS = ["app", "in_person", "either"];

const LABEL = {
  id: { en: "Valid ID", tl: "Valid ID" },
  birth_certificate: { en: "Birth certificate", tl: "Birth certificate" },
  barangay_certificate: { en: "Barangay certificate", tl: "Barangay certificate" },
};
const HOW = {
  app: { en: "send a photo in the app", tl: "ipadala ang litrato sa app" },
  in_person: { en: "bring it in person to the OSCA office", tl: "dalhin nang personal sa OSCA office" },
  either: { en: "send a photo in the app or bring it in person", tl: "ipadala ang litrato sa app o dalhin nang personal" },
};

const nameOf = (it, lang) => (it.kind === "other" ? it.label : LABEL[it.kind][lang]);

function clean(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 6) {
    throw new HttpsError("invalid-argument", "Choose 1 to 6 missing requirements.");
  }
  const seen = new Set();
  return items.map((raw) => {
    const kind = String((raw && raw.kind) || "");
    const method = String((raw && raw.method) || "either");
    if (!KINDS.includes(kind)) throw new HttpsError("invalid-argument", "Unknown requirement.");
    if (!METHODS.includes(method)) throw new HttpsError("invalid-argument", "Unknown way of submitting.");
    const label = String((raw && raw.label) || "").trim().slice(0, 80);
    if (kind === "other" && label.length < 2) throw new HttpsError("invalid-argument", "Name the other requirement.");
    const key = kind === "other" ? `other:${label.toLowerCase()}` : kind;
    if (seen.has(key)) throw new HttpsError("invalid-argument", "The same requirement is listed twice.");
    seen.add(key);
    // "other" has no upload slot in the app, so it is always in person.
    return { kind, label: kind === "other" ? label : null, method: kind === "other" ? "in_person" : method, submitted: false };
  });
}

function message(items, note, lang) {
  const lines = items.map((it) => `${nameOf(it, lang)}: ${HOW[it.method][lang]}`);
  const head = lang === "tl"
    ? "May kulang pang requirements ang iyong SCIA account."
    : "Your SCIA account still needs some requirements.";
  return `${head} ${lines.join("; ")}.${note ? ` ${lang === "tl" ? "Paalala" : "Note"}: ${note}` : ""}`;
}

exports.requestMissingRequirements = onCall({ region: "asia-southeast1" }, async (request) => {
  const { auth, data } = request;
  if (!auth) throw new HttpsError("unauthenticated", "Sign in as an OSCA staff account first.");

  const db = admin.firestore();
  const FV = admin.firestore.FieldValue;

  const staffSnap = await db.collection("admins").doc(auth.uid).get();
  const staff = staffSnap.exists ? staffSnap.data() : null;
  if (!staff || !["super_admin", "sub_admin"].includes(staff.role)) {
    throw new HttpsError("permission-denied", "Only OSCA or barangay staff can notify a senior.");
  }
  const actorName = staff.name || (auth.token && auth.token.email) || auth.uid;

  const uid = String((data && data.uid) || "");
  const action = String((data && data.action) || "request");
  if (!uid) throw new HttpsError("invalid-argument", "Missing senior.");
  if (!["request", "clear"].includes(action)) throw new HttpsError("invalid-argument", "Unknown action.");

  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "That account no longer exists.");
  const u = snap.data();

  // A barangay sub_admin only works with seniors of their own barangay.
  if (staff.role === "sub_admin" && staff.barangay) {
    const mine = (resolveBarangay(staff.barangay) || {}).name || String(staff.barangay).trim();
    const theirs = (resolveBarangay(u.barangay) || {}).name || String(u.barangay || "").trim();
    if (mine.toLowerCase() !== theirs.toLowerCase()) {
      throw new HttpsError("permission-denied", "This senior belongs to another barangay.");
    }
  }

  const audit = {
    actorUid: auth.uid, actorName, actorRole: staff.role,
    targetUid: uid, targetRef: referenceCode(uid), at: FV.serverTimestamp(),
  };

  if (action === "clear") {
    const batch = db.batch();
    batch.update(ref, { missingRequirements: FV.delete() });
    batch.set(db.collection("admin_audit").doc(), { ...audit, action: "requirements_cleared" });
    await batch.commit();
    return { ok: true };
  }

  const items = clean(data && data.items);
  const note = String((data && data.note) || "").trim().slice(0, 300);
  const anyApp = items.some((i) => i.method !== "in_person");
  const notifId = `missing_${uid}_${Date.now()}`;

  const batch = db.batch();
  batch.update(ref, {
    missingRequirements: {
      items, note: note || null, open: true,
      requestedAt: FV.serverTimestamp(), requestedBy: auth.uid, requestedByName: actorName,
    },
  });
  batch.set(db.collection("notifications").doc(notifId), {
    uid,
    type: "missing_requirements",
    title: "May kulang na requirements",
    titleEn: "Missing requirements",
    body: message(items, note, "tl"),
    bodyEn: message(items, note, "en"),
    link: anyApp ? "/screen/missing-docs" : null,
    read: false,
    createdAt: FV.serverTimestamp(),
  });
  batch.set(db.collection("admin_audit").doc(), {
    ...audit, action: "requirements_requested",
    items: items.map((i) => `${i.kind}:${i.method}`), note: note || null,
  });
  await batch.commit();
  return { ok: true, count: items.length };
});

// When the senior uploads a document in the app, mark the matching item as submitted so staff
// see it was received. Staff still review the photo in Senior Records as usual.
exports.onSeniorDocumentSubmitted = onDocumentCreated(
  { document: "senior_documents/{docId}", region: "asia-southeast1" },
  async (event) => {
    const d = event.data && event.data.data();
    if (!d || !d.uid) return;
    const db = admin.firestore();
    const ref = db.collection("users").doc(d.uid);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const mr = snap.exists && snap.data().missingRequirements;
      if (!mr || !mr.open || !Array.isArray(mr.items)) return;
      let changed = false;
      const items = mr.items.map((it) => {
        if (it.kind === d.kind && !it.submitted && it.method !== "in_person") {
          changed = true;
          return { ...it, submitted: true };
        }
        return it;
      });
      if (!changed) return;
      tx.update(ref, { "missingRequirements.items": items });
      tx.set(db.collection("admin_notifications").doc(`docs_${event.params.docId}`), {
        type: "requirement_submitted",
        targetUid: d.uid,
        targetRef: referenceCode(d.uid),
        kind: d.kind,
        title: "A senior sent a requested document",
        body: `${referenceCode(d.uid)} sent: ${LABEL[d.kind] ? LABEL[d.kind].en : d.kind}. Open Senior Records to review it.`,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
  },
);
