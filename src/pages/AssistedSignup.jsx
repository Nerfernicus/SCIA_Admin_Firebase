import { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { UserPlus, Loader2, CheckCircle2, Copy, AlertCircle, ExternalLink, Clock } from 'lucide-react';
import { functions } from '../lib/firebase';
import { createAssistedSeniorAccountWithSession } from '../lib/assistedKiosk';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { DISTRICTS, barangaysOf, resolveBarangay } from '../lib/barangay';
import IdCardCapture from '../components/IdCardCapture';
import { RULES, sanitize, validate, validateGender, validateDob, validateOption } from '../lib/validators';

const createAssistedSeniorAccount = httpsCallable(functions, 'createAssistedSeniorAccount');

const NCSC_FORM_URL = 'https://www.ncsc.gov.ph/seniorcitizensdataform';

const EMPTY_FORM = {
  firstName: '', midName: '', lastName: '', district: '', barangay: '', block: '', street: '',
  conNumber: '', gender: '', dob: '', idNumber: '',
  // Who the inactivity-monitoring alert texts if this senior goes silent too long.
  guardianName: '', guardianPhone: '', guardianRelation: '',
};

const PH_MOBILE = /^(09\d{9}|\+639\d{9})$/;

const INPUT_BASE = 'w-full text-gray-900 placeholder:text-gray-400 rounded-xl py-2.5 px-3 text-sm border outline-none focus:ring-2';
const INPUT_OK = 'bg-gray-50 border-gray-100 focus:ring-blue-100 focus:border-blue-200';
const INPUT_BAD = 'bg-red-50 border-red-300 focus:ring-red-100 focus:border-red-400';
const INPUT_CLS = `${INPUT_BASE} ${INPUT_OK}`;
const inputCls = (err) => `${INPUT_BASE} ${err ? INPUT_BAD : INPUT_OK}`;
// Selected / unselected choice buttons (district, gender). dark: keeps the blue readable on the dark theme.
const CHOICE_ON = 'border-[#0f52ba] bg-blue-50 text-[#0f52ba] dark:border-blue-400 dark:text-blue-300';
const CHOICE_OFF = 'border-gray-200 text-gray-600 hover:bg-gray-50';
const LABEL_CLS = 'block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

function FieldError({ msg }) {
  if (!msg) return null;
  return (
    <p role="alert" className="mt-1 text-xs font-medium text-red-600 flex items-center gap-1">
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
  const [result, setResult] = useState(null); // { uid, idNumber, tempPassword }
  const [copied, setCopied] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  // null = not asked yet, 'registered' = already registered with NCSC,
  // otherwise the progress of registering them now: started | cancelled | completed_claimed
  const [ncscAnswer, setNcscAnswer] = useState(null);
  // Only used when the senior says they already hold a physical OSCA ID:
  // idPhoto = raw base64 JPEG of the card (taken with the camera or chosen from
  // files); idPhotoLater = they didn't bring it and will send a photo from the app.
  const [idPhoto, setIdPhoto] = useState('');
  const [idPhotoLater, setIdPhotoLater] = useState(false);
  const resetIdPhoto = () => { setIdPhoto(''); setIdPhotoLater(false); };

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
      idNumber: validate('idNumber', form.idNumber, { required: ncscAnswer === 'registered' }),
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

    if (ncscAnswer === null) {
      setError('Please answer whether the senior is already registered.');
      return;
    }
    if (ncscAnswer === 'registered' && !form.idNumber.trim()) {
      setError('OSCA ID Number is required for a senior who is already registered.');
      return;
    }
    if (ncscAnswer === 'registered' && !idPhoto && !idPhotoLater) {
      setError("Add a photo of the senior's OSCA ID, or choose that they didn't bring it and will send it from home.");
      return;
    }

    setSubmitting(true);
    try {
      const ncscStatus = ['started', 'cancelled', 'completed_claimed', 'registered'].includes(ncscAnswer)
        ? ncscAnswer
        : null;
      const submit = kiosk
        ? (payload) => createAssistedSeniorAccountWithSession({ ...payload, sessionToken: kiosk.token })
        : createAssistedSeniorAccount;
      const res = await submit({
        ...form,
        block: form.block.trim(),
        street: form.street.trim(),
        barangay: locked ? locked.name : form.barangay,
        district: locked ? locked.district : form.district,
        guardianName: form.guardianName.trim(),
        guardianPhone: form.guardianPhone.trim(),
        guardianRelation: form.guardianRelation.trim(),
        ncscStatus,
        ...(ncscAnswer === 'registered' && idPhoto ? { idPhotoBase64: idPhoto } : {}),
        ...(ncscAnswer === 'registered' && !idPhoto && idPhotoLater ? { idPhotoLater: true } : {}),
      });
      setResult(res.data);
      setForm(EMPTY_FORM);
      setNcscAnswer(null);
      resetIdPhoto();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to create the account. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const copyCredentials = () => {
    if (!result) return;
    const text = `SCIA Login\nID Number: ${result.idNumber}\nTemporary Password: ${result.tempPassword}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto font-sans">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <UserPlus size={22} className="text-[#0f52ba]" /> Assisted Senior Sign-Up
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          For seniors visiting in person without a phone or tech familiarity. Fill this in on their
          behalf and give them the printed credentials below to log into the app later.
          {myBarangay && (kiosk || !isSuperAdmin) && ` This account will be registered under Brgy. ${myBarangay}.`}
        </p>
      </div>

      {result ? (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8 text-center">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={26} className="text-green-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Account Created</h2>
          <p className="text-sm text-gray-500 mb-6">
            Write these down for the senior, or copy them to include in a printed slip. This is the
            only time this password will be shown.
          </p>

          {result.idPhoto === 'submitted' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4 text-left flex items-start gap-2">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-sm text-emerald-800">
                The photo of the OSCA ID was sent to OSCA. The account becomes verified once OSCA approves it.
              </p>
            </div>
          )}
          {result.idPhoto === 'later' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-left flex items-start gap-2">
              <Clock size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                <b>Not verified yet.</b> Tell the senior to open the app at home, go to Account &gt; Verify My
                OSCA ID, and send a photo of the physical ID (the ID number is already filled in). The account
                is verified after OSCA approves it.
              </p>
            </div>
          )}
          {result.idPhoto === 'failed' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-left flex items-start gap-2">
              <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                The account was created, but the ID photo could not be saved. Ask the senior to send it from the
                app (Account &gt; Verify My OSCA ID).
              </p>
            </div>
          )}

          <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5 text-left mb-6 space-y-3">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">ID Number</p>
              <p className="text-xl font-mono font-bold text-gray-900">{result.idNumber}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Temporary Password</p>
              <p className="text-xl font-mono font-bold text-gray-900">{result.tempPassword}</p>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={copyCredentials}
              className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
            >
              <Copy size={16} /> {copied ? 'Copied!' : 'Copy Credentials'}
            </button>
            <button
              onClick={() => setResult(null)}
              className="flex-1 py-3 rounded-xl bg-[#0f52ba] hover:bg-blue-700 text-white text-sm font-bold transition-colors"
            >
              Register Another
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
              <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 space-y-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              Is the senior already registered as a Senior Citizen? *
            </p>

            {ncscAnswer === null && (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setNcscAnswer('registered')}
                  className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-600 hover:bg-white transition-colors"
                >
                  Yes, registered
                </button>
                <button
                  type="button"
                  onClick={() => setNcscAnswer('none')}
                  className="flex-1 py-2.5 rounded-xl border-2 border-[#0f52ba] text-sm font-bold text-[#0f52ba] hover:bg-blue-50 transition-colors"
                >
                  Not yet
                </button>
              </div>
            )}

            {ncscAnswer === 'registered' && (
              <p className="text-sm text-gray-600">
                Enter the senior's OSCA ID Number and add a photo of the physical ID under Account Details below.
              </p>
            )}

            {(ncscAnswer === 'none' || ncscAnswer === 'cancelled') && (
              <div className="space-y-2">
                <p className="text-sm text-gray-600">
                  The senior can register at NCSC now, or you can skip this and just create the
                  account. Registering is optional.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setNcscAnswer('started');
                    window.open(NCSC_FORM_URL, '_blank', 'noopener,noreferrer');
                  }}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  <ExternalLink size={16} /> Register at NCSC
                </button>
              </div>
            )}

            {ncscAnswer === 'started' && (
              <div className="space-y-2">
                <p className="text-sm text-gray-600">Did the senior finish the NCSC registration?</p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setNcscAnswer('completed_claimed')}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-colors"
                  >
                    Yes, finished
                  </button>
                  <button
                    type="button"
                    onClick={() => setNcscAnswer('cancelled')}
                    className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-600 hover:bg-white transition-colors"
                  >
                    Cancelled
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => window.open(NCSC_FORM_URL, '_blank', 'noopener,noreferrer')}
                  className="text-xs text-[#0f52ba] underline"
                >
                  Open the form again
                </button>
              </div>
            )}

            {ncscAnswer === 'completed_claimed' && (
              <p className="text-sm text-emerald-700">
                Marked as finished. It will show up in NCSC Registrations for verification.
              </p>
            )}

            {ncscAnswer !== null && (
              <button
                type="button"
                onClick={() => { setNcscAnswer(null); resetIdPhoto(); }}
                className="text-xs text-gray-500 underline"
              >
                Change answer
              </button>
            )}
          </div>

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
              <select
                value={locked ? locked.name : form.barangay}
                onChange={(e) => { update('barangay')(e); clearErr('barangay'); }}
                disabled={!!locked || !form.district}
                className={`${INPUT_CLS} disabled:opacity-60`}
              >
                {locked ? (
                  <option value={locked.name}>{locked.name}</option>
                ) : (
                  <>
                    <option value="">{form.district ? 'Select barangay' : 'Select a district first'}</option>
                    {barangaysOf(form.district).map((b) => <option key={b} value={b}>{b}</option>)}
                  </>
                )}
              </select>
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

          <Section title="Account Details">
            <div>
              <label className={LABEL_CLS}>
                Senior Citizen ID Number{ncscAnswer === 'registered' ? ' *' : ' (optional)'}
              </label>
              <input value={form.idNumber} onChange={updateText('idNumber', 'idNumber')} maxLength={RULES.idNumber.max} aria-invalid={!!fieldErrors.idNumber} className={inputCls(fieldErrors.idNumber)} />
              <FieldError msg={fieldErrors.idNumber} />
              <p className="text-xs text-gray-400 mt-1.5">
                {ncscAnswer === 'registered'
                  ? 'Required for a senior who is already registered.'
                  : "Leave blank if they don't have one yet. A temporary ID will be assigned."}
              </p>
            </div>

            {ncscAnswer === 'registered' && (
              <div>
                <label className={LABEL_CLS}>Senior Citizen ID Photo *</label>
                <IdCardCapture
                  value={idPhoto}
                  onChange={setIdPhoto}
                  later={idPhotoLater}
                  onLaterChange={setIdPhotoLater}
                />
              </div>
            )}
          </Section>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-[#0f52ba] hover:bg-blue-700 disabled:opacity-50 text-white py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors shadow-md shadow-blue-500/20"
          >
            {submitting ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} />}
            Create Account
          </button>
        </form>
      )}
    </div>
  );
}
