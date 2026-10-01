// Inactivity monitoring for seniors who opted in to Safety Monitoring in the app.
//
// The app keeps users/{uid}.last_active_timestamp and .last_known_location fresh
// (foreground and background). This job runs every minute and, for each opted-in
// senior who has gone quiet:
//   50 min  -> urgent push: "Are you safe?"  (false-alarm buffer)
//   60 min  -> (and only after the push had >= 5 min to be answered) SMS to the
//              senior's guardians + the barangay office for the barangay they
//              were last seen in, plus an SOS entry for the dashboard.
// Any new ping from the app (or tapping "I'm safe") changes last_active_timestamp,
// which invalidates the pending state, so the countdown starts over.
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { routeSos, outsideCityNote, barangayOfficePhones } = require("./sosRouting");
const { sendSms, normalizePhNumber, SMS_API_KEY } = require("./sms");

const MIN = 60 * 1000;
const WARN_AFTER_MS = 50 * MIN;
const ESCALATE_AFTER_MS = 60 * MIN;
const MIN_WARNING_WINDOW_MS = 5 * MIN; // the senior always gets this long to answer the push
const LOOKBACK_MS = 6 * 60 * MIN;      // ignore accounts that have been quiet for 6h+ (already handled / abandoned)
const MAX_SMS_ATTEMPTS = 3;

const db = () => admin.firestore();
const fmtTime = (ms) => new Date(ms).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });

// Move the alert state machine one step, only if nobody else (a parallel run, or a new
// ping from the app) got there first. Returns true when this run owns the transition.
async function claim(ref, lastMs, fromState, patch) {
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const d = snap.data();
    const lm = d.last_active_timestamp && d.last_active_timestamp.toMillis();
    if (lm !== lastMs || d.safety_monitoring_enabled !== true) return false;
    const cur = d.safety_alert && d.safety_alert.basedOn === lm ? d.safety_alert : null;
    if ((cur ? cur.state : null) !== fromState) return false;
    tx.update(ref, { safety_alert: { ...(cur || {}), ...patch, basedOn: lm } });
    return true;
  });
}

async function pushToUser(ref, token, notification, data) {
  if (!token) return false;
  try {
    await admin.messaging().send({
      token,
      notification,
      data: { ...data, click_action: "OPEN_SAFETY_CHECK" },
      android: {
        priority: "high",
        ttl: 10 * MIN,
        notification: { channelId: "safety-check", sound: "default", priority: "max", visibility: "public" },
      },
    });
    return true;
  } catch (err) {
    logger.warn("safety push failed:", err.code || err.message);
    if (err.code === "messaging/registration-token-not-registered" || err.code === "messaging/invalid-registration-token") {
      await ref.update({ push_token: admin.firestore.FieldValue.delete() }).catch(() => {});
    }
    return false;
  }
}

async function warn(ref, u, lastMs, now) {
  if (!(await claim(ref, lastMs, null, { state: "warned", warnedAt: now, warningDelivered: false, smsAttempts: 0 }))) return;
  const delivered = await pushToUser(
    ref, u.push_token,
    { title: "Are you safe?", body: "We haven't detected activity from your phone in a while. Tap to let us know you're OK." },
    { type: "safety_check", uid: ref.id },
  );
  if (delivered) await ref.update({ "safety_alert.warningDelivered": true });
  logger.info(`safety warning for ${ref.id}, push delivered: ${delivered}`);
}

// Guardian numbers for a senior. The current shape is users/{uid}.guardians =
// [{ name, phone, relationship }]. Accounts created by the assisted sign-up
// before that was unified only have the flat guardianPhone field, so it is
// still read here as a fallback. Numbers are de-duplicated.
function guardianPhonesOf(u) {
  const fromList = (Array.isArray(u.guardians) ? u.guardians : []).map((g) => g && g.phone);
  const legacy = u.guardianPhone ? [u.guardianPhone] : [];
  return [...new Set([...fromList, ...legacy].map((p) => normalizePhNumber(p)).filter(Boolean))];
}

async function escalate(ref, u, lastMs, now, fromState) {
  const attempts = (u.safety_alert && u.safety_alert.basedOn === lastMs && u.safety_alert.smsAttempts) || 0;
  if (!(await claim(ref, lastMs, fromState, { state: "escalating", escalatingAt: now }))) return;

  const loc = u.last_known_location || null;
  const lat = loc && typeof loc.latitude === "number" ? loc.latitude : null;
  const lng = loc && typeof loc.longitude === "number" ? loc.longitude : null;

  // Which barangay office covers where they were last seen. Outside Valenzuela
  // the home barangay office is told, flagged so it coordinates with the local
  // barangay and 911 (see sosRouting.js).
  const route = routeSos(lat, lng, u.barangay);
  const barangay = route.barangay;
  const basis = !route.hasLocation ? "no_location_home_barangay"
    : route.outsideCity ? "outside_city_home_barangay" : "last_location";

  const fullName = [u.firstName, u.lastName].filter(Boolean).join(" ") || "A senior citizen";
  const mapLink = lat !== null ? ` Last seen ${fmtTime(loc.captured_at || lastMs)}: https://maps.google.com/?q=${lat},${lng}` : "";
  const where = route.outsideCity
    ? ` Last known location is outside Valenzuela (${route.city || "another city"}); home Brgy. ${barangay || "n/a"}.`
    : (barangay ? ` Brgy. ${barangay}${route.hasLocation ? "" : " (home)"}.` : "");
  const escalationNote = route.outsideCity ? " Please coordinate with that area's barangay and call 911." : "";
  const message =
    `SCIA URGENT: ${fullName} has had no phone activity for 60 min and did not confirm they are safe.` +
    `${where}${mapLink} Contact: ${u.conNumber || "n/a"}. Please check on them.${escalationNote}`;

  const guardianPhones = guardianPhonesOf(u);
  const officePhones = await barangayOfficePhones(barangay);
  const recipients = [...new Set([...guardianPhones, ...officePhones])];

  // Same SOS record a manual SOS creates, so the dashboard's SOS Map shows it too.
  if (lat !== null) {
    await db().collection("emergencies").add({
      name: fullName, latitude: lat, longitude: lng,
      address: u.address || "", barangay: barangay || "",
      homeBarangay: route.homeBarangay || "", outsideCity: route.outsideCity,
      city: route.city || null, escalation: route.escalation,
      ...(route.outsideCity ? { needsLocalResponders: true, responderNote: outsideCityNote(route.city) } : {}),
      routedAt: admin.firestore.FieldValue.serverTimestamp(),
      uid: ref.id, status: "pending", type: "inactivity", source: "inactivity_monitor",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch((e) => logger.error("inactivity emergency doc failed:", e.message));
  }

  const result = recipients.length ? await sendSms(recipients, message) : { sent: [], failed: [] };

  await db().collection("inactivity_alerts").add({
    uid: ref.id, name: fullName, barangay, basis, message,
    lastActiveAt: admin.firestore.Timestamp.fromMillis(lastMs),
    guardianCount: guardianPhones.length, officeCount: officePhones.length,
    sent: result.sent.length, failed: result.failed, dryRun: !!result.dryRun,
    attempt: attempts + 1,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const allFailed = recipients.length > 0 && result.sent.length === 0;
  if (allFailed && attempts + 1 < MAX_SMS_ATTEMPTS) {
    // Gateway hiccup: go back one step so the next run tries again.
    await claim(ref, lastMs, "escalating", { state: "warned", smsAttempts: attempts + 1 });
    return;
  }
  await claim(ref, lastMs, "escalating", {
    state: "escalated", escalatedAt: now, smsSent: result.sent.length,
    noRecipients: recipients.length === 0, smsFailed: allFailed,
  });

  await pushToUser(
    ref, u.push_token,
    { title: "Your guardians were alerted", body: "We couldn't confirm you were safe, so we notified your guardians and your barangay office." },
    { type: "safety_escalated", uid: ref.id },
  );
  logger.info(`safety escalation for ${ref.id}: ${result.sent.length}/${recipients.length} SMS sent (${basis})`);
}

async function processUser(docSnap, now) {
  const ref = docSnap.ref;
  const u = docSnap.data();
  const lastMs = u.last_active_timestamp && u.last_active_timestamp.toMillis();
  if (!lastMs) return;
  const gap = now - lastMs;
  const cur = u.safety_alert && u.safety_alert.basedOn === lastMs ? u.safety_alert : null;
  const state = cur ? cur.state : null;

  if (state === "escalated" || state === "escalating") return;

  if (state === "warned") {
    if (gap >= ESCALATE_AFTER_MS && now - cur.warnedAt >= MIN_WARNING_WINDOW_MS) {
      await escalate(ref, u, lastMs, now, "warned");
    }
    return;
  }

  // Never warned for this stretch of silence.
  if (gap >= ESCALATE_AFTER_MS && !u.push_token) {
    // No way to ask them, so the 60-minute rule applies directly.
    await escalate(ref, u, lastMs, now, null);
  } else if (gap >= WARN_AFTER_MS) {
    await warn(ref, u, lastMs, now); // (a missed run that lands past 60 min still gets its warning window first)
  }
}

exports.monitorInactivity = onSchedule(
  {
    schedule: "every 1 minutes",
    timeZone: "Asia/Manila",
    region: "asia-southeast1",
    timeoutSeconds: 120,
    secrets: [SMS_API_KEY],
  },
  async () => {
    const now = Date.now();
    const snap = await db().collection("users")
      .where("safety_monitoring_enabled", "==", true)
      .where("last_active_timestamp", "<=", admin.firestore.Timestamp.fromMillis(now - WARN_AFTER_MS))
      .where("last_active_timestamp", ">=", admin.firestore.Timestamp.fromMillis(now - LOOKBACK_MS))
      .get();

    await Promise.all(snap.docs.map((d) =>
      processUser(d, now).catch((err) => logger.error(`inactivity check failed for ${d.id}:`, err.message)),
    ));
  },
);

// Exposed for local tests only; functions.js re-exports monitorInactivity alone, so this is not deployed.
exports.__test = { processUser };
