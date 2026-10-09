// lib/guideAI.js
//
// Vertex AI (Gemini, through Firebase AI Logic) for the dashboard's voice guide:
//  - translateLabels(): turns button/field names that are still in English into natural Tagalog
//  - explainPageInTagalog(): a short spoken walkthrough of the page the person is looking at
//
// Same project, backend and model as the mobile app (lib/firebaseAI.ts there).
//
// Needs in the Google Cloud project (scia-b5440): Vertex AI API enabled and billing on Blaze.
// Firebase AI Logic requires App Check from Nov 2, 2026. Create a reCAPTCHA v3 site key, register
// it under Firebase console > App Check, then put it in .env as  VITE_RECAPTCHA_SITE_KEY=...
// Without the key the calls still work until enforcement starts, and then they fail quietly:
// the guide falls back to its built-in Tagalog phrases.

import { getAI, getGenerativeModel, VertexAIBackend } from 'firebase/ai';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import app from './firebase';
import { TAGALOG_GUIDE_RULES } from './tagalogStyle';

export const GUIDE_MODEL = 'gemini-3.5-flash-lite'; // keep in step with CHAT_MODEL in the mobile app
const REGION = 'global';                            // Gemini 3.x models are only served from "global"

let ai = null;
let appCheckReady = false;
const models = {};

// Running from this computer (Live Server, vite dev, a built copy opened on 127.0.0.1): reCAPTCHA
// does not accept those addresses unless they are added to the key, so App Check would send an invalid
// token and the AI answers 401. A debug token fixes that for local testing only. The first time, the
// browser console prints "App Check debug token: ..." (also saved in this browser's localStorage).
// Register it once in Firebase console > App Check > Apps > (web app) > Manage debug tokens.
// To reuse a token you already registered, set VITE_APPCHECK_DEBUG_TOKEN in .env.
const isLocalHost = () =>
  typeof location !== 'undefined' && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

function ensureAi() {
  if (!appCheckReady) {
    appCheckReady = true;
    const key = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
    if (isLocalHost()) {
      // Must be set before initializeAppCheck runs.
      self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true;
    }
    if (key || isLocalHost()) {
      try {
        initializeAppCheck(app, {
          provider: new ReCaptchaV3Provider(key || 'debug-only-no-site-key'),
          isTokenAutoRefreshEnabled: true,
        });
      } catch (e) { console.warn('[guideAI] App Check not started:', e?.message || e); }
    }
  }
  if (!ai) ai = getAI(app, { backend: new VertexAIBackend(REGION) });
  return ai;
}

function model(kind) {
  if (!models[kind]) {
    models[kind] = getGenerativeModel(ensureAi(), {
      model: GUIDE_MODEL,
      systemInstruction: TAGALOG_GUIDE_RULES,
      generationConfig: kind === 'json'
        ? { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 2048 }
        : { temperature: 0.5, maxOutputTokens: 700 },
    });
  }
  return models[kind];
}

const textOf = (result) => {
  const r = result?.response;
  const t = typeof r?.text === 'function' ? r.text() : r?.text;
  return String(t ?? '').trim();
};

const stripFence = (s) => s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

/**
 * labels: array of short UI strings (English or already Tagalog).
 * Returns { "Original label": "Tagalog label", ... } — only for labels the model returned.
 */
export async function translateLabels(labels) {
  const unique = [...new Set(labels.map((l) => String(l).trim()).filter(Boolean))].slice(0, 60);
  if (!unique.length) return {};
  const prompt =
    'Translate each dashboard button / field / heading name into short natural spoken Tagalog, ' +
    'the way it would be said aloud. Keep each under 6 words. If it is already Tagalog, or is a name, ' +
    'return it unchanged. Return ONLY a JSON object mapping each original string to its Tagalog version.\n\n' +
    JSON.stringify(unique);
  const raw = stripFence(textOf(await model('json').generateContent(prompt)));
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return {}; }
  const out = {};
  for (const k of unique) {
    const v = parsed?.[k];
    if (typeof v === 'string' && v.trim() && v.length <= 120) out[k] = v.trim();
  }
  return out;
}

/**
 * outline: { title, headings: [], actions: [], fields: [] }  (names only, see accessibility.js)
 * Returns a short spoken Tagalog walkthrough.
 */
export async function explainPageInTagalog(outline) {
  const prompt =
    'Explain this dashboard page out loud, in Tagalog, in 4 to 7 short sentences (under 110 words). ' +
    'Say what the page is for, then what the person can do here, then where to start. ' +
    'Use only the names given below; do not invent anything.\n\n' +
    JSON.stringify(outline);
  const text = textOf(await model('text').generateContent(prompt));
  return text.replace(/[*_#>`]/g, '').replace(/\s+/g, ' ').trim();
}
