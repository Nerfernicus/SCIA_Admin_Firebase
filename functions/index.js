/**
 * Firebase Cloud Functions — index.js
 * Uses Firebase Functions v2 (matches your existing setup)
 *
 * Setup before deploying:
 *   cd functions
 *   npm install node-fetch@2 cheerio
 *   firebase deploy --only functions:ncscVerify
 */

const { setGlobalOptions } = require("firebase-functions");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const fetch = require("node-fetch");
const cheerio = require("cheerio");

setGlobalOptions({ maxInstances: 10 });

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
