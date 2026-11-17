import { describe, expect, it } from 'vitest';
import type { PayBidderRow, PayWeekBlock } from '../api/endpoints';
import { payCopyText } from './payCopy';

const row = (over: Partial<PayBidderRow>): PayBidderRow => ({
  bidderId: 'b1', name: 'Ana', country: null, profileName: null, ownerId: 'o1', ownerName: 'Pedro',
  approved: 158, pending: 3, rate: 0.06, pay: 9.48, error: null, ...over,
});
const week = (over: Partial<PayWeekBlock> = {}): PayWeekBlock => ({
  weekEnd: '2026-11-29', label: 'Week ending Sun Nov 29', end: '2026-11-30T02:00:00Z', first: '2026-11-23', last: '2026-11-29',
  state: 'closed', source: 'report',
  bidders: [row({}), row({ bidderId: 'b2', name: 'Raj', approved: 100, pending: 0, pay: 6 })],
  totals: { approved: 258, pending: 3, pay: 15.48, errors: 0 },
  ...over,
});

describe('payCopyText', () => {
  it("is the design's summary", () => {
    expect(payCopyText(week(), { groupByOwner: false })).toBe([
      'Pay week ending Sun Nov 29',
      'Ana — 158 approved × $0.06 = $9.48',
      '⚠ Ana: 3 pending — not paid until reviewed',
      'Raj — 100 approved × $0.06 = $6.00',
      'Total $15.48',
    ].join('\n'));
  });
  it('marks the open week so far', () => {
    expect(payCopyText(week({ state: 'open' }), { groupByOwner: false }).split('\n')[0]).toBe(
      'Pay week ending Sun Nov 29 (so far)');
  });
  it('groups by owner with an owner line before each owner, Unknown owner when unnamed', () => {
    const w = week({ bidders: [row({}), row({ bidderId: 'b2', name: 'Raj', ownerId: 'o2', ownerName: null, pending: 0, pay: 6 })] });
    const lines = payCopyText(w, { groupByOwner: true }).split('\n');
    expect(lines[1]).toBe('Pedro:');
    expect(lines[2]).toBe('Ana — 158 approved × $0.06 = $9.48');
    expect(lines).toContain('Unknown owner:');
    expect(lines.indexOf('Unknown owner:')).toBeGreaterThan(lines.indexOf('Pedro:'));
  });
  it("an error row says it couldn't read the count", () => {
    const w = week({ bidders: [row({ name: 'Lee', approved: null, pending: null, pay: null, error: 'boom' })] });
    const lines = payCopyText(w, { groupByOwner: false }).split('\n');
    expect(lines[1]).toBe("Lee — couldn't read the count");
    expect(lines).toHaveLength(3);
  });
  it('a folder week (pending is null) reads bids, with no pending warning', () => {
    const w = week({ bidders: [row({ pending: null })] });
    const lines = payCopyText(w, { groupByOwner: false }).split('\n');
    expect(lines[1]).toBe('Ana — 158 bids × $0.06 = $9.48');
    expect(lines).toHaveLength(3);
  });
});
