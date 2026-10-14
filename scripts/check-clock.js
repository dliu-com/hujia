'use strict';
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { anniversaryClock } = require('../web/anniversary-clock');
const fixtures = [
  { at: '2026-10-18T21:55:00Z', expected: [2220, 6, 0, 29, 23, 55, 0] },
  { at: '2026-10-18T22:00:00Z', expected: [2221, 6, 1, 0, 0, 0, 0] },
  { at: '2026-10-25T02:00:00Z', expected: [2227, 6, 1, 6, 3, 0, 0] },
  { at: '2024-02-29T11:34:56Z', calendar: [3, 5, 10, 12, 34, 56] },
  { at: '2024-02-29T23:00:00Z', calendar: [3, 5, 11, 0, 0, 0] },
  { at: '2025-01-18T23:00:00Z', calendar: [4, 4, 0, 0, 0, 0] }
];
if (process.argv.includes('--zone')) {
  for (const f of fixtures) {
    const c = anniversaryClock(new Date(f.at));
    const values = [c.totalDays, c.years, c.months, c.days, c.hours, c.minutes, c.seconds];
    if (f.expected) assert.deepEqual(values, f.expected);
    else assert.deepEqual(values.slice(1), f.calendar);
  }
  process.exit(0);
}
for (const zone of ['Europe/Madrid', 'Europe/London', 'Asia/Shanghai', 'UTC']) {
  const result = spawnSync(process.execPath, [__filename, '--zone'], { env: { ...process.env, TZ: zone }, encoding: 'utf8' });
  assert.equal(result.status, 0, `${zone}: ${result.stderr}`);
}
console.log('Clock verified: Spain gift midnight, leap day, year rollover and DST; identical across four device time zones.');
