import React, { useState, useEffect, useRef } from 'react';
import { Bell, Settings, X, Check, AlertTriangle, Megaphone, ShieldCheck, Save, Loader2, Camera } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { doc, updateDoc, collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';

// ── Notifications Panel ───────────────────────────────────────────────────────
function NotificationsPanel({ onClose }) {
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Pull recent SOS + announcements as notifications
    const unsubSOS = onSnapshot(
      query(collection(db, 'emergencies'), orderBy('createdAt', 'desc'), limit(5)),
      (snap) => {
        const sos = snap.docs.map(d => ({
          id: d.id,
          type: 'sos',
          title: 'SOS Alert',
          body: d.data().barangay || d.data().address || 'Emergency reported',
          time: d.data().createdAt?.toDate?.() || new Date(),
          status: d.data().status,
        }));
        setNotifs(prev => {
          const ann = prev.filter(n => n.type === 'announcement');
          return [...sos, ...ann].sort((a, b) => b.time - a.time).slice(0, 8);
        });
        setLoading(false);
      },
      () => setLoading(false)
    );

    const unsubAnn = onSnapshot(
      query(collection(db, 'editorial_health'), orderBy('createdAt', 'desc'), limit(3)),
      (snap) => {
        const ann = snap.docs.map(d => ({
          id: d.id,
          type: 'announcement',
          title: d.data().Title || 'Announcement',
          body: d.data().Body || '',
          time: d.data().createdAt?.toDate?.() || new Date(),
        }));
        setNotifs(prev => {
          const sos = prev.filter(n => n.type === 'sos');
          return [...sos, ...ann].sort((a, b) => b.time - a.time).slice(0, 8);
        });
      }
    );

    return () => { unsubSOS(); unsubAnn(); };
  }, []);

  const timeAgo = (date) => {
    const diff = Math.round((Date.now() - date) / 60000);
    if (diff < 1) return 'just now';
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.round(diff / 60)}h ago`;
    return `${Math.round(diff / 1440)}d ago`;
  };

  return (
    <div className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="font-bold text-gray-900 text-sm">Notifications</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
          <X size={16} />
        </button>
      </div>
      <div className="max-h-80 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-gray-300" />
          </div>
        ) : notifs.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8">No notifications</p>
        ) : (
          notifs.map(n => (
            <div key={n.id + n.type} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                n.type === 'sos' ? 'bg-red-100' : 'bg-blue-100'
              }`}>
                {n.type === 'sos'
                  ? <AlertTriangle size={14} className="text-red-500" />
                  : <Megaphone size={14} className="text-blue-500" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-gray-900 truncate">{n.title}</p>
                  <span className="text-[10px] text-gray-400 whitespace-nowrap">{timeAgo(n.time)}</span>
                </div>
                <p className="text-xs text-gray-500 truncate mt-0.5">{n.body}</p>
                {n.type === 'sos' && n.status && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded mt-1 inline-block ${
                    n.status === 'pending' ? 'bg-red-100 text-red-600' :
                    n.status === 'dispatched' ? 'bg-orange-100 text-orange-600' :
                    'bg-green-100 text-green-600'
                  }`}>{n.status.toUpperCase()}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Settings Panel ────────────────────────────────────────────────────────────
function SettingsPanel({ onClose }) {
  return (
    <div className="absolute right-0 top-12 w-64 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="font-bold text-gray-900 text-sm">Settings</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
          <X size={16} />
        </button>
      </div>
      <div className="p-2">
        {[
          { label: 'Email Notifications', defaultOn: true },
          { label: 'SOS Alerts Sound',    defaultOn: true },
          { label: 'Dark Mode',           defaultOn: false },
        ].map(s => (
          <SettingsToggle key={s.label} label={s.label} defaultOn={s.defaultOn} />
        ))}
      </div>
      <div className="px-4 pb-3 pt-1 border-t border-gray-100 mt-1">
        <p className="text-[10px] text-gray-400 text-center">SCIA Admin v1.0.0</p>
      </div>
    </div>
  );
}

function SettingsToggle({ label, defaultOn }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <div className="flex items-center justify-between px-2 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
      <span className="text-sm text-gray-700">{label}</span>
      <button
        onClick={() => setOn(!on)}
        className={`w-9 h-5 rounded-full transition-colors duration-200 relative flex-shrink-0 ${on ? 'bg-[#0f52ba]' : 'bg-gray-200'}`}
      >
        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}

// ── Admin Profile Modal ───────────────────────────────────────────────────────
function AdminProfileModal({ onClose }) {
  const { user, adminData, setAdminData } = useAuth();
  const [name,     setName]     = useState(adminData?.name     || '');
  const [email,    setEmail]    = useState(adminData?.email    || user?.email || '');
  const [phone,    setPhone]    = useState(adminData?.phone    || '');
  const [position, setPosition] = useState(adminData?.position || '');
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState('');

  // Password change
  const [currentPass, setCurrentPass] = useState('');
  const [newPass,     setNewPass]     = useState('');
  const [passError,   setPassError]   = useState('');
  const [passSaving,  setPassSaving]  = useState(false);
  const [passSaved,   setPassSaved]   = useState(false);

  const handleSaveProfile = async () => {
    if (!name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      const ref = doc(db, 'admins', user.uid);
      const updates = { name: name.trim(), phone: phone.trim(), position: position.trim() };
      await updateDoc(ref, updates);
      // Update local auth context data so sidebar reflects change immediately
      if (setAdminData) setAdminData(prev => ({ ...prev, ...updates }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error(err);
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPass || !newPass) { setPassError('Both fields are required.'); return; }
    if (newPass.length < 6) { setPassError('New password must be at least 6 characters.'); return; }
    setPassSaving(true);
    setPassError('');
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPass);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPass);
      setCurrentPass('');
      setNewPass('');
      setPassSaved(true);
      setTimeout(() => setPassSaved(false), 2500);
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setPassError('Current password is incorrect.');
      } else {
        setPassError('Failed to update password.');
      }
    } finally {
      setPassSaving(false);
    }
  };

  const avatarSeed = adminData?.name || user?.email || 'admin';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md z-10 overflow-hidden">

        {/* Top banner */}
        <div className="h-24 bg-gradient-to-r from-[#0f52ba] to-blue-400 relative">
          <button onClick={onClose} className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Avatar */}
        <div className="flex justify-center -mt-10 mb-3">
          <div className="relative">
            <div className="w-20 h-20 rounded-full border-4 border-white shadow-lg overflow-hidden bg-gray-100">
              <img
                src={`https://api.dicebear.com/7.x/notionists/svg?seed=${avatarSeed}`}
                alt="avatar"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="absolute bottom-0 right-0 w-6 h-6 bg-[#0f52ba] rounded-full flex items-center justify-center border-2 border-white">
              <Camera size={10} className="text-white" />
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 max-h-[65vh] overflow-y-auto space-y-5">

          {/* Role badge */}
          <div className="text-center">
            <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full ${
              adminData?.role === 'super_admin'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-blue-100 text-blue-700'
            }`}>
              {adminData?.role === 'super_admin' ? 'Super Admin' : 'Sub Admin'}
            </span>
          </div>

          {/* Profile fields */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-gray-700">Profile Information</h3>

            {error && <p className="text-xs text-red-500 font-semibold">{error}</p>}

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Full Name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Enter full name"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Email</label>
              <input
                value={email}
                disabled
                className="w-full bg-gray-100 border border-gray-200 rounded-xl py-2.5 px-3 text-sm text-gray-400 cursor-not-allowed"
              />
              <p className="text-[10px] text-gray-400 mt-1">Email cannot be changed here.</p>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Phone</label>
              <input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="e.g. +63 912 345 6789"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Position / Title</label>
              <input
                value={position}
                onChange={e => setPosition(e.target.value)}
                placeholder="e.g. Health Officer"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all"
              />
            </div>

            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="w-full py-2.5 rounded-xl bg-[#0f52ba] hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-bold flex items-center justify-center gap-2 transition-all"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : <Save size={15} />}
              {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Profile'}
            </button>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-100" />

          {/* Password change */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-gray-700">Change Password</h3>

            {passError && <p className="text-xs text-red-500 font-semibold">{passError}</p>}

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Current Password</label>
              <input
                type="password"
                value={currentPass}
                onChange={e => setCurrentPass(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">New Password</label>
              <input
                type="password"
                value={newPass}
                onChange={e => setNewPass(e.target.value)}
                placeholder="Min. 6 characters"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all"
              />
            </div>

            <button
              onClick={handleChangePassword}
              disabled={passSaving}
              className="w-full py-2.5 rounded-xl border-2 border-[#0f52ba] text-[#0f52ba] hover:bg-blue-50 disabled:opacity-60 text-sm font-bold flex items-center justify-center gap-2 transition-all"
            >
              {passSaving ? <Loader2 size={15} className="animate-spin" /> : passSaved ? <Check size={15} /> : <ShieldCheck size={15} />}
              {passSaving ? 'Updating…' : passSaved ? 'Password Updated!' : 'Update Password'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────
export default function Header() {
  const { user, adminData } = useAuth();
  const [showNotifs,   setShowNotifs]   = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showProfile,  setShowProfile]  = useState(false);
  const [unreadCount,  setUnreadCount]  = useState(0);

  const notifsRef   = useRef(null);
  const settingsRef = useRef(null);

  // Count unread SOS alerts as unread notifications
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'emergencies'), orderBy('createdAt', 'desc'), limit(20)),
      (snap) => {
        const pending = snap.docs.filter(d => d.data().status === 'pending').length;
        setUnreadCount(pending);
      },
      () => {}
    );
    return () => unsub();
  }, []);

  // Close panels on outside click
  useEffect(() => {
    const handler = (e) => {
      if (notifsRef.current   && !notifsRef.current.contains(e.target))   setShowNotifs(false);
      if (settingsRef.current && !settingsRef.current.contains(e.target)) setShowSettings(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const avatarSeed = adminData?.name || user?.email || 'admin';

  return (
    <>
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between font-sans">
        {/* Left */}
        <div>
          <p className="text-xs text-gray-400 font-medium">
            {new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
          <h2 className="text-sm font-bold text-gray-800 leading-tight">
            Welcome back, {adminData?.name?.split(' ')[0] || 'Admin'} 👋
          </h2>
        </div>

        {/* Right */}
        <div className="flex items-center gap-2">

          {/* Notifications */}
          <div className="relative" ref={notifsRef}>
            <button
              onClick={() => { setShowNotifs(!showNotifs); setShowSettings(false); }}
              className="relative w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors"
            >
              <Bell size={17} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {showNotifs && <NotificationsPanel onClose={() => setShowNotifs(false)} />}
          </div>

          {/* Settings */}
          <div className="relative" ref={settingsRef}>
            <button
              onClick={() => { setShowSettings(!showSettings); setShowNotifs(false); }}
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors"
            >
              <Settings size={17} />
            </button>
            {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
          </div>

          {/* Avatar → profile modal */}
          <button
            onClick={() => { setShowProfile(true); setShowNotifs(false); setShowSettings(false); }}
            className="w-9 h-9 rounded-full overflow-hidden border-2 border-[#0f52ba] hover:opacity-80 transition-opacity flex-shrink-0"
            title="Edit profile"
          >
            <img
              src={`https://api.dicebear.com/7.x/notionists/svg?seed=${avatarSeed}`}
              alt="avatar"
              className="w-full h-full object-cover"
            />
          </button>
        </div>
      </header>

      {showProfile && <AdminProfileModal onClose={() => setShowProfile(false)} />}
    </>
  );
}
