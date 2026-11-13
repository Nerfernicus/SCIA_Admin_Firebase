import { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { UserPlus, Loader2, AlertCircle, Clock, ShieldCheck } from 'lucide-react';
import { functions } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { DISTRICTS, barangaysOf, resolveBarangay } from '../lib/barangay';
import DocumentCapture from '../components/DocumentCapture';
import Combobox from '../components/Combobox';
import PrivacyConsent from '../components/PrivacyConsent';
import { RULES, sanitize, validate, validateGender, validateDob, validateOption } from '../lib/validators';

// No account is created at the desk any more: the application goes to OSCA's Senior Records for
// verification, and the login is created later from User Management.
const submitAssistedApplication = httpsCallable(functions, 'submitAssistedApplication');

const EMPTY_FORM = {
  firstName: '', midName: '', lastName: '', district: '', barangay: '', block: '', street: '',
  conNumber: '', gender: '', dob: '', idNumber: '',
  // Who the inactivity-monitoring alert texts if this senior goes silent too long.
  guardianName: '', guardianPhone: '', guardianRelation: '',
};

const PH_MOBILE = /^(09\d{9}|\+639\d{9})$/;

const INPUT_BASE = 'w-full text-gray-900 placeholder:text-gray-500 rounded-xl py-2.5 px-3 text-sm border outline-none focus:ring-2';
const INPUT_OK = 'bg-gray-50 border-gray-100 focus:ring-blue-100 focus:border-blue-200';
const INPUT_BAD = 'bg-red-50 border-red-300 focus:ring-red-100 focus:border-red-400';
const INPUT_CLS = `${INPUT_BASE} ${INPUT_OK}`;
const inputCls = (err) => `${INPUT_BASE} ${err ? INPUT_BAD : INPUT_OK}`;
// Selected / unselected choice buttons (district, gender). dark: keeps the blue readable on the dark theme.
const CHOICE_ON = 'border-brand bg-blue-50 text-brand dark:border-blue-400 dark:text-blue-300';
const CHOICE_OFF = 'border-gray-200 text-gray-600 hover:bg-gray-50';
// Darker than gray-400: NN/g flags light-grey, low-contrast text as hard for older eyes.
const LABEL_CLS = 'block text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-1.5';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

function FieldError({ msg }) {
  if (!msg) return null;
  return (
    <p role="alert" className="mt-1 text-sm font-medium text-red-600 flex items-center gap-1">
      <AlertCircle size={12} className="shrink-0" /> {msg}
    </p>
  );
}

function Section({ title, hint, children }) {
  return (
    <section className="rounded-2xl border border-gray-100 p-4 sm:p-5 space-y-4">
      <div>
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">{title}</h3>
        {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

// Month / Day / Year dropdowns. Years start 60 years back (the youngest a
// senior can be) and go down, so nobody has to scroll past decades of years.
function DobSelect({ value, onChange }) {
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 51 }, (_, i) => thisYear - 60 - i);
  const [p, setP] = useState({ y: '', m: '', d: '' });

  // Parent cleared the form after a successful submit -> clear our parts too.
  useEffect(() => {
    if (!value) setP((prev) => (prev.y && prev.m && prev.d ? { y: '', m: '', d: '' } : prev));
  }, [value]);

  const set = (key, v) => {
    const n = { ...p, [key]: v };
    if (n.y && n.m) {
      const max = new Date(Number(n.y), Number(n.m), 0).getDate();
      if (n.d && Number(n.d) > max) n.d = String(max);
    }
    setP(n);
    onChange(n.y && n.m && n.d
      ? `${n.y}-${String(n.m).padStart(2, '0')}-${String(n.d).padStart(2, '0')}`
      : '');
  };

  const daysInMonth = p.y && p.m ? new Date(Number(p.y), Number(p.m), 0).getDate() : 31;

  return (
    <div className="grid grid-cols-3 gap-2">
      <select value={p.m} onChange={(e) => set('m', e.target.value)} className={INPUT_CLS} aria-label="Birth month">
        <option value="">Month</option>
        {MONTHS.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
      </select>
      <select value={p.d} onChange={(e) => set('d', e.target.value)} className={INPUT_CLS} aria-label="Birth day">
        <option value="">Day</option>
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
      </select>
      <select value={p.y} onChange={(e) => set('y', e.target.value)} className={INPUT_CLS} aria-label="Birth year">
        <option value="">Year</option>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  );
}

// `kiosk` is set when this form runs in the separate sign-up tab where the admin
// is already logged out: { token, lockedBarangay }. The token (not a login) is
// what lets the server record the sign-up under the admin who started it.
export default function AssistedSignup({ kiosk = null }) {
  const { adminData, isSuperAdmin } = useAuth();
  const { t } = useLang();
  const myBarangay = kiosk ? (kiosk.lockedBarangay || null) : (adminData?.barangay || null);
  // A barangay-scoped sub-admin can only register seniors in their own barangay
  // (the server enforces this too), so district + barangay are fixed for them.
  const locked = myBarangay && (kiosk || !isSuperAdmin) ? resolveBarangay(myBarangay) : null;

  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // { applicationId, reference }
  const [fieldErrors, setFieldErrors] = useState({});
  // Scanned / uploaded documents: a valid ID and/or the birth certificate.
  const [docs, setDocs] = useState([]);
  const [agreed, setAgreed] = useState(false);
  const [consentError, setConsentError] = useState(false);

  const update = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  const clearErr = (...fields) =>
    setFieldErrors((prev) => {
      const n = { ...prev };
      fields.forEach((f) => delete n[f]);
      return n;
    });
  // Text fields: disallowed characters are dropped as the person types and the
  // field is flagged with the rule's hint.
  const updateText = (field, kind) => (e) => {
    const { value, rejected } = sanitize(kind, e.target.value);
    setForm((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => {
      const n = { ...prev };
      if (rejected) n[field] = RULES[kind].hint; else delete n[field];
      return n;
    });
  };
  const pickDistrict = (d) => {
    setForm((prev) => ({ ...prev, district: d, barangay: '' }));
    clearErr('district', 'barangay');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const effDistrict = locked ? locked.district : form.district;
    const effBarangay = locked ? locked.name : form.barangay;
    const errs = {
      firstName: validate('name', form.firstName),
      midName: validate('name', form.midName),
      lastName: validate('name', form.lastName),
      conNumber: validate('phone', form.conNumber),
      dob: validateDob(form.dob),
      gender: validateGender(form.gender),
      district: validateOption(effDistrict, DISTRICTS, 'district'),
      barangay: locked ? '' : validateOption(effBarangay, barangaysOf(form.district), 'barangay'),
      block: validate('address', form.block, { required: false }),
      street: validate('address', form.street),
      guardianName: validate('name', form.guardianName),
      guardianPhone: validate('phone', form.guardianPhone),
      guardianRelation: validate('relation', form.guardianRelation, { required: false }),
    };
    if (!errs.guardianPhone && form.guardianPhone.replace(/\D/g, '').slice(-10) === form.conNumber.replace(/\D/g, '').slice(-10)) {
      errs.guardianPhone = "The guardian's number must be different from the senior's own number.";
    }
    Object.keys(errs).forEach((k) => { if (!errs[k]) delete errs[k]; });
    setFieldErrors(errs);
    if (Object.keys(errs).length) {
      setError('Please fix the highlighted fields before creating the account.');
      return;
    }

    if (docs.length === 0) {
      setError('Add at least one photo: a valid ID or the birth certificate.');
      return;
    }

    if (!agreed) {
      setConsentError(true);
      setError('Please tick the box to confirm agreement with the Terms and Conditions and the Data Privacy Policy.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await submitAssistedApplication({
        ...form,
        block: form.block.trim(),
        street: form.street.trim(),
        barangay: locked ? locked.name : form.barangay,
        district: locked ? locked.district : form.district,
        guardianName: form.guardianName.trim(),
        guardianPhone: form.guardianPhone.trim(),
        guardianRelation: form.guardianRelation.trim(),
        documents: docs,
        ...(kiosk ? { sessionToken: kiosk.token } : {}),
      });
      setResult(res.data);
      setForm(EMPTY_FORM);
      setAgreed(false);
      setConsentError(false);
      setDocs([]);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to submit the application. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto font-sans">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <UserPlus size={22} className="text-brand" /> Assisted Senior Sign-Up
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          For seniors visiting in person. Fill this in on their behalf and scan their documents. OSCA verifies them first; the login is created only after approval.
          {myBarangay && (kiosk || !isSuperAdmin) && ` This account will be registered under Brgy. ${myBarangay}.`}
        </p>
      </div>

      {result ? (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8 text-center">
          <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock size={26} className="text-amber-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Waiting for verification</h2>
          <p className="text-sm text-gray-500 mb-6">
            OSCA will check the documents in Senior Records. The login details are not available yet; they are
            created after OSCA approves the application.
          </p>
          <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5 mb-6">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Reference number</p>
            <p className="text-2xl font-mono font-bold text-gray-900">{result.reference}</p>
            <p className="text-xs text-gray-400 mt-1">Give this to the senior so OSCA can find the application.</p>
          </div>
          <button
            onClick={() => setResult(null)}
            className="w-full py-3 rounded-xl bg-brand hover:bg-blue-700 text-white text-sm font-bold transition-colors"
          >
            Register Another
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
              <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <Section title="Documents *">
            <p className="text-sm text-gray-500 -mt-1">
              Scan a valid government ID (National ID, SSS, GSIS, Driver's License, Voter's ID, Passport) and/or the Birth
              Certificate. The camera outline fits the ID or document it sees, or upload photos from this device.
            </p>
            <DocumentCapture value={docs} onChange={setDocs} />
            <p className="text-xs text-gray-400 flex items-center gap-1"><ShieldCheck size={13} /> Photos are only visible to OSCA staff.</p>
          </Section>

          <Section title="Personal Information">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={LABEL_CLS}>First Name *</label>
                <input value={form.firstName} onChange={updateText('firstName', 'name')} maxLength={RULES.name.max} aria-invalid={!!fieldErrors.firstName} className={inputCls(fieldErrors.firstName)} />
                <FieldError msg={fieldErrors.firstName} />
              </div>
              <div>
                <label className={LABEL_CLS}>Middle Name *</label>
                <input value={form.midName} onChange={updateText('midName', 'name')} maxLength={RULES.name.max} aria-invalid={!!fieldErrors.midName} className={inputCls(fieldErrors.midName)} />
                <FieldError msg={fieldErrors.midName} />
              </div>
              <div>
                <label className={LABEL_CLS}>Last Name *</label>
                <input value={form.lastName} onChange={updateText('lastName', 'name')} maxLength={RULES.name.max} aria-invalid={!!fieldErrors.lastName} className={inputCls(fieldErrors.lastName)} />
                <FieldError msg={fieldErrors.lastName} />
              </div>
              <div>
                <label className={LABEL_CLS}>Contact Number *</label>
                <input value={form.conNumber} onChange={updateText('conNumber', 'phone')} maxLength={RULES.phone.max} aria-invalid={!!fieldErrors.conNumber} placeholder="09XXXXXXXXX" inputMode="tel" className={inputCls(fieldErrors.conNumber)} />
                <FieldError msg={fieldErrors.conNumber} />
              </div>
            </div>

            <div>
              <label className={LABEL_CLS}>Date of Birth *</label>
              <DobSelect value={form.dob} onChange={(v) => { setForm((prev) => ({ ...prev, dob: v })); clearErr('dob'); }} />
              <FieldError msg={fieldErrors.dob} />
            </div>

            <div>
              <label className={LABEL_CLS}>Gender *</label>
              <div className="grid grid-cols-2 gap-3">
                {['Male', 'Female'].map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => { setForm((prev) => ({ ...prev, gender: g })); clearErr('gender'); }}
                    className={`py-2.5 rounded-xl border-2 text-sm font-bold transition-colors ${form.gender === g ? CHOICE_ON : CHOICE_OFF}`}
                  >
                    {g}
                  </button>
                ))}
              </div>
              <FieldError msg={fieldErrors.gender} />
            </div>
          </Section>

          <Section title="Address">
            <div>
              <label className={LABEL_CLS}>District{locked ? '' : ' *'}</label>
              <div className="grid grid-cols-2 gap-3">
                {DISTRICTS.map((d) => {
                  const active = (locked ? locked.district : form.district) === d;
                  return (
                    <button
                      key={d}
                      type="button"
                      disabled={!!locked}
                      onClick={() => pickDistrict(d)}
                      className={`py-2.5 rounded-xl border-2 text-sm font-bold transition-colors ${active ? CHOICE_ON : CHOICE_OFF} ${locked ? 'cursor-not-allowed opacity-80' : ''}`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
              <FieldError msg={fieldErrors.district} />
            </div>

            <div>
              <label className={LABEL_CLS}>Barangay{locked ? '' : ' *'}</label>
              <Combobox
                ariaLabel="Barangay"
                value={locked ? locked.name : form.barangay}
                onChange={(b) => { update('barangay')({ target: { value: b } }); clearErr('barangay'); }}
                options={locked ? [locked.name] : barangaysOf(form.district)}
                disabled={!!locked || !form.district}
                invalid={!!fieldErrors.barangay}
                placeholder={form.district ? 'Search or select barangay' : 'Select a district first'}
                className={`${INPUT_CLS} disabled:opacity-60`}
              />
              <FieldError msg={fieldErrors.barangay} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={LABEL_CLS}>Blk / Lot / House No.</label>
                <input value={form.block} onChange={updateText('block', 'address')} maxLength={RULES.address.max} aria-invalid={!!fieldErrors.block} placeholder="e.g. Blk 5 Lot 12" className={inputCls(fieldErrors.block)} />
                <FieldError msg={fieldErrors.block} />
              </div>
              <div>
                <label className={LABEL_CLS}>Street *</label>
                <input value={form.street} onChange={updateText('street', 'address')} maxLength={RULES.address.max} aria-invalid={!!fieldErrors.street} placeholder="e.g. Rizal St." className={inputCls(fieldErrors.street)} />
                <FieldError msg={fieldErrors.street} />
              </div>
            </div>
          </Section>

          <Section
            title="Guardian / Relative Contact"
            hint="Who to alert if the senior doesn't check in. Required for the safety-monitoring feature."
          >
            <div>
              <label className={LABEL_CLS}>Guardian/Relative Name *</label>
              <input value={form.guardianName} onChange={updateText('guardianName', 'name')} maxLength={RULES.name.max} aria-invalid={!!fieldErrors.guardianName} className={inputCls(fieldErrors.guardianName)} />
              <FieldError msg={fieldErrors.guardianName} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={LABEL_CLS}>Guardian Contact Number *</label>
                <input value={form.guardianPhone} onChange={updateText('guardianPhone', 'phone')} maxLength={RULES.phone.max} aria-invalid={!!fieldErrors.guardianPhone} placeholder="09XXXXXXXXX" inputMode="tel" className={inputCls(fieldErrors.guardianPhone)} />
                <FieldError msg={fieldErrors.guardianPhone} />
              </div>
              <div>
                <label className={LABEL_CLS}>Relationship</label>
                <input value={form.guardianRelation} onChange={updateText('guardianRelation', 'relation')} maxLength={RULES.relation.max} aria-invalid={!!fieldErrors.guardianRelation} placeholder="e.g. Daughter, Son, Neighbor" className={inputCls(fieldErrors.guardianRelation)} />
                <FieldError msg={fieldErrors.guardianRelation} />
              </div>
            </div>
          </Section>

          <PrivacyConsent checked={agreed} onChange={(v) => { setAgreed(v); if (v) setConsentError(false); }} error={consentError} />

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-brand hover:bg-blue-700 disabled:opacity-50 text-white py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors shadow-md shadow-blue-500/20"
          >
            {submitting ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} />}
            Submit for Verification
          </button>
        </form>
      )}
    </div>
  );
}
