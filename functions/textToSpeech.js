// functions/textToSpeech.js
//
// Natural-sounding speech for the SCIA mobile app's read-aloud feature (Google Cloud
// Text-to-Speech: neural / "Chirp 3 HD" voices, the same family of Google voices people
// hear in navigation apps). The phone's built-in voice is robotic in Tagalog, so the app
// asks this function for audio, plays it, and keeps a copy on the phone so the same
// sentence is never generated (or billed) twice.
//
// Needs the "Cloud Text-to-Speech API" enabled on the scia-b5440 Google Cloud project
// (console.cloud.google.com > APIs & Services > Library). No key or secret is needed:
// the function uses its own service account.
//
// Optional: pick a different voice without changing code:
//   firebase functions:secrets / .env  ->  TTS_VOICE_TL=fil-PH-Chirp3-HD-Kore   TTS_VOICE_EN=en-US-Chirp3-HD-Kore
// The first voice in each list that exists in Google's catalogue is used; the rest are fallbacks,
// so a renamed or retired voice never leaves the app silent.

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { TextToSpeechClient } = require("@google-cloud/text-to-speech");

const REGION = { region: "asia-southeast1", timeoutSeconds: 30, memory: "256MiB", maxInstances: 5 };

const MAX_TEXT_CHARS = 400;        // one label or one sentence at a time
const DAILY_CHAR_LIMIT = 8000;     // per signed-in user per day (the app also caches on the device)

const VOICES = {
  tl: [
    process.env.TTS_VOICE_TL,
    "fil-PH-Chirp3-HD-Aoede",
    "fil-PH-Neural2-A",
    "fil-PH-Wavenet-A",
    "fil-PH-Standard-A",
  ].filter(Boolean),
  en: [
    process.env.TTS_VOICE_EN,
    "en-US-Chirp3-HD-Aoede",
    "en-PH-Wavenet-A",
    "en-US-Neural2-F",
    "en-US-Standard-C",
  ].filter(Boolean),
};

let client = null;
const getClient = () => (client = client || new TextToSpeechClient());
const lastWorking = {}; // remembers which voice worked on this instance, to skip the failed ones next time

const languageCodeOf = (voiceName) => voiceName.split("-").slice(0, 2).join("-"); // "fil-PH-Chirp3-HD-Aoede" -> "fil-PH"

// Today's date in Philippine time (UTC+8), used to reset the daily allowance.
const phDay = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, "");

async function takeAllowance(uid, chars) {
  const ref = admin.firestore().collection("tts_usage").doc(`${uid}_${phDay()}`);
  await admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const used = snap.exists ? Number(snap.data().chars) || 0 : 0;
    if (used + chars > DAILY_CHAR_LIMIT) {
      throw new HttpsError("resource-exhausted", "Daily read-aloud limit reached.");
    }
    tx.set(ref, { uid, chars: used + chars, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  });
}

exports.synthesizeSpeech = onCall(REGION, async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Please sign in.");

  const lang = request.data && request.data.lang === "en" ? "en" : "tl";
  const text = String((request.data && request.data.text) || "").replace(/\s+/g, " ").trim();
  if (!text) throw new HttpsError("invalid-argument", "No text.");
  if (text.length > MAX_TEXT_CHARS) throw new HttpsError("invalid-argument", "Text is too long.");

  await takeAllowance(uid, text.length);

  const order = [lastWorking[lang], ...VOICES[lang]].filter((v, i, a) => v && a.indexOf(v) === i);
  let lastError = null;
  for (const name of order) {
    try {
      const [res] = await getClient().synthesizeSpeech({
        input: { text },
        voice: { languageCode: languageCodeOf(name), name },
        audioConfig: { audioEncoding: "MP3", speakingRate: 0.95 },
      });
      if (!res.audioContent) throw new Error("empty audio");
      lastWorking[lang] = name;
      return {
        audioBase64: Buffer.from(res.audioContent).toString("base64"),
        mime: "audio/mpeg",
        voice: name,
      };
    } catch (err) {
      lastError = err;
      // 3 = INVALID_ARGUMENT, 5 = NOT_FOUND: this voice name isn't available, try the next one.
      const unavailable = err && (err.code === 3 || err.code === 5 || /voice|language/i.test(String(err.message)));
      logger.warn(`synthesizeSpeech: voice ${name} failed (${err && err.code}): ${err && err.message}`);
      if (!unavailable) break;
    }
  }
  logger.error("synthesizeSpeech: no voice could speak this text", lastError);
  throw new HttpsError("internal", "Could not generate speech.");
});
