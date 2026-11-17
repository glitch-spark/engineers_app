// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { BidPerformance, BidPerformanceRow } from '../../api/endpoints';
import BiddersWeekTable from './BiddersWeekTable';

afterEach(cleanup);

const DAYS = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30'];

function row(over: Partial<BidPerformanceRow> = {}): BidPerformanceRow {
  return {
    id: 'b1', name: 'Ana', ownerName: 'Pat', profileId: 'a1', profileName: 'Alpha', status: 'active',
    weekly: [13], weeklyPending: [3], total: 13, approved: 10, pending: 3, rejected: 0, previousTotal: 0, change: null,
    longestStreak: 0, currentStreak: 0, hitDays: 0, weekdays: 0, hitRate: null, avgPerWeekday: null,
    interviews: 0, sharedProfile: false, sharedWith: [], profileSelfBids: false, untaggedInterviews: 0, days: [],
    per100: null, lastBidAt: null, rate: 0.06, pay: 0.6, toReview: 3,
    ...over,
  };
}

/** A pay week of eight report days (the long week around the schedule switch). */
function weekData(): BidPerformance {
  return {
    period: 'week', start: DAYS[0], end: DAYS[7], label: 'Week ending Sun Nov 29', recordsStart: null,
    weeks: [{ start: DAYS[0], end: DAYS[7], partial: false }],
    bidders: [row({
      dayCells: DAYS.map((day, i) => ({ day, approved: i === 0 ? 10 : 0, pending: i === 1 ? 3 : 0, rejected: 0 })),
      week: { approved: 10, pending: 3, rejected: 0, toReview: 3, pay: 0.6, source: 'records', error: null },
    })],
    totals: {
      total: 13, interviews: 0, hitRate: null, avgPerWeekday: null, per100: null, approved: 10, pending: 3, rejected: 0,
      toReview: 3, pay: 0.6, days: DAYS.map((day, i) => ({ day, approved: i === 0 ? 10 : 0, pending: i === 1 ? 3 : 0, rejected: 0 })),
    },
    payWeek: {
      start: DAYS[0], end: DAYS[7], label: 'Week ending Sun Nov 29', timezone: 'America/Chicago',
      days: DAYS.map((day) => ({ day, isToday: day === DAYS[1], isFuture: day > DAYS[1] })),
    },
    top: { bids: [], streak: [], interviews: [], conversion: [] },
  } as BidPerformance;
}

function monthData(): BidPerformance {
  return {
    period: 'month', start: '2026-11-01', end: '2026-11-30', label: 'November 2026', recordsStart: null,
    weeks: [
      { start: '2026-11-01', end: '2026-11-07', partial: false }, { start: '2026-11-08', end: '2026-11-14', partial: false },
      { start: '2026-11-15', end: '2026-11-22', partial: false }, { start: '2026-11-23', end: '2026-11-30', partial: true },
    ],
    bidders: [row({ weekly: [0, 0, 14, 0], weeklyPending: [0, 0, 4, 0], total: 14, approved: 10, pending: 4, toReview: 4, pay: 5 })],
    totals: { total: 14, interviews: 0, hitRate: null, avgPerWeekday: null, per100: null, approved: 10, rejected: 0, toReview: 4, pay: 5 },
    payWeek: null,
    top: { bids: [], streak: [], interviews: [], conversion: [] },
  } as BidPerformance;
}

function renderTable(data: BidPerformance, over: { showPay?: boolean; rows?: BidPerformanceRow[]; onReview?: (id: string) => void } = {}) {
  return render(
    <BiddersWeekTable
      data={data}
      rows={over.rows ?? data.bidders}
      showOwner={false}
      showPay={over.showPay ?? true}
      onOpenBidder={vi.fn()}
      onReview={over.onReview ?? vi.fn()}
      renderStatus={() => 'Active'}
      renderActions={() => null}
    />,
  );
}

describe('BiddersWeekTable', () => {
  it('hides Pay when the range is not whole pay weeks, keeps Approved and Pending', () => {
    renderTable(monthData(), { showPay: false });
    expect(screen.queryByRole('columnheader', { name: 'Pay' })).toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Approved' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Pending' })).toBeTruthy();
  });

  it("shows the pay week's pay per bidder", () => {
    renderTable(weekData(), { showPay: true });
    const headers = screen.getAllByRole('columnheader');
    const payAt = headers.findIndex((h) => h.textContent === 'Pay');
    expect(payAt).toBeGreaterThan(0);
    const ana = screen.getByRole('row', { name: /Ana/ });
    expect(within(ana).getAllByRole('cell')[payAt - 1].textContent).toBe('$0.60');
  });

  it('renders one column per report day the server sent (eight in the long week)', () => {
    renderTable(weekData());
    expect(screen.getAllByRole('button', { name: /^Ana, / })).toHaveLength(2);
    expect(screen.getAllByRole('columnheader', { name: /Nov \d+/ })).toHaveLength(8);
  });

  it("the Pending badge opens the review of the bidder's pending bids", () => {
    const onReview = vi.fn();
    renderTable(weekData(), { onReview });
    fireEvent.click(screen.getByRole('button', { name: 'Review 3 pending bids of Ana' }));
    expect(onReview).toHaveBeenCalledWith('b1');
  });

  it('keeps the Total row on the whole period when search narrows the rows', () => {
    renderTable(weekData(), { rows: [] });
    const total = screen.getByRole('row', { name: /Total/ });
    const headers = screen.getAllByRole('columnheader');
    const approvedAt = headers.findIndex((h) => h.textContent === 'Approved');
    expect(within(total).getAllByRole('cell')[approvedAt - 1].textContent).toBe('10');
  });

  it('has no hover-only tips', () => {
    renderTable(weekData());
    expect(document.querySelector('.cursor-help')).toBeNull();
  });
});
