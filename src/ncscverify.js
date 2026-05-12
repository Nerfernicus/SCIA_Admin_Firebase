/**
 * ncscverify.js — Firebase Cloud Function
 * Deploys as:  functions/index.js  (or import into your existing index.js)
 *
 * What it does:
 *  1. Receives { lastName, firstName, middleName, month, day } from the frontend
 *  2. POSTs to the real NCSC senior-citizen lookup at www.ncsc.gov.ph
 *  3. Parses the HTML response to check if the person is registered
 *  4. Returns { found: true/false } or { error: 'ncsc_unreachable' }
 *
 * Deploy:
 *   firebase deploy --only functions:ncscVerify
 *
 * Required packages (add to functions/package.json):
 *   "node-fetch": "^2.7.0",
 *   "cheerio": "^1.0.0"
 */

const functions  = require("firebase-functions");
const fetch      = require("node-fetch");
const cheerio    = require("cheerio");

// The NCSC verification endpoint (POST form submit)
const NCSC_URL = "https://www.ncsc.gov.ph/verification/search";

// Fallback URL if the above changes
const NCSC_BASE = "https://www.ncsc.gov.ph";

/**
 * Fetch the NCSC homepage first to grab any CSRF token / session cookie,
 * then POST the search form with the senior's details.
 */
exports.ncscVerify = functions
  .runWith({ timeoutSeconds: 30, memory: "256MB" })
  .https.onCall(async (data, context) => {
    const { lastName = "", firstName = "", middleName = "", month = "", day = "" } = data;

    if (!lastName || !firstName) {
      return { found: false, error: "missing_name" };
    }

    try {
      // ── Step 1: GET the homepage to collect session cookie + CSRF token ──
      const homeRes = await fetch(NCSC_BASE + "/verification", {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "follow",
        timeout: 12000,
      });

      if (!homeRes.ok && homeRes.status !== 200) {
        functions.logger.warn("NCSC homepage returned", homeRes.status);
        return { error: "ncsc_unreachable" };
      }

      const homeHtml  = await homeRes.text();
      const homeCookies = (homeRes.headers.get("set-cookie") || "")
        .split(",")
        .map(c => c.split(";")[0].trim())
        .filter(Boolean)
        .join("; ");

      // ── Step 2: Extract CSRF token from the form ──
      const $home = cheerio.load(homeHtml);
      // Common patterns: _token, csrf_token, authenticity_token, __RequestVerificationToken
      const csrfToken =
        $home('input[name="_token"]').val() ||
        $home('input[name="csrf_token"]').val() ||
        $home('input[name="authenticity_token"]').val() ||
        $home('meta[name="csrf-token"]').attr("content") ||
        "";

      // ── Step 3: Build form body ──
      // Field names observed on the NCSC verification page:
      //   last_name, first_name, middle_name, birth_month, birth_day
      // (Adjust if NCSC ever changes their form field names)
      const formBody = new URLSearchParams();
      formBody.append("last_name",   lastName.trim().toUpperCase());
      formBody.append("first_name",  firstName.trim().toUpperCase());
      formBody.append("middle_name", middleName.trim().toUpperCase());
      if (month) formBody.append("birth_month", month);   // e.g. "Jan"
      if (day)   formBody.append("birth_day",   day);     // e.g. "1"
      if (csrfToken) formBody.append("_token", csrfToken);

      // ── Step 4: POST the search form ──
      const searchRes = await fetch(NCSC_URL, {
        method: "POST",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: NCSC_BASE + "/verification",
          Cookie: homeCookies,
        },
        body: formBody.toString(),
        redirect: "follow",
        timeout: 15000,
      });

      if (!searchRes.ok && searchRes.status !== 200) {
        functions.logger.warn("NCSC search returned", searchRes.status);
        return { error: "ncsc_unreachable" };
      }

      const resultHtml = await searchRes.text();
      const $result    = cheerio.load(resultHtml);

      // ── Step 5: Parse the result page ──
      // The NCSC page shows a result table when found, or a "not found" / "no results" message.
      // These selectors cover the patterns seen on www.ncsc.gov.ph:
      const bodyText   = $result("body").text().toLowerCase();
      const resultText = resultHtml.toLowerCase();

      // Positive indicators — adjust if the site wording changes
      const FOUND_SIGNALS = [
        "registered",
        "found in our records",
        "is a registered",
        "senior citizen",     // table row with data
        "osca",
        "result(s) found",
        "1 record",
      ];
      // Negative indicators
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

      // Also check: is there a result table with rows?
      const resultRows = $result("table tbody tr").length;

      functions.logger.info("NCSC check", {
        lastName, firstName, month, day,
        status: searchRes.status,
        signalsFound, signalsNotFound, resultRows,
        // Log first 500 chars to help debug if signals change
        snippet: bodyText.substring(0, 500),
      });

      // Decision logic:
      // - Explicit "not found" text → not found
      // - Table rows present OR "registered" text → found
      // - Ambiguous → not found (conservative)
      if (signalsNotFound && !signalsFound) {
        return { found: false };
      }
      if (signalsFound || resultRows > 0) {
        return { found: true };
      }

      // Couldn't parse either way — treat as not found conservatively
      return { found: false };

    } catch (err) {
      functions.logger.error("NCSC fetch error:", err.message);
      // Network timeout, DNS failure, etc.
      return { error: "ncsc_unreachable" };
    }
  });
  