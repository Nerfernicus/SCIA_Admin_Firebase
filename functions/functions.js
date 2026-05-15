/**
 * Firebase Cloud Functions — index.js
 * Uses Firebase Functions v2
 *
 * Setup before deploying:
 *   cd functions
 *   npm install node-fetch@2 cheerio
 *   firebase deploy --only functions:ncscVerify
 */

const { setGlobalOptions } = require("firebase-functions");
const { onCall }           = require("firebase-functions/v2/https");
const logger               = require("firebase-functions/logger");
const fetch                = require("node-fetch");
const cheerio              = require("cheerio");

setGlobalOptions({ maxInstances: 10 });

const NCSC_BASE        = "https://www.ncsc.gov.ph";
const NCSC_VERIFY_PAGE = "https://www.ncsc.gov.ph/verification";
const NCSC_SEARCH_URL  = "https://www.ncsc.gov.ph/verification/search";

/** Common browser headers to avoid bot-blocking */
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const BASE_HEADERS = {
  "User-Agent":      BROWSER_UA,
  Accept:            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Connection:        "keep-alive",
};

/**
 * Merge all set-cookie headers from a node-fetch response into a single
 * Cookie header string, handling both raw() and get() API variants.
 */
function extractCookies(response) {
  let rawCookies = [];
  if (typeof response.headers.raw === "function") {
    rawCookies = response.headers.raw()["set-cookie"] || [];
  } else {
    response.headers.forEach((value, name) => {
      if (name.toLowerCase() === "set-cookie") rawCookies.push(value);
    });
  }
  return rawCookies
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

exports.ncscVerify = onCall(
  { timeoutSeconds: 45, memory: "256MiB", region: "asia-southeast1" },
  async (request) => {
    const {
      lastName   = "",
      firstName  = "",
      middleName = "",
      month      = "",
      day        = "",
    } = request.data;

    if (!lastName || !firstName) {
      return { found: false, error: "missing_name" };
    }

    try {
      // Step 1: GET verification page — session cookie + CSRF token
      let homeRes;
      try {
        homeRes = await fetch(NCSC_VERIFY_PAGE, {
          method:   "GET",
          headers:  BASE_HEADERS,
          redirect: "follow",
          timeout:  15000,
        });
      } catch (fetchErr) {
        logger.warn("NCSC homepage fetch failed:", fetchErr.message);
        return { error: "ncsc_unreachable" };
      }

      if (!homeRes.ok) {
        logger.warn("NCSC homepage returned HTTP", homeRes.status);
        return { error: "ncsc_unreachable" };
      }

      const homeHtml    = await homeRes.text();
      const cookieHeader = extractCookies(homeRes);

      // Step 2: Extract CSRF token
      const $home = cheerio.load(homeHtml);
      const csrfToken =
        $home('input[name="_token"]').val()                     ||
        $home('input[name="csrf_token"]').val()                 ||
        $home('input[name="authenticity_token"]').val()         ||
        $home('meta[name="csrf-token"]').attr("content")        ||
        $home('input[name="__RequestVerificationToken"]').val() ||
        "";

      if (!csrfToken) {
        logger.warn("NCSC: no CSRF token found in page — proceeding without it");
      }

      // Step 3: Build POST body
      const formBody = new URLSearchParams();
      formBody.append("last_name",   lastName.trim().toUpperCase());
      formBody.append("first_name",  firstName.trim().toUpperCase());
      formBody.append("middle_name", middleName.trim().toUpperCase());
      if (month)     formBody.append("birth_month", month);
      if (day)       formBody.append("birth_day",   day);
      if (csrfToken) formBody.append("_token",      csrfToken);

      // Step 4: POST to search endpoint
      let searchRes;
      try {
        searchRes = await fetch(NCSC_SEARCH_URL, {
          method:  "POST",
          headers: {
            ...BASE_HEADERS,
            "Content-Type": "application/x-www-form-urlencoded",
            Referer:         NCSC_VERIFY_PAGE,
            Origin:          NCSC_BASE,
            Cookie:          cookieHeader,
          },
          body:     formBody.toString(),
          redirect: "follow",
          timeout:  20000,
        });
      } catch (fetchErr) {
        logger.warn("NCSC search POST failed:", fetchErr.message);
        return { error: "ncsc_unreachable" };
      }

      if (!searchRes.ok) {
        logger.warn("NCSC search returned HTTP", searchRes.status);
        return { error: "ncsc_unreachable" };
      }

      const resultHtml = await searchRes.text();
      const $result    = cheerio.load(resultHtml);

      // Clean the text for signal matching
      $result("script, style, noscript").remove();
      const bodyText = $result("body").text().replace(/\s+/g, " ").toLowerCase().trim();

      // Step 5: Parse result
      const FOUND_SIGNALS = [
        "is a registered senior citizen",
        "registered senior citizen",
        "found in our records",
        "result(s) found",
        "results found",
        "1 record",
        "osca id no",
        "osca id:",
      ];
      const NOT_FOUND_SIGNALS = [
        "no record found",
        "no records found",
        "not found in our records",
        "not registered",
        "no result",
        "0 record",
        "0 result",
        "no matching",
        "sorry, we could not find",
        "no data found",
      ];

      const signalsFound    = FOUND_SIGNALS.some((s) => bodyText.includes(s));
      const signalsNotFound = NOT_FOUND_SIGNALS.some((s) => bodyText.includes(s));

      // Count substantive result table rows
      const resultRows = $result("table tbody tr").filter((_, el) => {
        const txt = $result(el).text().trim().toLowerCase();
        return txt.length > 2 && !txt.includes("no data") && !txt.includes("no record");
      }).length;

      logger.info("NCSC verification result", {
        lastName, firstName, month, day,
        httpStatus: searchRes.status,
        signalsFound, signalsNotFound, resultRows,
        snippet: bodyText.substring(0, 600),
      });

      if (signalsNotFound && !signalsFound && resultRows === 0) return { found: false };
      if (signalsFound || resultRows > 0) return { found: true };

      logger.warn("NCSC: ambiguous result, defaulting to not found");
      return { found: false };

    } catch (err) {
      logger.error("NCSC unexpected error:", err.message);
      return { error: "ncsc_unreachable" };
    }
  }
);
// comment