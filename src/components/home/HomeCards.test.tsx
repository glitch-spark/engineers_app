// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SWRConfig } from 'swr';
import * as api from '../../api/endpoints';
import WeekCard from './WeekCard';
import MetricsCard from './MetricsCard';

vi.mock('../../api/endpoints', () => ({ getDashboardWeek: vi.fn(), getDashboardNetMonthly: vi.fn() }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-11-18T12:00:00-06:00'));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); });

const week = (o: object = {}) => ({
  week: { start: '2026-11-16', end: '2026-11-21' },
  bids: { self: 0, bidder: 0, total: 734, target: 2000, pace: { expected: 800, behindBy: 66, perDayNeeded: 1, onTrack: false }, percentile: null },
  interviews: { done: 5, self: 0, caller: 0, target: 10, pace: { expected: 4, behindBy: 0, perDayNeeded: null, onTrack: true }, percentile: null },
  stages: [], streak: 0, hasWeeklyPlan: true,
  routines: { done: 11, expected: 15 }, weeklyGoals: [], ...o,
});
const wrap = (ui: React.ReactElement) =>
  render(<SWRConfig value={{ provider: () => new Map() }}><MemoryRouter>{ui}</MemoryRouter></SWRConfig>);

describe('WeekCard', () => {
  it('bids behind pace', async () => {
    vi.mocked(api.getDashboardWeek).mockResolvedValue(week() as never);
    wrap(<WeekCard />);
    expect(await screen.findByText('734 / 2000')).toBeTruthy();
    expect(screen.getByText('▼66 vs pace')).toBeTruthy();
    expect(screen.getByText('This week · Nov 16 – Nov 20')).toBeTruthy();
    expect(screen.getByText('day 3 of 5')).toBeTruthy();
  });

  it('ahead of pace', async () => {
    vi.mocked(api.getDashboardWeek).mockResolvedValue(week() as never);
    wrap(<WeekCard />);
    expect(await screen.findByText('5 / 10')).toBeTruthy();
    expect(screen.getByText('▲1 vs pace')).toBeTruthy();
  });

  it('no target shows only the count', async () => {
    const w = week();
    vi.mocked(api.getDashboardWeek).mockResolvedValue(
      week({ bids: { ...w.bids, total: 3, target: null, pace: null }, interviews: { ...w.interviews, done: 7, target: null, pace: null } }) as never,
    );
    wrap(<WeekCard />);
    expect(await screen.findByText('3')).toBeTruthy();
    expect(screen.queryByText(/vs pace/)).toBeNull();
  });

  it('zero target shows only the count', async () => {
    const w = week();
    vi.mocked(api.getDashboardWeek).mockResolvedValue(
      week({ interviews: { ...w.interviews, done: 3, target: 0, pace: null } }) as never,
    );
    wrap(<WeekCard />);
    await screen.findByText('Interviews');
    expect(screen.queryByText('3 / 0')).toBeNull();
  });

  it('strip shows bids, interviews, routines', async () => {
    vi.mocked(api.getDashboardWeek).mockResolvedValue(week() as never);
    wrap(<WeekCard />);
    expect(await screen.findByText('Bids')).toBeTruthy();
    expect(screen.getByText('Interviews')).toBeTruthy();
    expect(screen.getByText('Routines')).toBeTruthy();
    expect(screen.getByText('11 / 15')).toBeTruthy();
    expect(screen.getAllByTestId('pace-tick')).toHaveLength(1);
  });

  it('hides routines when none expected', async () => {
    vi.mocked(api.getDashboardWeek).mockResolvedValue(week({ routines: { done: 0, expected: 0 } }) as never);
    wrap(<WeekCard />);
    await screen.findByText('Bids');
    expect(screen.queryByText('Routines')).toBeNull();
  });

  it('no weekly goals list on the week card', async () => {
    vi.mocked(api.getDashboardWeek).mockResolvedValue(week({
      weeklyGoals: [{ id: 'g1', text: 'Reach outs', kind: 'count', value: 140, target: 250, done: false }],
    }) as never);
    wrap(<WeekCard />);
    await screen.findByText('Bids');
    expect(screen.queryByText('Reach outs')).toBeNull();
    expect(screen.queryByText('140 / 250')).toBeNull();
  });
});

describe('MetricsCard', () => {
  it('earnings vs last month and pipeline', async () => {
    vi.mocked(api.getDashboardNetMonthly).mockResolvedValue({
      months: [{ period: '2026-09', income: 0, outcome: 0, net: 100 }, { period: '2026-10', income: 0, outcome: 0, net: 4300 }, { period: '2026-11', income: 0, outcome: 0, net: 4820 }],
      total: 0,
    } as never);
    vi.mocked(api.getDashboardWeek).mockResolvedValue(week({
      stages: [
        { key: 'tech', label: 'Tech', count: 3 }, { key: 'final', label: 'Final', count: 2 },
        { key: 'offer', label: 'Offer', count: 1 }, { key: 'canceled', label: 'Canceled', count: 4 },
        { key: 'hiring', label: 'Hiring', count: 0 },
      ],
    }) as never);
    wrap(<MetricsCard />);
    expect(await screen.findByText('$4,820')).toBeTruthy();
    expect(screen.getByText('▲12%')).toBeTruthy();
    expect(screen.getByText('3 Tech · 2 Final · 1 Offer')).toBeTruthy();
    expect(screen.queryByText(/Canceled/)).toBeNull();
  });
});
