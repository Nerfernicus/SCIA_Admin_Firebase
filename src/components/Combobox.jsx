import { useState, useRef, useEffect, useId, useMemo } from 'react';
import { ChevronDown, Check } from 'lucide-react';

// Searchable single-select (WAI-ARIA 1.2 combobox with a listbox popup).
// Type to filter, ↑/↓ to move, Enter to pick, Esc to close. The value can only
// be one of `options`, so a half-typed name never reaches the form.
// `options` may be strings or { value, label } objects.
export default function Combobox({
  value, onChange, options, placeholder = 'Select…', disabled = false,
  className = '', emptyText = 'No match', ariaLabel, invalid = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const listRef = useRef(null);
  const uid = useId();
  const listId = `${uid}-list`;

  const opts = useMemo(
    () => options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o)), [options]);
  const selected = opts.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? opts.filter((o) => o.label.toLowerCase().includes(q)) : opts;
  }, [opts, query]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (!wrapRef.current?.contains(e.target)) close(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  // Keep the highlighted option in view.
  useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function close() { setOpen(false); setQuery(''); }
  function openList() {
    if (disabled) return;
    setOpen(true);
    setActive(Math.max(0, opts.findIndex((o) => o.value === value)));
  }
  function pick(o) { onChange(o.value); close(); }

  function onKeyDown(e) {
    if (disabled) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) openList(); else setActive((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (!open) openList(); else setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && open) { e.preventDefault(); if (filtered[active]) pick(filtered[active]); }
    else if (e.key === 'Escape' && open) { e.preventDefault(); close(); }
    else if (e.key === 'Tab') close();
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && filtered[active] ? `${uid}-opt-${active}` : undefined}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        disabled={disabled}
        placeholder={open && selected ? selected.label : placeholder}
        value={open ? query : (selected ? selected.label : '')}
        onFocus={openList}
        onClick={openList}
        onChange={(e) => { setQuery(e.target.value); setActive(0); if (!open) setOpen(true); }}
        onKeyDown={onKeyDown}
        className={`${className} pr-9`}
      />
      <ChevronDown size={16} aria-hidden="true"
        className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      {open && (
        <ul id={listId} ref={listRef} role="listbox"
          className="absolute z-30 transition duration-150 ease-out starting:opacity-0 starting:scale-95 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-gray-200 bg-white py-1 text-sm shadow-lg"
          style={{ transformOrigin: 'top' }}>
          {filtered.length === 0 && <li className="px-3 py-2 text-gray-500">{emptyText}</li>}
          {filtered.map((o, i) => (
            <li key={o.value || 'none'} id={`${uid}-opt-${i}`} role="option" aria-selected={o.value === value}
              onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)} onMouseEnter={() => setActive(i)}
              className={`flex min-h-10 cursor-pointer items-center justify-between px-3 py-2 text-gray-900 ${i === active ? 'bg-gray-100' : ''}`}>
              <span>{o.label}</span>
              {o.value === value && <Check size={14} className="text-brand" aria-hidden="true" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
