// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { addDays, type BidderPeriodRequest, type ReportClock, type ShownWeeks } from '../../lib/bidderFilters';
import type { BidsSection } from '../../lib/bidsUrl';
import { BiddersFilterBar, useBidderFilters } from './biddersFilters';

// Wed Nov 18, 2026 09:00 Chicago, as the server's clock says: the long pay week Sun Nov 15 .. Sun Nov 22.
const CLOCK: ReportClock = {
  today: '2026-11-18', payWeekStart: '2026-11-15', payWeekEnd: '2026-11-22', previousPayWeekStart: '2026-11-08',
  timezone: 'America/Chicago',
};
afterEach(cleanup);

/** The days the server shows for a pay-week request (Sun..Sat weeks before the long week Nov 15..22). */
function payWeekOf(day: string): ShownWeeks {
  if (day >= '2026-11-15') return { first: '2026-11-15', last: '2026-11-22' };
  const first = addDays(day, -new Date(`${day}T00:00:00Z`).getUTCDay());
  return { first, last: addDays(first, 6) };
}
function served(req: BidderPeriodRequest | null): ShownWeeks | undefined {
  if (!req || req.period !== 'week') return undefined;
  const w = payWeekOf(req.date ?? CLOCK.payWeekStart);
  return req.weeks === 2 ? { first: payWeekOf(addDays(w.first, -1)).first, last: w.last } : w;
}

const seen = { search: '', request: null as unknown };
function Probe() {
  seen.search = useLocation().search;
  return null;
}
type BarProps = { admin?: boolean; label?: string; loading?: boolean; section?: BidsSection };
function Bar({ admin = false, label, loading = false, section = 'bidders' }: BarProps) {
  const f = useBidderFilters(admin, CLOCK)!;
  seen.request = f.request;
  return createElement(BiddersFilterBar, {
    f,
    isAdmin: admin,
    section,
    ownerValue: f.filters.owner,
    serverLabel: label,
    ownerOptions: [{ value: '', label: 'Me' }, { value: 'u1', label: 'Pedro' }, { value: 'all', label: 'All owners' }],
    // The period the server showed for the request (none while it loads).
    shown: loading ? undefined : served(f.request),
  });
}
const renderBar = (initial: string, props: BarProps = {}) =>
  render(createElement(MemoryRouter, { initialEntries: [`/bidders${initial}`] }, createElement(Probe), createElement(Bar, props)));
const prev = () => fireEvent.click(screen.getByRole('button', { name: 'Previous period' }));
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next period' }));
const range = () => screen.getByLabelText('Date range') as HTMLSelectElement;

describe('the bar', () => {
  it('offers the Bidders presets, search and Show archived; no Clear by default', () => {
    renderBar('');
    expect([...range().options].map((o) => o.text)).toEqual([
      'This pay week', 'Last pay week', 'Last 2 pay weeks', 'This month', 'Last month', 'Custom',
    ]);
    expect(range().value).toBe('this_pay_week');
    expect(screen.getByPlaceholderText('Search bidders…')).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Show archived' })).toBeTruthy();
    expect(screen.queryByLabelText('Owner')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
    expect(seen.request).toEqual({ period: 'week' });
  });

  it('shows the Owner filter to an admin only', () => {
    renderBar('', { admin: true });
    fireEvent.change(screen.getByLabelText('Owner'), { target: { value: 'u1' } });
    expect(seen.search).toBe('?owner=u1');
    fireEvent.change(screen.getByLabelText('Owner'), { target: { value: 'all' } });
    expect(seen.search).toBe('?owner=all');
    // Me is the default and is never written.
    fireEvent.change(screen.getByLabelText('Owner'), { target: { value: '' } });
    expect(seen.search).toBe('');
  });

  it('has no Show switch', () => {
    renderBar('', { admin: true });
    expect(screen.queryByRole('radiogroup', { name: 'Show' })).toBeNull();
    expect(screen.queryByText('Self')).toBeNull();
  });

  it('My bids has the owner and the period, but no search or Show archived', () => {
    renderBar('', { admin: true, section: 'mine' });
    expect(screen.getByLabelText('Owner')).toBeTruthy();
    expect(screen.getByLabelText('Date range')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Search bidders…')).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Show archived' })).toBeNull();
  });

  it('labels a pay week with the server label (dots while it loads)', () => {
    renderBar('');
    expect(screen.getByText('…')).toBeTruthy();
    cleanup();
    renderBar('', { label: 'Week ending Sun Nov 22' });
    expect(screen.getByText('Week ending Sun Nov 22')).toBeTruthy();
  });

  it('shows the dates for months', () => {
    renderBar('?range=last_month');
    expect(screen.getByText('Oct 2026')).toBeTruthy();
  });

  it('Show archived is archived=1 in the URL', () => {
    renderBar('');
    fireEvent.click(screen.getByRole('switch', { name: 'Show archived' }));
    expect(seen.search).toBe('?archived=1');
    expect(screen.getByRole('button', { name: 'Clear' })).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Show archived' }));
    expect(seen.search).toBe('');
  });

  it('shows the search text from the URL', () => {
    renderBar('?q=ana');
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('ana');
  });
});

describe('stepping with the arrows', () => {
  it('goes back a pay week at a time on date, and the next arrow is off at the current one', () => {
    renderBar('');
    expect((screen.getByRole('button', { name: 'Next period' }) as HTMLButtonElement).disabled).toBe(true);
    prev();
    expect(seen.search).toBe('?range=last_pay_week');
    expect(seen.request).toEqual({ period: 'week', date: '2026-11-14' });
    prev();
    expect(seen.search).toBe('?range=pay_week&date=2026-11-07');
    expect(seen.request).toEqual({ period: 'week', date: '2026-11-07' });
    // The stepped week has its own dropdown entry while it is active.
    expect(range().value).toBe('pay_week');
    expect([...range().options].map((o) => o.text)).toContain('Pay week');
    next();
    expect(seen.search).toBe('?range=last_pay_week');
    expect([...range().options].map((o) => o.text)).not.toContain('Pay week');
    next();
    expect(seen.search).toBe('');
    expect((screen.getByRole('button', { name: 'Next period' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('steps Last 2 pay weeks by two', () => {
    renderBar('?range=last_2_pay_weeks');
    prev();
    expect(seen.search).toBe('?range=two_pay_weeks&date=2026-10-31');
    expect(seen.request).toEqual({ period: 'week', date: '2026-10-31', weeks: 2 });
    expect(range().value).toBe('two_pay_weeks');
    expect([...range().options].map((o) => o.text)).toContain('2 pay weeks');
    next();
    expect(seen.search).toBe('?range=last_2_pay_weeks');
  });

  it('previous period waits for the period to load', () => {
    renderBar('', { loading: true });
    expect((screen.getByRole('button', { name: 'Previous period' }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    renderBar('?range=this_month', { loading: true });
    expect((screen.getByRole('button', { name: 'Previous period' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('keeps the server label for a stepped pay week', () => {
    renderBar('?range=pay_week&date=2026-11-01', { label: 'Week ending Sat Nov 7' });
    expect(screen.getByText('Week ending Sat Nov 7')).toBeTruthy();
  });

  it('a stepped pay week from a shared link opens, and picking a preset drops its date', () => {
    renderBar('?range=pay_week&date=2026-11-01');
    expect(seen.request).toEqual({ period: 'week', date: '2026-11-01' });
    expect(range().value).toBe('pay_week');
    fireEvent.change(range(), { target: { value: 'last_pay_week' } });
    expect(seen.search).toBe('?range=last_pay_week');
  });

  it('steps a month, and a Custom range by its own length', () => {
    renderBar('?range=this_month');
    prev();
    expect(seen.search).toBe('?range=last_month');
    prev();
    expect(seen.search).toBe('?range=month&date=2026-09-01');
    expect(range().value).toBe('month');
    cleanup();
    renderBar('?range=custom&from=2026-10-01&to=2026-10-10');
    prev();
    expect(seen.search).toBe('?range=custom&from=2026-09-21&to=2026-09-30');
  });
});

describe('the dropdown', () => {
  it('leaves only the preset in the URL', () => {
    renderBar('?range=last_month');
    fireEvent.change(range(), { target: { value: 'this_pay_week' } });
    expect(seen.search).toBe('');
    fireEvent.change(range(), { target: { value: 'last_2_pay_weeks' } });
    expect(seen.search).toBe('?range=last_2_pay_weeks');
    expect(seen.request).toEqual({ period: 'week', date: '2026-11-14', weeks: 2 });
  });

  it('seeds Custom with the days shown, up to today, and sends period=custom', () => {
    renderBar('');
    fireEvent.change(range(), { target: { value: 'custom' } });
    expect(seen.search).toBe('?range=custom&from=2026-11-15&to=2026-11-18');
    expect(seen.request).toEqual({ period: 'custom', date: '2026-11-15', to: '2026-11-18' });
  });
});

describe('URLs', () => {
  it('keeps every other key through filter changes and Clear', () => {
    renderBar('?bidder=b1&day=2026-11-16&tab=history&mode=focus&bid=x&range=this_month&archived=1&q=ana');
    fireEvent.change(range(), { target: { value: 'last_month' } });
    prev();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(seen.search).toBe('?bidder=b1&day=2026-11-16&tab=history&mode=focus&bid=x');
  });

  it('an old week= link opens that pay week, and picking a period drops it', () => {
    renderBar('?bidder=b1&week=2026-11-10');
    expect(seen.request).toEqual({ period: 'week', date: '2026-11-14' });
    expect(range().value).toBe('last_pay_week');
    expect(screen.getByRole('button', { name: 'Clear' })).toBeTruthy();
    fireEvent.change(range(), { target: { value: 'this_pay_week' } });
    expect(seen.search).toBe('?bidder=b1');
    expect(seen.request).toEqual({ period: 'week' });
  });

  it('old period= links keep working', () => {
    renderBar('?period=month&date=2026-10-15');
    expect(seen.request).toEqual({ period: 'month', date: '2026-10-01' });
    cleanup();
    renderBar('?period=custom&date=2026-10-01&to=2026-10-20');
    expect(seen.request).toEqual({ period: 'custom', date: '2026-10-01', to: '2026-10-20' });
    expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe('2026-10-01');
  });

  it('bad values fall back or ask for nothing, and never throw', () => {
    renderBar('?range=bogus&date=nope&q=');
    expect(seen.request).toEqual({ period: 'week' });
    expect(range().value).toBe('this_pay_week');
    cleanup();
    renderBar('?range=custom&from=2026-02-31&to=2026-03-02');
    expect(seen.request).toBeNull();
    expect(screen.getByRole('alert').textContent).toBe('Pick both dates.');
    cleanup();
    renderBar('?range=custom');
    expect(seen.request).toBeNull();
    expect(screen.getByRole('alert').textContent).toBe('Pick both dates.');
  });
});
