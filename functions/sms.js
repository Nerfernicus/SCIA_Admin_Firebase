// SMS gateway wrapper — textbee.dev (https://textbee.dev).
//
// textbee turns an ordinary Android phone with a SIM into the SMS gateway, so
// messages are paid by that SIM's load / text promo, not per message by a
// provider. The free tier is 300 messages per month, no credit card.
// To use a different provider (Semaphore, PhilSMS, Twilio...) only sendSms()
// below has to change.
//
// One-time setup:
//   1. Install the textbee app on a spare Android phone that stays on, charging,
//      online, with a SIM that has load — https://textbee.dev/download
//   2. In the textbee dashboard: register the device and generate an API key.
//   3. firebase functions:secrets:set TEXTBEE_API_KEY      (paste the key)
//   Optional: TEXTBEE_DEVICE_ID (only if you registered several phones) and
//             SMS_DRY_RUN=true to log the messages instead of sending them.
const fetch = require("node-fetch");
const logger = require("firebase-functions/logger");
const { defineSecret, defineString, defineBoolean } = require("firebase-functions/params");

const SMS_API_KEY = defineSecret("TEXTBEE_API_KEY");
const TEXTBEE_DEVICE_ID = defineString("TEXTBEE_DEVICE_ID", { default: "" });
const SMS_DRY_RUN = defineBoolean("SMS_DRY_RUN", { default: false });

// 09XXXXXXXXX, +639XXXXXXXXX, 639XXXXXXXXX, 9XXXXXXXXX -> 639XXXXXXXXX (else null)
function normalizePhNumber(raw) {
  let d = String(raw || "").replace(/[^\d]/g, "");
  if (d.length === 10 && d.startsWith("9")) d = "63" + d;
  else if (d.length === 11 && d.startsWith("09")) d = "63" + d.slice(1);
  return /^639\d{9}$/.test(d) ? d : null;
}

// Sends the same message to each number in its own request so one bad number
// can't fail the rest. Returns { sent: [numbers], failed: [{ number, error }] }.
async function sendSms(numbers, message) {
  const sent = [];
  const failed = [];
  const unique = [...new Set(numbers)];

  if (SMS_DRY_RUN.value()) {
    unique.forEach((n) => logger.info(`[SMS_DRY_RUN] to ${n}: ${message}`));
    return { sent: unique, failed, dryRun: true };
  }

  await Promise.all(unique.map(async (number) => {
    try {
      const payload = { recipients: [`+${number}`], message };
      const deviceId = TEXTBEE_DEVICE_ID.value();
      if (deviceId) payload.deviceId = deviceId;

      const res = await fetch("https://api.textbee.dev/api/v1/gateway/send-sms", {
        method: "POST",
        headers: { "x-api-key": SMS_API_KEY.value(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        sent.push(number);
      } else {
        const text = await res.text().catch(() => "");
        failed.push({ number, error: `HTTP ${res.status} ${text.slice(0, 200)}` });
      }
    } catch (err) {
      failed.push({ number, error: err.message });
    }
  }));

  if (failed.length) {
    // Counts and reasons only: no phone numbers, no message text.
    require("./monitoring").logEvent("error", "SMS_SEND_FAILED", {
      failed: failed.length,
      total: unique.length,
      reasons: [...new Set(failed.map((f) => String(f.error).slice(0, 40).replace(/(\+?63|0)9\d{9}/g, "[phone]")))],
    });
  }
  return { sent, failed };
}

module.exports = { sendSms, normalizePhNumber, SMS_API_KEY };
