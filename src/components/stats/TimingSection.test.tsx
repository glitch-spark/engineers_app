// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { SWRConfig } from 'swr';
import type { RateCell, TimingReport } from '../../api/endpoints';
import TimingSection from './TimingSection';

const getTiming = vi.fn();
vi.mock('../../api/endpoints', async (orig) => ({ ...(await orig<object>()), getTiming: (...a: unknown[]) => getTiming(...a) }));
const params = { period: 'month' as const, date: '2026-11-01', region: 'all' as const };
const show = (user = '') => render(<SWRConfig value={{ provider: () => new Map() }}><TimingSection params={params} user={user} /></SWRConfig>);

const cell = (o: Partial<RateCell> = {}): RateCell => ({ bids: 100, matured: 80, interviews: 8, per100: 10, tooFew: false, ...o });
const grp = (label: string, you: Partial<RateCell> = {}) => ({ key: label, label, you: cell(you), team: cell() });
const bidder = (o = {}) => ({ bidderId: 'b1', name: 'Bo' as string | null, bids: 50, matured: 40, interviews: 4, per100: 10 as number | null, tooFew: false, rejectedShare: 5, ...o });
const report = (o: Partial<TimingReport> = {}): TimingReport => ({
  label: 'L', subject: { userId: 'me', name: 'Me' }, timezone: 'America/New_York',
  weekday: [grp('Mon'), grp('Tue', { tooFew: true, per100: 3 })], hours: [grp('00–03'), grp('21–24')],
  bidders: [bidder(), bidder({ bidderId: 'b2', name: null, tooFew: true, rejectedShare: 25 })], teamBidder: { per100: 0.4, matured: 3000, interviews: 12 }, ...o,
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
    expect(screen.getByText('Bidder quality')).toBeTruthy();
    expect(getTiming).toHaveBeenCalledTimes(1);
    expect(getTiming).toHaveBeenCalledWith({ ...params, user: 'u7' });
  });

  it('renders bidders, unnamed fallback, red rejected >= 20% and the pooled team bidder rate', async () => {
    getTiming.mockResolvedValue(report());
    show();
    expect(await screen.findByText('Your bidders\' bids in this period: how many, how they convert, and how many Bid Track rejected.')).toBeTruthy();
    const t = within(screen.getByRole('table', { name: 'Bidders' }));
    expect(t.getByText('Bo')).toBeTruthy();
    expect(t.getByText('Unnamed bidder')).toBeTruthy();
    expect(t.getByText('5%').className).not.toMatch(/text-red/);
    expect(t.getByText('25%').className).toMatch(/text-red/);
    expect(screen.getByText('Team bidders overall: 0.4 per 100 (12 interviews from 3,000 matured bids).')).toBeTruthy();
  });

  it('says not enough data when the team bidders have no matured bids', async () => {
    getTiming.mockResolvedValue(report({ teamBidder: { per100: null, matured: 0, interviews: 0 } }));
    show();
    expect(await screen.findByText('Team bidders overall: not enough data yet.')).toBeTruthy();
  });

  it('hides Bidder quality when there are no bidders', async () => {
    getTiming.mockResolvedValue(report({ bidders: [] }));
    show();
    expect(await screen.findByText('When to bid')).toBeTruthy();
    expect(screen.queryByText('Bidder quality')).toBeNull();
  });

  it('shows an error', async () => {
    getTiming.mockRejectedValue(new Error('x'));
    show();
    expect(await screen.findByText(/Couldn’t load the timing report/)).toBeTruthy();
  });
});
