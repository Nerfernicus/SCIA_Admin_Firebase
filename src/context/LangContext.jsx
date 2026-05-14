import React, { createContext, useContext, useState } from 'react';

export const LANGUAGES = {
  en: {
    label: 'English',
    notifications: 'Notifications',
    noNotifications: 'No notifications',
    settings: 'Settings',
    emailNotifs: 'Email Notifications',
    sosSound: 'SOS Alerts Sound',
    darkMode: 'Dark Mode',
    language: 'Language',
    version: 'SCIA Admin v1.0.0',
    profile: 'Profile Information',
    fullName: 'Full Name',
    email: 'Email',
    phone: 'Phone',
    position: 'Position / Title',
    saveProfile: 'Save Profile',
    saving: 'Saving…',
    saved: 'Saved!',
    changePassword: 'Change Password',
    currentPass: 'Current Password',
    newPass: 'New Password',
    updatePassword: 'Update Password',
    updating: 'Updating…',
    passwordUpdated: 'Password Updated!',
    emailCannotChange: 'Email cannot be changed here.',
    superAdmin: 'OSCA Admin',
    subAdmin: 'Barangay Admin',
    welcomeBack: 'Welcome back',
    editProfile: 'Edit profile',
    // Sidebar
    dashboard: 'Dashboard',
    announcements: 'Announcements',
    sosMap: 'SOS Map',
    healthCenters: 'Health Centers',
    idManagement: 'ID Management',
    
    digitalId: 'Digital ID',
    userManagement: 'User Management',
    analytics: 'Analytics',
    generateReport: 'Generate Report',
    signOut: 'Sign Out',
    oscaPlatform: 'OSCA Platform',
    barangayPlatform: 'Barangay Platform',
  },
  fil: {
    label: 'Filipino',
    notifications: 'Mga Abiso',
    noNotifications: 'Walang abiso',
    settings: 'Mga Setting',
    emailNotifs: 'Mga Abiso sa Email',
    sosSound: 'Tunog ng SOS Alerto',
    darkMode: 'Madilim na Mode',
    language: 'Wika',
    version: 'SCIA Admin v1.0.0',
    profile: 'Impormasyon ng Profile',
    fullName: 'Buong Pangalan',
    email: 'Email',
    phone: 'Telepono',
    position: 'Posisyon / Titulo',
    saveProfile: 'I-save ang Profile',
    saving: 'Sine-save…',
    saved: 'Na-save!',
    changePassword: 'Baguhin ang Password',
    currentPass: 'Kasalukuyang Password',
    newPass: 'Bagong Password',
    updatePassword: 'I-update ang Password',
    updating: 'Ina-update…',
    passwordUpdated: 'Na-update ang Password!',
    emailCannotChange: 'Hindi mababago ang email dito.',
    superAdmin: 'OSCA Admin',
    subAdmin: 'Barangay Admin',
    welcomeBack: 'Maligayang pagbabalik',
    editProfile: 'I-edit ang profile',
    dashboard: 'Dashboard',
    announcements: 'Mga Anunsyo',
    sosMap: 'Mapa ng SOS',
    healthCenters: 'Mga Health Center',
    idManagement: 'Pamamahala ng ID',
    
    digitalId: 'Digital ID',
    userManagement: 'Pamamahala ng User',
    analytics: 'Analytics',
    generateReport: 'Gumawa ng Ulat',
    signOut: 'Mag-sign Out',
    oscaPlatform: 'OSCA Platform',
    barangayPlatform: 'Barangay Platform',
  },
  ceb: {
    label: 'Cebuano',
    notifications: 'Mga Pahibalo',
    noNotifications: 'Walay pahibalo',
    settings: 'Mga Setting',
    emailNotifs: 'Pahibalo sa Email',
    sosSound: 'Tunog sa SOS Alerto',
    darkMode: 'Ngitngit nga Mode',
    language: 'Lengguwahe',
    version: 'SCIA Admin v1.0.0',
    profile: 'Impormasyon sa Profile',
    fullName: 'Tibuok Ngalan',
    email: 'Email',
    phone: 'Telepono',
    position: 'Posisyon / Titulo',
    saveProfile: 'I-save ang Profile',
    saving: 'Gi-save…',
    saved: 'Na-save!',
    changePassword: 'Usba ang Password',
    currentPass: 'Karon nga Password',
    newPass: 'Bag-ong Password',
    updatePassword: 'I-update ang Password',
    updating: 'Gi-update…',
    passwordUpdated: 'Na-update ang Password!',
    emailCannotChange: 'Dili mausab ang email dinhi.',
    superAdmin: 'OSCA Admin',
    subAdmin: 'Barangay Admin',
    welcomeBack: 'Welcome balik',
    editProfile: 'I-edit ang profile',
    dashboard: 'Dashboard',
    announcements: 'Mga Pahibalo',
    sosMap: 'Mapa sa SOS',
    healthCenters: 'Mga Health Center',
    idManagement: 'Pagdumala sa ID',
    
    digitalId: 'Digital ID',
    userManagement: 'Pagdumala sa User',
    analytics: 'Analytics',
    generateReport: 'Himoa ang Taho',
    signOut: 'Mag-sign Out',
    oscaPlatform: 'OSCA Platform',
    barangayPlatform: 'Barangay Platform',
  },
};

const LangContext = createContext({ lang: 'en', t: LANGUAGES.en, setLang: () => {} });

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try { return localStorage.getItem('scia_lang') || 'en'; } catch { return 'en'; }
  });

  const setLang = (code) => {
    setLangState(code);
    try { localStorage.setItem('scia_lang', code); } catch {}
  };

  const t = LANGUAGES[lang] || LANGUAGES.en;

  return (
    <LangContext.Provider value={{ lang, t, setLang }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}

export default LangContext;