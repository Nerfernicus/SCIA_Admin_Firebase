// functions/monitoring.js
//
// Error reporting + structured logging for Cloud Functions.
//
//  * logEvent()        writes JSON log entries to Google Cloud Logging with a stable
//                      `event` name, so log-based alerts can match on it
//                      (see docs/MONITORING.md).
//  * withMonitoring()  wraps a handler: if it throws, it logs `<NAME>_FAILED`,
//                      reports to Sentry (when SENTRY_DSN is set) and re-throws, so
//                      Firebase still records the failure and retries as before.
//
// PRIVACY: this app handles senior citizens' personal data. Nothing here sends
// names, phone numbers, addresses or message text. Phone numbers are also
// redacted from any error message before it leaves the server, and Sentry's
// user / request data is dropped.

const logger = require("firebase-functions/logger");

// 09171234567, +639171234567, 639171234567
const PH_PHONE = /(\+?63|0)9\d{9}/g;
const redact = (text) => (typeof text === "string" ? text.replace(PH_PHONE, "[phone]") : text);

function scrubEvent(event) {
  delete event.user;
  delete event.request;
  delete event.breadcrumbs;
  if (event.message) event.message = redact(event.message);
  for (const ex of (event.exception && event.exception.values) || []) {
    ex.value = redact(ex.value);
  }
  return event;
}

let sentry = null;
let initTried = false;
function getSentry() {
  if (initTried) return sentry;
  initTried = true;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return null; // monitoring is optional: no DSN, no Sentry
  try {
    const S = require("@sentry/node");
    S.init({
      dsn,
      environment: process.env.SENTRY_ENVIRONMENT || "production",
      tracesSampleRate: 0,
      sendDefaultPii: false,
      beforeSend: scrubEvent,
    });
    sentry = S;
  } catch (e) {
    logger.warn("Sentry init failed", { error: e.message });
  }
  return sentry;
}

async function captureError(err, tags = {}) {
  const S = getSentry();
  if (!S) return;
  try {
    S.withScope((scope) => {
      scope.setTags(tags);
      S.captureException(err);
    });
    await S.flush(2000); // a function instance can freeze right after returning
  } catch (_) { /* never let reporting break the function */ }
}

// logEvent("error", "SMS_SEND_FAILED", { failed: 2, total: 3 })
// logger.write keeps the entry clean (logger.error would append a stack trace to
// every line). `event` lands in Cloud Logging as jsonPayload.event.
const SEVERITY = { debug: "DEBUG", info: "INFO", warn: "WARNING", error: "ERROR" };
function logEvent(severity, event, fields = {}) {
  logger.write({ severity: SEVERITY[severity] || "INFO", message: event, event, ...fields });
}

function withMonitoring(name, handler) {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (err) {
      logEvent("error", `${name}_FAILED`, { function: name, error: redact(String((err && err.message) || err)) });
      await captureError(err, { function: name });
      throw err;
    }
  };
}

module.exports = { logEvent, withMonitoring, captureError, redact, scrubEvent };
