// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { SWRConfig } from 'swr';
import type { LeaderGroup, LeadersReport } from '../../api/endpoints';
import LeadersCard from './LeadersCard';

const getLeaders = vi.fn();
vi.mock('../../api/endpoints', async (orig) => ({ ...(await orig<object>()), getLeaders: (...a: unknown[]) => getLeaders(...a) }));
const params = { period: 'month' as const, date: '2026-11-01', region: 'all' as const };
const show = (user = '') => render(<SWRConfig value={{ provider: () => new Map() }}><LeadersCard params={params} user={user} /></SWRConfig>);

const group = (o: Partial<LeaderGroup> = {}): LeaderGroup => ({
  matured: 400, interviews: 40, regions: { EU: 2, US: 1 }, avgScore: 82.5, scored: 300,
  areas: [{ label: 'Backend', share: 60 }, { label: 'Data', share: 25 }], areaKnown: 90, medianProfileAge: 70,
  sites: [{ label: 'LinkedIn', share: 70 }], medianDays: 4, interviewCount: 45, daysTooFew: false, selfShare: 30, ...o,
});
const lrow = (o = {}) => ({ accountId: 'a1', name: 'Alpha', owner: 'Ana', region: 'EU' as string | null, matured: 200, interviews: 25, per100: 12.5, ...o });
const report = (o: Partial<LeadersReport> = {}): LeadersReport => ({
  label: 'L', window: { median: null, p90: 14, matured_days: 14, n: 0, thin: false },
  best: [lrow()], weakest: [lrow({ accountId: 'a2', name: 'Zed', owner: 'Bob', region: null, per100: 1 })],
  groups: { best: group(), weakest: group({ medianProfileAge: 9, daysTooFew: true, medianDays: null, avgScore: null, scored: 0 }) },
  note: 'These are patterns, not proof.', ...o,
});

beforeEach(() => { getLeaders.mockReset(); });
afterEach(cleanup);

describe('LeadersCard', () => {
  it('renders both columns, profiles and group rows', async () => {
    getLeaders.mockResolvedValue(report());
    show('u7');
    expect(await screen.findByText('Winning vs weakest profiles')).toBeTruthy();
    expect(screen.getByText("The team's 3 best and 3 weakest profiles by interviews per 100 matured bids (150+ matured bids each).")).toBeTruthy();
    const win = within(screen.getByRole('region', { name: 'Winning' }));
    expect(win.getByText(/Alpha · Ana · EU · 200 matured · 25 interviews · 12\.5 per 100/)).toBeTruthy();
    expect(win.getByText('400 matured bids · 40 interviews')).toBeTruthy();
    expect(win.getByText('EU 2 · US 1')).toBeTruthy();
    expect(win.getByText('82.5 (300 scored bids)')).toBeTruthy();
    expect(win.getByText('Backend 60% · Data 25% · area known for 90%')).toBeTruthy();
    expect(win.getByText('10 weeks')).toBeTruthy();
    expect(win.getByText('LinkedIn 70%')).toBeTruthy();
    expect(win.getByText('4 days (45 interviews)')).toBeTruthy();
    expect(win.getByText('30% self')).toBeTruthy();
    const weak = within(screen.getByRole('region', { name: 'Weakest' }));
    expect(weak.getByText(/Zed · Bob · no region/)).toBeTruthy();
    expect(weak.getByText('9 days')).toBeTruthy();
    expect(weak.getByText('no scores')).toBeTruthy();
    expect(weak.getByText('too few')).toBeTruthy();
    expect(screen.getByText('These are patterns, not proof.')).toBeTruthy();
    expect(getLeaders).toHaveBeenCalledWith(params);
  });

  it('shows the empty state when nobody qualifies', async () => {
    getLeaders.mockResolvedValue(report({ best: [], weakest: [] }));
    show();
    expect(await screen.findByText('No profile has 150+ matured bids in this period yet.')).toBeTruthy();
  });

  it('falls back for null name, owner and region (incl. "null" key)', async () => {
    getLeaders.mockResolvedValue(report({
      best: [lrow({ name: null, owner: null, region: null })],
      groups: { best: group({ regions: { null: 2, EU: 1 } }), weakest: group() },
    }));
    show();
    const win = within(await screen.findByRole('region', { name: 'Winning' }));
    expect(win.getByText(/Unnamed profile · unknown owner · no region · 200 matured/)).toBeTruthy();
    expect(win.getByText('no region 2 · EU 1')).toBeTruthy();
  });

  it('weakest empty: one muted line instead of empty summary rows', async () => {
    getLeaders.mockResolvedValue(report({ weakest: [] }));
    show();
    const weak = within(await screen.findByRole('region', { name: 'Weakest' }));
    expect(weak.getByText('Not enough profiles with 150+ matured bids to compare.')).toBeTruthy();
    expect(weak.queryByText('Region mix')).toBeNull();
  });

  it('uses singular for 1 day and 1 week', async () => {
    getLeaders.mockResolvedValue(report({ groups: { best: group({ medianProfileAge: 1, medianDays: 1, interviewCount: 1 }), weakest: group({ medianProfileAge: 7 * 1, medianDays: 2 }) } }));
    show();
    const win = within(await screen.findByRole('region', { name: 'Winning' }));
    expect(win.getByText('1 day')).toBeTruthy();
    expect(win.getByText('1 day (1 interview)')).toBeTruthy();
  });
});
