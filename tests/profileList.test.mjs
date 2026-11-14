// Profiles list helpers (spec 2026-11-14-profiles-list-compare-design.md). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bandCells, bandHeading, bidsBreakdown, flagNumbers, flagSuggestion, fmtListRate, interviewsBreakdown, regionTopLines, interviewsAppliedBy, passDetail, rateDetail, rowArrow, setupText, sinceDay,
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
    title: "Your 9 profiles vs the average of all users' profiles",
    dates: 'This month · Nov 1 – Nov 14',
    note: 'Averages count only profiles with bids: 7 of yours, 49 across all users (yours included).',
  });
  assert.deepEqual(bandHeading({ ...h, whose: 'These', total: 1, withBids: 1, from: '2026-11-14' }), {
    title: "These 1 profile vs the average of all users' profiles",
    dates: 'This month · Nov 14',
    note: 'Averages count only profiles with bids: 1 of these, 49 across all users (these included).',
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
    { dir: 'up', value: '0.62%', title: "Since Nov 5: 0.62% · all users' average 0.41%" });
  assert.equal(rowArrow('rate', stats({ bids: 29 }), all, '2026-11-05'), null);
  assert.deepEqual(rowArrow('pass', stats({ passRate: 0.2, decided: 5 }), all, '2026-11-05'),
    { dir: 'down', value: '20%', title: "Since Nov 5: 20% · all users' average 35%" });
  assert.equal(rowArrow('tailor', stats({ tailorScore: { avg: 77, n: 5 } }), all, '2026-11-05'), null); // 77 vs 73 (4 pts)
  assert.deepEqual(rowArrow('tailor', stats({ tailorScore: { avg: 66, n: 5 } }), all, '2026-11-05'),
    { dir: 'down', value: '66', title: "Since Nov 5: tailor score 66 · all users' average 73" });
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

test('bids line: self and each bidder by name, zeros left out', () => {
  const by = [{ bidderId: 'x', name: 'Eugine', bids: 570 }, { bidderId: 'y', name: 'jeremybabu', bids: 123 }];
  assert.equal(bidsBreakdown({ selfBids: 0, bidderBids: 693, bidderBidsBy: by }), 'Eugine: 570, jeremybabu: 123');
  assert.equal(bidsBreakdown({ selfBids: 1200, bidderBids: 3, bidderBidsBy: [{ bidderId: 'z', name: 'Bo', bids: 3 }] }),
    'Self: 1,200, Bo: 3');
  assert.equal(bidsBreakdown({ selfBids: 363, bidderBids: 0, bidderBidsBy: [] }), 'Self: 363');
  assert.equal(bidsBreakdown({ selfBids: 0, bidderBids: 0, bidderBidsBy: [] }), null);
  assert.equal(bidsBreakdown({ selfBids: 5, bidderBids: 7 }), 'Self: 5, Bidders: 7'); // older server: no names
});

test('interviews line: self-taken and each caller by name, zeros left out', () => {
  const by = [{ name: 'Kim', interviews: 4 }, { name: 'Bo', interviews: 5 }];
  assert.equal(interviewsBreakdown({ selfInterviews: 5, callerInterviews: 9, callerInterviewsBy: by }), 'Self: 5, Kim: 4, Bo: 5');
  assert.equal(interviewsBreakdown({ selfInterviews: 0, callerInterviews: 3, callerInterviewsBy: [{ name: 'Kim', interviews: 3 }] }),
    'Kim: 3');
  assert.equal(interviewsBreakdown({ selfInterviews: 2, callerInterviews: 0, callerInterviewsBy: [] }), 'Self: 2');
  assert.equal(interviewsBreakdown({ selfInterviews: 0, callerInterviews: 0, callerInterviewsBy: [] }), null);
  assert.equal(interviewsBreakdown({ selfInterviews: 1, callerInterviews: 2 }), 'Self: 1, Callers: 2'); // older server
});

const al = (o = {}) => ({ accountId: 'v', name: 'Vyas', bids: 379, tailored: 120, tailorScore: { avg: 64, n: 118 }, ...o });
const RULE5 = "Bids aren't turning into interviews: update the resume and check the target roles.";

test('flag suggestion: the first rule that matches', () => {
  assert.equal(flagSuggestion(al({ bids: 12 }), 71, ['x']), 'Too few bids to get interviews: add bids or a bidder.');
  assert.equal(flagSuggestion(al(), 71, ['"QA" unit has no tailor draft']), 'Fix the setup: "QA" unit has no tailor draft.');
  assert.equal(flagSuggestion(al({ tailored: 0, tailorScore: { avg: null, n: 0 } }), 71, []),
    'Set up tailoring so resumes match each job.');
  assert.equal(flagSuggestion(al({ tailorScore: { avg: 66, n: 9 } }), 71.2, []),
    "Resume score 66 is below all users' average 71: update the tailoring prompt or template.");
  assert.equal(flagSuggestion(al({ tailorScore: { avg: 67, n: 9 } }), 71.2, []), RULE5);   // 4.2 points: not rule 4
  assert.equal(flagSuggestion(al({ tailorScore: { avg: 50, n: 9 } }), null, []), RULE5);   // no average yet
  assert.equal(flagSuggestion(al({ bids: 30 }), 71, []), "Resume score 64 is below all users' average 71: update the tailoring prompt or template.");
});

test('flag numbers line', () => {
  assert.equal(flagNumbers(al(), 71.2), "379 bids · resume score 64 (all users' avg 71)");
  assert.equal(flagNumbers(al({ tailored: 0, tailorScore: { avg: null, n: 0 } }), 71), '379 bids · no tailored resumes');
  assert.equal(flagNumbers(al({ bids: 1 }), null), '1 bid · resume score 64');
  assert.equal(flagNumbers(al({ tailored: 3, tailorScore: { avg: null, n: 0 } }), 71), '379 bids');
});

test('region lines: mine vs the best across all users', () => {
  const mine = {
    US: { mostInterviews: { accountId: 'e', name: 'Erric', interviews: 3 },
          bestRate: { accountId: 'd', name: 'Daniel Kifle', interviewsPerBid: 0.004, bids: 363 } },
    Latam: { mostInterviews: null, bestRate: null },
  };
  const lines = regionTopLines(mine, { US: { mostInterviews: 9, bestRate: 0.012 }, Latam: { mostInterviews: 2, bestRate: null } });
  assert.deepEqual(lines.map((l) => [l.label, l.most?.text ?? null, l.mostAll, l.best?.text ?? null, l.bestAll]), [
    ['US', '3', 'best across all users: 9', '0.40%', 'best across all users: 1.2%'],
    ['LATAM', null, 'best across all users: 2', null, ''],
  ]);
  assert.equal(lines[0].most.accountId, 'e');
  const same = regionTopLines({ US: mine.US }, { US: { mostInterviews: 3, bestRate: 0.004 } })[0];
  assert.deepEqual([same.mostAll, same.bestAll], ['best across all users', 'best across all users']);
  assert.equal(regionTopLines({ EU: mine.Latam }, undefined)[0].mostAll, '');            // no benchmark numbers
  assert.deepEqual(regionTopLines({ Latam: mine.Latam, EU: mine.Latam, US: mine.US }, undefined).map((l) => l.label),
    ['US', 'EU', 'LATAM']);
});
