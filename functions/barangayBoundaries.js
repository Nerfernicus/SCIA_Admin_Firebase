// functions/barangayBoundaries.js
//
// Point-in-polygon lookup against the real Valenzuela City barangay boundaries
// (PSA 2019 / PSGC, via faeldon/philippines-json-maps, simplified), stored in
// valenzuelaBarangayPolygons.json. This replaces the old "nearest single point
// per barangay" guess, which was wrong near any border (it put Lawang Bato
// residents in Polo). The same data ships in the mobile app
// (constants/valenzuelaBarangayPolygons.ts) so both sides agree.
//
// Names in the JSON already use the spellings the admin dashboard stores.

const POLYGONS = require("./valenzuelaBarangayPolygons.json");

// The boundary file is simplified, so a point right on a border (or on a river
// bank) can fall a few metres outside every polygon. Anything within this many
// metres of a barangay edge is still assigned to that barangay.
const EDGE_TOLERANCE_M = 350;

const M_PER_DEG_LAT = 110540;
const mPerDegLng = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

// Precompute bounding boxes once.
const BOXES = POLYGONS.map((b) => {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const ring of b.rings) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY };
});

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Distance in metres from a point to a ring's edges.
function distToRingM(x, y, ring) {
  const kx = mPerDegLng(y);
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = ring[j][0] * kx; const ay = ring[j][1] * M_PER_DEG_LAT;
    const bx = ring[i][0] * kx; const by = ring[i][1] * M_PER_DEG_LAT;
    const px = x * kx; const py = y * M_PER_DEG_LAT;
    const dx = bx - ax; const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (d < best) best = d;
  }
  return best;
}

/**
 * @returns {{ name: string, exact: boolean, distanceM: number } | null}
 *   null when the point is not in (or within EDGE_TOLERANCE_M of) any Valenzuela barangay.
 */
function barangayFromBoundaries(lat, lng) {
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  // 1) Exact: the point is inside the polygon.
  for (let i = 0; i < POLYGONS.length; i++) {
    const b = BOXES[i];
    if (lng < b.minX || lng > b.maxX || lat < b.minY || lat > b.maxY) continue;
    let count = 0;
    for (const ring of POLYGONS[i].rings) if (inRing(lng, lat, ring)) count++;
    if (count % 2 === 1) return { name: POLYGONS[i].name, exact: true, distanceM: 0 };
  }

  // 2) Near an edge (simplified boundary / river bank): closest barangay wins.
  let best = null;
  for (let i = 0; i < POLYGONS.length; i++) {
    for (const ring of POLYGONS[i].rings) {
      const d = distToRingM(lng, lat, ring);
      if (d <= EDGE_TOLERANCE_M && (!best || d < best.distanceM)) best = { name: POLYGONS[i].name, exact: false, distanceM: Math.round(d) };
    }
  }
  return best;
}

module.exports = { barangayFromBoundaries, EDGE_TOLERANCE_M };
