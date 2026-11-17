// A pay week has 7 report days, or 8 across the schedule switch (week ending Sun 2026-11-22). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDaysKey, neighbourWeekKeys } from '../src/components/bidders/weekDates.ts';
import { timeColumns } from '../src/lib/bidderPage.ts';

const keys = (from, n) => Array.from({ length: n }, (_, i) => ({ day: addDaysKey(from, i), isToday: false, isFuture: false }));
const eight = keys('2026-11-15', 8); // Sun Nov 15 .. Sun Nov 22
const seven = keys('2026-11-23', 7); // Mon Nov 23 .. Sun Nov 29
const old = keys('2026-11-08', 7); // Sun Nov 8 .. Sat Nov 14

test('time columns follow the server days: 8 columns, labelled from the days, not Sun-Sat', () => {
  const cols = timeColumns({ payWeek: { days: eight }, weeks: [] });
  assert.equal(cols.length, 8);
  assert.deepEqual(cols.map((c) => c.label), ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  assert.deepEqual(cols.map((c) => c.day), eight.map((d) => d.day));
  const after = timeColumns({ payWeek: { days: seven }, weeks: [] });
  assert.deepEqual(after.map((c) => c.label), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
});

test("week navigation steps from the week's own first and last day, not a fixed 7 days", () => {
  // One stepper for the list and the bidder page (stepPayWeekDay): back = first - 1, forward = last + 7. From the
  // 8-day week, +7 from its first day (Nov 15 -> Nov 22) would be the same week again; last + 7 is a day of the next.
  assert.deepEqual(neighbourWeekKeys(eight), { prev: '2026-11-14', next: '2026-11-29' });
  assert.deepEqual(neighbourWeekKeys(seven), { prev: '2026-11-22', next: '2026-12-06' });
  assert.deepEqual(neighbourWeekKeys(old), { prev: '2026-11-07', next: '2026-11-21' });
  assert.equal(neighbourWeekKeys([]), null);
});

test('prev of a week lands in the week that ends the day before it starts (and next in the one after it)', () => {
  const weeks = [old, eight, seven];
  for (let i = 1; i < weeks.length; i++) {
    assert.equal(neighbourWeekKeys(weeks[i]).prev, weeks[i - 1][weeks[i - 1].length - 1].day);
    assert.ok(weeks[i].some((d) => d.day === neighbourWeekKeys(weeks[i - 1]).next));
  }
});
