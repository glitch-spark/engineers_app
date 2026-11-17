// The single Bidders page helpers (spec 2026-11-14-bidders-single-page-design.md). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardOpen, rowMoney, timeColumns, weekCell } from '../src/lib/bidderPage.ts';
import { bidderTopLines } from '../src/lib/bidderInsights.ts';

test('row money: the pay-week block in week mode, report-day sums otherwise', () => {
  const week = { approved: 10, pending: 4, rejected: 2, pay: 5, toReview: 4, source: 'records', error: null };
  assert.deepEqual(rowMoney({ total: 99, approved: 90, pending: 9, pay: 45, toReview: 9, week }),
    { approved: 10, bids: 14, pay: 5, toReview: 4, folder: false });
  assert.deepEqual(rowMoney({ total: 99, approved: 90, pending: 9, pay: 45, toReview: 9, week: null }),
    { approved: 90, bids: 99, pay: 45, toReview: 9, folder: false });
  const folder = { approved: 30, pending: null, rejected: null, pay: 15, toReview: null, source: 'folders', error: null };
  assert.deepEqual(rowMoney({ total: 0, approved: 0, pending: 0, pay: 0, toReview: 0, week: folder }),
    { approved: 30, bids: 30, pay: 15, toReview: null, folder: true });
});

test('time columns: report days in a pay week, pay weeks in a month', () => {
  const week = {
    weeks: [], payWeek: { days: [{ day: '2026-11-15', isToday: false, isFuture: false }, { day: '2026-11-18', isToday: true, isFuture: false }] },
  };
  assert.deepEqual(timeColumns(week).map((c) => [c.key, c.label, c.sub, c.isToday]), [
    ['2026-11-15', 'Sun', 'Nov 15', false], ['2026-11-18', 'Wed', 'Nov 18', true]]);
  const month = { payWeek: null, weeks: [
    { start: '2026-10-01', end: '2026-10-03', partial: true }, { start: '2026-10-25', end: '2026-10-31', partial: false },
    { start: '2026-11-29', end: '2026-12-02', partial: false }] };
  assert.deepEqual(timeColumns(month).map((c) => [c.key, c.label, c.sub]), [
    ['w0', 'Oct 1–3', 'part'], ['w1', 'Oct 25–31', ''], ['w2', 'Nov 29 – Dec 2', '']]);
  assert.deepEqual(timeColumns(month).map((c) => c.end), ['2026-10-03', '2026-10-31', '2026-12-02']);
  assert.equal(timeColumns(week)[0].end, undefined);
});

test('the card is folded unless opened before', () => {
  assert.equal(cardOpen(null), false);
  assert.equal(cardOpen('open'), true);
  assert.equal(cardOpen('closed'), false);
});

test('week cell: the day cell in week mode, the column split from weeklyPending otherwise', () => {
  const day = { day: '2026-11-16', approved: 10, pending: 0, rejected: 0 };
  assert.deepEqual(weekCell({ weekly: [10], weeklyPending: [0], dayCells: [day] }, 0, true), day);
  assert.deepEqual(weekCell({ weekly: [14], weeklyPending: [4] }, 0, false), { approved: 10, pending: 4, rejected: null });
  // An older server without weeklyPending: the split is unknown, never a made-up number.
  assert.deepEqual(weekCell({ weekly: [14] }, 0, false), { approved: null, pending: null, rejected: null });
});

test('top bidders add longest streak and most interviews; an older server without them still works', () => {
  const none = { mine: null, platform: null };
  const lines = bidderTopLines({
    bids: none, per100: none, costPerInterview: none,
    streak: { mine: { id: 'a', name: 'Ana', value: 3 }, platform: { name: 'Zoe', ownerName: 'Maria', value: 5 } },
    interviews: { mine: { id: 'a', name: 'Ana', value: 2 }, platform: { name: 'Ana', ownerName: 'Pedro', value: 2 } },
  });
  const view = (l) => [l.label, l.mine?.text ?? null, l.top?.chip?.text ?? null, l.top?.leader ?? null];
  assert.deepEqual(lines.slice(3).map(view), [
    ['Longest streak', '3 days', '2 days behind', 'Zoe (Maria) 5 days'],
    ['Most interviews', '2', 'Best on the platform', null],
  ]);
  assert.equal(bidderTopLines({ bids: none, per100: none, costPerInterview: none }).length, 3);
});
