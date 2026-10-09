// src/lib/monitoring.js
//
// Error + performance reporting for the admin dashboard (Sentry).
// Does nothing unless VITE_SENTRY_DSN is set, so local dev and CI stay quiet.
//
// PRIVACY: the dashboard shows senior citizens' personal data. Reports contain
// only the error, its stack trace and the signed-in admin's uid (no name, email
// or IP). Phone numbers are redacted from messages, query strings are stripped
// from URLs, and console / input breadcrumbs are dropped.

import * as Sentry from '@sentry/react';

const PH_PHONE = /(\+?63|0)9\d{9}/g;
const redact = (text) => (typeof text === 'string' ? text.replace(PH_PHONE, '[phone]') : text);

export function scrubEvent(event) {
  if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined;
  if (event.request) {
    if (event.request.url) event.request.url = event.request.url.split('?')[0].split('#')[0];
    delete event.request.headers;
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.query_string;
  }
  if (event.message) event.message = redact(event.message);
  for (const ex of (event.exception && event.exception.values) || []) ex.value = redact(ex.value);
  return event;
}

let started = false;

export function initMonitoring() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn || started) return;
  started = true;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: typeof __APP_RELEASE__ !== 'undefined' && __APP_RELEASE__ ? __APP_RELEASE__ : undefined,
    sendDefaultPii: false,
    // Performance: sample 10% of page loads / navigations to keep within the free quota.
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
    beforeSend: scrubEvent,
    beforeBreadcrumb: (b) => (b.category === 'console' || b.category === 'ui.input' ? null : b),
    // Browser noise that is not a bug in this app.
    ignoreErrors: ['ResizeObserver loop', 'Non-Error promise rejection captured', 'Load failed', 'Failed to fetch'],
  });
}

// Only the Firebase uid is attached to reports: it lets you find "what did this admin hit".
export function setMonitoringUser(uid) {
  if (!started) return;
  Sentry.setUser(uid ? { id: uid } : null);
}

export const ErrorBoundary = Sentry.ErrorBoundary;
