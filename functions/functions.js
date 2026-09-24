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
