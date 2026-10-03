
// Callables for the assisted sign-up "kiosk" tab. See functions/functions.js
// ("Assisted sign-up kiosk sessions") for how the session token works.
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

// Signed-in admin only: returns { token, expiresAt }.
export const startAssistedSession = httpsCallable(functions, 'startAssistedSession');
// Token only (works while logged out): returns { valid, lockedBarangay, expiresAt, remaining }.
export const getAssistedSession = httpsCallable(functions, 'getAssistedSession');
// Token only: same result as createAssistedSeniorAccount.
export const createAssistedSeniorAccountWithSession = httpsCallable(
  functions,
  'createAssistedSeniorAccountWithSession',
);

// The token lives only in this tab's sessionStorage (so a refresh keeps working
// but a new tab does not inherit it) and is removed from the address bar.
const KEY = 'scia_assisted_kiosk_token';

export function readKioskToken() {
  const fromHash = window.location.hash.replace(/^#/, '');
  if (fromHash) {
    try { sessionStorage.setItem(KEY, fromHash); } catch { /* storage unavailable */ }
    window.history.replaceState(null, '', window.location.pathname);
    return fromHash;
  }
  try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; }
}

export function clearKioskToken() {
  try { sessionStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}
