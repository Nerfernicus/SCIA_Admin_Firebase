// functions/sosRouting.js
//
// Decides which Barangay office an SOS alert belongs to, based on where the
// senior actually IS (not only where they registered), and escalates alerts
// that come from outside Valenzuela City.
//
//   inside Valenzuela   -> the barangay the coordinates fall in responds.
//                          The home barangay is kept in `homeBarangay` and can
//                          still see the alert.
//   outside Valenzuela  -> the senior's HOME barangay office is told, and the
//                          alert is flagged `outsideCity` with the city name
//                          (e.g. Quezon City) and a note to coordinate with that
//                          area's barangay and local responders (911) instead of
//                          handling it only as if the senior were at home.
//   no location at all  -> home barangay, nothing else to go on.
//
// Two entry points use this:
//   * onEmergencyCreated (below): runs on every new /emergencies document, which
//     is how the mobile app's manual SOS button reaches the admin side.
//   * inactivityMonitor.js: calls routeSos() / barangayOfficePhones() directly
//     for the alerts it raises itself.

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { sendSms, normalizePhNumber, SMS_API_KEY } = require("./sms");
const { locateBarangay, locateCity, resolveBarangay, barangayVariants } = require("./barangays");

const db = () => admin.firestore();

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const toNum = (v) => (isNum(v) ? v : (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null));

/**
 * @returns {{
 *   hasLocation: boolean, outsideCity: boolean, city: string|null,
 *   barangay: string|null,      // the barangay office that should respond
 *   homeBarangay: string|null,  // where the senior is registered
 *   escalation: "barangay"|"local_responders"
 * }}
 */
function routeSos(lat, lng, homeBarangayRaw) {
  const home = resolveBarangay(homeBarangayRaw);
  const homeBarangay = home ? home.name : (String(homeBarangayRaw || "").trim() || null);

  if (!isNum(lat) || !isNum(lng)) {
    return { hasLocation: false, outsideCity: false, city: null, barangay: homeBarangay, homeBarangay, escalation: "barangay" };
  }
  const geo = locateBarangay(lat, lng);
  if (geo.insideCity) {
    return { hasLocation: true, outsideCity: false, city: "Valenzuela City", barangay: geo.barangay, homeBarangay, escalation: "barangay" };
  }
  const place = locateCity(lat, lng);
  return { hasLocation: true, outsideCity: true, city: place.city, barangay: homeBarangay, homeBarangay, escalation: "local_responders" };
}

// Text shown on the dashboard and sent to the barangay office.
function outsideCityNote(city) {
  const where = city || "another city or municipality";
  return `Outside Valenzuela City (${where}). Coordinate with that area's barangay and call 911 / local emergency responders.`;
}

// Office phone numbers of the barangay admins (sub_admins) for a barangay.
async function barangayOfficePhones(barangay) {
  if (!barangay) return [];
  const variants = barangayVariants(barangay);
  if (!variants.length) return [];
  const snap = await db().collection("admins")
    .where("role", "==", "sub_admin").where("barangay", "in", variants).get();
  return [...new Set(snap.docs.map((d) => normalizePhNumber(d.data().phone)).filter(Boolean))];
}

function mapLink(lat, lng) {
  return isNum(lat) && isNum(lng) ? ` Map: https://maps.google.com/?q=${lat},${lng}` : "";
}

exports.routeSos = routeSos;
exports.outsideCityNote = outsideCityNote;
exports.barangayOfficePhones = barangayOfficePhones;

exports.onEmergencyCreated = onDocumentCreated(
  { document: "emergencies/{emergencyId}", secrets: [SMS_API_KEY] },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const d = snap.data() || {};

    // The inactivity monitor routes its own alerts; a retried event must not
    // route (and text) the same alert twice.
    if (d.routedAt || d.source === "inactivity_monitor") return;

    const lat = toNum(d.latitude);
    const lng = toNum(d.longitude);
    const route = routeSos(lat, lng, d.barangay);

    const update = {
      routedAt: admin.firestore.FieldValue.serverTimestamp(),
      homeBarangay: route.homeBarangay || "",
      outsideCity: route.outsideCity,
      city: route.city || null,
      escalation: route.escalation,
    };
    // Inside the city the barangay where they are responds; outside, the home
    // barangay keeps it (that is the office that then coordinates with 911).
    if (route.barangay && route.barangay !== d.barangay) update.barangay = route.barangay;
    if (route.outsideCity) {
      update.needsLocalResponders = true;
      update.responderNote = outsideCityNote(route.city);
    }
    await snap.ref.update(update);

    // Text the office that has to act.
    let contact = "";
    if (d.uid && d.uid !== "anonymous") {
      try {
        const u = await db().collection("users").doc(d.uid).get();
        contact = u.exists ? (u.data().conNumber || "") : "";
      } catch (e) { logger.warn("onEmergencyCreated: user lookup failed:", e.message); }
    }
    const who = d.name || "A senior citizen";
    const phones = await barangayOfficePhones(route.barangay);
    if (!phones.length) {
      logger.info(`SOS ${snap.id}: no office phone on file for ${route.barangay || "unknown barangay"}`);
      return;
    }
    const message = route.outsideCity
      ? `SCIA SOS (OUTSIDE VALENZUELA): ${who}, Brgy. ${route.homeBarangay || "n/a"} resident, sent an SOS from ${route.city || "outside the city"}.${mapLink(lat, lng)} ` +
        `Contact: ${contact || "n/a"}. Please coordinate with that area's barangay and call 911 / local responders.`
      : `SCIA SOS: ${who} needs help${route.barangay ? ` in Brgy. ${route.barangay}` : ""}.${mapLink(lat, lng)} Contact: ${contact || "n/a"}.`;
    try {
      const result = await sendSms(phones, message);
      await snap.ref.update({ officeSmsSent: result.sent.length, officeSmsFailed: result.failed.length || 0 });
    } catch (e) {
      logger.error(`SOS ${snap.id}: office SMS failed:`, e.message);
    }
  },
);
