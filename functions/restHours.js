// Rest hours ("sleep time") for Safety Monitoring.
//
// A senior who is asleep is not "inactive". So the inactivity clock does not run during
// rest hours: only AWAKE time counts towards the 50-minute "Are you safe?" push and the
// 60-minute alert. This also means nobody is woken at night by the push.
//
// Default rest period (Philippine time): 10:00 PM to 6:00 AM, plus a 60-minute morning
// grace so someone who sleeps in a little is not flagged. That is 10 PM to 7 AM in effect.
// Example: last active 9:30 PM -> 30 awake minutes by 10 PM -> clock pauses -> resumes at
// 7:00 AM -> push at 7:20 AM, alert at 7:30 AM if still no activity.
//
// Staff can change it without a deploy by editing the Firestore document
// system/safety_settings: { restEnabled: true, restStart: "22:00", restEnd: "06:00",
// restGraceMinutes: 60 }. Set restEnabled to false for the plain 60-minute rule.
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const PH_OFFSET = 8 * 60 * MIN; // Asia/Manila is UTC+8 all year (no daylight saving)

const DEFAULTS = Object.freeze({ restEnabled: true, restStart: "22:00", restEnd: "06:00", restGraceMinutes: 60 });

function parseHHMM(value, fallback) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || ""));
  const ok = m && Number(m[1]) < 24 && Number(m[2]) < 60;
  const [h, mi] = (ok ? [Number(m[1]), Number(m[2])] : fallback.split(":").map(Number));
  return h * 60 + mi;
}

/** Turn the (optional) settings document into a ready-to-use window. */
function normalizeRest(raw) {
  const r = { ...DEFAULTS, ...(raw || {}) };
  const startMin = parseHHMM(r.restStart, DEFAULTS.restStart);
  const endMin = parseHHMM(r.restEnd, DEFAULTS.restEnd);
  const grace = Math.min(240, Math.max(0, Number(r.restGraceMinutes) || 0));
  // Length of the rest period, wrapping past midnight when end <= start.
  let lenMin = (endMin - startMin + 1440) % 1440;
  if (lenMin === 0) lenMin = 0; // start == end means "no rest period"
  lenMin = Math.min(lenMin + grace, 1440 - 60); // never pause the clock all day
  return { enabled: r.restEnabled !== false && lenMin > 0, startMin, lenMs: lenMin * MIN };
}

// Rest intervals (real ms) that could overlap [fromMs, toMs]: one starting on each PH day.
function* restIntervals(cfg, fromMs, toMs) {
  const firstDay = Math.floor((fromMs + PH_OFFSET) / DAY) - 1;
  const lastDay = Math.floor((toMs + PH_OFFSET) / DAY);
  for (let d = firstDay; d <= lastDay; d += 1) {
    const start = d * DAY + cfg.startMin * MIN - PH_OFFSET;
    yield [start, start + cfg.lenMs];
  }
}

/** Is `ms` inside rest hours (including the morning grace)? */
function isRestNow(ms, cfg) {
  if (!cfg.enabled) return false;
  for (const [s, e] of restIntervals(cfg, ms, ms)) if (ms >= s && ms < e) return true;
  return false;
}

/** Milliseconds of AWAKE time between lastMs and nowMs (rest hours are not counted). */
function awakeGapMs(lastMs, nowMs, cfg) {
  const total = nowMs - lastMs;
  if (!cfg.enabled || total <= 0) return Math.max(0, total);
  let rest = 0;
  for (const [s, e] of restIntervals(cfg, lastMs, nowMs)) {
    rest += Math.max(0, Math.min(e, nowMs) - Math.max(s, lastMs));
  }
  return Math.max(0, total - rest);
}

module.exports = { normalizeRest, isRestNow, awakeGapMs, DEFAULT_REST: normalizeRest(null), MAX_REST_MS: 23 * 60 * MIN };
