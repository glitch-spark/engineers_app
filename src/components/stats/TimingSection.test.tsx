// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { SWRConfig } from 'swr';
import type { RateCell, TimingReport } from '../../api/endpoints';
import TimingSection from './TimingSection';

const getTiming = vi.fn();
vi.mock('../../api/endpoints', async (orig) => ({ ...(await orig<object>()), getTiming: (...a: unknown[]) => getTiming(...a) }));
const params = { period: 'month' as const, date: '2026-11-01', region: 'all' as const };
const show = (user = '') => render(<SWRConfig value={{ provider: () => new Map() }}><TimingSection params={params} user={user} /></SWRConfig>);

const cell = (o: Partial<RateCell> = {}): RateCell => ({ bids: 100, matured: 80, interviews: 8, per100: 10, tooFew: false, ...o });
const grp = (label: string, you: Partial<RateCell> = {}, team: Partial<RateCell> = {}) => ({ key: label, label, you: cell(you), team: cell(team) });
const report = (o: Partial<TimingReport> = {}): TimingReport => ({
  label: 'L', subject: { userId: 'me', name: 'Me' }, timezone: 'America/New_York', window: { median: null, p90: 14, matured_days: 14, n: 14, thin: false },
  weekday: [grp('Mon'), grp('Tue', { tooFew: true, per100: 3, bids: 10 })], hours: [grp('00–03'), grp('21–24')],
  ...o,
});

beforeEach(() => { getTiming.mockReset(); });
afterEach(cleanup);

describe('TimingSection', () => {
  it('renders both timing tables with too few, one request for both cards', async () => {
    getTiming.mockResolvedValue(report());
    show('u7');
    expect(await screen.findByText('When to bid')).toBeTruthy();
    expect(screen.getByText('Interviews per 100 matured bids by when the bid went out (New York time).')).toBeTruthy();
    expect(screen.getByText('Tue')).toBeTruthy();
    expect(screen.getByText('21–24')).toBeTruthy();
    expect(screen.getAllByText('too few').length).toBeGreaterThan(0);
    expect(screen.queryByText('Bidder quality')).toBeNull(); // removed (user, 2026-11-19)
    expect(getTiming).toHaveBeenCalledTimes(1);
    expect(getTiming).toHaveBeenCalledWith({ ...params, user: 'u7' });
  });

  it('shows an error', async () => {
    getTiming.mockRejectedValue(new Error('x'));
    show();
    expect(await screen.findByText(/Couldn’t load the timing report/)).toBeTruthy();
  });
});

describe('TimingSection team scope', () => {
  it('labels the columns Team bids / Team, one rate column (you == team)', async () => {
    getTiming.mockResolvedValue(report());
    render(<SWRConfig value={{ provider: () => new Map() }}><TimingSection params={{ ...params, scope: 'team' }} user="" /></SWRConfig>);
    const t = (await screen.findByText('Day of week')).parentElement!.querySelector('table')!;
    expect(within(t).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Group', 'Team bids', 'Team']);
    expect(within(t).getAllByRole('row')[1].querySelectorAll('td')).toHaveLength(3);
  });

  it('me scope keeps Your bids / You / Team', async () => {
    getTiming.mockResolvedValue(report());
    show();
    const t = (await screen.findByText('Day of week')).parentElement!.querySelector('table')!;
    expect(within(t).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Group', 'Your bids', 'You', 'Team']);
  });
});

describe('TimingSection immature period', () => {
  const imm = (o: Partial<TimingReport> = {}) => report({
    window: { median: null, p90: 14, matured_days: 27, n: 0, thin: true },
    weekday: [grp('Mon', { matured: 0, per100: null, tooFew: true }, { matured: 0, per100: null, tooFew: true })], hours: [grp('00–03', { matured: 0, per100: null, tooFew: true }, { matured: 0, per100: null, tooFew: true })], ...o });
  const showWith = (fn?: () => void) => render(<SWRConfig value={{ provider: () => new Map() }}><TimingSection params={params} user="" onShowLastMonth={fn} /></SWRConfig>);

  it('note + button', async () => {
    getTiming.mockResolvedValue(imm());
    const fn = vi.fn();
    showWith(fn);
    expect(await screen.findByText(/None of these bids have had 27 days to get an interview yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show last month' }));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('no note when something matured', async () => {
    getTiming.mockResolvedValue(report());
    showWith(vi.fn());
    await screen.findByText('When to bid');
    expect(screen.queryByText(/None of these bids/)).toBeNull();
  });
});
