// Profile → Metrics "Needs attention" rules (spec 2026-11-13-profile-metrics-ux-design.md). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attentionLines } from '../src/lib/profileAttention.ts';

const stats = (over = {}) => ({
  profiles: 1, bids: 100, decided: 10, bidsPerWeek: 30, interviewsPerWeek: 1, tailoredResumesPerWeek: 10,
  interviewsPerBid: 0.03, passRate: 0.5, tailorScore: { avg: 75, n: 20 }, matchScore: { avg: 60, n: 5 }, ...over,
});
const type = (passed, rejected) => ({
  done: passed + rejected, self: passed + rejected, caller: 0, passed, rejected,
  passRate: passed + rejected ? passed / (passed + rejected) : null,
});
const none = type(0, 0);
const rounds = (byType, passRate) => ({
  byType: { intro: none, tech: none, hiring: none, panel: none, final: none, home_assessment: none, ...byType },
  awaiting: 0, scheduled: 0, passRate,
});
const texts = (lines) => lines.map((l) => `${l.dir} ${l.text}`);

test('weakest round 15+ points under the overall rate, named with the best', () => {
  const r = rounds({ intro: type(5, 2), tech: type(1, 4) }, 0.5);              // 71% and 20%, overall 50%
  assert.deepEqual(texts(attentionLines(r, undefined, null)), ['down Tech rounds pass 20% (Intro 71%)']);
});

test('weakest round needs 3 decided and a 15-point gap', () => {
  assert.deepEqual(attentionLines(rounds({ intro: type(5, 2), tech: type(0, 2) }, 0.5), undefined, null), []);
  assert.deepEqual(attentionLines(rounds({ intro: type(3, 0), tech: type(2, 2) }, 0.64), undefined, null), []); // 14 pts
  assert.deepEqual(texts(attentionLines(rounds({ tech: type(1, 3) }, 0.4), undefined, null)),
    ['down Tech rounds pass 25%']);                                              // no other type to name
});

test('conversion against all profiles, both directions, at the thresholds', () => {
  const down = attentionLines(undefined, { this: stats({ interviewsPerBid: 0.0225 }), peers: null }, stats());
  assert.deepEqual(texts(down), ['down 2.3% interviews per bid vs 3.0% across all profiles']);
  const up = attentionLines(undefined, { this: stats({ interviewsPerBid: 0.0375 }), peers: null }, stats());
  assert.deepEqual(texts(up), ['up 3.8% interviews per bid vs 3.0% across all profiles']);
  assert.deepEqual(attentionLines(undefined, { this: stats({ interviewsPerBid: 0.023 }), peers: null }, stats()), []);
});

test('conversion is quiet under 30 bids', () => {
  const lines = attentionLines(undefined, { this: stats({ bids: 29, interviewsPerBid: 0.001 }), peers: null }, stats());
  assert.deepEqual(lines, []);
});

test('without all profiles the comparison falls back to your other profiles', () => {
  const lines = attentionLines(undefined, { this: stats({ interviewsPerBid: 0.01 }), peers: stats() }, null);
  assert.deepEqual(texts(lines), ['down 1.0% interviews per bid vs 3.0% on your other profiles']);
});

test('pass rate 15 points apart with 5 decided rounds', () => {
  const me = stats({ passRate: 0.35 });
  assert.deepEqual(texts(attentionLines(undefined, { this: me, peers: null }, stats())),
    ['down 35% of rounds passed vs 50% across all profiles']);
  assert.deepEqual(attentionLines(undefined, { this: stats({ passRate: 0.36 }), peers: null }, stats()), []);
  assert.deepEqual(attentionLines(undefined, { this: stats({ passRate: 0.1, decided: 4 }), peers: null }, stats()), []);
});

test('tailor score 5 points apart with 5 scored resumes', () => {
  const up = attentionLines(undefined, { this: stats({ tailorScore: { avg: 80, n: 5 } }), peers: null }, stats());
  assert.deepEqual(texts(up), ['up Tailor score 80, above all profiles (75)']);
  const peersOnly = attentionLines(undefined, { this: stats({ tailorScore: { avg: 70, n: 9 } }), peers: stats() }, null);
  assert.deepEqual(texts(peersOnly), ['down Tailor score 70, below your other profiles (75)']);
  assert.deepEqual(attentionLines(undefined, { this: stats({ tailorScore: { avg: 99, n: 4 } }), peers: null }, stats()), []);
});

test('bid volume compares with your other profiles only', () => {
  const me = stats({ bidsPerWeek: 15 });
  assert.deepEqual(texts(attentionLines(undefined, { this: me, peers: stats() }, stats())),
    ['down 15 bids / week vs 30 on your other profiles']);
  assert.deepEqual(attentionLines(undefined, { this: me, peers: null }, stats({ bidsPerWeek: 300 })), []);
  assert.deepEqual(attentionLines(undefined, { this: stats({ bidsPerWeek: 15.5 }), peers: stats() }, null), []);
});

test('at most three lines, downs first', () => {
  const r = rounds({ intro: type(5, 2), tech: type(1, 4) }, 0.5);
  const me = stats({ interviewsPerBid: 0.06, passRate: 0.2, tailorScore: { avg: 60, n: 9 }, bidsPerWeek: 5 });
  const lines = attentionLines(r, { this: me, peers: stats() }, stats());
  assert.equal(lines.length, 3);
  assert.deepEqual(lines.map((l) => l.dir), ['down', 'down', 'down']);
  assert.match(lines[0].text, /^Tech rounds pass/);
});

test('no comparison data: only the round rule can speak', () => {
  const r = rounds({ intro: type(5, 2), tech: type(1, 4) }, 0.5);
  assert.equal(attentionLines(r, { this: null, peers: null }, stats()).length, 1);
  assert.deepEqual(attentionLines(undefined, undefined, null), []);
});
