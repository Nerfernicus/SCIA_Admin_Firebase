import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]         = useState(null);
  const [role, setRole]         = useState(null); // 'super_admin' | 'sub_admin'
  const [adminData, setAdminData] = useState(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Fetch the admin document from Firestore to get their role
        try {
          const adminRef = doc(db, 'admins', firebaseUser.uid);
          const adminSnap = await getDoc(adminRef);
          if (adminSnap.exists()) {
            const data = adminSnap.data();
            setUser(firebaseUser);
            setRole(data.role); // 'super_admin' or 'sub_admin'
            setAdminData(data);
          } else {
            // User exists in Firebase Auth but has no admin record – sign them out
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

  const logout = () => signOut(auth);

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
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}