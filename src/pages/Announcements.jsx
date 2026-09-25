import { useState, useEffect } from 'react';
import {
  Plus, AlignLeft, ChevronDown, Send, CheckCircle2, Edit3, AlertCircle,
  Loader2, MapPin, Calendar, FileText, QrCode, ListPlus, Trash2, GripVertical, X
} from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';

const COLLECTION_ID = 'editorial_health';

const FIELD_TYPES_KEYS = [
  { value: 'text', labelKey: null, fallback: 'Short text' },
  { value: 'number', labelKey: null, fallback: 'Number' },
  { value: 'textarea', labelKey: null, fallback: 'Long text' },
  { value: 'select', labelKey: null, fallback: 'Multiple choice' },
];

const DISTRICT_1_BARANGAYS = [
  'Arkong Bato', 'Balangkas', 'Bignay', 'Bisig', 'Canumay East', 'Canumay West',
  'Coloong', 'Dalandanan', 'Isla', 'Lawang Bato', 'Lingunan', 'Mabolo',
  'Malanday', 'Malinta', 'Palasan', 'Pariancillo Villa', 'Pasolo', 'Poblacion',
  'Pulo', 'Punturin', 'Rincon', 'Tagalag', 'Veinte Reales', 'Wawang Pulo',
];

const DISTRICT_2_BARANGAYS = [
  'Bagbaguin', 'General T. de Leon', 'Karuhatan', 'Mapulang Lupa',
  'Marulas', 'Maysan', 'Parada', 'Paso de Blas', 'Ugong',
];

function formatDateLabel(dateStr) {
  if (!dateStr) return '';
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

function formatTimeLabel(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function computeExpirationDate(option) {
  const now = new Date();
  switch (option) {
    case '1 Week': return new Date(now.setDate(now.getDate() + 7));
    case '2 Weeks': return new Date(now.setDate(now.getDate() + 14));
    case '3 Weeks': return new Date(now.setDate(now.getDate() + 21));
    case '1 Month': return new Date(now.setMonth(now.getMonth() + 1));
    case '2 Months': return new Date(now.setMonth(now.getMonth() + 2));
    case '3 Months': return new Date(now.setMonth(now.getMonth() + 3));
    default: return null;
  }
}

function statusStyle(status) {
  if (status === 'PUBLISHED') return { icon: CheckCircle2, iconColor: 'text-blue-600', iconBg: 'bg-blue-50', badgeClass: 'bg-blue-50 text-blue-600' };
  if (status === 'DRAFT') return { icon: Edit3, iconColor: 'text-yellow-600', iconBg: 'bg-yellow-50', badgeClass: 'bg-yellow-50 text-yellow-700' };
  return { icon: AlertCircle, iconColor: 'text-red-500', iconBg: 'bg-red-50', badgeClass: 'bg-red-50 text-red-500' };
}

function statusMeta(doc) {
  const createdAt = doc.createdAt?.toDate ? doc.createdAt.toDate() : new Date(doc.createdAt);
  const diffMin = Math.round((Date.now() - createdAt) / 60000);
  const timeAgo = diffMin < 60 ? `${diffMin}m ago` : diffMin < 1440 ? `${Math.round(diffMin / 60)}h ago` : `${Math.round(diffMin / 1440)}d ago`;
  return `${timeAgo} • Senior Citizens`;
}

export default function Announcements() {
  const { adminData } = useAuth();
  const { t } = useLang();
  const myBarangay = adminData?.barangay || null; // null for OSCA and the generic sub_admin

  // Field-type dropdown options, translated where available, else the English label
  const FIELD_TYPES = [
    { value: 'text', label: t.fieldTypeShortText || 'Short text' },
    { value: 'number', label: t.fieldTypeNumber || 'Number' },
    { value: 'textarea', label: t.fieldTypeLongText || 'Long text' },
    { value: 'select', label: t.fieldTypeMultipleChoice || 'Multiple choice' },
  ];

  const [publishTime, setPublishTime] = useState('Immediately');
  const [expiration, setExpiration] = useState('Never');
  const [what, setWhat] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [where, setWhere] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [audience, setAudience] = useState(myBarangay ? 'BARANGAY' : 'ALL');
  const [barangay, setBarangay] = useState(myBarangay || '');
  const [isJoinable, setIsJoinable] = useState(false);
  const [formFields, setFormFields] = useState([]); // { id, label, type, required, options? }

  // barangay-scoped admins are always locked to their own barangay
  const effectiveAudience = myBarangay ? 'BARANGAY' : audience;
  const effectiveBarangay = myBarangay ? myBarangay : barangay;
  const whenLabel = eventDate
    ? [formatDateLabel(eventDate), [formatTimeLabel(startTime), formatTimeLabel(endTime)].filter(Boolean).join(' to ')]
        .filter(Boolean).join(', ')
    : '';

  const addFormField = () => {
    setFormFields((prev) => [
      ...prev,
      { id: `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, label: '', type: 'text', required: false, options: [] },
    ]);
  };

  const updateFormField = (id, patch) => {
    setFormFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const removeFormField = (id) => {
    setFormFields((prev) => prev.filter((f) => f.id !== id));
  };

  // Google-Forms-style option editing helpers -------------------------------
  const setFieldOptionAt = (fieldId, optIdx, value) => {
    setFormFields((prev) => prev.map((f) => {
      if (f.id !== fieldId) return f;
      const options = [...f.options];
      options[optIdx] = value;
      return { ...f, options };
    }));
  };

  const insertFieldOptionAfter = (fieldId, optIdx) => {
    setFormFields((prev) => prev.map((f) => {
      if (f.id !== fieldId) return f;
      const options = [...f.options];
      options.splice(optIdx + 1, 0, '');
      return { ...f, options };
    }));
    requestAnimationFrame(() => {
      document.querySelector(`[data-field-id="${fieldId}"][data-opt-idx="${optIdx + 1}"]`)?.focus();
    });
  };

  const removeFieldOptionAt = (fieldId, optIdx, focusPrev = false) => {
    setFormFields((prev) => prev.map((f) => {
      if (f.id !== fieldId) return f;
      if (f.options.length <= 1) return f; // always keep at least one row
      const options = f.options.filter((_, i) => i !== optIdx);
      return { ...f, options };
    }));
    if (focusPrev) {
      requestAnimationFrame(() => {
        document.querySelector(`[data-field-id="${fieldId}"][data-opt-idx="${optIdx - 1}"]`)?.focus();
      });
    }
  };

  const addFieldOption = (fieldId) => {
    setFormFields((prev) => prev.map((f) => (f.id === fieldId ? { ...f, options: [...f.options, ''] } : f)));
    // Reads the DOM after the append instead of the (possibly stale) formFields
    // closure, so this always focuses the row that was actually just added.
    requestAnimationFrame(() => {
      const rows = document.querySelectorAll(`[data-field-id="${fieldId}"]`);
      rows[rows.length - 1]?.focus();
    });
  };

  useEffect(() => {
    // Firestore can't exclude "other barangay" server-side, so fetch extra and filter here
    const q = query(collection(db, COLLECTION_ID), orderBy('createdAt', 'desc'), limit(30));
    const unsub = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      const visible = myBarangay
        ? docs.filter((d) => d.Audience !== 'BARANGAY' || d.barangay === myBarangay)
        : docs;
      setRecentActivity(visible.slice(0, 5));
    });
    return () => unsub();
  }, [myBarangay]);

  useEffect(() => {
    if (myBarangay) {
      setAudience('BARANGAY');
      setBarangay(myBarangay);
    }
  }, [myBarangay]);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const resetForm = () => {
    setWhat(''); setEventDate(''); setStartTime(''); setEndTime('');
    setWhere(''); setDescription('');
    setPublishTime('Immediately'); setExpiration('Never');
    setIsJoinable(false); setFormFields([]);
  };

  const saveDocument = async () => {
    if (!what || !eventDate || !startTime || !where || !description) {
      showToast(t.fillAllFields, 'error');
      return;
    }
    if (effectiveAudience === 'BARANGAY' && !effectiveBarangay) {
      showToast(t.selectABarangay, 'error');
      return;
    }
    if (isJoinable) {
      if (formFields.some((f) => !f.label.trim())) {
        showToast(t.everyFieldNeedsLabel, 'error');
        return;
      }
      if (formFields.some((f) => f.type === 'select' && f.options.filter((o) => o.trim()).length < 2)) {
        showToast(t.multipleChoiceNeeds2, 'error');
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
        Date: whenLabel,
        eventDate,
        startTime,
        endTime,
        expiration: expirationDate ? expirationDate.toISOString() : null,
        Audience: effectiveAudience,
        barangay: effectiveAudience === 'BARANGAY' ? effectiveBarangay : null,
        Status: 'PUBLISHED',
        createdAt: serverTimestamp(),
        isJoinable,
        formFields: isJoinable
          ? formFields.map(({ id, label, type, required, options }) => ({
              id, label: label.trim(), type, required,
              ...(type === 'select' ? { options: options.map((o) => o.trim()).filter(Boolean) } : {}),
            }))
          : [],
      });
      showToast(t.announcementPublishedToast);
      resetForm();
    } catch (err) {
      console.error(err);
      showToast(t.failedToPublish, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleNewAnnouncement = () => {
    const hasData = what || eventDate || where || description;
    if (hasData && !window.confirm(t.clearCurrentConfirm)) return;
    resetForm();
  };

  return (
    <div className="flex-1 bg-[#f8f9fa] min-h-screen p-8 font-sans">
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-2xl text-sm font-semibold shadow-lg ${toast.type === 'error' ? 'bg-red-500 text-white' : 'bg-gray-900 text-white'}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{t.announcements}</h1>
          <p className="text-gray-500">{t.announcementsPageSubtitle}</p>
        </div>
        <button onClick={handleNewAnnouncement} className="bg-[#0f52ba] hover:bg-blue-700 text-white px-5 py-2.5 rounded-full font-medium flex items-center gap-2 transition-colors shadow-sm">
          <Plus size={18} /> {t.newAnnouncement}
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-6 text-gray-800 font-bold text-lg">
              <AlignLeft size={20} className="text-[#0f52ba]" /> {t.eventDetails}
            </div>

            <div className="mb-5">
              <label className="flex items-center gap-1.5 text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                <FileText size={13} /> {t.whatLabel}
              </label>
              <input
                type="text"
                value={what}
                onChange={(e) => setWhat(e.target.value)}
                placeholder={t.whatPlaceholder}
                className="w-full bg-gray-50 rounded-xl py-3 px-4 text-sm text-gray-800 border border-gray-100 focus:ring-2 focus:ring-blue-100 outline-none"
              />
            </div>

            <div className="mb-5">
              <label className="flex items-center gap-1.5 text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                <Calendar size={13} /> {t.whenLabel}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="bg-gray-50 rounded-xl py-3 px-4 text-sm text-gray-800 border border-gray-100 focus:ring-2 focus:ring-blue-100 outline-none"
                />
                <div className="col-span-2 flex items-center gap-2">
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="flex-1 bg-gray-50 rounded-xl py-3 px-4 text-sm text-gray-800 border border-gray-100 focus:ring-2 focus:ring-blue-100 outline-none"
                  />
                  <span className="text-sm text-gray-400">to</span>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="flex-1 bg-gray-50 rounded-xl py-3 px-4 text-sm text-gray-800 border border-gray-100 focus:ring-2 focus:ring-blue-100 outline-none"
                  />
                </div>
              </div>
              {whenLabel && <p className="text-xs text-gray-400 mt-2">{t.shownToSeniorsAs} {whenLabel}</p>}
            </div>

            <div className="mb-5">
              <label className="flex items-center gap-1.5 text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                <MapPin size={13} /> {t.whereLabel}
              </label>
              <input
                type="text"
                value={where}
                onChange={(e) => setWhere(e.target.value)}
                placeholder={t.wherePlaceholder}
                className="w-full bg-gray-50 rounded-xl py-3 px-4 text-sm text-gray-800 border border-gray-100 focus:ring-2 focus:ring-blue-100 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t.eventDescription}</label>
              <textarea
                rows={6}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t.eventDescriptionPlaceholder}
                className="w-full bg-gray-50 rounded-xl py-3 px-4 text-sm text-gray-800 border border-gray-100 focus:ring-2 focus:ring-blue-100 outline-none resize-none"
              />
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 text-gray-800 font-bold text-lg">
                <QrCode size={20} className="text-[#0f52ba]" /> {t.joinableEvent}
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
              {t.joinableEventDesc}
            </p>

            {isJoinable && (
              <>
                <div className="rounded-2xl bg-blue-50/60 border border-blue-100 p-4 mb-4">
                  <p className="text-xs text-blue-800 leading-relaxed">
                    {t.joinableEventHint}
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
                          placeholder={`${t.fieldLabelPrefix} ${idx + 1} ${t.fieldLabelSuffix}`}
                          className="flex-1 bg-white rounded-lg py-2 px-3 text-sm border border-gray-200 focus:ring-2 focus:ring-blue-100 outline-none"
                        />
                        <select
                          value={field.type}
                          onChange={(e) => {
                            const nextType = e.target.value;
                            updateFormField(field.id, {
                              type: nextType,
                              options: nextType === 'select'
                                ? (field.options && field.options.length ? field.options : ['', ''])
                                : [],
                            });
                          }}
                          className="bg-white rounded-lg py-2 px-2 text-sm border border-gray-200 outline-none"
                        >
                          {FIELD_TYPES.map((ft) => (
                            <option key={ft.value} value={ft.value}>{ft.label}</option>
                          ))}
                        </select>
                        <label className="flex items-center gap-1.5 text-xs text-gray-500 shrink-0 px-1">
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={(e) => updateFormField(field.id, { required: e.target.checked })}
                          />
                          {t.requiredLabel}
                        </label>
                        <button type="button" onClick={() => removeFormField(field.id)} className="text-gray-300 hover:text-red-500 shrink-0">
                          <Trash2 size={16} />
                        </button>
                      </div>

                      {field.type === 'select' && (
                        <div className="space-y-2 mt-1 pl-6">
                          {field.options.map((opt, optIdx) => (
                            <div key={optIdx} className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full border-2 border-gray-400 shrink-0" />
                              <input
                                type="text"
                                value={opt}
                                data-field-id={field.id}
                                data-opt-idx={optIdx}
                                onChange={(e) => setFieldOptionAt(field.id, optIdx, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    insertFieldOptionAfter(field.id, optIdx);
                                  } else if (e.key === 'Backspace' && opt === '' && field.options.length > 1) {
                                    e.preventDefault();
                                    removeFieldOptionAt(field.id, optIdx, true);
                                  }
                                }}
                                placeholder={`${t.fieldOptionPrefix || 'Option'} ${optIdx + 1}`}
                                className="flex-1 bg-white rounded-lg py-2 px-3 text-sm border border-gray-200 focus:ring-2 focus:ring-blue-100 outline-none"
                              />
                              {field.options.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeFieldOptionAt(field.id, optIdx)}
                                  className="text-gray-300 hover:text-red-500 shrink-0"
                                >
                                  <X size={15} />
                                </button>
                              )}
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => addFieldOption(field.id)}
                            className="flex items-center gap-1.5 text-xs font-semibold text-[#0f52ba] hover:underline pt-1"
                          >
                            <Plus size={13} /> {t.addOption || 'Add option'}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <button type="button" onClick={addFormField} className="flex items-center gap-2 text-sm font-semibold text-[#0f52ba] hover:underline">
                  <ListPlus size={16} /> {t.addSignupField}
                </button>
              </>
            )}
          </div>

          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-gray-900 text-lg">{t.recentActivity}</h3>
              <button className="text-sm font-semibold text-[#0f52ba] hover:underline">{t.viewArchive}</button>
            </div>
            <div className="space-y-4">
              {recentActivity.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">{t.noAnnouncementsYet}</p>
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

        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-3">{t.audienceTitle}</h3>
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-blue-50 border-2 border-[#0f52ba]">
              <div className="w-8 h-8 rounded-full bg-[#0f52ba] flex items-center justify-center text-white text-sm">👴</div>
              <span className="text-sm font-bold text-[#0f52ba]">{t.seniorCitizensOnly}</span>
            </div>
            <p className="text-xs text-gray-400 mt-3">
              {myBarangay
                ? `${t.audienceNoteBarangayPrefix} ${myBarangay}.`
                : t.audienceNoteAll}
            </p>
          </div>

          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-4">{t.schedulingTitle}</h3>
            <div className="space-y-4 mb-6">
              {myBarangay ? (
                <div className="w-full bg-blue-50 border-2 border-[#0f52ba] rounded-xl py-2.5 px-3 text-sm font-bold text-[#0f52ba] flex items-center gap-2">
                  <MapPin size={14} /> {t.postingToBarangayOnlyPrefix} {myBarangay} {t.onlySuffix}
                </div>
              ) : (
                <>
                  <select
                    value={audience}
                    onChange={(e) => { setAudience(e.target.value); setBarangay(''); }}
                    className="w-full bg-gray-100 rounded-xl py-2 px-3"
                  >
                    <option value="ALL">{t.optAll}</option>
                    <option value="DISTRICT_1">{t.optDistrict1}</option>
                    <option value="DISTRICT_2">{t.optDistrict2}</option>
                    <option value="BARANGAY">{t.optSpecificBarangay}</option>
                  </select>

                  {audience === 'BARANGAY' && (
                    <select
                      value={barangay}
                      onChange={(e) => setBarangay(e.target.value)}
                      className="w-full bg-gray-100 rounded-xl py-2 px-3 mt-2"
                    >
                      <option value="">{t.selectBarangay}</option>
                      <optgroup label={t.district1}>
                        {DISTRICT_1_BARANGAYS.map((b) => (<option key={b} value={b}>{b}</option>))}
                      </optgroup>
                      <optgroup label={t.district2}>
                        {DISTRICT_2_BARANGAYS.map((b) => (<option key={b} value={b}>{b}</option>))}
                      </optgroup>
                    </select>
                  )}
                </>
              )}

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">{t.expirationLabel}</label>
                <div className="relative">
                  <AlertCircle className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-700" size={16} />
                  <select
                    value={expiration}
                    onChange={(e) => setExpiration(e.target.value)}
                    className="w-full bg-gray-100/80 border-none rounded-xl py-2.5 pl-10 pr-10 text-sm font-semibold text-gray-800 appearance-none focus:ring-2 focus:ring-blue-100 outline-none cursor-pointer"
                  >
                    {/* NOTE: values stay the literal English strings ('Never',
                        '1 Week', etc.) since computeExpirationDate() switches
                        on these exact values — only the displayed label is
                        translated. */}
                    <option value="Never">{t.expNever}</option>
                    <option value="1 Week">{t.exp1Week}</option>
                    <option value="2 Weeks">{t.exp2Weeks}</option>
                    <option value="3 Weeks">{t.exp3Weeks}</option>
                    <option value="1 Month">{t.exp1Month}</option>
                    <option value="2 Months">{t.exp2Months}</option>
                    <option value="3 Months">{t.exp3Months}</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                </div>
              </div>
            </div>

            <button
              onClick={saveDocument}
              disabled={saving}
              className="w-full bg-[#0f52ba] hover:bg-blue-700 disabled:opacity-50 text-white py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors shadow-md shadow-blue-500/20"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              {t.publishAnnouncement}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
