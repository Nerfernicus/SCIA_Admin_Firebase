// functions/index.js
//
// FIX: package.json's "main" points at "functions.js", which only exports
// ncscVerify. That meant createAssistedSeniorAccount and the ID-request
// notification trigger — both defined elsewhere — were never actually
// deployed, on Spark or Blaze. This file is now the single real entry
// point: change functions/package.json's "main" to "index.js" (see note
// at the bottom of this file) and this exports everything correctly.
//
// Now that you're on Blaze, all three deploy normally with:
//   cd functions && firebase deploy --only functions

const { setGlobalOptions } = require("firebase-functions");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const fetch = require("node-fetch");
const cheerio = require("cheerio");
const { resolveBarangay } = require("./barangays");
const admin = require("firebase-admin");

setGlobalOptions({ maxInstances: 10 });
admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();

// ── ncscVerify — using the more complete/current field mapping from the
// old functions.js (verified against a live NCSC site inspection, per its
// original comments), not the older copy that used to live in this file. ──
const NCSC_PAGE = "https://www.ncsc.gov.ph/registration-verification";
const NCSC_SEARCH = "https://www.ncsc.gov.ph/search";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Connection: "keep-alive",
};

function extractCookies(response) {
  const cookies = [];
  if (typeof response.headers.raw === "function") {
    const raw = response.headers.raw()["set-cookie"] || [];
    raw.forEach((c) => cookies.push(c.split(";")[0].trim()));
  } else {
    response.headers.forEach((value, name) => {
      if (name.toLowerCase() === "set-cookie") cookies.push(value.split(";")[0].trim());
    });
  }
  return cookies.filter(Boolean).join("; ");
}

function normalizeMonth(month) {
  if (!month) return "";
  const str = String(month).trim();
  if (/^\d+$/.test(str)) return str;
  const names = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  const idx = names.findIndex((n) => str.toLowerCase().startsWith(n));
  return idx >= 0 ? String(idx + 1) : str;
}

exports.ncscVerify = onCall(
  { timeoutSeconds: 45, memory: "256MiB", region: "asia-southeast1" },
  async (request) => {
    const {
      lastName = "", firstName = "", middleName = "",
      month = "", day = "", year = "", nameExtension = "",
    } = request.data;

    if (!lastName || !firstName) return { found: false, error: "missing_name" };

    try {
      let homeRes;
      try {
        homeRes = await fetch(NCSC_PAGE, { method: "GET", headers: BROWSER_HEADERS, redirect: "follow", timeout: 15000 });
      } catch (err) {
        logger.warn("NCSC GET failed:", err.message);
        return { error: "ncsc_unreachable" };
      }
      if (!homeRes.ok) return { error: "ncsc_unreachable" };

      const cookieHeader = extractCookies(homeRes);
      const homeHtml = await homeRes.text();
      const $home = cheerio.load(homeHtml);
      const csrfToken =
        $home('input[name="_token"]').val() ||
        $home('input[name="csrf_token"]').val() ||
        $home('meta[name="csrf-token"]').attr("content") ||
        $home('input[name="__RequestVerificationToken"]').val() || "";

      const form = new URLSearchParams();
      form.append("lastname", lastName.trim().toUpperCase());
      form.append("firstname", firstName.trim().toUpperCase());
      form.append("middlename", middleName.trim().toUpperCase());
      form.append("collection_comp-lfsde647", nameExtension.trim().toUpperCase());
      const monthNum = normalizeMonth(month);
      if (monthNum) form.append("collection_comp-leny5jqs", monthNum);
      const dayNum = String(day).trim().replace(/^0+/, "") || "";
      if (dayNum) form.append("collection_comp-leny7vd9", dayNum);
      if (year) form.append("enter-year", String(year).trim());
      if (csrfToken) form.append("_token", csrfToken);

      let searchRes;
      try {
        searchRes = await fetch(NCSC_SEARCH, {
          method: "POST",
          headers: { ...BROWSER_HEADERS, "Content-Type": "application/x-www-form-urlencoded", Referer: NCSC_PAGE, Origin: "https://www.ncsc.gov.ph", Cookie: cookieHeader },
          body: form.toString(), redirect: "follow", timeout: 20000,
        });
      } catch (err) {
        logger.warn("NCSC POST failed:", err.message);
        return { error: "ncsc_unreachable" };
      }
      if (!searchRes.ok) return { error: "ncsc_unreachable" };

      const resultHtml = await searchRes.text();
      const $result = cheerio.load(resultHtml);
      $result("script, style, noscript").remove();
      const bodyText = $result("body").text().replace(/\s+/g, " ").toLowerCase().trim();

      const FOUND_SIGNALS = ["is a registered senior citizen","registered senior citizen","found in our records","result(s) found","results found","1 record","osca id","registered"];
      const NOT_FOUND_SIGNALS = ["no record found","no records found","not found in our records","not registered","no result","0 record","0 result","no matching","sorry, we could not find","no data found","cannot be found"];

      const signalsFound = FOUND_SIGNALS.some((s) => bodyText.includes(s));
      const signalsNotFound = NOT_FOUND_SIGNALS.some((s) => bodyText.includes(s));
      const resultRows = $result("table tbody tr").filter((_, el) => {
        const txt = $result(el).text().trim().toLowerCase();
        return txt.length > 2 && !txt.includes("no data") && !txt.includes("no record");
      }).length;

      if (signalsNotFound && !signalsFound && resultRows === 0) return { found: false };
      if (signalsFound || resultRows > 0) return { found: true };
      return { found: false };
    } catch (err) {
      logger.error("NCSC unexpected error:", err.message);
      return { error: "ncsc_unreachable" };
    }
  }
);

// ── createAssistedSeniorAccount — unchanged logic, now actually deployed ──
function idToEmail(idNumber) {
  const cleaned = idNumber.trim().replace(/[^a-z0-9]/gi, "").toLowerCase();
  return `${cleaned}@scia.app`;
}

function generateTempPassword() {
  return Math.random().toString(36).slice(-4).toUpperCase() + Math.floor(1000 + Math.random() * 9000);
}

// NCSC progress the admin can record on the sign-up form. "registered" means
// the senior already holds an OSCA ID (the admin typed its number); it is
// stored as "completed_claimed" so it shows up under "Needs review" on the
// NCSC Registrations page. verified / rejected stay reserved for that review.
const NCSC_ALLOWED = ["started", "cancelled", "completed_claimed", "registered"];

// Everything that actually validates and creates an assisted senior account.
// Shared by the signed-in admin callable and by the kiosk-session callable
// (the sign-up tab that stays usable after the admin has logged out).
// `caller*` always describes the ADMIN the sign-up is recorded under.
async function createAssistedAccountCore({ data, callerUid, callerRole, callerBarangay }) {
  const {
    firstName, midName, lastName, street, conNumber, gender, dob, idNumber,
    barangay: submittedBarangay, ncscStatus,
    guardianName, guardianPhone, guardianRelation,
    idPhotoBase64, idPhotoLater,
  } = data || {};
  const clean = (v) => String(v || "").trim().replace(/\s+/g, " ");
  const first = clean(firstName);
  const mid = clean(midName);
  const last = clean(lastName);
  const streetClean = clean(street);
  const phone = clean(conNumber);
  const guardianNameClean = clean(guardianName);
  const guardianPhoneClean = clean(guardianPhone);

  if (!first || !mid || !last || !streetClean || !phone || !gender || !dob) {
    throw new HttpsError("invalid-argument", "Please fill in all required fields.");
  }
  // Same character rules as the admin form (src/lib/validators.js), enforced
  // again here so a hand-made request cannot store bad data.
  const NAME_OK = /^\p{L}[\p{L}\p{M}\s.'-]{0,49}$/u;
  const ADDR_OK = /^[\p{L}\p{N}][\p{L}\p{N}\s.,#'/-]{0,79}$/u;
  const PH_OK = /^(09\d{9}|\+639\d{9})$/;
  if (![first, mid, last].every((n) => NAME_OK.test(n))) {
    throw new HttpsError("invalid-argument", "Names may only contain letters, spaces and . ' -");
  }
  if (!ADDR_OK.test(streetClean) || (clean(data.block) && !ADDR_OK.test(clean(data.block)))) {
    throw new HttpsError("invalid-argument", "The address contains characters that are not allowed.");
  }
  if (!PH_OK.test(phone)) {
    throw new HttpsError("invalid-argument", "Enter a valid PH mobile number, e.g. 09171234567.");
  }
  if (gender !== "Male" && gender !== "Female") {
    throw new HttpsError("invalid-argument", "Gender must be Male or Female.");
  }
  if ((guardianNameClean && !NAME_OK.test(guardianNameClean)) || (clean(guardianRelation) && !NAME_OK.test(clean(guardianRelation)))) {
    throw new HttpsError("invalid-argument", "The guardian name and relationship may only contain letters.");
  }
  if (idNumber && !/^[A-Za-z0-9-]{4,20}$/.test(String(idNumber).trim())) {
    throw new HttpsError("invalid-argument", "The ID number may only contain letters, numbers and dashes.");
  }
  const dobDate = new Date(`${String(dob)}T00:00:00`);
  if (Number.isNaN(dobDate.getTime()) || (Date.now() - dobDate.getTime()) / 31557600000 < 60) {
    throw new HttpsError("invalid-argument", "The senior must be at least 60 years old.");
  }

  // Required (same as the mobile app's sign-up) so the inactivity alert always
  // has someone to text.
  if (!guardianNameClean || !guardianPhoneClean) {
    throw new HttpsError("invalid-argument", "Please provide the guardian/relative's name and contact number.");
  }
  if (!/^(09\d{9}|\+639\d{9})$/.test(guardianPhoneClean)) {
    throw new HttpsError("invalid-argument", "Please enter a valid PH mobile number for the guardian, e.g. 09171234567.");
  }

  // A barangay-scoped sub_admin can only register seniors in THEIR OWN
  // barangay — the client can never pick another one for them. Everyone
  // else (super admin, or a sub_admin with no barangay) must pick a real one.
  const forcedBarangay = callerRole === "sub_admin" && callerBarangay ? callerBarangay : null;
  const resolved = resolveBarangay(forcedBarangay || submittedBarangay);
  if (!resolved && !forcedBarangay) {
    throw new HttpsError("invalid-argument", "Please choose the senior's district and barangay.");
  }
  const effectiveBarangay = forcedBarangay || resolved.name;
  const district = resolved ? resolved.district : null;
  const address = `${streetClean}, Brgy. ${effectiveBarangay}, Valenzuela City`;

  const effectiveIdNumber = idNumber && String(idNumber).trim().length > 0
    ? String(idNumber).trim()
    : `TEMP${Math.floor(100000 + Math.random() * 900000)}`;
  if (ncscStatus === "registered" && effectiveIdNumber.startsWith("TEMP")) {
    throw new HttpsError("invalid-argument", "An OSCA ID number is required for a senior who is already registered.");
  }

  // A senior who says they already have a physical OSCA ID must either have the
  // card photographed now (it goes to OSCA's verification queue) or promise to
  // send the photo from the app later (the account then stays unverified).
  // Checked before anything is created so a bad request leaves no orphan account.
  let idPhoto = null;
  let idPhotoMode = null; // "now" | "later"
  if (ncscStatus === "registered") {
    if (idPhotoBase64) {
      idPhoto = String(idPhotoBase64).replace(/^data:image\/jpeg;base64,/, "");
      // Same ceiling as the mobile app (lib/idImage.ts); a Firestore doc is capped at 1 MiB.
      if (idPhoto.length > 700000 || !/^[A-Za-z0-9+/=]+$/.test(idPhoto) || !idPhoto.startsWith("/9j/")) {
        throw new HttpsError("invalid-argument", "The ID photo is not a valid, small enough JPEG. Please retake it.");
      }
      idPhotoMode = "now";
    } else if (idPhotoLater === true) {
      idPhotoMode = "later";
    } else {
      throw new HttpsError("invalid-argument", "Take a photo of the senior's OSCA ID, or choose that they will send it later from the app.");
    }
  }

  const email = idToEmail(effectiveIdNumber);
  const tempPassword = generateTempPassword();

  let userRecord;
  try {
    userRecord = await auth.createUser({ email, password: tempPassword, displayName: `${first} ${last}` });
  } catch (err) {
    if (err.code === "auth/email-already-exists") throw new HttpsError("already-exists", "An account with that ID number already exists.");
    logger.error("createAssistedSeniorAccount auth error:", err.message);
    throw new HttpsError("internal", "Failed to create the account. Please try again.");
  }

  const uid = userRecord.uid;
  const now = admin.firestore.FieldValue.serverTimestamp();

  // Same users/{uid} shape the mobile app's registerUser() writes
  // (district / barangay / street / address), plus an assisted-signup audit trail.
  await db.collection("users").doc(uid).set({
    firstName: first, midName: mid, lastName: last,
    district, barangay: effectiveBarangay, street: streetClean, address,
    conNumber: phone, gender, dob,
    idNumber: effectiveIdNumber, hasTempId: effectiveIdNumber.startsWith("TEMP"),
    // Same shape the mobile app's Account screen and the inactivity monitor use.
    guardians: [{
      name: guardianNameClean,
      phone: guardianPhoneClean.replace(/[\s-]/g, ""),
      ...(clean(guardianRelation) ? { relationship: clean(guardianRelation) } : {}),
    }],
    status: "PENDING", isVerified: false,
    role: "SENIOR_CITIZEN", uid,
    createdAt: now,
    createdByAdmin: true, createdByAdminUid: callerUid, createdInBarangay: callerBarangay,
  });

  const fullName = `${first} ${mid} ${last}`.toLowerCase().replace(/\s+/g, "_");
  const firstLast = `${first} ${last}`.toLowerCase().replace(/\s+/g, "_");
  const lookupKeys = [...new Set([effectiveIdNumber.toLowerCase(), phone, fullName, firstLast])];
  await Promise.all(lookupKeys.map((key) => db.collection("user_lookup").doc(key).set({ idNumber: effectiveIdNumber, uid })));

  // Record the NCSC progress captured on the form. Done here with the Admin
  // SDK because Firestore rules only let a senior create their own doc. The
  // account already exists at this point, so a failure is reported back
  // (ncscRecorded: false) instead of failing the whole sign-up.
  let ncscRecorded = null;
  if (NCSC_ALLOWED.includes(ncscStatus)) {
    const alreadyRegistered = ncscStatus === "registered";
    const status = alreadyRegistered ? "completed_claimed" : ncscStatus;
    try {
      await db.collection("ncsc_registrations").doc(uid).set({
        uid, status,
        barangay: effectiveBarangay,
        fullName: `${first} ${mid} ${last}`,
        source: "assisted_signup",
        createdByAdminUid: callerUid,
        startedAt: now, updatedAt: now,
        ...(alreadyRegistered ? { alreadyRegistered: true, idNumber: effectiveIdNumber } : {}),
        ...(status === "cancelled" ? { cancelledAt: now } : {}),
        ...(status === "completed_claimed" ? { claimedAt: now } : {}),
      });
      ncscRecorded = true;
    } catch (err) {
      logger.error("createAssistedSeniorAccount ncsc write failed:", err.message);
      ncscRecorded = false;
    }
  }

  // Photo of the physical card taken at the desk: queue it on OSCA's ID Management
  // page exactly like the app's sign-up / "Verify My OSCA ID" does. The account stays
  // PENDING / not verified until OSCA approves it. With "later" nothing is queued
  // and the account stays unverified until the senior sends the photo from the app.
  let idPhotoResult = idPhotoMode === "later" ? "later" : null;
  if (idPhotoMode === "now") {
    try {
      await db.collection("id_verifications").add({
        uid,
        idNumber: effectiveIdNumber,
        imageBase64: idPhoto,
        fullName: `${first} ${mid} ${last}`,
        barangay: effectiveBarangay,
        address, dob,
        sex: gender,
        contactNumber: phone,
        status: "pending",
        submittedAt: now,
        source: "assisted_signup",
        submittedByAdminUid: callerUid,
      });
      idPhotoResult = "submitted";
    } catch (err) {
      // The account exists already; the senior can still send the photo from the app.
      logger.error("createAssistedSeniorAccount id photo write failed:", err.message);
      idPhotoResult = "failed";
    }
  }

  // The ONLY time the temp password is ever visible — it is never stored.
  return { uid, idNumber: effectiveIdNumber, tempPassword, ncscRecorded, idPhoto: idPhotoResult };
}

exports.createAssistedSeniorAccount = onCall(
  { region: "asia-southeast1" },
  async (request) => {
    const { auth: callerAuth, data } = request;
    if (!callerAuth) throw new HttpsError("unauthenticated", "You must be signed in as an admin to do this.");

    const adminSnap = await db.collection("admins").doc(callerAuth.uid).get();
    if (!adminSnap.exists) throw new HttpsError("permission-denied", "Your account is not registered as an admin.");
    const adminInfo = adminSnap.data();
    const callerRole = adminInfo.role;
    const callerBarangay = adminInfo.barangay || null;
    if (callerRole !== "super_admin" && callerRole !== "sub_admin") {
      throw new HttpsError("permission-denied", "Your admin role cannot create accounts.");
    }

    return createAssistedAccountCore({ data, callerUid: callerAuth.uid, callerRole, callerBarangay });
  }
);

// ── Assisted sign-up "kiosk" sessions ─────────────────────────────────────
// The admin opens the sign-up form in a NEW tab and is logged out of the
// dashboard, so a senior using that PC cannot reach any admin page. The form
// still has to be recorded under that admin, so before logging out the admin
// asks for a short-lived session token:
//   startAssistedSession   (signed-in admin)  -> returns the token once
//   getAssistedSession     (token only)       -> tells the form what is allowed
//   createAssistedSeniorAccountWithSession (token only) -> creates the account
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
    // Same rule as createAssistedAccountCore: only a barangay sub_admin is locked.
    const lockedBarangay = session.role === "sub_admin" && session.barangay ? session.barangay : null;
    return {
      valid: true,
      lockedBarangay,
      expiresAt: session.expiresAt.toMillis(),
      remaining: Math.max(0, (session.maxUses || 0) - (session.uses || 0)),
    };
  }
);

exports.createAssistedSeniorAccountWithSession = onCall(
  { region: "asia-southeast1" },
  async (request) => {
    const { sessionToken, ...formData } = request.data || {};
    const { ref, session, adminNow } = await loadKioskSession(sessionToken);

    // Reserve one sign-up atomically so parallel requests cannot pass the cap.
    await db.runTransaction(async (tx) => {
      const fresh = (await tx.get(ref)).data();
      if ((fresh.uses || 0) >= (fresh.maxUses || 0)) {
        throw new HttpsError("resource-exhausted", "This sign-up session has reached its limit. Please ask the staff to start it again.");
      }
      tx.update(ref, { uses: (fresh.uses || 0) + 1, lastUsedAt: admin.firestore.FieldValue.serverTimestamp() });
    });

    try {
      // Role/barangay come from the admin's CURRENT record, never from the form.
      return await createAssistedAccountCore({
        data: formData,
        callerUid: session.adminUid,
        callerRole: adminNow.role,
        callerBarangay: adminNow.barangay,
      });
    } catch (err) {
      // Nothing was created (validation or duplicate ID), so give the slot back.
      await ref.update({ uses: admin.firestore.FieldValue.increment(-1) }).catch(() => {});
      throw err;
    }
  }
);

// ── approveIdVerification ─────────────────────────────────────────────────
// One atomic "Verify" for a senior's uploaded physical ID (super_admin only).
// Replaces the old client-side approve, which also wrote a phantom
// released_ids doc. In a single call it:
//   1. marks id_verifications/{id} approved (keeps the first reviewedAt on re-runs)
//   2. counts the senior in ncsc_registrations/{uid} as verified, with the
//      time the senior submitted the ID and the time it was approved
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
      const [ncscSnap, digitalSnap, lookupSnap] = await Promise.all([
        db.collection("ncsc_registrations").doc(uid).get(),
        db.collection("digital_ids").doc(uid).get(),
        db.collection("user_lookup").where("uid", "==", uid).get(),
      ]);
      const ncsc = ncscSnap.exists ? ncscSnap.data() : {};
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

      // 3. NCSC registration count: when the senior sent it, and when it was approved
      batch.set(db.collection("ncsc_registrations").doc(uid), {
        uid, fullName, barangay,
        status: "verified",
        source: ncsc.source || "id_verification",
        verifiedVia: "osca_id_upload",
        idVerificationId: verificationId,
        idNumber: cardId,
        submittedAt: v.submittedAt || ncsc.submittedAt || null,
        startedAt: ncsc.startedAt || v.submittedAt || FV.serverTimestamp(),
        verifiedAt: ncsc.verifiedAt || FV.serverTimestamp(),
        reviewedBy: callerAuth.uid,
        reviewedAt: ncsc.verifiedAt || FV.serverTimestamp(),
        updatedAt: FV.serverTimestamp(),
      }, { merge: true });

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
// Also keeps digital_ids / ncsc_registrations in step if they exist.
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
      const [lookupSnap, digitalSnap, ncscSnap] = await Promise.all([
        db.collection("user_lookup").where("uid", "==", uid).get(),
        db.collection("digital_ids").doc(uid).get(),
        db.collection("ncsc_registrations").doc(uid).get(),
      ]);

      const batch = db.batch();
      const userUpdate = { idNumber: newId, hasTempId: false };
      if (idChanged && oldId) userUpdate.previousIdNumber = oldId;
      if (idChanged && wasTemporary) userUpdate.tempIdReplacedAt = FV.serverTimestamp();
      batch.update(userRef, userUpdate);

      lookupSnap.docs.forEach((d) => batch.update(d.ref, { idNumber: newId }));
      batch.set(db.collection("user_lookup").doc(newId.toLowerCase()), { idNumber: newId, uid });
      if (digitalSnap.exists) batch.update(digitalSnap.ref, { idNumber: newId, controlNumber: newId });
      if (ncscSnap.exists) batch.update(ncscSnap.ref, { idNumber: newId, updatedAt: FV.serverTimestamp() });

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

// Digital ID: senior taps "Claim" in the app -> onDigitalIdRequested issues it;
// issueDigitalId is the OSCA dashboard's "Issue" button. See digitalId.js.
exports.onDigitalIdRequested = require("./digitalId").onDigitalIdRequested;
exports.issueDigitalId = require("./digitalId").issueDigitalId;

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
