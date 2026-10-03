import { useEffect, useState } from 'react';
import { Loader2, ShieldAlert, UserPlus } from 'lucide-react';
import AssistedSignup from './AssistedSignup';
import { clearKioskToken, getAssistedSession, readKioskToken } from '../lib/assistedKiosk';

// Public page (no login, no sidebar, no links to the dashboard). The admin who
// opened it has already been signed out, so a senior using this PC cannot reach
// any admin page. Sign-ups are still recorded because every request carries the
// session token the admin started before logging out.
export default function AssistedKiosk() {
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const token = readKioskToken();
    if (!token) {
      setState({ status: 'invalid', message: 'This page has to be opened from the admin dashboard (Assisted Sign-up).' });
      return undefined;
    }
    getAssistedSession({ token })
      .then((res) => {
        if (cancelled) return;
        setState({ status: 'ready', token, ...res.data });
      })
      .catch((err) => {
        if (cancelled) return;
        clearKioskToken();
        setState({
          status: 'invalid',
          message: err.message || 'This sign-up session is not valid. Please ask the staff to start it again.',
        });
      });
    return () => { cancelled = true; };
  }, []);

  if (state.status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 size={28} className="animate-spin text-[#0f52ba]" />
      </div>
    );
  }

  if (state.status === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6 font-sans">
        <div className="max-w-md bg-white rounded-3xl border border-gray-100 shadow-sm p-8 text-center">
          <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldAlert size={26} className="text-amber-600" />
          </div>
          <h1 className="text-lg font-bold text-gray-900 mb-2">Sign-up unavailable</h1>
          <p className="text-sm text-gray-600">{state.message}</p>
        </div>
      </div>
    );
  }

  const endsAt = new Date(state.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#0f52ba] text-white px-6 py-4 flex items-center gap-3">
        <UserPlus size={22} />
        <div>
          <p className="font-bold leading-tight">Senior Citizen Sign-Up</p>
          <p className="text-xs text-blue-100">
            Office of Senior Citizens Affairs · open until {endsAt}
          </p>
        </div>
      </header>
      <AssistedSignup kiosk={{ token: state.token, lockedBarangay: state.lockedBarangay }} />
    </div>
  );
}
