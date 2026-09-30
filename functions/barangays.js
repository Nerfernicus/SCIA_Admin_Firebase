// Valenzuela City barangays by district, spelled the way admin accounts store
// them (`admins/{uid}.barangay`). The mobile app's sign-up list is identical
// except it spells "General T. de Leon" as "Gen. T. de Leon" (see GEN_T below).
// Keep in sync with functions/barangays.js and the mobile app's
// constants/valenzuelaDistricts.ts.

export const DISTRICT_1_BARANGAYS = [
  'Arkong Bato', 'Balangkas', 'Bignay', 'Bisig', 'Canumay East', 'Canumay West',
  'Coloong', 'Dalandanan', 'Isla', 'Lawang Bato', 'Lingunan', 'Mabolo',
  'Malanday', 'Malinta', 'Palasan', 'Pariancillo Villa', 'Pasolo', 'Poblacion',
  'Polo', 'Punturin', 'Rincon', 'Tagalag', 'Veinte Reales', 'Wawang Pulo',
];

export const DISTRICT_2_BARANGAYS = [
  'Bagbaguin', 'General T. de Leon', 'Karuhatan', 'Mapulang Lupa',
  'Marulas', 'Maysan', 'Parada', 'Paso de Blas', 'Ugong',
];

export const DISTRICTS = ['District 1', 'District 2'];

export const barangaysForDistrict = (district) =>
  district === 'District 1' ? DISTRICT_1_BARANGAYS
    : district === 'District 2' ? DISTRICT_2_BARANGAYS
      : [];

// AssistedSignup.jsx imports this name; same function.
export const barangaysOf = barangaysForDistrict;

const ALIASES = {
  pulo: 'polo',
  'viente reales': 'veinte reales',
  'gen. t. de leon': 'general t. de leon',
  'gen t. de leon': 'general t. de leon',
  'gen t de leon': 'general t. de leon',
  'hen. t. de leon': 'general t. de leon',
  'general t de leon': 'general t. de leon',
  canumay: 'canumay east',
};

const normalize = (s) => String(s || '')
  .toLowerCase().trim().replace(/\s+/g, ' ')
  .replace(/^brgy\.?\s+/, '').replace(/^barangay\s+/, '');

/** { name, district } for any known spelling of a barangay, else null. */
export function resolveBarangay(barangay) {
  const key = ALIASES[normalize(barangay)] ?? normalize(barangay);
  if (!key) return null;
  const d1 = DISTRICT_1_BARANGAYS.find((b) => normalize(b) === key);
  if (d1) return { name: d1, district: 'District 1' };
  const d2 = DISTRICT_2_BARANGAYS.find((b) => normalize(b) === key);
  if (d2) return { name: d2, district: 'District 2' };
  return null;
}

export const districtOfBarangay = (barangay) => resolveBarangay(barangay)?.district ?? '';

// A barangay whose spelling in stored data disagrees between the mobile app's
// sign-up list and the admin dashboard needs every spelling listed together so
// a Firestore `where('barangay', 'in', [...])` query still finds it. Add a new
// row here (not to ALIASES above) if another barangay turns out to need one.
// Keep in sync with `isGenT()` in firestore.rules.
const SPELLING_GROUPS = [
  ['General T. de Leon', 'Gen. T. de Leon', 'Gen T. de Leon', 'Hen. T. de Leon'],
];

/** Canonical (admin-dashboard) spelling for any known spelling of a barangay. */
export function displayBarangay(barangay) {
  return resolveBarangay(barangay)?.name || String(barangay || '').trim();
}

/** True when both names resolve to the same barangay (any spelling, either side). */
export function sameBarangay(a, b) {
  const da = displayBarangay(a);
  const db = displayBarangay(b);
  return !!da && !!db && da === db;
}

/**
 * Every spelling that might be stored for this barangay. Use with
 * `where('barangay', 'in', barangayVariants(b))` so a barangay-scoped query
 * still matches documents written under a different (but equivalent) spelling.
 */
export function barangayVariants(barangay) {
  const canonical = displayBarangay(barangay);
  if (!canonical) return [];
  const group = SPELLING_GROUPS.find((g) => g.includes(canonical));
  return group ? [...group] : [canonical];
}
