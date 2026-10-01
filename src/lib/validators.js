// src/lib/validators.js
//
// One place for "what characters may go in this field". Each rule has:
//   strip    characters NOT allowed; they are removed as the user types and the
//            field shows `hint` so the person knows why nothing appeared
//   check    final validity test, run on submit
//   message  shown when `check` fails
//   max      maximum length
//
// The same rules are enforced again on the server (functions/functions.js).

export const RULES = {
  name: {
    strip: /[^\p{L}\p{M}\s.'-]/gu,
    check: /^\p{L}[\p{L}\p{M}\s.'-]*$/u,
    max: 50,
    hint: 'Letters only. Numbers and symbols are not allowed.',
    message: 'Enter a valid name (letters, spaces, . \' - only).',
  },
  // Mobile numbers: digits, with an optional leading +.
  phone: {
    strip: /[^\d+]/g,
    check: /^(09\d{9}|\+639\d{9})$/,
    max: 13,
    hint: 'Numbers only.',
    message: 'Enter a valid PH mobile number, e.g. 09171234567.',
  },
  // House / block / street lines.
  address: {
    strip: /[^\p{L}\p{N}\s.,#'/-]/gu,
    check: /^[\p{L}\p{N}][\p{L}\p{N}\s.,#'/-]*$/u,
    max: 80,
    hint: 'Letters, numbers and . , # - / only.',
    message: 'Enter a valid address (letters, numbers and . , # - / only).',
  },
  // Senior Citizen / OSCA ID numbers, including TEMP###### ones.
  idNumber: {
    strip: /[^A-Za-z0-9-]/g,
    check: /^[A-Za-z0-9-]{4,20}$/,
    max: 20,
    hint: 'Letters, numbers and dashes only.',
    message: 'Enter a valid ID number (4 to 20 letters or numbers).',
  },
  // Job titles such as "Health Officer" or "Barangay Secretary".
  position: {
    strip: /[^\p{L}\p{M}\s.'-]/gu,
    check: /^\p{L}[\p{L}\p{M}\s.'-]*$/u,
    max: 40,
    hint: 'Letters only.',
    message: 'Enter a valid position (letters only).',
  },
  // Free relationship text such as "Daughter" or "Neighbor".
  relation: {
    strip: /[^\p{L}\p{M}\s.'-]/gu,
    check: /^\p{L}[\p{L}\p{M}\s.'-]*$/u,
    max: 30,
    hint: 'Letters only.',
    message: 'Enter a valid relationship (letters only).',
  },
};

export const GENDERS = ['Male', 'Female'];
export const MIN_SENIOR_AGE = 60;

// Removes disallowed characters. `rejected` is true when something was dropped
// (or the value was cut to the max length) so the UI can flag it.
export function sanitize(kind, raw) {
  const rule = RULES[kind];
  const input = String(raw ?? '');
  let value = input.replace(rule.strip, '');
  if (kind === 'phone') value = value.replace(/(?!^)\+/g, ''); // "+" only at the start
  value = value.replace(/^\s+/, '').replace(/\s{2,}/g, ' ');
  if (value.length > rule.max) value = value.slice(0, rule.max);
  return { value, rejected: value !== input.replace(/^\s+/, '').replace(/\s{2,}/g, ' ') };
}

// Returns an error string, or '' when the value is fine.
export function validate(kind, raw, { required = true } = {}) {
  const rule = RULES[kind];
  const v = String(raw ?? '').trim();
  if (!v) return required ? 'This field is required.' : '';
  return rule.check.test(v) ? '' : rule.message;
}

export function validateGender(value) {
  return GENDERS.includes(value) ? '' : 'Choose Male or Female.';
}

// dob is "YYYY-MM-DD".
export function validateDob(dob) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob || '')) return 'Select a complete date of birth.';
  const d = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(d.getTime())) return 'Select a valid date of birth.';
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  if (age < MIN_SENIOR_AGE) return `The senior must be at least ${MIN_SENIOR_AGE} years old.`;
  if (age > 120) return 'Select a valid date of birth.';
  return '';
}

// A select must hold one of its real options.
export function validateOption(value, options, label = 'option') {
  return options.includes(value) ? '' : `Choose a valid ${label} from the list.`;
}
