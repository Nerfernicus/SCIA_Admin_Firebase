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

module.exports = { DISTRICT_1, DISTRICT_2, resolveBarangay };
