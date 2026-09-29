// Valenzuela City barangays by district (admin spelling). Mirrors
// functions/barangays.js — keep the two in sync.

export const DISTRICT_1 = [
  'Arkong Bato', 'Balangkas', 'Bignay', 'Bisig', 'Canumay East', 'Canumay West',
  'Coloong', 'Dalandanan', 'Isla', 'Lawang Bato', 'Lingunan', 'Mabolo',
  'Malanday', 'Malinta', 'Palasan', 'Pariancillo Villa', 'Pasolo', 'Poblacion',
  'Polo', 'Punturin', 'Rincon', 'Tagalag', 'Veinte Reales', 'Wawang Pulo',
];

export const DISTRICT_2 = [
  'Bagbaguin', 'General T. de Leon', 'Karuhatan', 'Mapulang Lupa',
  'Marulas', 'Maysan', 'Parada', 'Paso de Blas', 'Ugong',
];

export const DISTRICTS = ['District 1', 'District 2'];

export const barangaysOf = (district) =>
  district === 'District 1' ? DISTRICT_1 : district === 'District 2' ? DISTRICT_2 : [];

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

const normalize = (s) =>
  String(s || '').toLowerCase().trim().replace(/\s+/g, ' ')
    .replace(/^brgy\.?\s+/, '').replace(/^barangay\s+/, '');

// { name, district } for any known spelling, else null.
export function resolveBarangay(barangay) {
  const key = ALIASES[normalize(barangay)] || normalize(barangay);
  if (!key) return null;
  const d1 = DISTRICT_1.find((b) => normalize(b) === key);
  if (d1) return { name: d1, district: 'District 1' };
  const d2 = DISTRICT_2.find((b) => normalize(b) === key);
  if (d2) return { name: d2, district: 'District 2' };
  return null;
}
