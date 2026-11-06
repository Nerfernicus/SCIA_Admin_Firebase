// Reference code shown instead of a senior's name in staff lists and audit records.
// Identical algorithm to src/lib/referenceCode.js (dashboard) and lib/referenceCode.ts (mobile app).
const ALPHABET = "23456789CDFGHJKMNPQRSTVWXZ";

function hash53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

function referenceCode(id) {
  const key = String(id || "").trim();
  if (!key) return "SC-----";
  let n = hash53(key);
  let out = "";
  for (let i = 0; i < 8; i++) {
    out = ALPHABET[n % ALPHABET.length] + out;
    n = Math.floor(n / ALPHABET.length);
  }
  return `SC-${out.slice(0, 4)}-${out.slice(4)}`;
}

module.exports = { referenceCode };
