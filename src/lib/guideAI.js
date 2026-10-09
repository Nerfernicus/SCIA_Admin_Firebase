// lib/guideAI.js
// Tagalog voice guide for the dashboard, powered by Gemini on Vertex AI.
// The model is called by the `guideAI` Cloud Function (functions/guideAI.js), not from the browser,
// so it works the same in every browser and domain. If the call fails, callers fall back to the
// built-in Tagalog phrases.

import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

const call = httpsCallable(functions, 'guideAI', { timeout: 60000 });

export async function translateLabels(labels) {
  const unique = [...new Set(labels.map((l) => String(l).trim()).filter(Boolean))].slice(0, 60);
  if (!unique.length) return {};
  const { data } = await call({ kind: 'labels', labels: unique });
  return data?.labels && typeof data.labels === 'object' ? data.labels : {};
}

export async function explainPageInTagalog(outline) {
  const { data } = await call({ kind: 'explain', outline });
  return String(data?.text || '').trim();
}
