import './Header.css';
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Bell, Settings, X, Check, AlertTriangle, Megaphone, PackageCheck,
  ShieldCheck, Save, Loader2, Camera, Globe, Volume2,
  Moon, Mail, Menu
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLang, LANGUAGES } from '../context/LangContext';
import { useTheme } from '../context/ThemeContext';
import { doc, updateDoc, collection, onSnapshot, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { RULES, sanitize, validate } from '../lib/validators';
const RULES_HINT = Object.fromEntries(Object.entries(RULES).map(([k, r]) => [k, r.hint]));
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';

// ── Notifications ───────────────────────────────────────────────────────────
// Notifications are assembled from other collections (emergencies, announcements,
// released IDs), so "read" and "closed" are remembered per admin in this browser
// rather than written to those documents.
const NOTIF_LINKS = { sos: '/sos', announcement: '/announcements', id_release: '/id-management', id_received: '/id-management' };
const NOTIF_STATE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const notifKey = (n) => `${n.type}:${n.id}`;

function useNotifState(uid) {
  const storageKey = `scia_notif_state:${uid || 'anon'}`;
  const [state, setState] = useState({ read: {}, closed: {} });

  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey) || 'null');
      const keep = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, ts]) => Date.now() - ts < NOTIF_STATE_TTL_MS));
      setState({ read: keep(raw?.read), closed: keep(raw?.closed) });
    } catch {
      setState({ read: {}, closed: {} });
    }
  }, [storageKey]);

  const update = (fn) => setState((prev) => {
    const next = fn(prev);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* storage unavailable */ }
    return next;
  });

  return {
    state,
    markRead: (key) => update((p) => ({ ...p, read: { ...p.read, [key]: Date.now() } })),
    markAllRead: (keys) => update((p) => ({ ...p, read: { ...p.read, ...Object.fromEntries(keys.map((k) => [k, Date.now()])) } })),
    close: (key) => update((p) => ({ ...p, read: { ...p.read, [key]: Date.now() }, closed: { ...p.closed, [key]: Date.now() } })),
  };
}

function useNotifications(myBarangay) {
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // getDocs, not onSnapshot: avoids Firestore assertion errors from concurrent listeners
  const refresh = React.useCallback(async () => {
    try {
      // Security rule requires server-side where() filtering for barangay-scoped admins
      const releasedIdsQuery = myBarangay
        ? query(collection(db, 'released_ids'), where('barangay', '==', myBarangay), orderBy('releasedAt', 'desc'), limit(8))
        : query(collection(db, 'released_ids'), orderBy('releasedAt', 'desc'), limit(10));

      const [sosSnap, annSnap, idSnap] = await Promise.all([
        getDocs(query(collection(db, 'emergencies'), orderBy('createdAt', 'desc'), limit(10))),
        // Fetch a few extra so filtering out other barangays' posts doesn't leave us short
        getDocs(query(collection(db, 'editorial_health'), orderBy('createdAt', 'desc'), limit(12))),
        getDocs(releasedIdsQuery),
      ]);
      if (!mounted.current) return;

      const sos = sosSnap.docs.map((d) => ({
        id: d.id,
        type: 'sos',
        title: 'SOS Alert',
        body: d.data().barangay || d.data().address || 'Emergency reported',
        time: d.data().createdAt?.toDate?.() || new Date(),
        status: d.data().status,
      }));

      const ann = annSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        // A barangay-scoped admin doesn't get notified about other barangays' posts
        .filter((d) => !myBarangay || d.Audience !== 'BARANGAY' || d.barangay === myBarangay)
        .slice(0, 5)
        .map((d) => ({
          id: d.id,
          type: 'announcement',
          title: d.Title || 'Announcement',
          body: d.Body || '',
          time: d.createdAt?.toDate?.() || new Date(),
        }));

      // Notifies the barangay sub-admin when OSCA releases an ID for their area
      const idReleases = idSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((d) => !myBarangay || d.barangay === myBarangay)
        .slice(0, 5)
        .map((d) => ({
          id: d.id,
          type: 'id_release',
          title: 'ID Released',
          body: `${d.seniorName || 'Senior citizen'}, Brgy. ${d.barangay || 'Unassigned'}`,
          time: d.releasedAt?.toDate?.() || new Date(),
        }));

      setNotifs([...sos, ...ann, ...idReleases].sort((a, b) => b.time - a.time).slice(0, 15));
    } catch (err) {
      console.error('Notification fetch error:', err);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [myBarangay]);

  useEffect(() => { refresh(); }, [refresh]);

  return { notifs, loading, refresh };
}

// OSCA Super Admin only: live feed of physical-ID events reported by barangays
// (ID received / claimed), written by the onIdRequestStatusChange Cloud Function
// into /admin_notifications. One listener, real time, no polling.
function useOscaIdNotifications(enabled) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (!enabled) { setItems([]); return undefined; }
    const q = query(collection(db, 'admin_notifications'), orderBy('createdAt', 'desc'), limit(10));
    const unsub = onSnapshot(
      q,
      (snap) => setItems(snap.docs.map((d) => {
        const n = d.data();
        return {
          id: d.id,
          type: 'id_received',
          title: n.title || 'Physical ID update',
          body: n.body || '',
          time: n.createdAt?.toDate?.() || new Date(),
        };
      })),
      (err) => console.warn('OSCA notification listener error:', err),
    );
    return () => unsub();
  }, [enabled]);
  return items;
}

function NotificationsPanel({ items, loading, isRead, onOpen, onMarkRead, onMarkAllRead, onCloseItem, onClose }) {
  const { t } = useLang();
  const { dark } = useTheme();
  const unreadKeys = items.filter((n) => !isRead(n)).map(notifKey);

  const timeAgo = (date) => {
    const diff = Math.round((Date.now() - date) / 60000);
    if (diff < 1) return 'just now';
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.round(diff / 60)}h ago`;
    return `${Math.round(diff / 1440)}d ago`;
  };

  return (
    <div className={(dark ? 'bg-[#202124] border-white/10' : 'bg-white border-gray-100') + ' absolute right-0 top-12 w-80 max-w-[calc(100vw-24px)] rounded-2xl shadow-2xl border z-50 overflow-hidden'}>
      <div className={(dark ? 'border-white/10' : 'border-gray-100') + ' flex items-center justify-between gap-2 px-4 py-3 border-b'}>
        <span className={(dark ? 'text-[#f0efec]' : 'text-gray-900') + ' font-bold text-sm'}>{t.notifications}</span>
        <div className="flex items-center gap-3">
          {unreadKeys.length > 0 && (
            <button onClick={() => onMarkAllRead(unreadKeys)} className="text-[11px] font-semibold text-[#0f52ba] hover:underline">
              Mark all as read
            </button>
          )}
          <button onClick={onClose} aria-label="Close notifications" className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>
      <div className="max-h-96 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-gray-300" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8">{t.noNotifications}</p>
        ) : (
          items.map((n) => {
            const unread = !isRead(n);
            return (
              <div
                key={notifKey(n)}
                className={`flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0 ${unread ? 'bg-blue-50/40' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => onOpen(n)}
                  title="Open"
                  className="flex items-start gap-3 flex-1 min-w-0 text-left"
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                    n.type === 'sos' ? 'bg-red-100' : n.type === 'id_release' ? 'bg-green-100' : n.type === 'id_received' ? 'bg-teal-100' : 'bg-blue-100'
                  }`}>
                    {n.type === 'sos'
                      ? <AlertTriangle size={14} className="text-red-500" />
                      : n.type === 'id_release'
                      ? <ShieldCheck size={14} className="text-green-600" />
                      : n.type === 'id_received'
                      ? <PackageCheck size={14} className="text-teal-600" />
                      : <Megaphone size={14} className="text-blue-500" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-xs text-gray-900 truncate ${unread ? 'font-bold' : 'font-medium'}`}>
                        {unread && <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#0f52ba] mr-1.5 align-middle" />}
                        {n.title}
                      </p>
                      <span className="text-[10px] text-gray-400 whitespace-nowrap">{timeAgo(n.time)}</span>
                    </div>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{n.body}</p>
                    {n.type === 'sos' && n.status && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded mt-1 inline-block ${
                        n.status === 'pending'    ? 'bg-red-100 text-red-600' :
                        n.status === 'dispatched' ? 'bg-orange-100 text-orange-600' :
                                                   'bg-green-100 text-green-600'
                      }`}>{n.status.toUpperCase()}</span>
                    )}
                  </div>
                </button>
                <div className="flex flex-col gap-1 shrink-0">
                  {unread && (
                    <button onClick={() => onMarkRead(notifKey(n))} title="Mark as read" aria-label="Mark as read" className="p-1 rounded-md text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors">
                      <Check size={13} />
                    </button>
                  )}
                  <button onClick={() => onCloseItem(notifKey(n))} title="Close (remove)" aria-label="Close notification" className="p-1 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                    <X size={13} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function SettingsToggle({ label, icon: Icon, storageKey, defaultOn = true, checked, onChange }) {
  // Controlled mode (checked/onChange passed in) overrides the localStorage toggle
  const isControlled = checked !== undefined;

  const [internalOn, setInternalOn] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored === null ? defaultOn : stored === 'true';
    } catch { return defaultOn; }
  });

  const on = isControlled ? checked : internalOn;

  const toggle = (e) => {
    e.stopPropagation();
    if (isControlled) {
      onChange?.(!on);
      return;
    }
    const next = !on;
    setInternalOn(next);
    try { localStorage.setItem(storageKey, String(next)); } catch {}
  };

  return (
    <div className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
      <div className="flex items-center gap-2 min-w-0 mr-3">
        {Icon && <Icon size={14} className="text-gray-400 shrink-0" />}
        <span className="text-sm text-gray-700 truncate">{label}</span>
      </div>
      {/* Toggle — fixed 36×20px, never overflows */}
      <button
        type="button"
        onClick={toggle}
        role="switch"
        aria-checked={on}
        style={{ width: 36, height: 20, minWidth: 36 }}
        className={`relative rounded-full transition-colors duration-200 shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-1 ${
          on ? 'bg-[#0f52ba]' : 'bg-gray-300'
        }`}
      >
        <span
          style={{
            width: 14, height: 14,
            transform: on ? 'translateX(18px)' : 'translateX(3px)',
          }}
          className="absolute top-[3px] bg-white rounded-full shadow transition-transform duration-200 block"
        />
      </button>
    </div>
  );
}

function SettingsPanel({ onClose }) {
  const { t, lang, setLang } = useLang();
  const { dark, toggleDark } = useTheme();

  return (
    <div className={(dark ? 'bg-[#202124] border-white/10' : 'bg-white border-gray-100') + ' absolute right-0 top-12 w-72 max-w-[calc(100vw-24px)] rounded-2xl shadow-2xl border z-50 overflow-hidden'}>
      <div className={(dark ? 'border-white/10' : 'border-gray-100') + ' flex items-center justify-between px-4 py-3 border-b'}>
        <span className={(dark ? 'text-[#f0efec]' : 'text-gray-900') + ' font-bold text-sm'}>{t.settings}</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="p-2">
        <SettingsToggle label={t.emailNotifs} icon={Mail}    storageKey="setting_email_notifs" defaultOn={true} />
        <SettingsToggle label={t.sosSound}    icon={Volume2} storageKey="setting_sos_sound"    defaultOn={true} />
        <SettingsToggle label={t.darkMode}    icon={Moon}    checked={dark} onChange={toggleDark} />
      </div>

      <div className={(dark ? 'border-white/10' : 'border-gray-100') + ' px-4 py-3 border-t'}>
        <div className="flex items-center gap-2 mb-2">
          <Globe size={14} className="text-gray-400 shrink-0" />
          <span className="text-sm font-semibold text-gray-700">{t.language}</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {Object.entries(LANGUAGES).map(([code, def]) => (
            <button
              key={code}
              onClick={() => setLang(code)}
              className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-colors ${
                lang === code
                  ? 'bg-[#0f52ba] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {def.label}
            </button>
          ))}
        </div>
      </div>

      <div className={(dark ? 'border-white/10' : 'border-gray-100') + ' px-4 pb-3 pt-1 border-t'}>
        <p className="text-[10px] text-gray-400 text-center">{t.version}</p>
      </div>
    </div>
  );
}

function AdminProfileModal({ onClose }) {
  const { user, adminData, setAdminData } = useAuth();
  const { t } = useLang();
  const [name,     setName]     = useState(adminData?.name     || '');
  const [email,    setEmail]    = useState(adminData?.email    || user?.email || '');
  const [phone,    setPhone]    = useState(adminData?.phone    || '');
  const [position, setPosition] = useState(adminData?.position || '');
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState('');
  // Per-field message shown in red when a typed character was rejected or the value is invalid.
  const [fieldErr, setFieldErr] = useState({});

  const setField = (key, kind, setter) => (raw) => {
    const { value, rejected } = sanitize(kind, raw);
    setter(value);
    setFieldErr((prev) => ({ ...prev, [key]: rejected ? RULES_HINT[kind] : '' }));
  };

  const [currentPass, setCurrentPass] = useState('');
  const [newPass,     setNewPass]     = useState('');
  const [passError,   setPassError]   = useState('');
  const [passSaving,  setPassSaving]  = useState(false);
  const [passSaved,   setPassSaved]   = useState(false);

  const handleSaveProfile = async () => {
    const errs = {
      name: validate('name', name),
      phone: validate('phone', phone, { required: false }),
      position: validate('position', position, { required: false }),
    };
    setFieldErr(errs);
    if (errs.name || errs.phone || errs.position) { setError('Please fix the highlighted fields.'); return; }
    setSaving(true); setError('');
    try {
      const ref = doc(db, 'admins', user.uid);
      const updates = { name: name.trim(), phone: phone.trim(), position: position.trim() };
      await updateDoc(ref, updates);
      if (setAdminData) setAdminData(prev => ({ ...prev, ...updates }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error(err);
      setError('Failed to save. Please try again.');
    } finally { setSaving(false); }
  };

  const handleChangePassword = async () => {
    if (!currentPass || !newPass) { setPassError('Both fields are required.'); return; }
    if (newPass.length < 6) { setPassError('New password must be at least 6 characters.'); return; }
    setPassSaving(true); setPassError('');
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPass);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPass);
      setCurrentPass(''); setNewPass('');
      setPassSaved(true);
      setTimeout(() => setPassSaved(false), 2500);
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setPassError('Current password is incorrect.');
      } else {
        setPassError('Failed to update password.');
      }
    } finally { setPassSaving(false); }
  };

  const avatarSeed = adminData?.name || user?.email || 'admin';

  // Rendered into document.body with a z-index above every page layer (the SOS
  // Map page uses z-[2000] for its header and z-[1000] for its panels), so this
  // modal and its blurred backdrop always cover the whole screen.
  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md z-10 overflow-hidden">

        <div className="h-24 bg-gradient-to-r from-[#0f52ba] to-blue-400 relative">
          <button onClick={onClose} className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex justify-center -mt-10 mb-3">
          <div className="relative">
            <div className="w-20 h-20 rounded-full border-4 border-white shadow-lg overflow-hidden bg-gray-100">
              <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=${avatarSeed}`} alt="avatar" className="w-full h-full object-cover" />
            </div>
            <div className="absolute bottom-0 right-0 w-6 h-6 bg-[#0f52ba] rounded-full flex items-center justify-center border-2 border-white">
              <Camera size={10} className="text-white" />
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 max-h-[65vh] overflow-y-auto space-y-5">
          <div className="text-center">
            <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full ${
              adminData?.role === 'super_admin' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
            }`}>
              {adminData?.role === 'super_admin' ? t.superAdmin : t.subAdmin}
            </span>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-bold text-gray-700">{t.profile}</h3>
            {error && <p className="text-xs text-red-500 font-semibold">{error}</p>}
            {[
              { key: 'name',     label: t.fullName, value: name, setter: setField('name', 'name', setName), placeholder: 'Enter full name', disabled: false },
              { key: 'email',    label: t.email,    value: email, setter: null,    placeholder: '',               disabled: true  },
              { key: 'phone',    label: t.phone,    value: phone, setter: setField('phone', 'phone', setPhone), placeholder: 'e.g. 09171234567', disabled: false, inputMode: 'tel' },
              { key: 'position', label: t.position, value: position, setter: setField('position', 'position', setPosition), placeholder: 'e.g. Health Officer', disabled: false },
            ].map(({ key, label, value, setter, placeholder, disabled, inputMode }) => (
              <div key={label}>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{label}</label>
                <input
                  value={value}
                  onChange={setter ? e => setter(e.target.value) : undefined}
                  placeholder={placeholder}
                  disabled={disabled}
                  inputMode={inputMode}
                  aria-invalid={!!fieldErr[key]}
                  className={`w-full border rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all ${
                    disabled ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                      : fieldErr[key] ? 'bg-red-50 border-red-300 text-gray-800' : 'bg-gray-50 border-gray-200 text-gray-800'
                  }`}
                />
                {fieldErr[key] && <p className="text-[11px] text-red-500 font-semibold mt-1">{fieldErr[key]}</p>}
                {disabled && <p className="text-[10px] text-gray-400 mt-1">{t.emailCannotChange}</p>}
              </div>
            ))}
            <button onClick={handleSaveProfile} disabled={saving}
              className="w-full py-2.5 rounded-xl bg-[#0f52ba] hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-bold flex items-center justify-center gap-2 transition-all">
              {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : <Save size={15} />}
              {saving ? t.saving : saved ? t.saved : t.saveProfile}
            </button>
          </div>

          <div className="border-t border-gray-100" />

          <div className="space-y-3">
            <h3 className="text-sm font-bold text-gray-700">{t.changePassword}</h3>
            {passError && <p className="text-xs text-red-500 font-semibold">{passError}</p>}
            {[
              { label: t.currentPass, value: currentPass, setter: setCurrentPass },
              { label: t.newPass,     value: newPass,     setter: setNewPass },
            ].map(({ label, value, setter }) => (
              <div key={label}>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{label}</label>
                <input type="password" value={value} onChange={e => setter(e.target.value)} placeholder="••••••••"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all" />
              </div>
            ))}
            <button onClick={handleChangePassword} disabled={passSaving}
              className="w-full py-2.5 rounded-xl border-2 border-[#0f52ba] text-[#0f52ba] hover:bg-blue-50 disabled:opacity-60 text-sm font-bold flex items-center justify-center gap-2 transition-all">
              {passSaving ? <Loader2 size={15} className="animate-spin" /> : passSaved ? <Check size={15} /> : <ShieldCheck size={15} />}
              {passSaving ? t.updating : passSaved ? t.passwordUpdated : t.updatePassword}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function Header({ onMenuClick }) {
  const { user, adminData, isSuperAdmin } = useAuth();
  const { t } = useLang();
  const { dark } = useTheme();
  const [showNotifs,   setShowNotifs]   = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showProfile,  setShowProfile]  = useState(false);

  const notifsRef   = useRef(null);
  const settingsRef = useRef(null);

  const navigate = useNavigate();
  const { notifs, loading: notifsLoading, refresh: refreshNotifs } = useNotifications(adminData?.barangay || null);
  const oscaIdNotifs = useOscaIdNotifications(!!isSuperAdmin);
  const notifState = useNotifState(user?.uid);
  const isRead = (n) => !!notifState.state.read[notifKey(n)];
  const visibleNotifs = [...oscaIdNotifs, ...notifs]
    .sort((a, b) => b.time - a.time)
    .filter((n) => !notifState.state.closed[notifKey(n)]);
  const unreadCount = visibleNotifs.filter((n) => !isRead(n)).length;

  // Opening a notification marks it read and goes to the related page.
  const openNotification = (n) => {
    notifState.markRead(notifKey(n));
    setShowNotifs(false);
    const link = NOTIF_LINKS[n.type];
    if (link) navigate(link);
  };

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
      <header className={(dark ? 'bg-[#202124] border-white/10' : 'bg-white border-gray-100') + ' sticky top-0 z-30 border-b px-3 sm:px-6 py-3 flex items-center justify-between gap-2 font-sans'}>
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onMenuClick}
            className={(dark ? 'text-[#96958d] hover:bg-white/5' : 'text-gray-500 hover:bg-gray-100') + ' md:hidden w-9 h-9 flex items-center justify-center rounded-xl shrink-0'}
            title="Menu"
          >
            <Menu size={18} />
          </button>
          <div className="min-w-0">
            <p className={(dark ? 'text-[#7a7970]' : 'text-gray-400') + ' text-xs font-medium hidden sm:block'}>
              {new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
            <h2 className={(dark ? 'text-[#ddd9d2]' : 'text-gray-800') + ' text-sm font-bold leading-tight truncate'}>
              {t.welcomeBack}, {adminData?.name?.split(' ')[0] || 'Admin'} 👋
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="relative" ref={notifsRef}>
            <button
              onClick={() => { if (!showNotifs) refreshNotifs(); setShowNotifs(v => !v); setShowSettings(false); }}
              className={(dark ? 'border-white/10 text-[#96958d] hover:bg-white/5 hover:text-[#ddd9d2]' : 'border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-800') + ' relative w-9 h-9 flex items-center justify-center rounded-xl border transition-colors'}
              title={t.notifications}
            >
              <Bell size={17} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {showNotifs && (
              <NotificationsPanel
                items={visibleNotifs}
                loading={notifsLoading}
                isRead={isRead}
                onOpen={openNotification}
                onMarkRead={notifState.markRead}
                onMarkAllRead={notifState.markAllRead}
                onCloseItem={notifState.close}
                onClose={() => setShowNotifs(false)}
              />
            )}
          </div>

          <div className="relative" ref={settingsRef}>
            <button
              onClick={() => { setShowSettings(v => !v); setShowNotifs(false); }}
              className={(dark ? 'border-white/10 text-[#96958d] hover:bg-white/5 hover:text-[#ddd9d2]' : 'border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-800') + ' w-9 h-9 flex items-center justify-center rounded-xl border transition-colors'}
              title={t.settings}
            >
              <Settings size={17} />
            </button>
            {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
          </div>

          <button
            onClick={() => { setShowProfile(true); setShowNotifs(false); setShowSettings(false); }}
            className="w-9 h-9 rounded-full overflow-hidden border-2 border-[#0f52ba] hover:opacity-80 transition-opacity shrink-0"
            title={t.editProfile}
          >
            <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=${avatarSeed}`} alt="avatar" className="w-full h-full object-cover" />
          </button>
        </div>
      </header>

      {showProfile && <AdminProfileModal onClose={() => setShowProfile(false)} />}
    </>
  );
}
