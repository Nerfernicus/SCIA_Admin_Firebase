// Shared constants for the OSCA Valenzuela local registry (mirror of functions/seniorRecord.js).
export const ID_TYPES = [
  { value: 'philsys',         label: 'National ID (PhilSys)' },
  { value: 'sss',             label: 'SSS ID / UMID' },
  { value: 'gsis',            label: 'GSIS ID / UMID' },
  { value: 'drivers_license', label: "Driver's License" },
  { value: 'voters_id',       label: "Voter's ID" },
  { value: 'passport',        label: 'Passport' },
  { value: 'birth_certificate', label: 'Birth Certificate (PSA)' },
];
export const idTypeLabel = (v) => ID_TYPES.find((t) => t.value === v)?.label || v;
export const RECORD_RE = /^VAL-OSCA-\d{4}-\d{6}$/;
