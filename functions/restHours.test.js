// Run: node restHours.test.js  (checks the awake-time maths used by the inactivity monitor)
const { normalizeRest, isRestNow, awakeGapMs } = require('./restHours.js');
const ph = (d, h, m = 0) => Date.UTC(2026, 9, d, h - 8, m); // Oct d, 2026, Manila time
const cfg = normalizeRest(null);
const min = (ms) => Math.round(ms / 60000);
let fails = 0;
const eq = (name, got, want) => { const ok = got === want; if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, '->', got, ok ? '' : '(want ' + want + ')'); };
eq('9:30pm -> 9:55pm (before rest)', min(awakeGapMs(ph(13,21,30), ph(13,21,55), cfg)), 25);
eq('9:30pm -> 2:00am (clock paused)', min(awakeGapMs(ph(13,21,30), ph(14,2,0), cfg)), 30);
eq('9:30pm -> 7:20am (30 + 20 awake)', min(awakeGapMs(ph(13,21,30), ph(14,7,20), cfg)), 50);
eq('3:00am -> 7:50am (rest then 50 awake)', min(awakeGapMs(ph(14,3,0), ph(14,7,50), cfg)), 50);
eq('10am -> 11:10am (plain 70)', min(awakeGapMs(ph(14,10,0), ph(14,11,10), cfg)), 70);
eq('6:30am -> 7:10am (inside grace + 10)', min(awakeGapMs(ph(14,6,30), ph(14,7,10), cfg)), 10);
eq('9pm day1 -> 8am day3 = 60 + 900 + 60 awake', min(awakeGapMs(ph(13,21,0), ph(15,8,0), cfg)), 1020);
eq('rest at 23:00', isRestNow(ph(13,23,0), cfg), true);
eq('rest at 06:30 (grace)', isRestNow(ph(14,6,30), cfg), true);
eq('not rest at 07:00', isRestNow(ph(14,7,0), cfg), false);
eq('not rest at noon', isRestNow(ph(14,12,0), cfg), false);
eq('not rest at 21:59', isRestNow(ph(13,21,59), cfg), false);
eq('rest starts 22:00', isRestNow(ph(13,22,0), cfg), true);
const off = normalizeRest({ restEnabled: false });
eq('disabled = plain gap', min(awakeGapMs(ph(13,21,30), ph(14,7,20), off)), 590);
const custom = normalizeRest({ restStart: '21:00', restEnd: '05:00', restGraceMinutes: 0 });
eq('custom 21-05, 8pm -> 5:30am = 60+30', min(awakeGapMs(ph(13,20,0), ph(14,5,30), custom)), 90);
const bad = normalizeRest({ restStart: 'abc', restEnd: '99:99' });
eq('bad values fall back to defaults', isRestNow(ph(13,23,0), bad), true);
console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
