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

    const { firstName, midName = "", lastName, address, conNumber, gender, dob, idNumber, barangay: submittedBarangay } = data || {};
    if (!firstName || !lastName || !address || !conNumber || !gender || !dob) {
      throw new HttpsError("invalid-argument", "Please fill in all required fields.");
    }

    const effectiveBarangay = callerRole === "sub_admin" ? callerBarangay : (submittedBarangay || null);
    const effectiveIdNumber = idNumber && idNumber.trim().length > 0 ? idNumber.trim() : `TEMP${Math.floor(100000 + Math.random() * 900000)}`;
    const email = idToEmail(effectiveIdNumber);
    const tempPassword = generateTempPassword();

    let userRecord;
    try {
      userRecord = await auth.createUser({ email, password: tempPassword, displayName: `${firstName} ${lastName}` });
    } catch (err) {
      if (err.code === "auth/email-already-exists") throw new HttpsError("already-exists", "An account with that ID number already exists.");
      logger.error("createAssistedSeniorAccount auth error:", err.message);
      throw new HttpsError("internal", "Failed to create the account. Please try again.");
    }

    const uid = userRecord.uid;
    await db.collection("users").doc(uid).set({
      firstName, midName, lastName, address, conNumber, gender, dob,
      idNumber: effectiveIdNumber, status: "PENDING", isVerified: false,
      role: "SENIOR_CITIZEN", uid, barangay: effectiveBarangay,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByAdmin: true, createdByAdminUid: callerAuth.uid, createdInBarangay: callerBarangay,
    });

    const fullName = `${firstName} ${midName} ${lastName}`.trim().toLowerCase().replace(/\s+/g, "_");
    const firstLast = `${firstName} ${lastName}`.trim().toLowerCase().replace(/\s+/g, "_");
    const lookupKeys = [...new Set([effectiveIdNumber.toLowerCase(), conNumber.trim(), fullName, firstLast])];
    await Promise.all(lookupKeys.map((key) => db.collection("user_lookup").doc(key).set({ idNumber: effectiveIdNumber, uid })));

    return { uid, idNumber: effectiveIdNumber, tempPassword };
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

// ── onIdRequestStatusChange — was defined in idRequestNotifications.js but
// never required from here (its own comment said to wire it up — this is
// that wiring). ──
exports.onIdRequestStatusChange = require("./idRequestNotifications").onIdRequestStatusChange;

// ─────────────────────────────────────────────────────────────────────────
// REQUIRED companion change — functions/package.json:
//   "main": "index.js"   ← change from "functions.js"
// Otherwise Firebase still only looks at functions.js and none of this runs.
// You can delete functions/functions.js afterward; everything it had is
// now here.
