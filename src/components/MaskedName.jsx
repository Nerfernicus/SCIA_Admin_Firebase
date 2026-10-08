import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { referenceCode } from '../lib/referenceCode';

/**
 * Shows a senior's reference code instead of the full name. The eye button reveals that one name
 * for 10 seconds (staff sometimes need it), then hides it again.
 */
export default function MaskedName({ id, name, className = '' }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!show) return undefined;
    const t = setTimeout(() => setShow(false), 10000);
    return () => clearTimeout(t);
  }, [show]);

  const code = referenceCode(id || name);
  if (!name) return <span className={`font-mono ${className}`}>{code}</span>;

  return (
    <span className={className}>
      {show ? name : <span className="font-mono">{code}</span>}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setShow((s) => !s); }}
        aria-label={show ? 'Hide name' : 'Show name for 10 seconds'}
        className="ml-2 inline-flex align-middle rounded p-1 text-gray-500 hover:text-[#0f52ba]"
      >
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </span>
  );
}
