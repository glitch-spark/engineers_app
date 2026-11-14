// Profiles list helpers (spec 2026-11-14-profiles-list-compare-design.md). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bandCells, bandHeading, fmtListRate, interviewsAppliedBy, passDetail, rateDetail, rowArrow, setupText, sinceDay,
  strongestWeakest, windowsMatch,
} from '../src/lib/profileList.ts';

test('interviews line leaves out "not set" when there are none', () => {
  assert.equal(interviewsAppliedBy({ selfAppliedInterviews: 1, bidderAppliedInterviews: 0, unsetAppliedInterviews: 0 }),
    '1 self · 0 bidder');
});

test('interviews line is left out when there are no interviews', () => {
  assert.equal(interviewsAppliedBy({}), null);
  assert.equal(interviewsAppliedBy({ selfAppliedInterviews: 0, bidderAppliedInterviews: 0, unsetAppliedInterviews: 0 }), null);
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
    ['pass', '40%', '35%', '4 of 10 rounds', null],
    ['tailor', '74', '73', 'from 120 resumes', null],
  ]);
  assert.deepEqual(bandCells(stats(), all).map((c) => c.label),
    ['Bids per profile, per week', 'Bids that led to an interview', 'Interview rounds passed', 'Avg tailored resume score']);
  const none = bandCells(stats({ passRate: null, decided: 0, tailorScore: { avg: null, n: 0 } }), all);
  assert.deepEqual([none[2].mine, none[2].note, none[3].mine, none[3].note], ['—', 'no results yet', '—', 'no scored resumes']);
});

test('band heading counts every listed profile and says which ones the averages use', () => {
  const h = { whose: 'Your', total: 9, withBids: 7, allWithBids: 49, rangeLabel: 'This month', from: '2026-11-01', to: '2026-11-14' };
  assert.deepEqual(bandHeading(h), {
    title: "Your 9 profiles vs all owners' profiles",
    dates: 'This month · Nov 1 – Nov 14',
    note: 'Averages count only profiles with bids: 7 of yours, 49 overall.',
  });
  assert.deepEqual(bandHeading({ ...h, whose: 'These', total: 1, withBids: 1, from: '2026-11-14' }), {
    title: "These 1 profile vs all owners' profiles",
    dates: 'This month · Nov 14',
    note: 'Averages count only profiles with bids: 1 of these, 49 overall.',
  });
});

test('second lines under Interview rate and Rounds passed', () => {
  assert.equal(rateDetail(3, 182), '3 of 182 bids');
  assert.equal(rateDetail(0, 1200), '0 of 1,200 bids');
  assert.equal(passDetail({ decided: 1, passed: 0, passRate: 0 }, 3), '0 of 1 passed');
  assert.equal(passDetail({ decided: 0, passed: 0, passRate: null }, 2), 'no results yet');
  assert.equal(passDetail({ decided: 0, passed: 0, passRate: null }, 0), null);
  assert.equal(passDetail(undefined, 2), null);
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
    { dir: 'up', value: '0.62%', title: 'Since Nov 5: 0.62% vs 0.41% across all profiles' });
  assert.equal(rowArrow('rate', stats({ bids: 29 }), all, '2026-11-05'), null);
  assert.deepEqual(rowArrow('pass', stats({ passRate: 0.2, decided: 5 }), all, '2026-11-05'),
    { dir: 'down', value: '20%', title: 'Since Nov 5: 20% vs 35% across all profiles' });
  assert.equal(rowArrow('tailor', stats({ tailorScore: { avg: 77, n: 5 } }), all, '2026-11-05'), null); // 77 vs 73 (4 pts)
  assert.deepEqual(rowArrow('tailor', stats({ tailorScore: { avg: 66, n: 5 } }), all, '2026-11-05'),
    { dir: 'down', value: '66', title: 'Since Nov 5: tailor score 66 vs 73 across all profiles' });
  assert.equal(rowArrow('rate', null, all, '2026-11-05'), null);
  assert.equal(rowArrow('rate', stats(), null, '2026-11-05'), null);
});

test('an arrow carries the value it judged, which can differ from the range total', () => {
  assert.equal(rowArrow('rate', stats(), all, '2026-11-05').value, '0.62%');
  assert.equal(rowArrow('pass', stats({ passRate: 0.2, decided: 5 }), all, '2026-11-05').value, '20%');
  assert.equal(rowArrow('tailor', stats({ tailorScore: { avg: 66, n: 5 } }), all, '2026-11-05').value, '66');
});

test('the compared days need their own label only when they start after the range', () => {
  assert.equal(sinceDay('2026-11-01', '2026-11-05'), '2026-11-05');   // This month, launch on Nov 5
  assert.equal(sinceDay('2026-11-09', '2026-11-09'), null);           // This week: same days
  assert.equal(sinceDay(null, '2026-11-05'), '2026-11-05');           // All time
  assert.equal(sinceDay('2026-11-01', null), null);                   // nothing compared
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
