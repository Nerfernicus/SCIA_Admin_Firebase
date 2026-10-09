// functions/guideAI.js
// Server side of the dashboard's Tagalog voice guide (src/lib/guideAI.js calls this).
// Runs on the server so no browser needs an App Check token for Vertex AI.

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const MODEL = "gemini-3.5-flash-lite"; // keep in step with CHAT_MODEL in the mobile app
const LOCATION = "global"; // Gemini 3.x models are only served from "global"

// Same rules as src/lib/tagalogStyle.js (TAGALOG_GUIDE_RULES). Update both together.
const TAGALOG_GUIDE_RULES = `You write what a screen reader says aloud for the SCIA Admin dashboard of the Office of Senior Citizens Affairs (OSCA), Valenzuela City, Philippines. The listeners are barangay staff and senior citizens, some with poor eyesight.

Language: Tagalog (Filipino), in natural spoken style, as a kind, respectful young Filipino would say it to a lola or lolo. Not a textbook, not a word-for-word translation.

Rules:
1. Everyday conversational Tagalog. Keep words Filipinos normally say in English: button, link, ID, health center, appointment, SOS, OSCA, barangay, dashboard, login, password, email, upload, download, report.
2. Avoid deep or invented "purong Tagalog" words. Use words people really say.
3. Be polite: use "po" where you address the listener, and "kayo" / "ninyo", never "ikaw" or "mo".
4. Short sentences. Commas where a speaker would pause. Standard spelling, no texting spelling.
5. Write numbers and times in words the Filipino way ("alas-otso ng umaga", "limampung piso"). Emergency numbers in English digits: "nine one one". Write "S-O-S" for SOS.
6. No markdown, symbols, emoji, URLs or abbreviations; the text is read by a speech engine.
7. Never invent buttons, pages or features that were not given to you. If something is unclear, leave it out.`;

let client = null;
const ai = () => {
  if (!client) {
    // Loaded on first call, not at startup, so deploy-time code analysis stays fast.
    const { GoogleGenAI } = require("@google/genai");
    client = new GoogleGenAI({
      vertexai: true,
      project: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "scia-b5440",
      location: LOCATION,
    });
  }
  return client;
};

const stripFence = (s) => String(s || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

async function generate(prompt, config) {
  const res = await ai().models.generateContent({
    model: MODEL,
    contents: prompt,
    config: { systemInstruction: TAGALOG_GUIDE_RULES, ...config },
  });
  return String(res.text || "").trim();
}

exports.guideAI = onCall(
  { region: "asia-southeast1", timeoutSeconds: 60, memory: "256MiB", maxInstances: 5 },
  async (request) => {
    const { auth, data } = request;
    if (!auth) throw new HttpsError("unauthenticated", "Sign in first.");
    const adminSnap = await admin.firestore().collection("admins").doc(auth.uid).get();
    if (!adminSnap.exists) throw new HttpsError("permission-denied", "Admins only.");

    const kind = data && data.kind;

    try {
      if (kind === "labels") {
        const unique = [...new Set((Array.isArray(data.labels) ? data.labels : [])
          .map((l) => String(l).trim()).filter((l) => l && l.length <= 120))].slice(0, 60);
        if (!unique.length) return { labels: {} };
        const prompt =
          "Translate each dashboard button / field / heading name into short natural spoken Tagalog, " +
          "the way it would be said aloud. Keep each under 6 words. If it is already Tagalog, or is a name, " +
          "return it unchanged. Return ONLY a JSON object mapping each original string to its Tagalog version.\n\n" +
          JSON.stringify(unique);
        const raw = stripFence(await generate(prompt, {
          responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: 2048,
        }));
        let parsed = {};
        try { parsed = JSON.parse(raw); } catch (e) { return { labels: {} }; }
        const out = {};
        for (const k of unique) {
          const v = parsed && parsed[k];
          if (typeof v === "string" && v.trim() && v.length <= 120) out[k] = v.trim();
        }
        return { labels: out };
      }

      if (kind === "explain") {
        const outline = JSON.stringify(data.outline || {});
        if (outline.length > 8000) throw new HttpsError("invalid-argument", "Page outline is too large.");
        const prompt =
          "Explain this dashboard page out loud, in Tagalog, in 4 to 7 short sentences (under 110 words). " +
          "Say what the page is for, then what the person can do here, then where to start. " +
          "Use only the names given below; do not invent anything.\n\n" + outline;
        const text = await generate(prompt, { temperature: 0.5, maxOutputTokens: 700 });
        return { text: text.replace(/[*_#>`]/g, "").replace(/\s+/g, " ").trim() };
      }
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      logger.error("guideAI failed:", e && (e.message || e));
      throw new HttpsError("unavailable", "The AI guide is not available right now.");
    }

    throw new HttpsError("invalid-argument", "Unknown request.");
  },
);
