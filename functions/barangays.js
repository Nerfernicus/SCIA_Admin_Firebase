// Valenzuela City barangays by district (admin spelling). Mirrors
// src/lib/barangay.js in the dashboard — keep the two in sync.

const DISTRICT_1 = [
  "Arkong Bato", "Balangkas", "Bignay", "Bisig", "Canumay East", "Canumay West",
  "Coloong", "Dalandanan", "Isla", "Lawang Bato", "Lingunan", "Mabolo",
  "Malanday", "Malinta", "Palasan", "Pariancillo Villa", "Pasolo", "Poblacion",
  "Polo", "Punturin", "Rincon", "Tagalag", "Veinte Reales", "Wawang Pulo",
];

const DISTRICT_2 = [
  "Bagbaguin", "General T. de Leon", "Karuhatan", "Mapulang Lupa",
  "Marulas", "Maysan", "Parada", "Paso de Blas", "Ugong",
];

const ALIASES = {
  "pulo": "polo",
  "viente reales": "veinte reales",
  "gen. t. de leon": "general t. de leon",
  "gen t. de leon": "general t. de leon",
  "gen t de leon": "general t. de leon",
  "hen. t. de leon": "general t. de leon",
  "general t de leon": "general t. de leon",
  "canumay": "canumay east",
};

const normalize = (s) => String(s || "")
    .toLowerCase().trim().replace(/\s+/g, " ")
    .replace(/^brgy\.?\s+/, "").replace(/^barangay\s+/, "");

// { name, district: "District 1" | "District 2" } for any known spelling, else null.
function resolveBarangay(barangay) {
  const key = ALIASES[normalize(barangay)] || normalize(barangay);
  if (!key) return null;
  const d1 = DISTRICT_1.find((b) => normalize(b) === key);
  if (d1) return { name: d1, district: "District 1" };
  const d2 = DISTRICT_2.find((b) => normalize(b) === key);
  if (d2) return { name: d2, district: "District 2" };
  return null;
}

// ── Geofence ────────────────────────────────────────────────────────────────
// The repo has no barangay boundary polygons, only one representative point per
// barangay (the same points the mobile app's SOS screen uses as its fallback).
// So the geofence is: (1) is the coordinate inside Valenzuela City's bounding
// box at all, (2) which barangay point is nearest. Both are approximations;
// near a barangay border the nearest point can be the neighbouring barangay.
// Swap locateBarangay() for a point-in-polygon check if you get GeoJSON.
const CITY_BOUNDS = { minLat: 14.64, maxLat: 14.78, minLng: 120.90, maxLng: 121.02 };

const BARANGAY_POINTS = [
  ["Arkong Bato", 14.7175, 120.9800], ["Bagbaguin", 14.7365, 120.9920],
  ["Balangkas", 14.7015, 120.9790], ["Bignay", 14.7250, 120.9980],
  ["Bisig", 14.7160, 120.9785], ["Canumay East", 14.7095, 120.9925],
  ["Canumay West", 14.7065, 120.9880], ["Coloong", 14.7205, 120.9780],
  ["Dalandanan", 14.7035, 120.9825], ["General T. de Leon", 14.7120, 120.9870],
  ["Isla", 14.6945, 120.9950], ["Karuhatan", 14.7055, 120.9890],
  ["Lawang Bato", 14.7155, 120.9975], ["Lingunan", 14.7060, 120.9830],
  ["Mabolo", 14.6995, 120.9905], ["Malanday", 14.7190, 120.9820],
  ["Malinta", 14.7045, 120.9785], ["Mapulang Lupa", 14.7135, 120.9965],
  ["Marulas", 14.7145, 120.9915], ["Maysan", 14.7195, 120.9950],
  ["Palasan", 14.7005, 120.9915], ["Parada", 14.7085, 120.9805],
  ["Pariancillo Villa", 14.7030, 120.9865], ["Paso de Blas", 14.7290, 120.9930],
  ["Pasolo", 14.7110, 120.9795], ["Poblacion", 14.7080, 120.9860],
  ["Polo", 14.7245, 120.9835], ["Punturin", 14.7270, 120.9875],
  ["Rincon", 14.7095, 120.9795], ["Tagalag", 14.7320, 120.9880],
  ["Ugong", 14.7205, 120.9935], ["Veinte Reales", 14.7075, 120.9895],
  ["Wawang Pulo", 14.7185, 120.9845],
];

// { insideCity, barangay, district } — barangay/district are null outside the city.
function locateBarangay(lat, lng) {
  const inside = typeof lat === "number" && typeof lng === "number" &&
    lat >= CITY_BOUNDS.minLat && lat <= CITY_BOUNDS.maxLat &&
    lng >= CITY_BOUNDS.minLng && lng <= CITY_BOUNDS.maxLng;
  if (!inside) return { insideCity: false, barangay: null, district: null };
  let best = null;
  for (const [name, bLat, bLng] of BARANGAY_POINTS) {
    const d = Math.hypot(lat - bLat, lng - bLng);
    if (!best || d < best.d) best = { name, d };
  }
  const resolved = resolveBarangay(best.name);
  return { insideCity: true, barangay: resolved.name, district: resolved.district };
}

module.exports = { DISTRICT_1, DISTRICT_2, resolveBarangay, locateBarangay };
