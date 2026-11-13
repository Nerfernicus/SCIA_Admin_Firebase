// functions/seniorRecord.js
//
// OSCA Valenzuela LOCAL registry. No NCSC call anywhere: OSCA is the source of truth.
//
//   verifyAndIssueSeniorRecord  (super_admin) verify a PENDING senior against a primary
//       government ID and/or birth certificate, then claim the 6-digit OSCA
//       number that OSCA typed (checked unique, never auto-assigned) in ONE transaction, write senior_records/{uid}, mark the
//       user verified, set users.idNumber = record number, write an audit entry, and
//       issue the digital ID.
//   lookupSeniorRecord          (sub_admin / super_admin) resolve a scanned QR / barcode
//       value to the live record, so a forged or revoked card never validates.
//   revokeSeniorRecord          (super_admin) mark a record revoked (lost card, deceased,
//       fraud). The record number is never reused.

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { checkEligibility } = require("./eligibility");
const { resolveBarangay } = require("./barangays");
const { referenceCode } = require("./referenceCode");
const { issueDigitalIdForUser } = require("./digitalId");

const REGION = { region: "asia-southeast1" };
const db = () => admin.firestore();

// Accepted proof of identity / age (business rule 2).
const PRIMARY_ID_TYPES = [
  "philsys", "sss", "gsis", "drivers_license", "voters_id", "passport",
];
const DOC_TYPES = [...PRIMARY_ID_TYPES, "birth_certificate"];

// Record number: the plain 6-digit OSCA number (000001, 000002, ...). One global counter, so a
// number is never reused. Numbers already taken by a legacy account are skipped (see below).
const RECORD_RE = /^\d{6}$/;
const formatRecordNo = (n) => String(n).padStart(6, "0");

// Next free OSCA number at or after counter+1. Skips numbers a legacy account already uses
// (as idNumber or as a login key) so a new record can never overwrite someone's login.
// MUST be called before any write in the transaction.
async function allocateNumber(tx, cntSnap) {
  let next = (cntSnap.exists && cntSnap.data().next) || 0;
  for (let i = 0; i < 50; i++) {
    next += 1;
    if (next > 999999) break;
    const cand = formatRecordNo(next);
    const [lk, used] = await Promise.all([
      tx.get(db().collection("user_lookup").doc(cand)),
      tx.get(db().collection("users").where("idNumber", "==", cand).limit(1)),
    ]);
    if (!lk.exists && used.empty) return { recordNo: cand, next };
  }
  throw new HttpsError("resource-exhausted", "Could not find a free OSCA number. Try again.");
}

// Manual OSCA number: the OSCA admin types the number (6 digits, same as the card). It must not
// belong to any other account, record (revoked ones included, a number is never reused), lookup
// key or already-verified application. MUST be called before any write in the transaction.
async function claimNumber(tx, raw, { excludeAppId } = {}) {
  const recordNo = String(raw || "").trim();
  if (!RECORD_RE.test(recordNo)) {
    throw new HttpsError("invalid-argument", "Enter the 6-digit OSCA ID number (for example 000123).");
  }
  const [lk, used, rec, apps] = await Promise.all([
    tx.get(db().collection("user_lookup").doc(recordNo)),
    tx.get(db().collection("users").where("idNumber", "==", recordNo).limit(1)),
    tx.get(db().collection("senior_records").where("recordNo", "==", recordNo).limit(1)),
    tx.get(db().collection("senior_applications").where("recordNo", "==", recordNo).limit(5)),
  ]);
  const heldByApp = apps.docs.some((d) => d.id !== excludeAppId
    && ["verified", "creating", "account_created"].includes(d.data().status));
  if (lk.exists || !used.empty || !rec.empty || heldByApp) {
    throw new HttpsError("already-exists", `OSCA No. ${recordNo} is already used by another senior.`);
  }
  return recordNo;
}

async function requireStaff(auth, roles) {
  if (!auth) throw new HttpsError("unauthenticated", "Sign in as an OSCA staff account first.");
  const snap = await db().collection("admins").doc(auth.uid).get();
  if (!snap.exists || !roles.includes(snap.data().role) || snap.data().locked === true) {
    throw new HttpsError("permission-denied", "You are not allowed to do this.");
  }
  return { uid: auth.uid, ...snap.data(), name: snap.data().name || (auth.token && auth.token.email) || auth.uid };
}

exports.verifyAndIssueSeniorRecord = onCall(REGION, async ({ auth, data }) => {
  const staff = await requireStaff(auth, ["super_admin"]);
  const FV = admin.firestore.FieldValue;

  const uid = String((data && data.uid) || "");
  const documents = Array.isArray(data && data.documents) ? data.documents : [];
  const note = String((data && data.note) || "").trim().slice(0, 500);
  if (!uid) throw new HttpsError("invalid-argument", "Missing senior.");

  // Clean the submitted proof. Need a primary ID and/or a birth certificate.
  const docs = documents.map((d) => ({
    type: String(d && d.type || ""),
    number: String(d && d.number || "").trim().slice(0, 40),
  })).filter((d) => DOC_TYPES.includes(d.type));
  if (docs.length === 0) {
    throw new HttpsError("invalid-argument", "Record at least one primary ID or a birth certificate.");
  }
  const needsNumber = docs.find((d) => d.type !== "birth_certificate" && d.number.length < 4);
  if (needsNumber) throw new HttpsError("invalid-argument", "Enter the ID number of each government ID you checked.");

  const userRef = db().collection("users").doc(uid);
  const recordRef = db().collection("senior_records").doc(uid);

  // Server-side eligibility (age 60+, Valenzuela resident). ID-photo / duplicate-number
  // OSCA issues the number itself, so there is no card-number or duplicate-ID check.
  const userSnap = await userRef.get();
  if (!userSnap.exists) throw new HttpsError("not-found", "That account no longer exists.");
  const u = userSnap.data();
  const elig = checkEligibility(u, { hasIdPhoto: true, duplicateCount: 0, resolveBarangay });
  const hard = elig.items.filter((i) => !i.ok && i.hard && ["age", "address"].includes(i.key));
  if (hard.length) {
    throw new HttpsError("failed-precondition",
      `Cannot issue: ${hard.map((i) => (i.key === "age" ? "senior is under 60" : "address is not in Valenzuela")).join(", ")}.`);
  }
  const ageItem = elig.items.find((i) => i.key === "age");
  if (ageItem && !ageItem.ok && note.length < 5) {
    throw new HttpsError("invalid-argument", "Birthday is unclear. Write what you checked on the ID before issuing.");
  }

  const result = await db().runTransaction(async (tx) => {
    const [rec, usr] = await Promise.all([tx.get(recordRef), tx.get(userRef)]);
    if (rec.exists) {
      if (rec.data().status === "revoked") throw new HttpsError("failed-precondition", "This record was revoked. Review it before re-issuing.");
      return { recordNo: rec.data().recordNo, created: false };
    }
    const status = String(usr.data().status || "PENDING").toUpperCase();
    if (!["PENDING", "REJECTED"].includes(status)) {
      throw new HttpsError("failed-precondition", `This account is already ${status.toLowerCase()}.`);
    }
    const recordNo = await claimNumber(tx, data && data.recordNo);

    tx.create(recordRef, {
      uid,
      recordNo,
      status: "active",
      fullName: [u.firstName, u.midName, u.lastName].filter(Boolean).join(" "),
      dob: u.dob || "",
      sex: u.gender || "",
      address: u.address || "",
      barangay: u.barangay || "",
      verification: { documents: docs, note: note || null, verifiedBy: staff.uid, verifiedByName: staff.name },
      issuedAt: FV.serverTimestamp(),
      qrValue: recordNo,           // the scanner sends this to lookupSeniorRecord
      printCount: 0,
      source: "osca_valenzuela_local",
    });
    // Login: the Auth email is built from the SIGN-UP id (TEMP######), not the record number.
    // This lookup lets the senior type VAL-OSCA-... on the login screen (key = lower-case, same
    // normalisation the app uses) and still resolve to the real sign-up id. Admin SDK bypasses rules.
    const signupId = String(usr.data().idNumber || "").trim();
    if (signupId && signupId !== recordNo) {
      tx.set(db().collection("user_lookup").doc(recordNo.toLowerCase()), { idNumber: signupId, uid });
    }
    tx.update(userRef, {
      status: "ACTIVE", isVerified: true, verifiedAt: FV.serverTimestamp(),
      idNumber: recordNo, hasTempId: false,
      reviewDecision: "approved", reviewReason: note || null, rejectionReason: FV.delete(),
      reviewedBy: staff.uid, reviewerName: staff.name, reviewedAt: FV.serverTimestamp(),
    });
    tx.set(db().collection("admin_audit").doc(), {
      action: "senior_record_issued", actorUid: staff.uid, actorName: staff.name, actorRole: "super_admin",
      targetUid: uid, targetRef: referenceCode(uid), recordNo,
      docTypes: docs.map((d) => d.type), reason: note || null,
      before: status, after: "ACTIVE", at: FV.serverTimestamp(),
    });
    return { recordNo, created: true };
  });

  // Digital ID is derived from the record just written. A failure here must not undo the issue.
  let digital = null;
  try { digital = await issueDigitalIdForUser(uid, { issuedBy: staff.uid }); } catch (e) { digital = { ok: false }; }

  return { ok: true, ...result, digitalIdIssued: !!(digital && digital.ok) };
});

exports.lookupSeniorRecord = onCall(REGION, async ({ auth, data }) => {
  await requireStaff(auth, ["sub_admin", "super_admin"]);
  const code = String((data && data.code) || "").trim().toUpperCase();
  if (!RECORD_RE.test(code)) throw new HttpsError("invalid-argument", "Enter the 6-digit OSCA number.");
  const q = await db().collection("senior_records").where("recordNo", "==", code).limit(1).get();
  if (q.empty) return { found: false };
  const r = q.docs[0].data();
  return {
    found: true, valid: r.status === "active", status: r.status, recordNo: r.recordNo,
    fullName: r.fullName, barangay: r.barangay, dob: r.dob, sex: r.sex,
    issuedAt: r.issuedAt ? r.issuedAt.toMillis() : null,
  };
});

exports.revokeSeniorRecord = onCall(REGION, async ({ auth, data }) => {
  const staff = await requireStaff(auth, ["super_admin"]);
  const uid = String((data && data.uid) || "");
  const reason = String((data && data.reason) || "").trim().slice(0, 500);
  if (!uid || reason.length < 5) throw new HttpsError("invalid-argument", "Give the senior and a reason (5+ characters).");
  const FV = admin.firestore.FieldValue;
  const ref = db().collection("senior_records").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "No record for this senior.");
  const batch = db().batch();
  batch.update(ref, { status: "revoked", revokedAt: FV.serverTimestamp(), revokedBy: staff.uid, revokeReason: reason });
  batch.set(db().collection("digital_ids").doc(uid), { status: "invalidated" }, { merge: true });
  batch.set(db().collection("admin_audit").doc(), {
    action: "senior_record_revoked", actorUid: staff.uid, actorName: staff.name, actorRole: "super_admin",
    targetUid: uid, targetRef: referenceCode(uid), recordNo: snap.data().recordNo, reason, at: FV.serverTimestamp(),
  });
  await batch.commit();
  return { ok: true };
});

// Printing is logged so reprints of a card are traceable.
exports.logSeniorIdPrint = onCall(REGION, async ({ auth, data }) => {
  await requireStaff(auth, ["super_admin"]);
  const uid = String((data && data.uid) || "");
  if (!uid) throw new HttpsError("invalid-argument", "Missing senior.");
  await db().collection("senior_records").doc(uid).update({
    printCount: admin.firestore.FieldValue.increment(1),
    lastPrintedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { ok: true };
});

// ── One-time import of accounts OSCA already verified before this registry existed ──────────
// A senior with a clean 6-digit number KEEPS it (their printed card stays valid). Anyone else
// (TEMP id, odd format, duplicate of another account) gets a new number and a login lookup.
async function migrateOne(uid, staff) {
  const FV = admin.firestore.FieldValue;
  const userRef = db().collection("users").doc(uid);
  const recordRef = db().collection("senior_records").doc(uid);
  const counterRef = db().collection("counters").doc("senior_records");
  const digitalRef = db().collection("digital_ids").doc(uid);

  return db().runTransaction(async (tx) => {
    const [usr, rec, cnt, dig] = await Promise.all([tx.get(userRef), tx.get(recordRef), tx.get(counterRef), tx.get(digitalRef)]);
    if (!usr.exists) return { uid, result: "skipped", why: "missing" };
    if (rec.exists) return { uid, result: "skipped", why: "already_in_registry" };
    const u = usr.data();
    if (u.isVerified !== true) return { uid, result: "skipped", why: "not_verified" };
    if (String(u.status || "").toUpperCase() === "SUSPENDED") return { uid, result: "skipped", why: "deactivated" };

    const legacy = String(u.idNumber || "").trim();
    let recordNo = null;
    let kept = false;
    if (/^\d{6}$/.test(legacy)) {
      const [r2, u2] = await Promise.all([
        tx.get(db().collection("senior_records").where("recordNo", "==", legacy).limit(1)),
        tx.get(db().collection("users").where("idNumber", "==", legacy).limit(3)),
      ]);
      if (r2.empty && u2.docs.every((d) => d.id === uid)) { recordNo = legacy; kept = true; }
    }
    let next = null;
    if (!recordNo) ({ recordNo, next } = await allocateNumber(tx, cnt));
    const lookupRef = db().collection("user_lookup").doc(recordNo);
    const lookup = kept ? await tx.get(lookupRef) : null;

    // ── writes ──
    if (next !== null) tx.set(counterRef, { next }, { merge: true });
    tx.create(recordRef, {
      uid, recordNo, status: "active",
      fullName: [u.firstName, u.midName, u.lastName].filter(Boolean).join(" "),
      dob: u.dob || "", sex: u.gender || "", address: u.address || "", barangay: u.barangay || "",
      verification: { documents: [], note: "Migrated from an account OSCA verified before the local registry.",
        verifiedBy: staff.uid, verifiedByName: staff.name, migrated: true },
      issuedAt: u.verifiedAt || FV.serverTimestamp(), migratedAt: FV.serverTimestamp(),
      qrValue: recordNo, printCount: 0, source: "legacy_migration",
    });
    if (!kept) {
      if (legacy) tx.set(lookupRef, { idNumber: legacy, uid });   // login by the new number still reaches the sign-up id
      tx.update(userRef, { idNumber: recordNo, hasTempId: false, legacyIdNumber: legacy || FV.delete() });
      if (dig.exists) tx.update(digitalRef, { idNumber: recordNo, controlNumber: recordNo });
    } else if (lookup && !lookup.exists) {
      tx.set(lookupRef, { idNumber: legacy, uid });
    }
    tx.set(db().collection("admin_audit").doc(), {
      action: "senior_record_migrated", actorUid: staff.uid, actorName: staff.name, actorRole: "super_admin",
      targetUid: uid, targetRef: referenceCode(uid), recordNo, keptLegacyNumber: kept, at: FV.serverTimestamp(),
    });
    return { uid, result: "imported", recordNo, kept };
  });
}

exports.migrateLegacySeniors = onCall(REGION, async ({ auth, data }) => {
  const staff = await requireStaff(auth, ["super_admin"]);
  const uids = [...new Set((Array.isArray(data && data.uids) ? data.uids : []).map(String))].slice(0, 25);
  if (uids.length === 0) throw new HttpsError("invalid-argument", "No accounts given.");
  const results = [];
  for (const uid of uids) {           // one at a time: each import takes the next free number
    try { results.push(await migrateOne(uid, staff)); }
    catch (e) { results.push({ uid, result: "error", why: e.message || "failed" }); }
  }
  return { ok: true, results };
});

// Internal helper for functions/applications.js (not re-exported from functions.js, so not deployed).
exports.allocateNumber = allocateNumber;
exports.claimNumber = claimNumber;
exports.DOC_TYPES = DOC_TYPES;
