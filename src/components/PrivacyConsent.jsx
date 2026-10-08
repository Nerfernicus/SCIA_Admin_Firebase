import { useState } from 'react';
import { X } from 'lucide-react';
import { TERMS, PRIVACY } from '../lib/privacyText';

/**
 * Required checkbox: the senior (or their guardian) agrees to the Terms and Conditions and the
 * Data Privacy Policy. Links open the full text in a dialog.
 */
export default function PrivacyConsent({ checked, onChange, error }) {
  const [doc, setDoc] = useState(null); // 'terms' | 'privacy' | null
  const sections = doc === 'terms' ? TERMS : PRIVACY;

  return (
    <div className={`rounded-xl border-2 p-4 ${error ? 'border-red-500 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={!!error}
          className="mt-1 h-6 w-6 shrink-0 accent-[#0f52ba]"
        />
        <span className="text-sm text-gray-900">
          The senior (or their guardian) has read and agrees to the{' '}
          <button type="button" onClick={() => setDoc('terms')} className="font-bold text-[#0f52ba] underline">Terms and Conditions</button>
          {' '}and the{' '}
          <button type="button" onClick={() => setDoc('privacy')} className="font-bold text-[#0f52ba] underline">Data Privacy Policy</button>.
        </span>
      </label>
      {error && <p role="alert" className="mt-2 text-sm font-medium text-red-600">Please tick this box to continue.</p>}

      {doc && (
        <div className="fixed inset-0 z-10000 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 text-gray-900 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-extrabold">{doc === 'terms' ? 'Terms and Conditions' : 'Data Privacy Policy'}</h2>
              <button type="button" onClick={() => setDoc(null)} aria-label="Close" className="rounded-full p-2 hover:bg-gray-100"><X size={20} /></button>
            </div>
            {sections.map(([title, body]) => (
              <div key={title} className="mb-3">
                <h3 className="text-sm font-bold">{title}</h3>
                <p className="text-sm text-gray-700">{body}</p>
              </div>
            ))}
            <button type="button" onClick={() => setDoc(null)} className="mt-2 w-full rounded-xl bg-[#0f52ba] py-3 text-sm font-bold text-white">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
