// functions/health.js
//
// Public health check for an uptime monitor (UptimeRobot / Better Stack).
// GET https://asia-southeast1-<project>.cloudfunctions.net/health
//
//   200 {"status":"ok", ...}       Firestore reachable AND the inactivity monitor ran recently
//   503 {"status":"degraded", ...} something is wrong (the monitor keyword check fails)
//
// The inactivity monitor runs every minute and writes system/monitor_heartbeat
// (see inactivityMonitor.js). If that stops, seniors stop being checked on, and
// nothing else would notice, so a stale heartbeat is reported here.
//
// Only coarse "ok"/"stale" values are returned: no counts, ids or error text.

const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { logEvent } = require("./monitoring");

const db = () => admin.firestore();
const MONITOR_STALE_MS = 5 * 60 * 1000; // the job runs every 1 minute

async function runChecks(now = Date.now()) {
  const checks = {};
  try {
    const snap = await db().collection("system").doc("monitor_heartbeat").get();
    checks.firestore = "ok";
    const last = snap.exists ? snap.data().lastRunAt : null;
    const lastMs = last && typeof last.toMillis === "function" ? last.toMillis() : null;
    checks.monitor = lastMs !== null && now - lastMs <= MONITOR_STALE_MS ? "ok" : "stale";
  } catch (_) {
    checks.firestore = "down";
    checks.monitor = "unknown";
  }
  const ok = checks.firestore === "ok" && checks.monitor === "ok";
  return { ok, checks };
}

exports.runChecks = runChecks;
exports.MONITOR_STALE_MS = MONITOR_STALE_MS;

exports.health = onRequest(
  { region: "asia-southeast1", invoker: "public", cors: false, maxInstances: 3, timeoutSeconds: 10 },
  async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (req.method !== "GET" && req.method !== "HEAD") { res.status(405).end(); return; }
    const { ok, checks } = await runChecks();
    if (!ok) logEvent("warn", "HEALTH_DEGRADED", { checks });
    res.status(ok ? 200 : 503).json({ status: ok ? "ok" : "degraded", time: new Date().toISOString(), checks });
  },
);
