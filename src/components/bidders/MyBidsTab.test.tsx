// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { BidPerformance, SelfBidRow } from '../../api/endpoints';
import MyBidsTab from './MyBidsTab';

afterEach(cleanup);

const pedro: SelfBidRow = {
  ownerId: 'o1', ownerName: 'Pedro', total: 7, weekly: [3, 4], interviews: 1, lastBidAt: null,
  profiles: [
    { accountId: 'a1', name: 'Alpha', total: 5, weekly: [1, 4], interviews: 1 },
    { accountId: 'a2', name: 'Zeta', total: 2, weekly: [2, 0], interviews: 0 },
  ],
};
const maria: SelfBidRow = {
  ownerId: 'o2', ownerName: 'Maria', total: 3, weekly: [3, 0], interviews: 0, lastBidAt: null,
  profiles: [{ accountId: 'a3', name: 'Gamma', total: 3, weekly: [3, 0], interviews: 0 }],
};

const weekData = (selfRows: SelfBidRow[]) => ({
  label: 'Pay week ending Sun Nov 29',
  weeks: [{ start: '2026-11-23', end: '2026-11-29', partial: false }],
  payWeek: {
    start: 'a', end: 'b', label: 'x', timezone: 'UTC',
    days: [{ day: '2026-11-23', isToday: false, isFuture: false }, { day: '2026-11-24', isToday: false, isFuture: false }],
  },
  selfRows,
}) as unknown as BidPerformance;

const monthData = () => ({
  label: 'November 2026',
  weeks: [{ start: '2026-11-01', end: '2026-11-08', partial: false }, { start: '2026-11-09', end: '2026-11-15', partial: false }],
  payWeek: null,
  selfRows: [{ ...pedro, weekly: [6, 1], total: 7, profiles: [
    { accountId: 'a1', name: 'Alpha', total: 5, weekly: [1, 4], interviews: 1 },
    { accountId: 'a2', name: 'Zeta', total: 2, weekly: [2, 0], interviews: 0 },
  ] }],
}) as unknown as BidPerformance;

const cells = (row: HTMLElement) => within(row).getAllByRole('cell').map((c) => c.textContent);

describe('MyBidsTab', () => {
  it('opens with the source line', () => {
    render(<MyBidsTab data={weekData([pedro])} allOwners={false} onOpen={vi.fn()} />);
    expect(screen.getByText('Your own bids from Bid Track · Pay week ending Sun Nov 29')).toBeTruthy();
  });

  it('one row per profile, then a Total row', () => {
    render(<MyBidsTab data={weekData([pedro])} allOwners={false} onOpen={vi.fn()} />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    const [alpha, zeta, total] = rows;
    expect(within(alpha).getByRole('rowheader').textContent).toBe('Alpha');
    expect([cells(alpha).at(-2), cells(alpha).at(-1)]).toEqual(['5', '1']);
    expect([cells(zeta).at(-2), cells(zeta).at(-1)]).toEqual(['2', '0']);
    expect(within(total).getByRole('rowheader').textContent).toBe('Total');
    expect([cells(total).at(-2), cells(total).at(-1)]).toEqual(['7', '1']);
  });

  it("a day cell opens that profile's bids for the day", () => {
    const onOpen = vi.fn();
    render(<MyBidsTab data={weekData([pedro])} allOwners={false} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Zeta, Mon Nov 23: 2 bids' }));
    expect(onOpen).toHaveBeenCalledWith({ ownerId: 'o1', ownerName: 'Pedro', accountId: 'a2', profileName: 'Zeta', day: '2026-11-23' });
  });

  it('a profile name opens its pay week when one pay week is shown', () => {
    const onOpen = vi.fn();
    render(<MyBidsTab data={weekData([pedro])} allOwners={false} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));
    expect(onOpen).toHaveBeenCalledWith({ ownerId: 'o1', ownerName: 'Pedro', accountId: 'a1', profileName: 'Alpha', week: '2026-11-23' });
  });

  it('in a month the name is plain text and a pay-week cell opens that week', () => {
    const onOpen = vi.fn();
    render(<MyBidsTab data={monthData()} allOwners={false} onOpen={onOpen} />);
    expect(screen.queryByRole('button', { name: 'Alpha' })).toBeNull();
    expect(screen.getByText('Alpha')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Alpha, Nov 9–15: 4 bids' }));
    expect(onOpen).toHaveBeenCalledWith({ ownerId: 'o1', ownerName: 'Pedro', accountId: 'a1', profileName: 'Alpha', week: '2026-11-15' });
  });

  it('All owners: one block per owner', () => {
    render(<MyBidsTab data={weekData([pedro, maria])} allOwners onOpen={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Pedro' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Maria' })).toBeTruthy();
    expect(screen.getAllByRole('rowheader', { name: 'Total' })).toHaveLength(2);
  });

  it('empty says so and links Bid Track', () => {
    render(<MyBidsTab data={weekData([])} allOwners={false} onOpen={vi.fn()} />);
    expect(screen.getByText('No own bids in this period. Jobs you apply to with Bid Track signed in as yourself show up here.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Download Bid Track' }).getAttribute('href')).toMatch(/\/ext\/download$/);
  });

  it('never says Self', () => {
    render(<MyBidsTab data={weekData([pedro])} allOwners={false} onOpen={vi.fn()} />);
    expect(screen.queryByText(/self/i)).toBeNull();
  });
});
