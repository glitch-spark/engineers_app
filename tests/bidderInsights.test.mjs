// Bidders page insights helpers (spec 2026-11-14-bidders-insights-design.md). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  archiveText, arrowGood, bidderCells, bidderTopLines, canManageBidders, flagText, isReviewedDataKey, rowPer100Verdict,
} from '../src/lib/bidderInsights.ts';

const stats = (o = {}) => ({
  bidders: 6, bids: 2202, weekdays: 22, hitDays: 14, hitRate: 0.64, avgPerWeekday: 42.3, approved: 120, rejected: 10,
  reviewed: 130, approvalRate: 0.92, interviews: 19, per100: 0.85, pay: 820, costPerInterview: 41, ...o,
});
const platform = stats({ bidders: 40, hitRate: 0.45, approvalRate: 0.8, per100: 0.6, costPerInterview: 60, avgPerWeekday: 38 });

test('bidder cells: colour, gap and notes, yours vs the platform', () => {
  const c = bidderCells(stats(), platform);
  assert.deepEqual(c.map((x) => x.label),
    ['Bids per weekday', 'Days at 50+', 'Approval rate', 'Interviews per 100 bids', 'Cost per interview']);
  assert.deepEqual(c.map((x) => [x.key, x.mine, x.tone, x.gap]), [
    ['avg', '42.3', null, null],
    ['hit', '64%', 'good', '+19 pts'],
    ['approval', '92%', 'good', '+12 pts'],
    ['per100', '0.85', 'good', '+42%'],
    ['cost', '$41', 'good', '−32%'],          // cheaper is better
  ]);
  assert.deepEqual(c.map((x) => x.note), [
    null, '14 of 22 weekdays at 50+', '120 of 130 reviewed', '19 interviews from 2,202 bids', '$820 paid']);
  assert.deepEqual(c.map((x) => x.all), ['38', '45%', '80%', '0.60', '$60']);
});

test('bidder cells: worse is red, too few is grey', () => {
  const worse = bidderCells(stats({ hitRate: 0.2, approvalRate: 0.6, per100: 0.3, costPerInterview: 90 }), platform);
  assert.deepEqual(worse.slice(1).map((x) => x.tone), ['bad', 'bad', 'bad', 'bad']);
  const thin = bidderCells(stats({ weekdays: 9, reviewed: 29, bids: 99, per100: null, interviews: 2 }), platform);
  assert.deepEqual(thin.slice(1).map((x) => x.tone), ['thin', 'thin', 'thin', 'thin']);
  const none = bidderCells(stats({ approvalRate: null, reviewed: 0, approved: 0, rejected: 0, costPerInterview: null, interviews: 0 }), platform);
  assert.deepEqual([none[2].mine, none[2].note, none[4].mine, none[4].note], ['—', 'nothing reviewed yet', '—', 'no interviews yet']);
});

test('top bidders: mine vs the best on the platform', () => {
  const lines = bidderTopLines({
    bids: { mine: { id: 'a', name: 'Ana', value: 2000 }, platform: { name: 'Zoe', ownerName: 'Maria', value: 2400 } },
    per100: { mine: { id: 'a', name: 'Ana', value: 0.85 }, platform: { name: 'Bo', ownerName: 'Maria', value: 1.2 } },
    costPerInterview: { mine: { id: 'c', name: 'Cy', value: 41 }, platform: { name: 'Dee', ownerName: 'Ian', value: 45 } },
  });
  const view = (t) => t && [t.chip?.kind ?? null, t.chip?.text ?? null, t.leader];
  assert.deepEqual(lines.map((l) => [l.label, l.mine?.text ?? null, view(l.top)]), [
    ['Most bids', '2,000', ['near', '400 behind', 'Zoe (Maria) 2,400']],
    ['Best conversion', '0.85 / 100', ['far', '−0.35 per 100', 'Bo (Maria) 1.20 / 100']],
    ['Lowest cost per interview', '$41', ['lead', 'Best on the platform', null]],
  ]);
  assert.equal(lines[2].mine.id, 'c');
  const empty = bidderTopLines({ bids: { mine: null, platform: null }, per100: { mine: null, platform: null },
    costPerInterview: { mine: null, platform: { name: 'Dee', ownerName: '', value: 45 } } });
  assert.deepEqual(empty.map((l) => [l.mine, view(l.top)]), [[null, null], [null, null], [null, [null, null, 'Dee $45']]]);
  // near on cost = at most a third more than the leader
  const cost = bidderTopLines({ bids: { mine: null, platform: null }, per100: { mine: null, platform: null },
    costPerInterview: { mine: { id: 'c', name: 'Cy', value: 56 }, platform: { name: 'Dee', ownerName: 'Ian', value: 45 } } })[2];
  assert.deepEqual(view(cost.top), ['near', '+$11', 'Dee (Ian) $45']);
});

const label = (code) => ({ duplicate: 'Duplicate', incomplete: 'Incomplete' })[code] ?? code;

test('flag sentences', () => {
  const f = (kind, detail, name = 'Ana') => flagText({ bidderId: 'a', name, kind, detail }, label);
  assert.equal(f('inactive', { lastBidDay: '2026-11-12' }), 'No bids since Nov 12: check in with Ana.');
  assert.equal(f('inactive', { lastBidDay: null }), 'No bids yet: check in with Ana.');
  assert.equal(f('rejects', { rejected: 4, reviewed: 20, topReason: 'duplicate' }), '4 of 20 rejected, mostly "Duplicate": coach on it.');
  assert.equal(f('rejects', { rejected: 4, reviewed: 20, topReason: null }), '4 of 20 rejected: coach on it.');
  assert.equal(f('no_interviews', { bids: 120, profileId: 'p', profileName: 'Erric' }),
    '120 bids, no interviews: check the profile Erric and its target roles.');
  assert.equal(f('review_backlog', { pending: 5, oldestDay: '2026-10-01' }), '5 bids waiting for review since Oct 1.');
  assert.equal(f('review_backlog', { pending: 1, oldestDay: '2026-10-01' }), '1 bid waiting for review since Oct 1.');
});

test('archive sentences', () => {
  assert.equal(archiveText({ bidderId: 'a', name: 'Ana', reason: 'idle', since: '2026-10-30' }), 'No bids in 2 weeks (last Oct 30)');
  assert.equal(archiveText({ bidderId: 'a', name: 'Ana', reason: 'idle', since: null }), 'No bids in 2 weeks');
  assert.equal(archiveText({ bidderId: 'a', name: 'Ana', reason: 'invite_expired', since: '2026-11-03' }), 'Invite expired Nov 3, never used');
});

test('the arrow colour follows the verdict, not the direction (a higher cost is bad)', () => {
  const [, , , per100, cost] = bidderCells(stats({ costPerInterview: 90, per100: 1.0 }), platform);
  assert.deepEqual([cost.dir, cost.tone, arrowGood(cost)], ['up', 'bad', false]);
  assert.deepEqual([per100.dir, per100.tone, arrowGood(per100)], ['up', 'good', true]);
  const cheap = bidderCells(stats({ costPerInterview: 30 }), platform)[4];
  assert.deepEqual([cheap.dir, cheap.tone, arrowGood(cheap)], ['down', 'good', true]);
});

test('archive is offered only for bidders the viewer manages', () => {
  assert.equal(canManageBidders({ isAdmin: false, ownerId: '', userId: 'u1' }), true);
  assert.equal(canManageBidders({ isAdmin: true, ownerId: 'u1', userId: 'u1' }), true);
  assert.equal(canManageBidders({ isAdmin: true, ownerId: 'u2', userId: 'u1' }), false);
});

test('reviewing refreshes the banners too', () => {
  assert.equal(isReviewedDataKey(['bid-alerts', '']), true);
  assert.equal(isReviewedDataKey(['bids-day', 'b', '2026-11-12']), true);
  assert.equal(isReviewedDataKey(['bids-week', 'b']), true);
  assert.equal(isReviewedDataKey(['bid-performance', 'week']), true);   // the single page's table and strip
  assert.equal(isReviewedDataKey(['bid-insights', 'month']), true);    // the card's approval and cost
  assert.equal(isReviewedDataKey('bids-day'), false);
});

test('row per-100 verdict against the platform', () => {
  assert.equal(rowPer100Verdict({ total: 120, per100: 1.0 }, 0.6), 'up');
  assert.equal(rowPer100Verdict({ total: 120, per100: 0.4 }, 0.6), 'down');
  assert.equal(rowPer100Verdict({ total: 120, per100: 0.6 }, 0.6), null);
  assert.equal(rowPer100Verdict({ total: 99, per100: null }, 0.6), null);
  assert.equal(rowPer100Verdict({ total: 120, per100: 1.0 }, null), null);
});
