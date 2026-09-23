import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { UserPlus, Loader2, CheckCircle2, Copy, AlertCircle } from 'lucide-react';
import { functions } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';

const createAssistedSeniorAccount = httpsCallable(functions, 'createAssistedSeniorAccount');

const EMPTY_FORM = {
  firstName: '', midName: '', lastName: '', address: '', conNumber: '',
  gender: '', dob: '', idNumber: '',
};

export default function AssistedSignup() {
  const { adminData, isSuperAdmin } = useAuth();
  const { t } = useLang();
  const myBarangay = adminData?.barangay || null;

  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // { uid, idNumber, tempPassword }
  const [copied, setCopied] = useState(false);

  const update = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.firstName || !form.lastName || !form.address || !form.conNumber || !form.gender || !form.dob) {
      setError(t.fillAllFields);
      return;
    }

    setSubmitting(true);
    try {
      const res = await createAssistedSeniorAccount(form);
      setResult(res.data);
      setForm(EMPTY_FORM);
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
    <div className="p-8 max-w-3xl mx-auto font-sans">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <UserPlus size={22} className="text-[#0f52ba]" /> Assisted Senior Sign-Up
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          For seniors visiting in person without a phone or tech familiarity — fill this in on their
          behalf and give them the printed credentials below to log into the app later.
          {myBarangay && !isSuperAdmin && ` This account will be registered under Brgy. ${myBarangay}.`}
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

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">First Name</label>
              <input value={form.firstName} onChange={update('firstName')} className="w-full bg-gray-50 rounded-xl py-2.5 px-3 text-sm border border-gray-100 focus:ring-2 focus:ring-blue-100 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Middle Name</label>
              <input value={form.midName} onChange={update('midName')} className="w-full bg-gray-50 rounded-xl py-2.5 px-3 text-sm border border-gray-100 focus:ring-2 focus:ring-blue-100 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Last Name</label>
              <input value={form.lastName} onChange={update('lastName')} className="w-full bg-gray-50 rounded-xl py-2.5 px-3 text-sm border border-gray-100 focus:ring-2 focus:ring-blue-100 outline-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Address</label>
            <input value={form.address} onChange={update('address')} className="w-full bg-gray-50 rounded-xl py-2.5 px-3 text-sm border border-gray-100 focus:ring-2 focus:ring-blue-100 outline-none" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Contact Number</label>
              <input value={form.conNumber} onChange={update('conNumber')} placeholder="09XXXXXXXXX" className="w-full bg-gray-50 rounded-xl py-2.5 px-3 text-sm border border-gray-100 focus:ring-2 focus:ring-blue-100 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Gender</label>
              <select value={form.gender} onChange={update('gender')} className="w-full bg-gray-50 rounded-xl py-2.5 px-3 text-sm border border-gray-100 focus:ring-2 focus:ring-blue-100 outline-none">
                <option value="">Select</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Date of Birth</label>
              <input type="date" value={form.dob} onChange={update('dob')} className="w-full bg-gray-50 rounded-xl py-2.5 px-3 text-sm border border-gray-100 focus:ring-2 focus:ring-blue-100 outline-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
              OSCA ID Number <span className="normal-case font-normal text-gray-400">(leave blank if they don't have one yet — a temporary ID will be assigned)</span>
            </label>
            <input value={form.idNumber} onChange={update('idNumber')} className="w-full bg-gray-50 rounded-xl py-2.5 px-3 text-sm border border-gray-100 focus:ring-2 focus:ring-blue-100 outline-none" />
          </div>

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