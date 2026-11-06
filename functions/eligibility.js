// Eligibility check for approving a senior's account.
// SHARED RULES: the dashboard (src/lib/eligibility.js) uses the same logic to show the checklist
// before the decision, and this file is the authority that re-checks on the server. Keep the two
// identical (the dashboard copy is this file with ES-module exports).
//
// Each item is { key, ok, hard, detail }:
//   hard = true  -> a failure blocks approval (age clearly under 60, not a Valenzuela resident,
//                   OSCA ID already used by another account).
//   hard = false -> a failure is a warning; approval is still possible but needs a written reason.
const MIN_AGE = 60;

// The birthday is stored as text in several formats (2026-10-03, 3/12/1960, 03-12-60, "March 12, 1960").
// For day/month order we cannot always tell, so every reading is returned.
function parseBirthday(raw) {
  const s = String(raw || "").trim();
  if (!s) return [];
  const mk = (y, m, d) => {
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? dt : null;
  };
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) { const d = mk(+m[1], +m[2], +m[3]); return d ? [d] : []; }
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += y <= 26 ? 2000 : 1900; // "60" means 1960 (a senior), "05" means 2005
    const out = [mk(y, +m[1], +m[2]), mk(y, +m[2], +m[1])].filter(Boolean);
    return out.filter((d, i) => out.findIndex((x) => x.getTime() === d.getTime()) === i);
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? [] : [new Date(t)];
}

function ageOn(birth, now) {
  let age = now.getFullYear() - birth.getFullYear();
  const before = now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (before) age -= 1;
  return age;
}

/**
 * @param {object} user  the users/{uid} document
 * @param {object} ctx   { now?: Date, hasIdPhoto: boolean, duplicateCount: number, resolveBarangay: fn }
 */
function checkEligibility(user, ctx) {
  const now = (ctx && ctx.now) || new Date();
  const items = [];

  // 1. Age 60 or older
  const births = parseBirthday(user.dob);
  if (births.length === 0) {
    items.push({ key: "age", ok: false, hard: false, detail: "missing" });
  } else {
    const ages = births.map((b) => ageOn(b, now));
    const oldest = Math.max(...ages);
    const youngest = Math.min(...ages);
    if (oldest < MIN_AGE) items.push({ key: "age", ok: false, hard: true, detail: `under:${oldest}` });
    else if (youngest < MIN_AGE) items.push({ key: "age", ok: false, hard: false, detail: "unclear" });
    else items.push({ key: "age", ok: true, hard: false, detail: String(youngest) });
  }

  // 2. Valenzuela resident: a known barangay or the word Valenzuela in the address
  const resolve = (ctx && ctx.resolveBarangay) || (() => null);
  const inCity = !!resolve(user.barangay) || /valenzuela/i.test(String(user.address || ""));
  items.push({ key: "address", ok: inCity, hard: true, detail: inCity ? "" : "outside" });

  // 3. A photo of the ID is on file
  items.push({ key: "idPhoto", ok: !!(ctx && ctx.hasIdPhoto), hard: false, detail: "" });

  // 4. OSCA ID number present, real (not TEMP) and well formed
  const id = String(user.idNumber || "").trim();
  if (!id) items.push({ key: "idFormat", ok: false, hard: false, detail: "missing" });
  else if (/^TEMP/i.test(id)) items.push({ key: "idFormat", ok: false, hard: false, detail: "temporary" });
  else if (!/^[A-Za-z0-9\-/]{4,}$/.test(id)) items.push({ key: "idFormat", ok: false, hard: false, detail: "format" });
  else items.push({ key: "idFormat", ok: true, hard: false, detail: "" });

  // 5. The OSCA ID number is not used by another account (temporary IDs are unique by design)
  const dup = !!id && !/^TEMP/i.test(id) && ((ctx && ctx.duplicateCount) || 0) > 0;
  items.push({ key: "duplicate", ok: !dup, hard: true, detail: dup ? "used" : "" });

  return {
    items,
    hardFail: items.some((i) => !i.ok && i.hard),
    softFail: items.some((i) => !i.ok && !i.hard),
  };
}

module.exports = { checkEligibility, parseBirthday, ageOn, MIN_AGE };