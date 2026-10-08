import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, X, Volume2, Check } from 'lucide-react';
import { MODES, loadSettings, saveSettings, applyMode, startNarration, filterMatrixValues } from '../lib/accessibility';

/**
 * Floating "Accessibility" button on every page (dashboard, login and the senior kiosk).
 * Colour modes + voice narration (reads buttons, links and fields on hover or keyboard focus).
 * Choices are remembered in this browser.
 */
export default function AccessibilityMenu() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(loadSettings);
  const speechOk = typeof window !== 'undefined' && 'speechSynthesis' in window;

  useEffect(() => { applyMode(settings.mode); saveSettings(settings); }, [settings]);
  useEffect(() => (settings.narrate && speechOk ? startNarration() : undefined), [settings.narrate, speechOk]);

  const set = (patch) => setSettings((s) => ({ ...s, ...patch }));

  return createPortal(
    <>
      {/* Hidden SVG filters used by the colour-blind modes */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
        <defs>
          {['protanopia', 'deuteranopia', 'tritanopia'].map((id) => (
            <filter key={id} id={`a11y-${id}`} colorInterpolationFilters="sRGB">
              <feColorMatrix type="matrix" values={filterMatrixValues(id)} />
            </filter>
          ))}
        </defs>
      </svg>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="a11y-panel"
        aria-label="Accessibility options"
        className="fixed bottom-4 right-4 z-9999 flex items-center gap-2 rounded-full bg-[#0f52ba] px-4 py-3 text-sm font-bold text-white shadow-lg ring-2 ring-white hover:bg-blue-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-yellow-300"
      >
        <Eye size={20} /> <span className="hidden sm:inline">Accessibility</span>
      </button>

      {open && (
        <div
          id="a11y-panel"
          role="dialog"
          aria-label="Accessibility options"
          className="fixed bottom-20 right-4 z-9999 w-[min(92vw,22rem)] rounded-2xl border border-gray-200 bg-white p-4 text-gray-900 shadow-2xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-extrabold">Accessibility</h2>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-full p-2 hover:bg-gray-100">
              <X size={18} />
            </button>
          </div>

          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-600">Colours</p>
          <div className="space-y-1.5" role="radiogroup" aria-label="Colour mode">
            {MODES.map((m) => {
              const on = settings.mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => set({ mode: m.id })}
                  className={`flex w-full items-center justify-between rounded-xl border-2 px-3 py-2.5 text-left text-sm font-semibold ${on ? 'border-[#0f52ba] bg-blue-50 text-[#0f52ba]' : 'border-gray-200 hover:bg-gray-50'}`}
                >
                  <span>{m.label}<span className="block text-xs font-normal text-gray-600">{m.hint}</span></span>
                  {on && <Check size={18} />}
                </button>
              );
            })}
          </div>

          <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-wider text-gray-600">Voice</p>
          <button
            type="button"
            role="switch"
            aria-checked={settings.narrate}
            disabled={!speechOk}
            onClick={() => set({ narrate: !settings.narrate })}
            className={`flex w-full items-center justify-between rounded-xl border-2 px-3 py-2.5 text-left text-sm font-semibold disabled:opacity-50 ${settings.narrate ? 'border-[#0f52ba] bg-blue-50 text-[#0f52ba]' : 'border-gray-200 hover:bg-gray-50'}`}
          >
            <span className="flex items-center gap-2"><Volume2 size={18} /> Read aloud on hover or focus</span>
            <span>{settings.narrate ? 'On' : 'Off'}</span>
          </button>
          {!speechOk && <p className="mt-1 text-xs text-red-600">This browser has no text-to-speech.</p>}
          <p className="mt-3 text-xs text-gray-600">
            Colour-blind modes shift colours toward ones that are easier to tell apart. They are approximate.
          </p>
        </div>
      )}
    </>,
    document.body,
  );
}
