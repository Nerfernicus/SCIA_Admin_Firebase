// Valenzuela City barangays by district, spelled the way admin accounts store
// them (`admins/{uid}.barangay`). The mobile app's sign-up list is identical
// except it spells "General T. de Leon" as "Gen. T. de Leon" (see GEN_T below).
// Keep in sync with src/lib/barangay.js (the website's copy) and the mobile
// app's constants/valenzuelaDistricts.ts. This copy is CommonJS because Cloud
// Functions load it with require(); do not paste the website's `export` syntax
// over it again (that is what removed locateBarangay before).

const DISTRICT_1_BARANGAYS = [
  'Arkong Bato', 'Balangkas', 'Bignay', 'Bisig', 'Canumay East', 'Canumay West',
  'Coloong', 'Dalandanan', 'Isla', 'Lawang Bato', 'Lingunan', 'Mabolo',
  'Malanday', 'Malinta', 'Palasan', 'Pariancillo Villa', 'Pasolo', 'Poblacion',
  'Polo', 'Punturin', 'Rincon', 'Tagalag', 'Veinte Reales', 'Wawang Pulo',
];

const DISTRICT_2_BARANGAYS = [
  'Bagbaguin', 'General T. de Leon', 'Karuhatan', 'Mapulang Lupa',
  'Marulas', 'Maysan', 'Parada', 'Paso de Blas', 'Ugong',
];

const DISTRICTS = ['District 1', 'District 2'];

const barangaysForDistrict = (district) =>
  district === 'District 1' ? DISTRICT_1_BARANGAYS
    : district === 'District 2' ? DISTRICT_2_BARANGAYS
      : [];

// AssistedSignup.jsx imports this name; same function.
const barangaysOf = barangaysForDistrict;

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
function resolveBarangay(barangay) {
  const key = ALIASES[normalize(barangay)] ?? normalize(barangay);
  if (!key) return null;
  const d1 = DISTRICT_1_BARANGAYS.find((b) => normalize(b) === key);
  if (d1) return { name: d1, district: 'District 1' };
  const d2 = DISTRICT_2_BARANGAYS.find((b) => normalize(b) === key);
  if (d2) return { name: d2, district: 'District 2' };
  return null;
}

const districtOfBarangay = (barangay) => resolveBarangay(barangay)?.district ?? '';

// A barangay whose spelling in stored data disagrees between the mobile app's
// sign-up list and the admin dashboard needs every spelling listed together so
// a Firestore `where('barangay', 'in', [...])` query still finds it. Add a new
// row here (not to ALIASES above) if another barangay turns out to need one.
// Keep in sync with `isGenT()` in firestore.rules.
const SPELLING_GROUPS = [
  ['General T. de Leon', 'General T de Leon', 'Gen. T. de Leon', 'Gen T. de Leon', 'Gen T de Leon', 'Hen. T. de Leon'],
];

/** Canonical (admin-dashboard) spelling for any known spelling of a barangay. */
function displayBarangay(barangay) {
  return resolveBarangay(barangay)?.name || String(barangay || '').trim();
}

/** True when both names resolve to the same barangay (any spelling, either side). */
function sameBarangay(a, b) {
  const da = displayBarangay(a);
  const db = displayBarangay(b);
  return !!da && !!db && da === db;
}

/**
 * Every spelling that might be stored for this barangay. Use with
 * `where('barangay', 'in', barangayVariants(b))` so a barangay-scoped query
 * still matches documents written under a different (but equivalent) spelling.
 */
function barangayVariants(barangay) {
  const canonical = displayBarangay(barangay);
  if (!canonical) return [];
  const group = SPELLING_GROUPS.find((g) => g.includes(canonical));
  return group ? [...group] : [canonical];
}


// ── Geofence ────────────────────────────────────────────────────────────────
// Real barangay boundaries (point-in-polygon), see barangayBoundaries.js.
// Anything outside every barangay (beyond a ~350 m edge tolerance) is outside
// Valenzuela City, so a Caloocan/Malabon/Meycauayan location is no longer
// mistaken for a Valenzuela barangay.
const { barangayFromBoundaries } = require('./barangayBoundaries');

const isCoord = (lat, lng) =>
  typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng);

// { insideCity, barangay, district, exact } — barangay/district are null outside the city.
function locateBarangay(lat, lng) {
  if (!isCoord(lat, lng)) return { insideCity: false, barangay: null, district: null, exact: false };
  const hit = barangayFromBoundaries(lat, lng);
  if (!hit) return { insideCity: false, barangay: null, district: null, exact: false };
  const resolved = resolveBarangay(hit.name);
  return {
    insideCity: true,
    barangay: resolved ? resolved.name : hit.name,
    district: resolved ? resolved.district : null,
    exact: hit.exact,
  };
}

// Rough boxes for the cities around Valenzuela, used only to NAME where an SOS
// came from when it is outside Valenzuela (for the alert text and the 911
// coordination note). They are coarse rectangles, checked in order, so a point
// near a city border can be named wrongly; an unknown place returns null and the
// alert then just says "outside Valenzuela City". Replace with real boundaries
// (GeoJSON) if exact city names matter.
const NEARBY_CITIES = [
  { city: "Malabon City", minLat: 14.64, maxLat: 14.675, minLng: 120.93, maxLng: 120.97 },
  { city: "Caloocan City", minLat: 14.61, maxLat: 14.675, minLng: 120.95, maxLng: 121.01 },
  { city: "Quezon City", minLat: 14.58, maxLat: 14.79, minLng: 120.99, maxLng: 121.13 },
  { city: "Manila", minLat: 14.55, maxLat: 14.65, minLng: 120.95, maxLng: 121.02 },
  { city: "San Jose del Monte, Bulacan", minLat: 14.78, maxLat: 14.86, minLng: 121.02, maxLng: 121.12 },
  { city: "Meycauayan, Bulacan", minLat: 14.72, maxLat: 14.78, minLng: 120.93, maxLng: 120.98 },
];

// { insideCity: true } inside Valenzuela, else { insideCity: false, city: name | null }.
function locateCity(lat, lng) {
  if (!isCoord(lat, lng)) return { insideCity: false, city: null };
  if (locateBarangay(lat, lng).insideCity) return { insideCity: true, city: "Valenzuela City" };
  const hit = NEARBY_CITIES.find((c) =>
    lat >= c.minLat && lat <= c.maxLat && lng >= c.minLng && lng <= c.maxLng);
  return { insideCity: false, city: hit ? hit.city : null };
}

module.exports = {
  DISTRICTS, DISTRICT_1_BARANGAYS, DISTRICT_2_BARANGAYS,
  barangaysForDistrict, barangaysOf, districtOfBarangay,
  resolveBarangay, displayBarangay, sameBarangay, barangayVariants,
  locateBarangay, locateCity,
};
