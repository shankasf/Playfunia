/**
 * Verifies date-only membership columns are read as America/New_York calendar
 * dates regardless of the server's timezone. Run with: TZ=UTC npx tsx scripts/verify/dates.verify.ts
 */
import assert from 'node:assert/strict';
import { DateTime, Settings } from 'luxon';

const ZONE = 'America/New_York';
const endDate = '2026-11-24';

const display = DateTime.fromISO(endDate, { zone: ZONE }).toLocaleString(DateTime.DATE_FULL);
assert.equal(display, 'November 24, 2026', 'display date shifted');

const expiry = DateTime.fromISO(endDate, { zone: ZONE }).endOf('day');
const lastDayLate = DateTime.fromISO('2026-11-24T23:00:00', { zone: ZONE });
const nextDayEarly = DateTime.fromISO('2026-11-25T00:01:00', { zone: ZONE });
assert.ok(!(lastDayLate > expiry), 'check-in at 11pm ET on last day must be allowed');
assert.ok(nextDayEarly > expiry, 'check-in after last day must be rejected');

// Old behaviour, for contrast: proves the bug existed on a UTC server.
Settings.defaultZone = 'UTC';
const old = DateTime.fromISO(endDate).setZone(ZONE).toLocaleString(DateTime.DATE_FULL);
assert.equal(old, 'November 23, 2026');

console.log('dates: all assertions passed');
