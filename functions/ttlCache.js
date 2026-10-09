// functions/ttlCache.js
//
// Tiny in-process cache for Cloud Functions. Each warm function instance keeps
// its own copy, so it is ONLY for read-mostly data where being up to `ttlMs`
// out of date is acceptable (e.g. the list of barangay office phone numbers).
//
// It is deliberately NOT used for anything that must be consistent across
// instances: OTP attempts, resend cooldowns, lockouts and sessions stay in
// Firestore (accountControls.js), because two instances would each have their
// own counter here and the limit could be bypassed. For that kind of shared
// state, move to Redis/Memorystore (see README "Caching").
//
//   const cache = createTtlCache({ ttlMs: 60_000, maxEntries: 200 });
//   const phones = await cache.getOrLoad(key, () => loadFromFirestore());
//
// Concurrent callers for the same key share ONE load (no thundering herd), and
// a failed load is never cached.

function createTtlCache({ ttlMs = 60_000, maxEntries = 500, now = Date.now } = {}) {
  const store = new Map(); // key -> { value, expiresAt }
  const inflight = new Map(); // key -> Promise

  function get(key) {
    const hit = store.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= now()) {
      store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  function set(key, value, ttl = ttlMs) {
    if (store.size >= maxEntries && !store.has(key)) {
      // Drop the oldest entry (Map iterates in insertion order).
      store.delete(store.keys().next().value);
    }
    store.delete(key); // re-insert so it counts as the newest
    store.set(key, { value, expiresAt: now() + ttl });
  }

  async function getOrLoad(key, loader, ttl = ttlMs) {
    const cached = get(key);
    if (cached !== undefined) return cached;
    if (inflight.has(key)) return inflight.get(key);

    const p = (async () => {
      try {
        const value = await loader();
        set(key, value, ttl);
        return value;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, p);
    return p;
  }

  return {
    get, set, getOrLoad,
    invalidate: (key) => store.delete(key),
    clear: () => store.clear(),
    get size() { return store.size; },
  };
}

module.exports = { createTtlCache };
