// functions/applications.js
//
// Assisted sign-up, reworked for the local OSCA registry. NO account is created at the desk any
// more. The flow is:
//
//   1. submitAssistedApplication     (admin / kiosk session) form + scanned documents
//                                    -> senior_applications/{id}  status "pending"
//   2. verifyApplication             (super_admin, Senior Records) checks the documents, reserves the
//                                    OSCA number (typed by OSCA)                  status "verified"  (or "rejected")
//   3. createAccountFromApplication  (super_admin, User Management) confirmation step: creates the
//                                    login + user + senior_records + digital ID, returns the login
//                                    details ONCE                 status "account_created"
//
// The desk screen only ever shows "waiting for verification" and a reference code. Login details
// exist only after step 3 and are shown in User Management.

const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { resolveBarangay } = require("./barangays");
const { referenceCode } = require("./referenceCode");
const { issueDigitalIdForUser } = require("./digitalId");
const { claimNumber, DOC_TYPES } = require("./seniorRecord");

const REGION = { region: "asia-southeast1" };
const db = () => admin.firestore();
const FV = () => admin.firestore.FieldValue;
const clean = (v) => String(v || "").trim().replace(/\s+/g, " ");
const idToEmail = (id) => `${String(id).trim().replace(/[^a-z0-9]/gi, "").toLowerCase()}@scia.app`;
const tempPassword = () => crypto.randomBytes(4).toString("hex").toUpperCase().slice(0, 4) + (1000 + crypto.randomInt(9000));

// ── who may submit: a signed-in admin, or the kiosk session an admin started ────────────────
async function resolveSubmitter(request, sessionToken) {
  if (request.auth) {
    const snap = await db().collection("admins").doc(request.auth.uid).get();
    const a = snap.exists ? snap.data() : null;
    if (a && ["super_admin", "sub_admin"].includes(a.role) && a.locked !== true) {
      return { uid: request.auth.uid, role: a.role, barangay: a.barangay || null, sessionRef: null };
    }
  }
  if (typeof sessionToken !== "string" || !/^[A-Za-z0-9_-]{40,64}$/.test(sessionToken)) {
    throw new HttpsError("permission-denied", "This sign-up session is not valid. Please ask the staff to start it again.");
  }
  const ref = db().collection("assisted_sessions").doc(crypto.createHash("sha256").update(sessionToken).digest("hex"));
  const snap = await ref.get();
  const ses = snap.exists ? snap.data() : null;
  if (!ses || ses.revoked || !ses.expiresAt || ses.expiresAt.toMillis() < Date.now()) {
    throw new HttpsError("failed-precondition", "This sign-up session has ended. Please ask the staff to start it again.");
  }
  const a = await db().collection("admins").doc(ses.adminUid).get();
  if (!a.exists || !["super_admin", "sub_admin"].includes(a.data().role)) {
    throw new HttpsError("permission-denied", "Your admin role cannot create accounts.");
  }
  return { uid: ses.adminUid, role: a.data().role, barangay: a.data().barangay || null, sessionRef: ref, session: ses };
}

async function requireSuper(auth) {
  if (!auth) throw new HttpsError("unauthenticated", "Sign in as an OSCA staff account first.");
  const snap = await db().collection("admins").doc(auth.uid).get();
  if (!snap.exists || snap.data().role !== "super_admin" || snap.data().locked === true) {
    throw new HttpsError("permission-denied", "Only OSCA (super admin) can do this.");
  }
  return { uid: auth.uid, name: snap.data().name || (auth.token && auth.token.email) || auth.uid };
}

// Same character rules as the form and the old createAssistedAccountCore.
function validateForm(data, who) {
  const d = data || {};
  const first = clean(d.firstName), mid = clean(d.midName), last = clean(d.lastName);
  const street = clean(d.street), phone = clean(d.conNumber), gender = d.gender, dob = String(d.dob || "");
  const gName = clean(d.guardianName), gPhone = clean(d.guardianPhone), gRel = clean(d.guardianRelation);
  const NAME_OK = /^\p{L}[\p{L}\p{M}\s.'-]{0,49}$/u;
  const ADDR_OK = /^[\p{L}\p{N}][\p{L}\p{N}\s.,#'/-]{0,79}$/u;
  const PH_OK = /^(09\d{9}|\+639\d{9})$/;
  if (!first || !mid || !last || !street || !phone || !gender || !dob) throw new HttpsError("invalid-argument", "Please fill in all required fields.");
  if (![first, mid, last].every((n) => NAME_OK.test(n))) throw new HttpsError("invalid-argument", "Names may only contain letters, spaces and . ' -");
  if (!ADDR_OK.test(street)) throw new HttpsError("invalid-argument", "The address contains characters that are not allowed.");
  if (!PH_OK.test(phone)) throw new HttpsError("invalid-argument", "Enter a valid PH mobile number, e.g. 09171234567.");
  if (gender !== "Male" && gender !== "Female") throw new HttpsError("invalid-argument", "Gender must be Male or Female.");
  if (!gName || !gPhone) throw new HttpsError("invalid-argument", "Please provide the guardian/relative's name and contact number.");
  if (!NAME_OK.test(gName) || (gRel && !NAME_OK.test(gRel))) throw new HttpsError("invalid-argument", "The guardian name and relationship may only contain letters.");
  if (!PH_OK.test(gPhone)) throw new HttpsError("invalid-argument", "Enter a valid PH mobile number for the guardian.");
  const dobDate = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(dobDate.getTime()) || (Date.now() - dobDate.getTime()) / 31557600000 < 60) {
    throw new HttpsError("invalid-argument", "The senior must be at least 60 years old.");
  }
  const forced = who.role === "sub_admin" && who.barangay ? who.barangay : null;
  const resolved = resolveBarangay(forced || d.barangay);
  if (!resolved && !forced) throw new HttpsError("invalid-argument", "Please choose the senior's district and barangay.");
  const barangay = forced || resolved.name;
  return {
    firstName: first, midName: mid, lastName: last, street, conNumber: phone, gender, dob,
    barangay, district: resolved ? resolved.district : null,
    address: `${street}, Brgy. ${barangay}, Valenzuela City`,
    guardians: [{ name: gName, phone: gPhone.replace(/[\s-]/g, ""), ...(gRel ? { relationship: gRel } : {}) }],
  };
}

function validateImages(list) {
  const imgs = (Array.isArray(list) ? list : []).slice(0, 3);
  if (imgs.length === 0) throw new HttpsError("invalid-argument", "Add at least one photo: a valid ID or the birth certificate.");
  return imgs.map((i) => {
    const b64 = String((i && i.imageBase64) || "").replace(/^data:image\/jpeg;base64,/, "");
    if (b64.length > 700000 || !/^[A-Za-z0-9+/=]+$/.test(b64) || !b64.startsWith("/9j/")) {
      throw new HttpsError("invalid-argument", "A photo is not a valid, small enough JPEG. Please retake it.");
    }
    const type = DOC_TYPES.includes(i && i.type) ? i.type : null;
    return { kind: i && i.kind === "document" ? "document" : "id", type, imageBase64: b64 };
  });
}

// ── 1. desk submits the application ─────────────────────────────────────────────────────────
exports.submitAssistedApplication = onCall(REGION, async (request) => {
  const { sessionToken, documents, ...form } = request.data || {};
  const who = await resolveSubmitter(request, sessionToken);
  const clientData = validateForm(form, who);
  const images = validateImages(documents);

  if (who.sessionRef) {          // same per-session cap as before
    await db().runTransaction(async (tx) => {
      const f = (await tx.get(who.sessionRef)).data();
      if ((f.uses || 0) >= (f.maxUses || 0)) throw new HttpsError("resource-exhausted", "This sign-up session has reached its limit. Please ask the staff to start it again.");
      tx.update(who.sessionRef, { uses: (f.uses || 0) + 1, lastUsedAt: FV().serverTimestamp() });
    });
  }
  try {
    const ref = db().collection("senior_applications").doc();
    const batch = db().batch();
    batch.set(ref, {
      ...clientData, status: "pending", source: "assisted_signup",
      documentCount: images.length, documentKinds: images.map((i) => i.kind),
      createdAt: FV().serverTimestamp(), createdByAdminUid: who.uid, createdInBarangay: who.barangay,
    });
    images.forEach((img, i) => batch.set(ref.collection("documents").doc(String(i)), { ...img, uploadedAt: FV().serverTimestamp() }));
    await batch.commit();
    return { applicationId: ref.id, reference: referenceCode(ref.id) };
  } catch (e) {
    if (who.sessionRef) await who.sessionRef.update({ uses: FV().increment(-1) }).catch(() => {});
    logger.error("submitAssistedApplication:", e.message);
    throw new HttpsError("internal", "Could not save the application. Please try again.");
  }
});

// ── 2. OSCA verifies the documents (Senior Records) ─────────────────────────────────────────
exports.verifyApplication = onCall(REGION, async ({ auth, data }) => {
  const staff = await requireSuper(auth);
  const id = String((data && data.applicationId) || "");
  const action = String((data && data.action) || "approve");
  const note = clean(data && data.note).slice(0, 500);
  if (!id) throw new HttpsError("invalid-argument", "Missing application.");
  const ref = db().collection("senior_applications").doc(id);

  if (action === "reject") {
    if (note.length < 5) throw new HttpsError("invalid-argument", "Please write the reason for rejecting (at least 5 characters).");
    await db().runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists || s.data().status !== "pending") throw new HttpsError("failed-precondition", "This application is no longer pending.");
      tx.update(ref, { status: "rejected", rejectReason: note, reviewedBy: staff.uid, reviewerName: staff.name, reviewedAt: FV().serverTimestamp() });
    });
    return { ok: true, status: "rejected" };
  }

  const docs = (Array.isArray(data && data.documents) ? data.documents : [])
    .map((d) => ({ type: String((d && d.type) || ""), number: clean(d && d.number).slice(0, 40) }))
    .filter((d) => DOC_TYPES.includes(d.type));
  if (docs.length === 0) throw new HttpsError("invalid-argument", "Record at least one primary ID or a birth certificate.");
  if (docs.find((d) => d.type !== "birth_certificate" && d.number.length < 4)) {
    throw new HttpsError("invalid-argument", "Enter the ID number of each government ID you checked.");
  }
  const out = await db().runTransaction(async (tx) => {
    const app = await tx.get(ref);
    if (!app.exists || app.data().status !== "pending") throw new HttpsError("failed-precondition", "This application is no longer pending.");
    // OSCA types the number by hand; it is checked for duplicates, not auto-assigned.
    const recordNo = await claimNumber(tx, data && data.recordNo, { excludeAppId: id });
    tx.update(ref, {
      status: "verified", recordNo,
      verification: { documents: docs, note: note || null, verifiedBy: staff.uid, verifiedByName: staff.name },
      reviewedBy: staff.uid, reviewerName: staff.name, reviewedAt: FV().serverTimestamp(),
    });
    tx.set(db().collection("admin_audit").doc(), {
      action: "application_verified", actorUid: staff.uid, actorName: staff.name, actorRole: "super_admin",
      targetRef: referenceCode(id), recordNo, docTypes: docs.map((d) => d.type), at: FV().serverTimestamp(),
    });
    return { recordNo };
  });
  return { ok: true, status: "verified", ...out };
});

// ── 3. OSCA confirms account creation (User Management) ─────────────────────────────────────
exports.createAccountFromApplication = onCall(REGION, async ({ auth, data }) => {
  const staff = await requireSuper(auth);
  const id = String((data && data.applicationId) || "");
  if (!id) throw new HttpsError("invalid-argument", "Missing application.");
  const ref = db().collection("senior_applications").doc(id);

  // Guard against a double click / two staff: flip verified -> creating first.
  const a = await db().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists || s.data().status !== "verified") throw new HttpsError("failed-precondition", "This application is not waiting for account creation.");
    tx.update(ref, { status: "creating" });
    return s.data();
  });
  const revert = () => ref.update({ status: "verified" }).catch(() => {});

  const recordNo = a.recordNo;
  const password = tempPassword();
  let userRecord;
  try {
    userRecord = await admin.auth().createUser({ email: idToEmail(recordNo), password, displayName: `${a.firstName} ${a.lastName}` });
  } catch (e) {
    await revert();
    if (e.code === "auth/email-already-exists") throw new HttpsError("already-exists", "An account with that OSCA number already exists.");
    logger.error("createAccountFromApplication auth:", e.message);
    throw new HttpsError("internal", "Failed to create the account. Please try again.");
  }
  const uid = userRecord.uid;
  const now = FV().serverTimestamp();
  try {
    const fullName = [a.firstName, a.midName, a.lastName].join(" ");
    const batch = db().batch();
    batch.set(db().collection("users").doc(uid), {
      firstName: a.firstName, midName: a.midName, lastName: a.lastName,
      district: a.district, barangay: a.barangay, street: a.street, address: a.address,
      conNumber: a.conNumber, gender: a.gender, dob: a.dob, guardians: a.guardians,
      idNumber: recordNo, hasTempId: false, status: "ACTIVE", isVerified: true, verifiedAt: now,
      role: "SENIOR_CITIZEN", uid, createdAt: now,
      createdByAdmin: true, createdByAdminUid: a.createdByAdminUid, createdInBarangay: a.createdInBarangay || null,
      applicationId: id, reviewedBy: a.reviewedBy, reviewerName: a.reviewerName, reviewedAt: a.reviewedAt, reviewDecision: "approved",
    });
    batch.set(db().collection("senior_records").doc(uid), {
      uid, recordNo, status: "active", fullName, dob: a.dob, sex: a.gender, address: a.address, barangay: a.barangay,
      verification: { ...(a.verification || {}), applicationId: id }, issuedAt: now, qrValue: recordNo, printCount: 0, source: "assisted_signup",
    });
    const keys = [...new Set([recordNo, a.conNumber, fullName.toLowerCase().replace(/\s+/g, "_"), `${a.firstName} ${a.lastName}`.toLowerCase().replace(/\s+/g, "_")])];
    keys.forEach((k) => batch.set(db().collection("user_lookup").doc(k), { idNumber: recordNo, uid }));
    batch.update(ref, { status: "account_created", uid, accountCreatedAt: now, accountCreatedBy: staff.uid });
    batch.set(db().collection("admin_audit").doc(), {
      action: "application_account_created", actorUid: staff.uid, actorName: staff.name, actorRole: "super_admin",
      targetUid: uid, targetRef: referenceCode(id), recordNo, at: now,
    });
    await batch.commit();
  } catch (e) {
    await admin.auth().deleteUser(uid).catch(() => {});   // no orphan login
    await revert();
    logger.error("createAccountFromApplication write:", e.message);
    throw new HttpsError("internal", "Could not finish creating the account. Nothing was created; please try again.");
  }
  let digital = false;
  try { digital = !!(await issueDigitalIdForUser(uid, { issuedBy: staff.uid })).ok; } catch (e) { /* OSCA can issue it from Digital ID */ }

  // The ONLY time the temporary password is visible: it is never stored.
  return { ok: true, uid, idNumber: recordNo, tempPassword: password, digitalIdIssued: digital };
});
