// Profiles list helpers (spec 2026-11-14-profiles-list-compare-design.md). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bandCells, fmtListRate, interviewsAppliedBy, rowArrow, setupText, strongestWeakest, windowsMatch,
} from '../src/lib/profileList.ts';

test('interviews line leaves out "not set" when there are none', () => {
  assert.equal(interviewsAppliedBy({ selfAppliedInterviews: 1, bidderAppliedInterviews: 0, unsetAppliedInterviews: 0 }),
    '1 self · 0 bidder');
  assert.equal(interviewsAppliedBy({}), '0 self · 0 bidder');
});

test('interviews line shows "not set" when some are', () => {
  assert.equal(interviewsAppliedBy({ selfAppliedInterviews: 1200, bidderAppliedInterviews: 2, unsetAppliedInterviews: 3 }),
    '1,200 self · 2 bidder · 3 not set');
});

const stats = (o = {}) => ({ profiles: 1, days: 13, bids: 100, decided: 10, bidsPerWeek: 38, interviewsPerWeek: 1,
  tailoredResumesPerWeek: 5, interviewsPerBid: 0.0062, passRate: 0.4, tailorScore: { avg: 74, n: 120 },
  matchScore: { avg: null, n: 0 }, ...o });
const all = stats({ profiles: 50, bidsPerWeek: 45, interviewsPerBid: 0.0041, passRate: 0.35, tailorScore: { avg: 72.5, n: 900 } });

test('list rates: two decimals under 1%, else one', () => {
  assert.equal(fmtListRate(0.0062), '0.62%');
  assert.equal(fmtListRate(0.011), '1.1%');
  assert.equal(fmtListRate(0), '0.00%');
});

test('band cells', () => {
  assert.deepEqual(bandCells(stats(), all).map((c) => [c.key, c.mine, c.all, c.note, c.dir]), [
    ['bids', '38', '45', null, null],
    ['rate', '0.62%', '0.41%', null, 'up'],
    ['pass', '40%', '35%', '10 decided', null],
    ['tailor', '74', '73', '120 scored', null],
  ]);
  assert.deepEqual(bandCells(stats(), all).map((c) => c.label),
    ['Bids / week per profile', 'Interviews per bid', 'Pass rate', 'Tailor score']);
  assert.equal(bandCells(stats({ passRate: null, decided: 0 }), all)[2].mine, '—');
});

test('strongest and weakest need two profiles with 30+ bids', () => {
  const r = (id, bids, ipb) => ({ accountId: id, name: id.toUpperCase(), compare: stats({ bids, interviewsPerBid: ipb }) });
  assert.deepEqual(strongestWeakest([r('a', 40, 0.011), r('b', 50, 0.001), r('c', 10, 0.5)]), {
    strongest: { accountId: 'a', name: 'A', interviewsPerBid: 0.011 },
    weakest: { accountId: 'b', name: 'B', interviewsPerBid: 0.001 },
  });
  assert.equal(strongestWeakest([r('a', 40, 0.01), r('c', 10, 0.5)]), null);
  assert.equal(strongestWeakest([r('a', 40, 0.01), r('b', 40, 0.01)]), null);
  assert.equal(strongestWeakest([r('a', 40, 0.01), { accountId: 'z', name: 'Z', compare: null }]), null);
});

test('row arrows follow the Metrics tab thresholds and need a compare', () => {
  assert.deepEqual(rowArrow('rate', stats(), all, '2026-11-05'),
    { dir: 'up', title: 'Since Nov 5: 0.62% vs 0.41% across all profiles' });
  assert.equal(rowArrow('rate', stats({ bids: 29 }), all, '2026-11-05'), null);
  assert.deepEqual(rowArrow('pass', stats({ passRate: 0.2, decided: 5 }), all, '2026-11-05'),
    { dir: 'down', title: 'Since Nov 5: 20% vs 35% across all profiles' });
  assert.equal(rowArrow('tailor', stats({ tailorScore: { avg: 77, n: 5 } }), all, '2026-11-05'), null); // 77 vs 73 (4 pts)
  assert.deepEqual(rowArrow('tailor', stats({ tailorScore: { avg: 66, n: 5 } }), all, '2026-11-05'),
    { dir: 'down', title: 'Since Nov 5: tailor score 66 vs 73 across all profiles' });
  assert.equal(rowArrow('rate', null, all, '2026-11-05'), null);
  assert.equal(rowArrow('rate', stats(), null, '2026-11-05'), null);
});

test('windows match only on the same compared window', () => {
  const w = { comparedFrom: '2026-11-05', comparedTo: '2026-11-13' };
  assert.equal(windowsMatch(w, { comparedFrom: '2026-11-05', end: '2026-11-13' }), true);
  assert.equal(windowsMatch(w, { comparedFrom: '2026-11-01', end: '2026-11-13' }), false);
  assert.equal(windowsMatch(w, { comparedFrom: '2026-11-05', end: '2026-11-30' }), false);
  assert.equal(windowsMatch({ comparedFrom: null, comparedTo: null }, { comparedFrom: null, end: '2026-10-20' }), false);
  assert.equal(windowsMatch({}, undefined), false);
});

test('setup text and warnings from setup units', () => {
  const u = (o) => ({ id: 'b', name: 'Backend', roles: ['backend'], hasTemplate: true, hasPrompt: true, ...o });
  assert.deepEqual(
    setupText({ resumes: [{}, {}], setupUnits: [u(), u({ id: 'q', name: 'QA', roles: ['qa'], hasTemplate: false })], setupDefaultId: 'b' }),
    { text: '2 fixed · 2 units', warnings: ['"QA" unit has no tailor draft'] });
  assert.deepEqual(
    setupText({ resumes: [{}], setupUnits: [u({ hasTemplate: false, hasPrompt: false, roles: [] })], setupDefaultId: 'b' }),
    { text: '1 fixed', warnings: [] });
  assert.deepEqual(setupText({ resumes: [] }), { text: '—', warnings: [] });
  assert.deepEqual(setupText({ setupUnits: [u()], setupDefaultId: 'b' }), { text: '1 unit', warnings: [] });
  assert.deepEqual(setupText({ resumePrompts: [{ id: 'b' }, { id: 'c' }] }), { text: '2 units', warnings: [] }); // older server
});
