// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { BidPerformance, BidPerformanceRow } from '../../api/endpoints';
import BiddersPerformanceTable from './BiddersPerformanceTable';

afterEach(cleanup);

function row(id: string, name: string, week: { approved: number; pending: number }, total: number): BidPerformanceRow {
  return {
    id, name, ownerName: 'Pat', profileId: null, profileName: null, status: 'active',
    weekly: [total, 0], weeklyPending: [0, 0], total, approved: total, pending: 0, rejected: 0, previousTotal: 0, change: null,
    longestStreak: 0, currentStreak: 0, hitDays: 0, weekdays: 0, hitRate: null, avgPerWeekday: null,
    interviews: 0, sharedProfile: false, sharedWith: [], profileSelfBids: false, untaggedInterviews: 0, days: [],
    per100: null, lastBidAt: null, rate: 0.06,
    week: { ...week, rejected: 0, toReview: week.pending, pay: week.approved * 0.06, source: 'records', error: null },
  };
}

/** Last 2 pay weeks: no `payWeek`, but each row and the totals carry the two boards' money (pay-week windows), which
 *  differ from the report-day `total` by the Sunday overlap. */
function twoPayWeeks(): BidPerformance {
  return {
    period: 'week', start: '2026-11-08', end: '2026-11-22', label: 'Last 2 pay weeks', recordsStart: null,
    weeks: [{ start: '2026-11-08', end: '2026-11-14', partial: false }, { start: '2026-11-15', end: '2026-11-22', partial: false }],
    bidders: [row('b1', 'Ana', { approved: 10, pending: 3 }, 15), row('b2', 'Bo', { approved: 5, pending: 2 }, 9)],
    totals: { total: 24, interviews: 0, hitRate: null, avgPerWeekday: null, per100: null, approved: 15, pending: 5, rejected: 0, toReview: 5, pay: 0.9, error: null },
    payWeek: null,
    top: { bids: [], streak: [], interviews: [], conversion: [] },
  } as BidPerformance;
}

describe('BiddersPerformanceTable', () => {
  it("the Total row's Bids is the rows' sum on two pay weeks (board money, not report days)", () => {
    const data = twoPayWeeks();
    render(<BiddersPerformanceTable data={data} rows={data.bidders} platformPer100={null} showOwner={false}
      onOpenBidder={vi.fn()} renderStatus={() => null} renderActions={() => null} />);
    const bidsAt = screen.getAllByRole('columnheader').findIndex((h) => h.textContent === 'Bids');
    const bidsOf = (name: RegExp) => within(screen.getByRole('row', { name })).getAllByRole('cell')[bidsAt - 1].textContent;
    expect([bidsOf(/^Ana/), bidsOf(/^Bo/)]).toEqual(['13', '7']);
    expect(bidsOf(/^Total/)).toBe('20');
  });
});
