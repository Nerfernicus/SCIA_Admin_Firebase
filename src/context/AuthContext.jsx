import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

const AuthContext = createContext(null);

// Barangay (sub_admin) accounts are signed out after this long with no mouse,
// keyboard, touch or scroll activity, so an unattended screen cannot be used.
const IDLE_LIMIT_MS = 5 * 60 * 1000;
const IDLE_WARNING_MS = 30 * 1000;
const ACTIVITY_KEY = 'scia_last_activity'; // shared across tabs of this browser
const NOTICE_KEY = 'scia_lock_notice';     // read and cleared by the Login page
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel', 'click'];

const setNotice = (msg) => {
  try { sessionStorage.setItem(NOTICE_KEY, msg); } catch { /* storage unavailable */ }
};
const readLastActivity = () => {
  try { return Number(localStorage.getItem(ACTIVITY_KEY)) || 0; } catch { return 0; }
};
const writeLastActivity = (ms) => {
  try { localStorage.setItem(ACTIVITY_KEY, String(ms)); } catch { /* storage unavailable */ }
};

export function AuthProvider({ children }) {
  const [user, setUser]         = useState(null);
  const [role, setRole]         = useState(null); // 'super_admin' | 'sub_admin'
  const [adminData, setAdminData] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [idleSecondsLeft, setIdleSecondsLeft] = useState(0);
  const lastActivityRef = useRef(Date.now());

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Fetch the admin document from Firestore to get their role
        try {
          const adminRef = doc(db, 'admins', firebaseUser.uid);
          const adminSnap = await getDoc(adminRef);
          if (adminSnap.exists()) {
            const data = adminSnap.data();
            if (data.locked === true) {
              // The OSCA Super Admin locked this account. (The login page already
              // shows its own message when this happens during sign-in.)
              if (!window.location.pathname.startsWith('/login')) {
                setNotice('This account has been locked by the OSCA Super Admin. Please contact them to unlock it.');
              }
              await signOut(auth);
              setUser(null);
              setRole(null);
              setAdminData(null);
            } else {
              const r = typeof data.role === 'string' ? data.role.trim() : data.role;
              // A fresh sign-in starts a fresh idle clock; a page reload of an
              // existing session keeps the old one, so leaving the browser open
              // overnight still locks the account.
              if (r === 'sub_admin') {
                const stored = readLastActivity();
                const fresh = stored && Date.now() - stored < IDLE_LIMIT_MS;
                if (!fresh) {
                  const cameFromLogin = window.location.pathname.startsWith('/login');
                  if (cameFromLogin) {
                    writeLastActivity(Date.now());
                  } else {
                    setNotice('You were signed out after 5 minutes of inactivity. Please sign in again.');
                    await signOut(auth);
                    setUser(null);
                    setRole(null);
                    setAdminData(null);
                    setLoading(false);
                    return;
                  }
                }
              }
              setUser(firebaseUser);
              setRole(r); // 'super_admin' or 'sub_admin'
              setAdminData(data);
            }
          } else {
            // User exists in Firebase Auth but has no admin record, sign them out
            await signOut(auth);
            setUser(null);
            setRole(null);
            setAdminData(null);
          }
        } catch (err) {
          console.error('Failed to fetch admin data:', err);
          setUser(null);
          setRole(null);
          setAdminData(null);
        }
      } else {
        setUser(null);
        setRole(null);
        setAdminData(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // If the Super Admin locks this account while it is open, sign out right away.
  useEffect(() => {
    if (!user) return undefined;
    const unsub = onSnapshot(
      doc(db, 'admins', user.uid),
      (snap) => {
        if (snap.exists() && snap.data().locked === true) {
          setNotice('This account has been locked by the OSCA Super Admin. Please contact them to unlock it.');
          signOut(auth);
        }
      },
      () => { /* permission errors after sign-out are expected */ },
    );
    return () => unsub();
  }, [user]);

  // Barangay admin idle auto-lock (5 minutes).
  useEffect(() => {
    if (!user || role !== 'sub_admin') {
      setIdleSecondsLeft(0);
      return undefined;
    }

    lastActivityRef.current = Math.max(readLastActivity(), Date.now());
    writeLastActivity(lastActivityRef.current);

    let lastWrite = 0;
    const onActivity = () => {
      const now = Date.now();
      lastActivityRef.current = now;
      if (now - lastWrite > 5000) { // throttle storage writes
        lastWrite = now;
        writeLastActivity(now);
      }
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    let locked = false;
    const check = () => {
      if (locked) return;
      // Activity in another tab of this browser counts too.
      const last = Math.max(lastActivityRef.current, readLastActivity());
      const remaining = IDLE_LIMIT_MS - (Date.now() - last);
      if (remaining <= 0) {
        locked = true;
        setNotice('You were signed out after 5 minutes of inactivity. Please sign in again.');
        setIdleSecondsLeft(0);
        signOut(auth);
      } else {
        setIdleSecondsLeft(remaining <= IDLE_WARNING_MS ? Math.ceil(remaining / 1000) : 0);
      }
    };
    const timer = setInterval(check, 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [user, role]);

  const logout = () => {
    try { localStorage.removeItem(ACTIVITY_KEY); } catch { /* storage unavailable */ }
    return signOut(auth);
  };

  // Permission helpers
  const isSuperAdmin = role === 'super_admin';
  const isSubAdmin   = role === 'sub_admin';

  // Super admin pages
  const canAccessIDVerification  = isSuperAdmin;
  const canAccessUserManagement  = isSuperAdmin;
  const canAccessFullAnalytics   = isSuperAdmin; // sees ALL analytics

  // Sub admin pages
  const canAccessAnnouncements = isSubAdmin || isSuperAdmin;
  const canAccessSOS           = isSubAdmin || isSuperAdmin;
  const canAccessHealthCenters = isSubAdmin || isSuperAdmin;

  return (
    <AuthContext.Provider value={{
      user,
      role,
      adminData,
      setAdminData,
      loading,
      logout,
      isSuperAdmin,
      isSubAdmin,
      canAccessIDVerification,
      canAccessUserManagement,
      canAccessFullAnalytics,
      canAccessAnnouncements,
      canAccessSOS,
      canAccessHealthCenters,
    }}>
      {children}

      {idleSecondsLeft > 0 && (
        <div
          role="alert"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-10002 bg-amber-500 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3"
        >
          <span>Locking due to inactivity in {idleSecondsLeft}s. Move the mouse or press a key to stay signed in.</span>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
