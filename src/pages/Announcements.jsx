import React, { useState, useEffect } from 'react';
import {
  Plus, AlignLeft,
  ChevronDown,
  Send, CheckCircle2, Edit3, AlertCircle,
  X, Loader2, MapPin, Calendar, FileText,
  QrCode, ListPlus, Trash2, GripVertical
} from 'lucide-react';
import { db } from "../lib/firebase";
import {
  collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp
} from "firebase/firestore";
import { useAuth } from "../context/AuthContext";

const COLLECTION_ID = "editorial_health";

export default function Announcements() {
  const { adminData } = useAuth();
  const myBarangay = adminData?.barangay || null; // null for OSCA + the generic sub_admin

  const [publishTime, setPublishTime] = useState('Immediately');
  const [expiration, setExpiration]   = useState('Never');
  const [what, setWhat]               = useState('');
  const [when, setWhen]               = useState('');
  const [where, setWhere]             = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving]           = useState(false);
  const [toast, setToast]             = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [audience, setAudience] = useState(myBarangay ? "BARANGAY" : "ALL");
  const [barangay, setBarangay] = useState(myBarangay || "");

  // A barangay-scoped admin's audience is always their own barangay,
  // regardless of what local state says — this is what saveDocument uses.
  const effectiveAudience = myBarangay ? "BARANGAY" : audience;
  const effectiveBarangay = myBarangay ? myBarangay : barangay;

  // Joinable event + dynamic sign-up form (drives the mobile app's
  // swipeable "Join" carousel — see EventJoinFormModal.tsx on the FE)
  const [isJoinable, setIsJoinable] = useState(false);
  const [formFields, setFormFields] = useState([]); // { id, label, type, required, options? }

  const FIELD_TYPES = [
    { value: "text",     label: "Short text" },
    { value: "number",   label: "Number" },
    { value: "textarea", label: "Long text" },
    { value: "select",   label: "Multiple choice" },
  ];

  const addFormField = () => {
    setFormFields((prev) => [
      ...prev,
      {
        id: `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        label: "",
        type: "text",
        required: false,
        options: [],
      },
    ]);
  };

  const updateFormField = (id, patch) => {
    setFormFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const removeFormField = (id) => {
    setFormFields((prev) => prev.filter((f) => f.id !== id));
  };

  const updateFieldOptions = (id, rawText) => {
    // one option per line in the textarea, trimmed, empty lines dropped
    const options = rawText.split("\n").map((o) => o.trim()).filter(Boolean);
    updateFormField(id, { options });
  };

  useEffect(() => {
    // Fetch more than we'll show so filtering doesn't leave us short —
    // Firestore can't filter "not my barangay" server-side in one query.
    const q = query(collection(db, COLLECTION_ID), orderBy("createdAt", "desc"), limit(30));
    const unsub = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      // A barangay-scoped admin sees everything EXCEPT another barangay's
      // BARANGAY-audience posts — OSCA's and the generic sub_admin's ALL/
      // DISTRICT/their-own-barangay posts still show.
      const visible = myBarangay
        ? docs.filter((d) => d.Audience !== "BARANGAY" || d.barangay === myBarangay)
        : docs;
      setRecentActivity(visible.slice(0, 5));
    });
    return () => unsub();
  }, [myBarangay]);

  // adminData can load a beat after first render — re-lock once it arrives
  useEffect(() => {
    if (myBarangay) {
      setAudience("BARANGAY");
      setBarangay(myBarangay);
    }
  }, [myBarangay]);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const resetForm = () => {
    setWhat(''); setWhen(''); setWhere(''); setDescription('');
    setPublishTime('Immediately'); setExpiration('Never');
    setIsJoinable(false); setFormFields([]);
  };

  const computeExpirationDate = (option) => {
    const now = new Date();
    switch (option) {
      case "1 Week":   return new Date(now.setDate(now.getDate() + 7));
      case "2 Weeks":  return new Date(now.setDate(now.getDate() + 14));
      case "3 Weeks":  return new Date(now.setDate(now.getDate() + 21));
      case "1 Month":  return new Date(now.setMonth(now.getMonth() + 1));
      case "2 Months": return new Date(now.setMonth(now.getMonth() + 2));
      case "3 Months": return new Date(now.setMonth(now.getMonth() + 3));
      default:         return null;
    }
  };

  const saveDocument = async () => {
    if (!what || !when || !where || !description) {
      showToast("Please fill all fields", "error");
      return;
    }
    if (effectiveAudience === "BARANGAY" && !effectiveBarangay) {
      showToast("Please select a barangay", "error");
      return;
    }
    if (isJoinable) {
      const blankLabel = formFields.some((f) => !f.label.trim());
      if (blankLabel) {
        showToast("Every sign-up field needs a label", "error");
        return;
      }
      const badSelect = formFields.some((f) => f.type === "select" && f.options.length < 2);
      if (badSelect) {
        showToast("Multiple-choice fields need at least 2 options", "error");
        return;
      }
    }
    setSaving(true);
    try {
      const expirationDate = computeExpirationDate(expiration);
      await addDoc(collection(db, COLLECTION_ID), {
        Title: what,
        Body: description,
        Location: where,
        Date: when,
        expiration: expirationDate ? expirationDate.toISOString() : null,
        Audience: effectiveAudience,
        barangay: effectiveAudience === "BARANGAY" ? effectiveBarangay : null,
        Status: "PUBLISHED",
        createdAt: serverTimestamp(),
        // ── Join + QR check-in (read by the mobile app's EventCarousel /
        // EventJoinFormModal, and by EventCheckIn.jsx on this dashboard) ──
        isJoinable,
        formFields: isJoinable
          ? formFields.map(({ id, label, type, required, options }) => ({
              id, label: label.trim(), type, required,
              ...(type === "select" ? { options } : {}),
            }))
          : [],
      });
      showToast("Announcement published!");
      resetForm();
    } catch (err) {
      console.error(err);
      showToast("Failed to publish", "error");
    } finally {
      setSaving(false);
    }
  };

  const statusMeta = (doc) => {
    const createdAt = doc.createdAt?.toDate ? doc.createdAt.toDate() : new Date(doc.createdAt);
    const diff = Math.round((Date.now() - createdAt) / 60000);
    const timeAgo = diff < 60 ? `${diff}m ago` : diff < 1440 ? `${Math.round(diff/60)}h ago` : `${Math.round(diff/1440)}d ago`;
    return `${timeAgo} • Senior Citizens`;
  };

  const statusStyle = (status) => {
    if (status === 'PUBLISHED') return { icon: CheckCircle2, iconColor: 'text-blue-600',  iconBg: 'bg-blue-50',   badgeClass: 'bg-blue-50 text-blue-600' };
    if (status === 'DRAFT')     return { icon: Edit3,        iconColor: 'text-yellow-600', iconBg: 'bg-yellow-50', badgeClass: 'bg-yellow-50 text-yellow-700' };
    return                             { icon: AlertCircle,  iconColor: 'text-red-500',    iconBg: 'bg-red-50',    badgeClass: 'bg-red-50 text-red-500' };
  };

  const handleNewAnnouncement = () => {
    const hasData = what || when || where || description;
    if (hasData) {
      const confirmReset = window.confirm("This will clear the current announcement. Continue?");
      if (!confirmReset) return;
    }
    resetForm();
  };

  const district1Barangays = [
    "Arkong Bato","Balangkas","Bignay","Bisig","Canumay East","Canumay West",
    "Coloong","Dalandanan","Isla","Lawang Bato","Lingunan","Mabolo",
    "Malanday","Malinta","Palasan","Pariancillo Villa","Pasolo","Poblacion",
    "Pulo","Punturin","Rincon","Tagalag","Veinte Reales","Wawang Pulo"
  ];
  const district2Barangays = [
    "Bagbaguin","General T. de Leon","Karuhatan","Mapulang Lupa",
    "Marulas","Maysan","Parada","Paso de Blas","Ugong"
  ];

  return (
    <div className="flex-1 bg-[#f8f9fa] min-h-screen p-8 font-sans">

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-2xl text-sm font-semibold shadow-lg ${toast.type === 'error' ? 'bg-red-500 text-white' : 'bg-gray-900 text-white'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header — NO duplicate bell/settings/profile buttons */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Announcements</h1>
          <p className="text-gray-500">Broadcast event updates to senior citizens.</p>
        </div>
        <button onClick={handleNewAnnouncement} className="bg-[#0f52ba] hover:bg-blue-700 text-white px-5 py-2.5 rounded-full font-medium flex items-center gap-2 transition-colors shadow-sm">
          <Plus size={18} /> New Announcement
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Left: Form */}
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-6 text-gray-800 font-bold text-lg">
              <AlignLeft size={20} className="text-[#0f52ba]" /> Event Details
            </div>

            <div className="mb-5">
              <label className="flex items-center gap-1.5 text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                <FileText size={13} /> What
              </label>
              <input
                type="text"
                value={what}
                onChange={(e) => setWhat(e.target.value)}
                placeholder="e.g. Free blood pressure & blood sugar screening"
                className="w-full bg-gray-50 rounded-xl py-3 px-4 text-sm text-gray-800 border border-gray-100 focus:ring-2 focus:ring-blue-100 outline-none"
              />
            </div>

            <div className="mb-5">
              <label className="flex items-center gap-1.5 text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                <Calendar size={13} /> When
              </label>
              <input
                type="text"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                placeholder="e.g. May 15, 2025 — 8:00 AM to 12:00 PM"
                className="w-full bg-gray-50 rounded-xl py-3 px-4 text-sm text-gray-800 border border-gray-100 focus:ring-2 focus:ring-blue-100 outline-none"
              />
            </div>

            <div className="mb-5">
              <label className="flex items-center gap-1.5 text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                <MapPin size={13} /> Where
              </label>
              <input
                type="text"
                value={where}
                onChange={(e) => setWhere(e.target.value)}
                placeholder="e.g. Barangay Hall, San Antonio"
                className="w-full bg-gray-50 rounded-xl py-3 px-4 text-sm text-gray-800 border border-gray-100 focus:ring-2 focus:ring-blue-100 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Event Description</label>
              <textarea
                rows={6}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Provide additional details about the event..."
                className="w-full bg-gray-50 rounded-xl py-3 px-4 text-sm text-gray-800 border border-gray-100 focus:ring-2 focus:ring-blue-100 outline-none resize-none"
              />
            </div>
          </div>

          {/* Joinable event + QR check-in sign-up form */}
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 text-gray-800 font-bold text-lg">
                <QrCode size={20} className="text-[#0f52ba]" /> Joinable Event
              </div>
              <button
                type="button"
                onClick={() => setIsJoinable((v) => !v)}
                className={`relative w-12 h-7 rounded-full transition-colors ${isJoinable ? 'bg-[#0f52ba]' : 'bg-gray-200'}`}
              >
                <span className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${isJoinable ? 'translate-x-5' : ''}`} />
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              Seniors can tap "Join" on this event in the app and get QR-checked-in on arrival.
              {" "}Leave off for a plain announcement.
            </p>

            {isJoinable && (
              <>
                <div className="rounded-2xl bg-blue-50/60 border border-blue-100 p-4 mb-4">
                  <p className="text-xs text-blue-800 leading-relaxed">
                    Add fields below only if you need info beyond the senior's existing profile
                    (e.g. current medications, household size). No fields = one-tap join.
                    On event day, scan each attendee's account QR on the <strong>Event Check-In</strong> page
                    to mark them present.
                  </p>
                </div>

                <div className="space-y-3 mb-4">
                  {formFields.map((field, idx) => (
                    <div key={field.id} className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <GripVertical size={16} className="text-gray-300 shrink-0" />
                        <input
                          type="text"
                          value={field.label}
                          onChange={(e) => updateFormField(field.id, { label: e.target.value })}
                          placeholder={`Field ${idx + 1} label — e.g. Household size`}
                          className="flex-1 bg-white rounded-lg py-2 px-3 text-sm border border-gray-200 focus:ring-2 focus:ring-blue-100 outline-none"
                        />
                        <select
                          value={field.type}
                          onChange={(e) => updateFormField(field.id, { type: e.target.value, options: e.target.value === 'select' ? field.options : [] })}
                          className="bg-white rounded-lg py-2 px-2 text-sm border border-gray-200 outline-none"
                        >
                          {FIELD_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                        <label className="flex items-center gap-1.5 text-xs text-gray-500 shrink-0 px-1">
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={(e) => updateFormField(field.id, { required: e.target.checked })}
                          />
                          Required
                        </label>
                        <button type="button" onClick={() => removeFormField(field.id)} className="text-gray-300 hover:text-red-500 shrink-0">
                          <Trash2 size={16} />
                        </button>
                      </div>

                      {field.type === "select" && (
                        <textarea
                          rows={3}
                          value={field.options.join("\n")}
                          onChange={(e) => updateFieldOptions(field.id, e.target.value)}
                          placeholder={"One option per line, e.g.\nFood\nMedicine\nFinancial"}
                          className="w-full bg-white rounded-lg py-2 px-3 text-sm border border-gray-200 focus:ring-2 focus:ring-blue-100 outline-none resize-none"
                        />
                      )}
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={addFormField}
                  className="flex items-center gap-2 text-sm font-semibold text-[#0f52ba] hover:underline"
                >
                  <ListPlus size={16} /> Add sign-up field
                </button>
              </>
            )}
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-gray-900 text-lg">Recent Activity</h3>
              <button className="text-sm font-semibold text-[#0f52ba] hover:underline">View Archive</button>
            </div>
            <div className="space-y-4">
              {recentActivity.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">No announcements yet. Publish one above!</p>
              )}
              {recentActivity.map((doc) => {
                const { icon: Icon, iconColor, iconBg, badgeClass } = statusStyle(doc.Status);
                return (
                  <div key={doc.id} className="flex items-center justify-between p-4 rounded-2xl border border-gray-50 bg-gray-50/50 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`p-2.5 rounded-full ${iconBg} ${iconColor}`}><Icon size={18} /></div>
                      <div>
                        <h4 className="font-bold text-gray-900 text-sm mb-0.5">{doc.Title}</h4>
                        <p className="text-xs text-gray-500">{statusMeta(doc)}</p>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider ${badgeClass}`}>{doc.Status}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Scheduling + Actions */}
        <div className="space-y-6">

          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-3">Audience</h3>
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-blue-50 border-2 border-[#0f52ba]">
              <div className="w-8 h-8 rounded-full bg-[#0f52ba] flex items-center justify-center text-white text-sm">👴</div>
              <span className="text-sm font-bold text-[#0f52ba]">Senior Citizens Only</span>
            </div>
            <p className="text-xs text-gray-400 mt-3">
              {myBarangay
                ? `Visible only to registered senior citizens in Brgy. ${myBarangay}.`
                : "All announcements are visible only to registered senior citizens."}
            </p>
          </div>

          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-4">Scheduling</h3>
            <div className="space-y-4 mb-6">

              {myBarangay ? (
                <div className="w-full bg-blue-50 border-2 border-[#0f52ba] rounded-xl py-2.5 px-3 text-sm font-bold text-[#0f52ba] flex items-center gap-2">
                  <MapPin size={14} /> Posting to Brgy. {myBarangay} only
                </div>
              ) : (
                <>
                  <select
                    value={audience}
                    onChange={(e) => { setAudience(e.target.value); setBarangay(""); }}
                    className="w-full bg-gray-100 rounded-xl py-2 px-3"
                  >
                    <option value="ALL">All</option>
                    <option value="DISTRICT_1">Valenzuela District 1</option>
                    <option value="DISTRICT_2">Valenzuela District 2</option>
                    <option value="BARANGAY">Specific Barangay</option>
                  </select>

                  {audience === "BARANGAY" && (
                    <select
                      value={barangay}
                      onChange={(e) => setBarangay(e.target.value)}
                      className="w-full bg-gray-100 rounded-xl py-2 px-3 mt-2"
                    >
                      <option value="">Select Barangay</option>
                      <optgroup label="District 1">
                        {district1Barangays.map((b) => (<option key={b} value={b}>{b}</option>))}
                      </optgroup>
                      <optgroup label="District 2">
                        {district2Barangays.map((b) => (<option key={b} value={b}>{b}</option>))}
                      </optgroup>
                    </select>
                  )}
                </>
              )}

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Expiration</label>
                <div className="relative">
                  <AlertCircle className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-700" size={16} />
                  <select value={expiration} onChange={(e) => setExpiration(e.target.value)}
                    className="w-full bg-gray-100/80 border-none rounded-xl py-2.5 pl-10 pr-10 text-sm font-semibold text-gray-800 appearance-none focus:ring-2 focus:ring-blue-100 outline-none cursor-pointer">
                    <option>Never</option>
                    <option>1 Week</option>
                    <option>2 Weeks</option>
                    <option>3 Weeks</option>
                    <option>1 Month</option>
                    <option>2 Months</option>
                    <option>3 Months</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                </div>
              </div>
            </div>

            <button onClick={saveDocument} disabled={saving}
              className="w-full bg-[#0f52ba] hover:bg-blue-700 disabled:opacity-50 text-white py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors shadow-md shadow-blue-500/20">
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              Publish Announcement
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}