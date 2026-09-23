/**
 * Firebase Cloud Functions — index.js
 * Uses Firebase Functions v2 (matches your existing setup)
 *
 * Setup before deploying:
 *   cd functions
 *   npm install node-fetch@2 cheerio firebase-admin
 *   firebase deploy --only functions
 */

const { setGlobalOptions } = require("firebase-functions");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const fetch = require("node-fetch");
const cheerio = require("cheerio");
const admin = require("firebase-admin");

setGlobalOptions({ maxInstances: 10 });

// Only ncscVerify used to live here, and it never touched Firestore/Auth,
// so this had never been called before — needed now for
// createAssistedSeniorAccount below. Safe to call once per file like this.
admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();

const NCSC_BASE = "https://www.ncsc.gov.ph";
const NCSC_VERIFY_PAGE = "https://www.ncsc.gov.ph/verification";
const NCSC_SEARCH_URL  = "https://www.ncsc.gov.ph/verification/search";

exports.ncscVerify = onCall(
  { timeoutSeconds: 30, memory: "256MiB", region: "asia-southeast1" },
  async (request) => {
    const { lastName = "", firstName = "", middleName = "", month = "", day = "" } = request.data;

    if (!lastName || !firstName) {
      return { found: false, error: "missing_name" };
    }

    try {
      // ── Step 1: GET the verification page to grab session cookie + CSRF token ──
      const homeRes = await fetch(NCSC_VERIFY_PAGE, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "follow",
        timeout: 12000,
      });

      if (!homeRes.ok) {
        logger.warn("NCSC homepage returned", homeRes.status);
        return { error: "ncsc_unreachable" };
      }

      const homeHtml = await homeRes.text();

      // Collect session cookies
      const rawCookies = homeRes.headers.raw()["set-cookie"] || [];
      const cookieHeader = rawCookies
        .map(c => c.split(";")[0].trim())
        .filter(Boolean)
        .join("; ");

      // ── Step 2: Extract CSRF token ──
      const $home = cheerio.load(homeHtml);
      const csrfToken =
        $home('input[name="_token"]').val() ||
        $home('input[name="csrf_token"]').val() ||
        $home('meta[name="csrf-token"]').attr("content") ||
        "";

      // ── Step 3: Build and POST the search form ──
      const formBody = new URLSearchParams();
      formBody.append("last_name",   lastName.trim().toUpperCase());
      formBody.append("first_name",  firstName.trim().toUpperCase());
      formBody.append("middle_name", middleName.trim().toUpperCase());
      if (month) formBody.append("birth_month", month); // e.g. "Jan"
      if (day)   formBody.append("birth_day",   day);   // e.g. "1"
      if (csrfToken) formBody.append("_token", csrfToken);

      const searchRes = await fetch(NCSC_SEARCH_URL, {
        method: "POST",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
          "Referer": NCSC_VERIFY_PAGE,
          "Cookie": cookieHeader,
        },
        body: formBody.toString(),
        redirect: "follow",
        timeout: 15000,
      });

      if (!searchRes.ok) {
        logger.warn("NCSC search returned", searchRes.status);
        return { error: "ncsc_unreachable" };
      }

      const resultHtml = await searchRes.text();
      const $result    = cheerio.load(resultHtml);
      const bodyText   = $result("body").text().toLowerCase();

      // ── Step 4: Parse the result ──
      const FOUND_SIGNALS = [
        "registered",
        "found in our records",
        "is a registered",
        "result(s) found",
        "1 record",
        "osca id",
      ];
      const NOT_FOUND_SIGNALS = [
        "no record found",
        "not found",
        "no result",
        "not registered",
        "0 record",
        "no matching",
      ];

      const signalsFound    = FOUND_SIGNALS.some(s => bodyText.includes(s));
      const signalsNotFound = NOT_FOUND_SIGNALS.some(s => bodyText.includes(s));
      const resultRows      = $result("table tbody tr").length;

      logger.info("NCSC check result", {
        lastName, firstName, month, day,
        httpStatus: searchRes.status,
        signalsFound, signalsNotFound, resultRows,
        snippet: bodyText.substring(0, 500),
      });

      if (signalsNotFound && !signalsFound) return { found: false };
      if (signalsFound || resultRows > 0)   return { found: true  };

      // Ambiguous — conservative default
      return { found: false };

    } catch (err) {
      logger.error("NCSC fetch error:", err.message);
      return { error: "ncsc_unreachable" };
    }
  }
);

// ── Same synthetic-email pattern the mobile app uses (lib/firebase.ts
// idToEmail) — kept identical so accounts created here log in through the
// exact same mobile-app login flow with no special-casing needed there. ──
function idToEmail(idNumber) {
  const cleaned = idNumber.trim().replace(/[^a-z0-9]/gi, "").toLowerCase();
  return `${cleaned}@scia.app`;
}

// Random temp password the admin writes down / prints for the senior. Not
// meant to be memorable — just enough to get their first login; nothing in
// the mobile app currently offers a "change password" flow, so tell them
// to keep this slip somewhere safe.
function generateTempPassword() {
  return Math.random().toString(36).slice(-4).toUpperCase() +
    Math.floor(1000 + Math.random() * 9000);
}

exports.createAssistedSeniorAccount = onCall(
  { region: "asia-southeast1" },
  async (request) => {
    const { auth: callerAuth, data } = request;

    // ── 1. Caller must be signed in ──────────────────────────────────
    if (!callerAuth) {
      throw new HttpsError("unauthenticated", "You must be signed in as an admin to do this.");
    }

    // ── 2. Caller must be a real admin — looked up by UID matching the
    // admins/{uid} doc pattern your ProtectedRoute/AuthContext uses. If
    // your admin docs are keyed some other way (e.g. by email), tell me
    // and I'll adjust this lookup. ──
    const adminSnap = await db.collection("admins").doc(callerAuth.uid).get();
    if (!adminSnap.exists) {
      throw new HttpsError("permission-denied", "Your account is not registered as an admin.");
    }
    const adminInfo = adminSnap.data();
    const callerRole = adminInfo.role; // 'super_admin' | 'sub_admin'
    const callerBarangay = adminInfo.barangay || null;

    if (callerRole !== "super_admin" && callerRole !== "sub_admin") {
      throw new HttpsError("permission-denied", "Your admin role cannot create accounts.");
    }

    // ── 3. Validate the submitted form data ──────────────────────────
    const {
      firstName, midName = "", lastName, address, conNumber, gender, dob,
      idNumber, barangay: submittedBarangay,
    } = data || {};

    if (!firstName || !lastName || !address || !conNumber || !gender || !dob) {
      throw new HttpsError("invalid-argument", "Please fill in all required fields.");
    }

    // sub_admins can only create seniors in THEIR OWN barangay — never let
    // the client dictate a different one for a barangay-scoped admin.
    const effectiveBarangay = callerRole === "sub_admin" ? callerBarangay : (submittedBarangay || null);

    const effectiveIdNumber = idNumber && idNumber.trim().length > 0
      ? idNumber.trim()
      : `TEMP${Math.floor(100000 + Math.random() * 900000)}`;

    const email = idToEmail(effectiveIdNumber);
    const tempPassword = generateTempPassword();

    // ── 4. Create the Auth user (server-side — never touches the
    // admin's own browser session, unlike calling this from the client
    // SDK directly would) ──
    let userRecord;
    try {
      userRecord = await auth.createUser({
        email,
        password: tempPassword,
        displayName: `${firstName} ${lastName}`,
      });
    } catch (err) {
      if (err.code === "auth/email-already-exists") {
        throw new HttpsError("already-exists", "An account with that ID number already exists.");
      }
      logger.error("createAssistedSeniorAccount auth error:", err.message);
      throw new HttpsError("internal", "Failed to create the account. Please try again.");
    }

    const uid = userRecord.uid;

    // ── 5. Write the same users/{uid} doc shape the mobile app's
    // registerUser() writes, plus an assisted-signup audit trail ──
    await db.collection("users").doc(uid).set({
      firstName,
      midName,
      lastName,
      address,
      conNumber,
      gender,
      dob,
      idNumber: effectiveIdNumber,
      status: "PENDING",
      isVerified: false,
      role: "SENIOR_CITIZEN",
      uid,
      barangay: effectiveBarangay,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByAdmin: true,
      createdByAdminUid: callerAuth.uid,
      createdInBarangay: callerBarangay,
    });

    // ── 6. Same user_lookup keys the mobile app writes at registration,
    // so loginByIdentifier() finds this account exactly like a
    // self-registered one — by ID number, phone, full name, or
    // first+last name. ──
    const fullName = `${firstName} ${midName} ${lastName}`.trim().toLowerCase().replace(/\s+/g, "_");
    const firstLast = `${firstName} ${lastName}`.trim().toLowerCase().replace(/\s+/g, "_");
    const lookupKeys = [...new Set([
      effectiveIdNumber.toLowerCase(),
      conNumber.trim(),
      fullName,
      firstLast,
    ])];

    await Promise.all(
      lookupKeys.map((key) =>
        db.collection("user_lookup").doc(key).set({ idNumber: effectiveIdNumber, uid })
      )
    );

    // ── 7. Hand back the credentials so the admin can write/print them
    // for the senior — this is the ONLY time the temp password is ever
    // visible, it's never stored anywhere. ──
    return {
      uid,
      idNumber: effectiveIdNumber,
      tempPassword,
    };
  }
);
