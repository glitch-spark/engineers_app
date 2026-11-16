// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { BiddersFilterBar, useBidderFilters } from './biddersFilters';

// Wed Nov 18, 2026 09:00 Chicago (15:00Z): the pay week is Sun Nov 15 .. Sat Nov 21.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-18T15:00:00Z'));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const seen = { search: '', request: null as unknown };
function Probe() {
  seen.search = useLocation().search;
  return null;
}
function Bar({ admin = false, label }: { admin?: boolean; label?: string }) {
  const f = useBidderFilters(admin);
  seen.request = f.request;
  return createElement(BiddersFilterBar, {
    f,
    isAdmin: admin,
    ownerId: f.filters.owner,
    serverLabel: label,
    ownerOptions: [{ value: '', label: 'All users' }, { value: 'u1', label: 'Pedro' }],
  });
}
const renderBar = (initial: string, props: { admin?: boolean; label?: string } = {}) =>
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
  });

  it('labels a pay week with the server label (dots while it loads)', () => {
    renderBar('');
    expect(screen.getByText('…')).toBeTruthy();
    cleanup();
    renderBar('', { label: 'Week ending Sat Nov 21' });
    expect(screen.getByText('Week ending Sat Nov 21')).toBeTruthy();
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
    expect(seen.search).toBe('?range=last_pay_week&date=2026-11-01');
    expect(seen.request).toEqual({ period: 'week', date: '2026-11-01' });
    next();
    next();
    expect(seen.search).toBe('');
    expect((screen.getByRole('button', { name: 'Next period' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('steps Last 2 pay weeks by two', () => {
    renderBar('?range=last_2_pay_weeks');
    prev();
    expect(seen.request).toEqual({ period: 'week', date: '2026-10-25', weeks: 2 });
  });

  it('steps a month, and a Custom range by its own length', () => {
    renderBar('?range=this_month');
    prev();
    expect(seen.search).toBe('?range=last_month');
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
    expect(seen.request).toEqual({ period: 'week', date: '2026-11-08' });
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
