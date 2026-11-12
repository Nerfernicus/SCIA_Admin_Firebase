// functions/functions.js: the single entry point (package.json "main"). Local OSCA Valenzuela
// registry; there is no NCSC integration anywhere.

const { setGlobalOptions } = require("firebase-functions");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { resolveBarangay } = require("./barangays");
const admin = require("firebase-admin");

setGlobalOptions({ maxInstances: 10 });
admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();

// OSCA Valenzuela is the local registry: no NCSC lookup anywhere.

// ── createAssistedSeniorAccount — unchanged logic, now actually deployed ──
function idToEmail(idNumber) {
  const cleaned = idNumber.trim().replace(/[^a-z0-9]/gi, "").toLowerCase();
  return `${cleaned}@scia.app`;
}

// ── Assisted sign-up "kiosk" sessions ─────────────────────────────────────
// The admin opens the sign-up form in a NEW tab and is logged out of the
// dashboard, so a senior using that PC cannot reach any admin page. The form
// still has to be recorded under that admin, so before logging out the admin
// asks for a short-lived session token:
//   startAssistedSession   (signed-in admin)  -> returns the token once
//   getAssistedSession     (token only)       -> tells the form what is allowed
//   submitAssistedApplication  (token only) -> sends the application for OSCA verification
// Only a SHA-256 hash of the token is stored (assisted_sessions/{hash}), and the
// collection has no Firestore rules, so browsers can never read or list it.
// A session can only create seniors, is locked to the admin's barangay (for a
// barangay sub_admin), expires after KIOSK_TTL_MS, and stops after
// KIOSK_MAX_SIGNUPS accounts.
const crypto = require("crypto");
const KIOSK_TTL_MS = 10 * 60 * 60 * 1000; // 10 hours
const KIOSK_MAX_SIGNUPS = 150;
const KIOSK_COLLECTION = "assisted_sessions";
const hashKioskToken = (t) => crypto.createHash("sha256").update(String(t || "")).digest("hex");

async function requireAssistedAdmin(uid) {
  const snap = await db.collection("admins").doc(uid).get();
  if (!snap.exists) throw new HttpsError("permission-denied", "Your account is not registered as an admin.");
  const info = snap.data();
  if (info.role !== "super_admin" && info.role !== "sub_admin") {
    throw new HttpsError("permission-denied", "Your admin role cannot create accounts.");
  }
  return { role: info.role, barangay: info.barangay || null, name: info.name || info.email || "" };
}

async function loadKioskSession(token) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{40,64}$/.test(token)) {
    throw new HttpsError("permission-denied", "This sign-up session is not valid. Please ask the staff to start it again.");
  }
  const ref = db.collection(KIOSK_COLLECTION).doc(hashKioskToken(token));
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("permission-denied", "This sign-up session is not valid. Please ask the staff to start it again.");
  }
  const session = snap.data();
  const expired = !session.expiresAt || session.expiresAt.toMillis() < Date.now();
  if (session.revoked || expired) {
    throw new HttpsError("failed-precondition", "This sign-up session has ended. Please ask the staff to start it again.");
  }
  // The admin may have been removed or demoted since the session started.
  const adminNow = await requireAssistedAdmin(session.adminUid);
  return { ref, session, adminNow };
}

exports.startAssistedSession = onCall(
  { region: "asia-southeast1" },
  async (request) => {
    const { auth: callerAuth } = request;
    if (!callerAuth) throw new HttpsError("unauthenticated", "You must be signed in as an admin to do this.");
    const adminNow = await requireAssistedAdmin(callerAuth.uid);

    // One live session per admin: starting a new one ends the old ones.
    const old = await db.collection(KIOSK_COLLECTION)
      .where("adminUid", "==", callerAuth.uid).where("revoked", "==", false).get();
    const batch = db.batch();
    old.forEach((d) => batch.update(d.ref, { revoked: true, revokedAt: admin.firestore.FieldValue.serverTimestamp() }));

    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAtMs = Date.now() + KIOSK_TTL_MS;
    batch.set(db.collection(KIOSK_COLLECTION).doc(hashKioskToken(token)), {
      adminUid: callerAuth.uid,
      adminName: adminNow.name,
      role: adminNow.role,
      barangay: adminNow.barangay,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromMillis(expiresAtMs),
      maxUses: KIOSK_MAX_SIGNUPS,
      uses: 0,
      revoked: false,
    });
    await batch.commit();
    return { token, expiresAt: expiresAtMs };
  }
);

exports.getAssistedSession = onCall(
  { region: "asia-southeast1" },
  async (request) => {
    const { session } = await loadKioskSession(request.data && request.data.token);
    // Only a barangay sub_admin is locked to their barangay.
    const lockedBarangay = session.role === "sub_admin" && session.barangay ? session.barangay : null;
    return {
      valid: true,
      lockedBarangay,
      expiresAt: session.expiresAt.toMillis(),
      remaining: Math.max(0, (session.maxUses || 0) - (session.uses || 0)),
    };
  }
);

// ── approveIdVerification ─────────────────────────────────────────────────
// One atomic "Verify" for a senior's uploaded physical ID (super_admin only).
// Replaces the old client-side approve, which also wrote a phantom
// released_ids doc. In a single call it:
//   1. marks id_verifications/{id} approved (keeps the first reviewedAt on re-runs)
//   3. replaces a temporary OSCA ID (TEMP######) with the real one from the card,
//      and moves the login email + user_lookup keys over so they can still sign in
//   4. issues/refreshes digital_ids/{uid} from the uploaded ID image
// Safe to run again on an already-approved record (used to back-fill older ones).
function normalizeIdNumber(v) {
  return String(v || "").trim().replace(/\s+/g, " ");
}

exports.approveIdVerification = onCall(
  { region: "asia-southeast1" },
  async (request) => {
    const { auth: callerAuth, data } = request;
    if (!callerAuth) throw new HttpsError("unauthenticated", "Sign in as an admin first.");

    const adminSnap = await db.collection("admins").doc(callerAuth.uid).get();
    if (!adminSnap.exists || adminSnap.data().role !== "super_admin") {
      throw new HttpsError("permission-denied", "Only OSCA (super admin) can verify IDs.");
    }

    const verificationId = data && data.verificationId;
    if (!verificationId) throw new HttpsError("invalid-argument", "Missing verificationId.");

    const vRef = db.collection("id_verifications").doc(verificationId);
    const vSnap = await vRef.get();
    if (!vSnap.exists) throw new HttpsError("not-found", "That ID submission no longer exists.");
    const v = vSnap.data();
    if (v.status === "rejected") {
      throw new HttpsError("failed-precondition", "This submission was rejected. Ask the senior to submit again.");
    }

    const uid = v.uid;
    if (!uid) throw new HttpsError("failed-precondition", "This submission is not linked to a senior account.");

    const cardId = normalizeIdNumber(v.idNumber || v.seniorId);
    if (!cardId) throw new HttpsError("invalid-argument", "The submission has no OSCA ID number.");

    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) throw new HttpsError("failed-precondition", "The senior's account was not found.");
    const u = userSnap.data();

    // The same OSCA ID number must not belong to two seniors
    const dup = await db.collection("users").where("idNumber", "==", cardId).limit(3).get();
    if (dup.docs.some((d) => d.id !== uid)) {
      throw new HttpsError("already-exists", `OSCA ID ${cardId} is already used by another senior.`);
    }

    const oldId = normalizeIdNumber(u.idNumber);
    const idChanged = oldId !== cardId;
    const wasTemporary = /^TEMP/i.test(oldId);

    // Login email is derived from the ID number, so move it first (rolled back on failure)
    let oldEmail = null;
    if (idChanged) {
      try {
        const rec = await auth.getUser(uid);
        oldEmail = rec.email || null;
        await auth.updateUser(uid, { email: idToEmail(cardId) });
      } catch (err) {
        if (err.code === "auth/email-already-exists") {
          throw new HttpsError("already-exists", `OSCA ID ${cardId} is already used by another account.`);
        }
        logger.error("approveIdVerification auth error:", err.message);
        throw new HttpsError("internal", "Could not update the senior's login. Nothing was changed.");
      }
    }

    try {
      const FV = admin.firestore.FieldValue;
      const [digitalSnap, lookupSnap] = await Promise.all([
        db.collection("digital_ids").doc(uid).get(),
        db.collection("user_lookup").where("uid", "==", uid).get(),
      ]);
      const digital = digitalSnap.exists ? digitalSnap.data() : {};

      const fullName = v.fullName || v.seniorName ||
        [u.firstName, u.midName, u.lastName].filter(Boolean).join(" ");
      const barangay = v.barangay || u.barangay || "";

      const batch = db.batch();

      // 1. the submission itself
      batch.update(vRef, {
        status: "approved",
        reviewedAt: v.status === "approved" && v.reviewedAt ? v.reviewedAt : FV.serverTimestamp(),
        reviewedBy: v.reviewedBy || callerAuth.uid,
        appliedIdNumber: cardId,
      });

      // 2. the senior's account: real OSCA ID replaces the temporary one
      const userUpdate = {
        isVerified: true,
        status: "VERIFIED",
        verifiedAt: u.verifiedAt || FV.serverTimestamp(),
        idNumber: cardId,
        hasTempId: false,
      };
      if (idChanged && oldId) userUpdate.previousIdNumber = oldId;
      if (idChanged && wasTemporary) userUpdate.tempIdReplacedAt = FV.serverTimestamp();
      batch.update(userRef, userUpdate);

      // 4. digital ID built from the verified upload
      const digitalDoc = {
        uid, fullName,
        firstName: v.firstName || u.firstName || "",
        middleName: v.middleName || u.midName || "",
        lastName: v.lastName || v.surname || u.lastName || "",
        dob: v.dob || v.dateOfBirth || u.dob || "",
        sex: v.sex || u.gender || "",
        address: v.address || u.address || "",
        barangay,
        email: v.email || u.email || "",
        idNumber: cardId, controlNumber: cardId,
        idImageUrl: v.idImageUrl || "",
        status: "active", isVerified: true,
        releasedAt: digital.releasedAt || FV.serverTimestamp(),
        createdAt: digital.createdAt || FV.serverTimestamp(),
        sourceDocId: verificationId,
        verifiedBy: callerAuth.uid,
      };
      if (u.photoURL) digitalDoc.photoURL = u.photoURL;
      // base64 uploads are copied only if they fit comfortably under Firestore's 1 MB doc limit
      if (!v.idImageUrl && v.imageBase64 && v.imageBase64.length < 600000) {
        digitalDoc.idImageBase64 = v.imageBase64;
      }
      batch.set(db.collection("digital_ids").doc(uid), digitalDoc, { merge: true });

      // 5. every lookup key (old temp ID, phone, name) now resolves to the real ID
      lookupSnap.docs.forEach((d) => batch.update(d.ref, { idNumber: cardId }));
      batch.set(db.collection("user_lookup").doc(cardId.toLowerCase()), { idNumber: cardId, uid });

      await batch.commit();
    } catch (err) {
      logger.error("approveIdVerification write failed:", err.message);
      if (idChanged && oldEmail) {
        try { await auth.updateUser(uid, { email: oldEmail }); } catch (e) { logger.error("email rollback failed:", e.message); }
      }
      throw new HttpsError("internal", "Could not finish verifying. Nothing was changed, please try again.");
    }

    return { ok: true, uid, idNumber: cardId, replacedTempId: idChanged && wasTemporary };
  }
);

// ── assignOscaIdNumber ────────────────────────────────────────────────────
// Called by the OSCA page when it hands a physical ID to the barangay (the step
// where OSCA types the real OSCA ID number). Puts that number on the senior's
// account in place of the temporary TEMP###### one, and moves the login email +
// user_lookup keys with it so the senior can still sign in (with the new number).
// Also keeps digital_ids in step if they exist.
// Safe to run again with the same number (nothing changes the second time).
exports.assignOscaIdNumber = onCall(
  { region: "asia-southeast1" },
  async (request) => {
    const { auth: callerAuth, data } = request;
    if (!callerAuth) throw new HttpsError("unauthenticated", "Sign in as an admin first.");

    const adminSnap = await db.collection("admins").doc(callerAuth.uid).get();
    if (!adminSnap.exists || adminSnap.data().role !== "super_admin") {
      throw new HttpsError("permission-denied", "Only OSCA (super admin) can assign OSCA ID numbers.");
    }

    const uid = data && data.uid;
    const newId = normalizeIdNumber(data && data.idNumber);
    if (!uid) throw new HttpsError("invalid-argument", "This request is not linked to a senior account.");
    if (!newId) throw new HttpsError("invalid-argument", "Please enter the OSCA ID number.");
    if (/^TEMP/i.test(newId)) throw new HttpsError("invalid-argument", "That is a temporary ID, not a real OSCA ID number.");

    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) throw new HttpsError("failed-precondition", "The senior's account was not found.");
    const u = userSnap.data();

    const dup = await db.collection("users").where("idNumber", "==", newId).limit(3).get();
    if (dup.docs.some((d) => d.id !== uid)) {
      throw new HttpsError("already-exists", `OSCA ID ${newId} is already used by another senior.`);
    }

    const oldId = normalizeIdNumber(u.idNumber);
    const idChanged = oldId !== newId;
    const wasTemporary = /^TEMP/i.test(oldId);
    if (!idChanged && u.hasTempId !== true) {
      return { ok: true, uid, idNumber: newId, changed: false, replacedTempId: false };
    }

    // Login email comes from the ID number, so move it first (rolled back on failure).
    let oldEmail = null;
    if (idChanged) {
      try {
        const rec = await auth.getUser(uid);
        oldEmail = rec.email || null;
        await auth.updateUser(uid, { email: idToEmail(newId) });
      } catch (err) {
        if (err.code === "auth/email-already-exists") {
          throw new HttpsError("already-exists", `OSCA ID ${newId} is already used by another account.`);
        }
        logger.error("assignOscaIdNumber auth error:", err.message);
        throw new HttpsError("internal", "Could not update the senior's login. Nothing was changed.");
      }
    }

    try {
      const FV = admin.firestore.FieldValue;
      const [lookupSnap, digitalSnap] = await Promise.all([
        db.collection("user_lookup").where("uid", "==", uid).get(),
        db.collection("digital_ids").doc(uid).get(),
      ]);

      const batch = db.batch();
      const userUpdate = { idNumber: newId, hasTempId: false };
      if (idChanged && oldId) userUpdate.previousIdNumber = oldId;
      if (idChanged && wasTemporary) userUpdate.tempIdReplacedAt = FV.serverTimestamp();
      batch.update(userRef, userUpdate);

      lookupSnap.docs.forEach((d) => batch.update(d.ref, { idNumber: newId }));
      batch.set(db.collection("user_lookup").doc(newId.toLowerCase()), { idNumber: newId, uid });
      if (digitalSnap.exists) batch.update(digitalSnap.ref, { idNumber: newId, controlNumber: newId });

      await batch.commit();
    } catch (err) {
      logger.error("assignOscaIdNumber write failed:", err.message);
      if (idChanged && oldEmail) {
        try { await auth.updateUser(uid, { email: oldEmail }); } catch (e) { logger.error("email rollback failed:", e.message); }
      }
      throw new HttpsError("internal", "Could not update the OSCA ID. Nothing was changed, please try again.");
    }

    return { ok: true, uid, idNumber: newId, changed: idChanged, replacedTempId: idChanged && wasTemporary };
  }
);

// ── onIdRequestStatusChange — was defined in idRequestNotifications.js but
// never required from here (its own comment said to wire it up — this is
// that wiring). ──
exports.onIdRequestStatusChange = require("./idRequestNotifications").onIdRequestStatusChange;
exports.onIdRequestDeleted = require("./idRequestNotifications").onIdRequestDeleted;
exports.onMedicineRequestStatusChange = require("./medicineRequestNotifications").onMedicineRequestStatusChange;
exports.onAppointmentConfirmedGuardians = require("./guardianAlerts").onAppointmentConfirmedGuardians;

// City Hall pickup scheduling for physical IDs (senior picks a slot in the app,
// OSCA can move it from the dashboard). See pickup.js.
exports.bookIdPickup = require("./pickup").bookIdPickup;

// ─────────────────────────────────────────────────────────────────────────
// REQUIRED companion change — functions/package.json:
//   "main": "index.js"   ← change from "functions.js"
// Otherwise Firebase still only looks at functions.js and none of this runs.
// You can delete functions/functions.js afterward; everything it had is
// now here.

// ── Inactivity monitor (50-min "are you safe?" push, 60-min SMS to guardians + barangay) ──
exports.monitorInactivity = require("./inactivityMonitor").monitorInactivity;
exports.onEmergencyCreated = require("./sosRouting").onEmergencyCreated;
exports.health = require("./health").health;

// Digital ID: senior taps "Claim" in the app -> onDigitalIdRequested issues it;
// issueDigitalId is the OSCA dashboard's "Issue" button. See digitalId.js.
exports.onDigitalIdRequested = require("./digitalId").onDigitalIdRequested;
exports.issueDigitalId = require("./digitalId").issueDigitalId;

// Natural voice for the mobile app's read-aloud feature (see textToSpeech.js).
exports.synthesizeSpeech = require("./textToSpeech").synthesizeSpeech;

// Super admin lock/unlock + password reset, and the senior Forgot Password OTP flow.
const accountControls = require("./accountControls");
exports.setAdminLock = accountControls.setAdminLock;
exports.resetUserPassword = accountControls.resetUserPassword;
exports.deactivateInactiveUser = accountControls.deactivateInactiveUser;
exports.requestPasswordResetOtp = accountControls.requestPasswordResetOtp;
exports.resetPasswordWithOtp = accountControls.resetPasswordWithOtp;


   // Tagalog voice guide: Gemini on Vertex AI, called server-side so no browser needs App Check.
const guideAI = require("./guideAI");
   exports.guideAI = guideAI.guideAI;
   

// ── Senior account review: approve / reject / flag, each with an audit record ──
exports.reviewSenior = require("./seniorReview").reviewSenior;

// ── Local OSCA Valenzuela registry (no NCSC) ───────────────────────────────
const seniorRecord = require("./seniorRecord");
exports.verifyAndIssueSeniorRecord = seniorRecord.verifyAndIssueSeniorRecord;
exports.lookupSeniorRecord = seniorRecord.lookupSeniorRecord;
exports.revokeSeniorRecord = seniorRecord.revokeSeniorRecord;
exports.logSeniorIdPrint = seniorRecord.logSeniorIdPrint;
exports.migrateLegacySeniors = seniorRecord.migrateLegacySeniors;

// ── Assisted sign-up applications (documents -> verify -> confirm account) ──
const applications = require("./applications");
exports.submitAssistedApplication = applications.submitAssistedApplication;
exports.verifyApplication = applications.verifyApplication;
exports.createAccountFromApplication = applications.createAccountFromApplication;

// ── View Senior Profile (status badges only, never document images) ──
exports.getSeniorProfile = require("./seniorProfile").getSeniorProfile;
