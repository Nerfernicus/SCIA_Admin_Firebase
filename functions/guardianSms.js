// functions/guardianSms.js
//
// Texts a senior's guardians, but only the ones who were switched on for that
// kind of message. Caregiver alerts are opt-in: in the app, each guardian has
// their own switches (users/{uid}.guardians[i].notify = { idReady, appointmentConfirmed }).
// Nothing is sent unless the senior (or whoever sets the app up for them) turned
// the matching switch on.
//
// This file only holds the helper. It is not exported as a Cloud Function, so
// the functions that call it must declare `secrets: [SMS_API_KEY]`.

const logger = require("firebase-functions/logger");
const { getFirestore } = require("firebase-admin/firestore");
const { sendSms, normalizePhNumber } = require("./sms");

// The only switches that exist. Anything else is ignored.
const FLAGS = ["idReady", "appointmentConfirmed"];

/**
 * @param {string} uid      the senior's user id
 * @param {string} flag     one of FLAGS
 * @param {(name: string) => string} buildMessage  gets the senior's first name
 * @returns {Promise<{ sent: string[], failed: object[] }>}
 */
async function textGuardians(uid, flag, buildMessage) {
  if (!uid || !FLAGS.includes(flag)) return { sent: [], failed: [] };

  const snap = await getFirestore().doc(`users/${uid}`).get();
  if (!snap.exists) return { sent: [], failed: [] };
  const u = snap.data() || {};

  const phones = [
    ...new Set(
      (Array.isArray(u.guardians) ? u.guardians : [])
        .filter((g) => g && g.notify && g.notify[flag] === true)
        .map((g) => normalizePhNumber(g.phone))
        .filter(Boolean),
    ),
  ];
  if (!phones.length) return { sent: [], failed: [] };

  const first = String(u.firstName || u.fname || "").trim() || "Your family member";
  const result = await sendSms(phones, buildMessage(first));
  if (result.failed && result.failed.length) {
    logger.warn(`guardian SMS (${flag}) failed for ${uid}`, result.failed);
  }
  return result;
}

module.exports = { textGuardians, FLAGS };
