/**
 * functions.js — Firebase Cloud Function: ncscVerify
 *
 * Verified endpoint and field names from live NCSC site inspection (May 2026):
 *   POST https://www.ncsc.gov.ph/search
 *   Fields:
 *     lastname                   → text
 *     firstname                  → text
 *     middlename                 → text
 *     enter-year                 → text  (e.g. "1960")
 *     collection_comp-leny5jqs   → month number "1"–"12"
 *     collection_comp-leny7vd9   → day number "1"–"31"
 *     collection_comp-lfsde647   → name extension ("JR","SR","I","II"… or "" if none)
 *
 * Deploy:
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

const NCSC_PAGE   = "https://www.ncsc.gov.ph/registration-verification";
const NCSC_SEARCH = "https://www.ncsc.gov.ph/search";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Connection: "keep-alive",
};

/** Safely extract all Set-Cookie values from a node-fetch response */
function extractCookies(response) {
  const cookies = [];
  // node-fetch v2: headers.raw() may exist
  if (typeof response.headers.raw === "function") {
    const raw = response.headers.raw()["set-cookie"] || [];
    raw.forEach((c) => cookies.push(c.split(";")[0].trim()));
  } else {
    response.headers.forEach((value, name) => {
      if (name.toLowerCase() === "set-cookie") {
        cookies.push(value.split(";")[0].trim());
      }
    });
  }
  return cookies.filter(Boolean).join("; ");
}

/**
 * Convert a month number string or name to the numeric value NCSC expects.
 * Accepts: "1"–"12", "Jan"–"Dec", "January"–"December"
 */
function normalizeMonth(month) {
  if (!month) return "";
  const str = String(month).trim();
  if (/^\d+$/.test(str)) return str; // already numeric

  const names = [
    "jan","feb","mar","apr","may","jun",
    "jul","aug","sep","oct","nov","dec",
  ];
  const idx = names.findIndex((n) =>
    str.toLowerCase().startsWith(n)
  );
  return idx >= 0 ? String(idx + 1) : str;
}

exports.ncscVerify = onCall(
  { timeoutSeconds: 45, memory: "256MiB", region: "asia-southeast1" },
  async (request) => {
    const {
      lastName      = "",
      firstName     = "",
      middleName    = "",
      month         = "",   // month number 1–12 or month name
      day           = "",   // day number 1–31
      year          = "",   // 4-digit birth year e.g. "1960"
      nameExtension = "",   // "JR", "SR", "I", "II", etc. — leave blank if none
    } = request.data;

    if (!lastName || !firstName) {
      return { found: false, error: "missing_name" };
    }

    try {
      // ── Step 1: GET the verification page to collect session cookies ──
      let homeRes;
      try {
        homeRes = await fetch(NCSC_PAGE, {
          method:   "GET",
          headers:  BROWSER_HEADERS,
          redirect: "follow",
          timeout:  15000,
        });
      } catch (err) {
        logger.warn("NCSC GET failed:", err.message);
        return { error: "ncsc_unreachable" };
      }

      if (!homeRes.ok) {
        logger.warn("NCSC GET returned HTTP", homeRes.status);
        return { error: "ncsc_unreachable" };
      }

      const cookieHeader = extractCookies(homeRes);
      const homeHtml     = await homeRes.text();

      // Extract CSRF token if present
      const $home    = cheerio.load(homeHtml);
      const csrfToken =
        $home('input[name="_token"]').val()                     ||
        $home('input[name="csrf_token"]').val()                 ||
        $home('meta[name="csrf-token"]').attr("content")        ||
        $home('input[name="__RequestVerificationToken"]').val() ||
        "";

      // ── Step 2: Build POST body with confirmed field names ──
      const form = new URLSearchParams();
      form.append("lastname",   lastName.trim().toUpperCase());
      form.append("firstname",  firstName.trim().toUpperCase());
      form.append("middlename", middleName.trim().toUpperCase());

      // Name extension dropdown (collection_comp-lfsde647)
      // Send empty string if none — the field still needs to be present
      form.append("collection_comp-lfsde647", nameExtension.trim().toUpperCase());

      // Month dropdown (collection_comp-leny5jqs) — numeric "1"–"12"
      const monthNum = normalizeMonth(month);
      if (monthNum) form.append("collection_comp-leny5jqs", monthNum);

      // Day dropdown (collection_comp-leny7vd9) — numeric "1"–"31"
      const dayNum = String(day).trim().replace(/^0+/, "") || "";
      if (dayNum) form.append("collection_comp-leny7vd9", dayNum);

      // Birth year text field
      if (year) form.append("enter-year", String(year).trim());

      // CSRF token if found
      if (csrfToken) form.append("_token", csrfToken);

      // ── Step 3: POST to /search ──
      let searchRes;
      try {
        searchRes = await fetch(NCSC_SEARCH, {
          method:  "POST",
          headers: {
            ...BROWSER_HEADERS,
            "Content-Type": "application/x-www-form-urlencoded",
            Referer:         NCSC_PAGE,
            Origin:          "https://www.ncsc.gov.ph",
            Cookie:          cookieHeader,
          },
          body:     form.toString(),
          redirect: "follow",
          timeout:  20000,
        });
      } catch (err) {
        logger.warn("NCSC POST failed:", err.message);
        return { error: "ncsc_unreachable" };
      }

      if (!searchRes.ok) {
        logger.warn("NCSC POST returned HTTP", searchRes.status);
        return { error: "ncsc_unreachable" };
      }

      const resultHtml = await searchRes.text();
      const $result    = cheerio.load(resultHtml);

      // Remove noise before text extraction
      $result("script, style, noscript").remove();
      const bodyText = $result("body")
        .text()
        .replace(/\s+/g, " ")
        .toLowerCase()
        .trim();

      // ── Step 4: Parse result signals ──
      const FOUND_SIGNALS = [
        "is a registered senior citizen",
        "registered senior citizen",
        "found in our records",
        "result(s) found",
        "results found",
        "1 record",
        "osca id",
        "registered",
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
        "cannot be found",
      ];

      const signalsFound    = FOUND_SIGNALS.some((s) => bodyText.includes(s));
      const signalsNotFound = NOT_FOUND_SIGNALS.some((s) => bodyText.includes(s));

      const resultRows = $result("table tbody tr")
        .filter((_, el) => {
          const txt = $result(el).text().trim().toLowerCase();
          return (
            txt.length > 2 &&
            !txt.includes("no data") &&
            !txt.includes("no record")
          );
        }).length;

      logger.info("NCSC verify result", {
        lastName, firstName, month: monthNum, day: dayNum, year,
        httpStatus: searchRes.status,
        signalsFound, signalsNotFound, resultRows,
        snippet: bodyText.substring(0, 600),
      });

      if (signalsNotFound && !signalsFound && resultRows === 0) {
        return { found: false };
      }
      if (signalsFound || resultRows > 0) {
        return { found: true };
      }

      logger.warn("NCSC: ambiguous result — defaulting to not found");
      return { found: false };

    } catch (err) {
      logger.error("NCSC unexpected error:", err.message);
      return { error: "ncsc_unreachable" };
    }
  }
);
