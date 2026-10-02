// functions/digitalId.js
//
// Issues digital_ids/{uid} for a VERIFIED senior. Two ways in, one code path:
//
//   1. The senior taps "Claim" in the mobile app. The app writes
//      digital_id_requests/{uid} = { status: "requested" } (the only thing the
//      rules let a senior write) and onDigitalIdRequested issues the ID, then
//      writes the outcome back onto that request ("issued" | "denied" plus a
//      message the app shows). digital_ids stays server-written, so a senior can
//      never mint or edit their own ID.
//
//   2. OSCA presses "Issue" on the Digital IDs page, which calls issueDigitalId
//      (super_admin only) for a verified senior who has no digital ID yet.
//
// The document it writes has the same shape approveIdVerification writes, and
// it is the data behind BOTH the web card (src/components/Oscaidcard.jsx) and
// the mobile card (components/DigitalIDCard.tsx in the app repo): name, address,
// date of birth, sex, date issued, photo and control number.

const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const db = () => admin.firestore();

const normalizeIdNumber = (v) => String(v || "").trim().replace(/\s+/g, " ");

const fail = (code, message) => ({ ok: false, created: false, code, message });

/**
 * Issue (or confirm) the digital ID for one senior.
 * @returns {Promise<{ok: boolean, created: boolean, code?: string, message?: string}>}
 */
async function issueDigitalIdForUser(uid, { issuedBy = null } = {}) {
  if (!uid) return fail("no_account", "No account was given.");

  const FV = admin.firestore.FieldValue;
  const userSnap = await db().collection("users").doc(uid).get();
  if (!userSnap.exists) return fail("no_account", "Your account could not be found.");
  const u = userSnap.data();

  if (u.isVerified !== true) {
    return fail("not_verified", "Your account is not verified yet. OSCA must verify your Senior Citizen ID first.");
  }
  if (String(u.status || "").toUpperCase() === "SUSPENDED") {
    return fail("suspended", "This account is deactivated. Please contact OSCA.");
  }

  // The digital ID mirrors the physical card, whose control number is the real
  // OSCA ID number, so a temporary TEMP###### number is not enough.
  const idNumber = normalizeIdNumber(u.idNumber);
  if (!idNumber || u.hasTempId === true || /^TEMP/i.test(idNumber)) {
    return fail("no_osca_id", "OSCA has not assigned your official ID number yet. Please try again once your physical ID is ready.");
  }

  const digitalRef = db().collection("digital_ids").doc(uid);
  const existing = await digitalRef.get();
  if (existing.exists) {
    if (existing.data().status === "invalidated") {
      return fail("invalidated", "Your digital ID was deactivated by OSCA. Please contact them.");
    }
    return { ok: true, created: false };
  }

  // Use the ID photo OSCA verified, when there is one.
  let verification = null;
  try {
    const vSnap = await db().collection("id_verifications")
      .where("uid", "==", uid).where("status", "==", "approved").get();
    const docs = vSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (b.reviewedAt?.toMillis?.() || 0) - (a.reviewedAt?.toMillis?.() || 0));
    verification = docs[0] || null;
  } catch (e) {
    logger.warn(`issueDigitalId ${uid}: could not read id_verifications:`, e.message);
  }
  const v = verification || {};

  const fullName = v.fullName || v.seniorName ||
    [u.firstName, u.midName, u.lastName].filter(Boolean).join(" ");

  const digitalDoc = {
    uid,
    fullName,
    firstName: v.firstName || u.firstName || "",
    middleName: v.middleName || u.midName || "",
    lastName: v.lastName || v.surname || u.lastName || "",
    dob: v.dob || v.dateOfBirth || u.dob || "",
    sex: v.sex || u.gender || "",
    address: v.address || u.address || "",
    barangay: v.barangay || u.barangay || "",
    email: v.email || u.email || "",
    idNumber,
    controlNumber: idNumber,
    idImageUrl: v.idImageUrl || "",
    status: "active",
    isVerified: true,
    releasedAt: FV.serverTimestamp(),
    createdAt: FV.serverTimestamp(),
    issuedVia: issuedBy ? "admin" : "claim",
  };
  if (verification) digitalDoc.sourceDocId = verification.id;
  if (issuedBy) digitalDoc.verifiedBy = issuedBy;
  if (u.photoURL) digitalDoc.photoURL = u.photoURL;
  // base64 uploads are copied only if they fit comfortably under Firestore's 1 MB doc limit
  if (!v.idImageUrl && v.imageBase64 && v.imageBase64.length < 600000) {
    digitalDoc.idImageBase64 = v.imageBase64;
  }

  try {
    await digitalRef.create(digitalDoc); // fails if two requests race: the loser is fine
  } catch (e) {
    if (e.code === 6 || /already exists/i.test(e.message || "")) return { ok: true, created: false };
    logger.error(`issueDigitalId ${uid}: write failed:`, e.message);
    return fail("error", "Something went wrong while creating your digital ID. Please try again.");
  }
  return { ok: true, created: true };
}

// ── 1. The senior's "Claim" tap ────────────────────────────────────────────
exports.onDigitalIdRequested = onDocumentWritten(
  "digital_id_requests/{uid}",
  async (event) => {
    const after = event.data && event.data.after && event.data.after.exists
      ? event.data.after.data() : null;
    // Only a fresh request. The result we write back is "issued"/"denied",
    // which also stops this function from triggering itself.
    if (!after || after.status !== "requested") return;

    const uid = event.params.uid;
    let result;
    try {
      result = await issueDigitalIdForUser(uid);
    } catch (e) {
      logger.error(`onDigitalIdRequested ${uid}:`, e);
      result = fail("error", "Something went wrong while creating your digital ID. Please try again.");
    }

    await event.data.after.ref.set({
      status: result.ok ? "issued" : "denied",
      code: result.ok ? (result.created ? "created" : "already_issued") : result.code,
      message: result.ok ? "" : result.message,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  },
);

// ── 2. OSCA issues one directly from the dashboard ─────────────────────────
exports.issueDigitalId = onCall(
  { region: "asia-southeast1" },
  async (request) => {
    const { auth: callerAuth, data } = request;
    if (!callerAuth) throw new HttpsError("unauthenticated", "Sign in as an admin first.");

    const adminSnap = await db().collection("admins").doc(callerAuth.uid).get();
    if (!adminSnap.exists || adminSnap.data().role !== "super_admin") {
      throw new HttpsError("permission-denied", "Only OSCA (super admin) can issue digital IDs.");
    }

    const uid = data && data.uid;
    if (!uid) throw new HttpsError("invalid-argument", "Missing the senior's account.");

    const result = await issueDigitalIdForUser(uid, { issuedBy: callerAuth.uid });
    if (!result.ok) throw new HttpsError("failed-precondition", result.message);
    return { ok: true, uid, created: result.created };
  },
);

exports.issueDigitalIdForUser = issueDigitalIdForUser;
