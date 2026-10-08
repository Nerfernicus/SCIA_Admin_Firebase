// Reference codes: staff-facing lists show a short code instead of a senior's full name
// (Data Privacy Act: show only the personal data the task needs). The code is derived from the
// account id, so it is the same everywhere (dashboard and the senior's own app screen) and needs no
// extra database field. It is a display alias, not encryption: anyone with database access can
// still look the person up, which is why names are only revealed one row at a time.
//
// Keep identical to lib/referenceCode.ts in the mobile app.
const ALPHABET = '23456789CDFGHJKMNPQRSTVWXZ'; // no vowels or look-alike characters (0/O, 1/I): no accidental words

// cyrb53 string hash (fast, stable, 53 bits)
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

/** e.g. "SC-7K3F-92HM". Same input always gives the same code. */
export function referenceCode(id) {
  const key = String(id || '').trim();
  if (!key) return 'SC-----';
  let n = hash53(key);
  let out = '';
  for (let i = 0; i < 8; i++) {
    out = ALPHABET[n % ALPHABET.length] + out;
    n = Math.floor(n / ALPHABET.length);
  }
  return `SC-${out.slice(0, 4)}-${out.slice(4)}`;
}
