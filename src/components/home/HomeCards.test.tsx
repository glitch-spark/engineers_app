// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SWRConfig } from 'swr';
import * as api from '../../api/endpoints';
import MetricsCard from './MetricsCard';

vi.mock('../../api/endpoints', () => ({ getDashboardWeek: vi.fn(), getDashboardNetMonthly: vi.fn(), getDashboardMonthInterviews: vi.fn() }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-11-18T12:00:00-06:00')); // a Wednesday
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); });

/** The week as an older server sends it: none of the redesign's fields. */
const week = (o: object = {}) => ({
  week: { start: '2026-11-16', end: '2026-11-21' },
  bids: { self: 0, bidder: 0, total: 734, target: 2000, pace: { expected: 800, behindBy: 66, perDayNeeded: 1, onTrack: false }, percentile: null },
  interviews: { done: 5, self: 0, caller: 0, target: 10, pace: { expected: 4, behindBy: 0, perDayNeeded: null, onTrack: true }, percentile: null },
  stages: [], streak: 0, hasWeeklyPlan: true,
  routines: { done: 11, expected: 15 }, weeklyGoals: [], ...o,
});
const wrap = (ui: React.ReactElement) =>
  render(<SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}><MemoryRouter>{ui}</MemoryRouter></SWRConfig>);
const tile = (name: string) => screen.getByRole('group', { name });

describe('MetricsCard (This month)', () => {
  const months = (cur: object, prev: object | null = { net: 3514 }) => ({
    months: [
      ...(prev ? [{ period: '2026-10', income: 0, outcome: 0, ...prev }] : []),
      { period: '2026-11', income: 0, outcome: 0, net: 0, ...cur },
    ],
    total: 0,
  });
  const month = (o: object = {}) => ({
    pipeline: [
      { stage: 'intro', label: 'Intro', count: 2 }, { stage: 'tech', label: 'Tech', count: 1 }, { stage: 'final', label: 'Final', count: 0 },
    ],
    waitingForResult: 4, followUpsDue: 1,
    passRate: { value: 24, passed: 6, decided: 25, few: false, teamRate: 23.9 }, ...o,
  });
  const show = async (net: object, m: object | null, w: object = {}) => {
    vi.mocked(api.getDashboardNetMonthly).mockResolvedValue(net as never);
    vi.mocked(api.getDashboardWeek).mockResolvedValue(week(w) as never);
    if (m) vi.mocked(api.getDashboardMonthInterviews).mockResolvedValue(m as never);
    else vi.mocked(api.getDashboardMonthInterviews).mockRejectedValue(new Error('404'));
    wrap(<MetricsCard />);
    await screen.findByRole('heading', { name: 'This month · November' });
  };

  it('Earnings: net, last month, money in and out, no percentage', async () => {
    await show(months({ net: -773, in: 1200, out: 1973 }), month());
    const box = tile('Earnings');
    expect(within(box).getByText('−$773')).toBeTruthy();
    expect(within(box).getByText('last month +$3,514')).toBeTruthy();
    expect(within(box).getByText('in $1,200 · out $1,973')).toBeTruthy();
    expect(box.textContent).not.toContain('%');
    expect(within(box).getByRole('link', { name: /Transactions/ }).getAttribute('href')).toBe('/transactions');
  });

  it('Earnings: a loss last month, and no last-month line in the first month', async () => {
    await show(months({ net: 4820, in: 5000, out: 180 }, { net: -250 }), month());
    expect(within(tile('Earnings')).getByText('$4,820')).toBeTruthy();
    expect(within(tile('Earnings')).getByText('last month −$250')).toBeTruthy();
    cleanup();
    await show(months({ net: 10, in: 10, out: 0 }, null), month());
    expect(within(tile('Earnings')).queryByText(/last month/)).toBeNull();
  });

  it('Earnings from an old response: in and out come from income and outcome', async () => {
    await show(months({ net: -773, income: 1200, outcome: -1973 }), month());
    expect(within(tile('Earnings')).getByText('in $1,200 · out $1,973')).toBeTruthy();
  });

  it('Interviews in progress: stage counts, waiting for a result and one follow-up due', async () => {
    await show(months({ net: 1 }), month());
    const box = tile('Interviews in progress');
    expect(within(box).getByText('2 Intro · 1 Tech')).toBeTruthy();
    expect(within(box).getByText('4 waiting for a result')).toBeTruthy();
    expect(within(box).getByText('1 follow-up due')).toBeTruthy();
    expect(within(box).getByRole('link', { name: /Interviews/ }).getAttribute('href')).toBe('/interviews');
  });

  it('Interviews in progress: several follow-ups, zero lines left out, and nothing in progress', async () => {
    await show(months({ net: 1 }), month({ followUpsDue: 3, waitingForResult: 0 }));
    expect(within(tile('Interviews in progress')).getByText('3 follow-ups due')).toBeTruthy();
    expect(within(tile('Interviews in progress')).queryByText(/waiting for a result/)).toBeNull();
    cleanup();
    await show(months({ net: 1 }), month({ pipeline: [], followUpsDue: 0, waitingForResult: 0 }));
    expect(within(tile('Interviews in progress')).getByText('No interviews in progress')).toBeTruthy();
    expect(within(tile('Interviews in progress')).queryByText(/follow-up/)).toBeNull();
  });

  it('Pass rate: the rate beside the team, what it is out of, and the link to the Interviews statistics', async () => {
    await show(months({ net: 1 }), month());
    const box = tile('Pass rate');
    expect(within(box).getByText('24%')).toBeTruthy();
    expect(within(box).getByText('team 23.9%')).toBeTruthy();
    expect(within(box).getByText('6 passed of 25 decided rounds')).toBeTruthy();
    expect(within(box).getByRole('link', { name: /Statistics/ }).getAttribute('href')).toBe('/statistics?tab=interviews');
  });

  it('Pass rate with too few decided rounds says so in place of a rate', async () => {
    await show(months({ net: 1 }), month({ passRate: { value: 50, passed: 1, decided: 2, few: true, teamRate: 23.9 } }));
    const box = tile('Pass rate');
    expect(within(box).getByText('too few to tell')).toBeTruthy();
    expect(within(box).queryByText('50%')).toBeNull();
    expect(within(box).getByText('1 passed of 2 decided rounds')).toBeTruthy();
  });

  it('Pass rate is left out with no decided round this month', async () => {
    await show(months({ net: 1 }), month({ passRate: { value: null, passed: 0, decided: 0, few: true, teamRate: 23.9 } }));
    expect(screen.queryByRole('group', { name: 'Pass rate' })).toBeNull();
  });

  it('an old server without the month read: the stage counts come from the week, no other lines, no pass rate', async () => {
    await show(months({ net: 4820, income: 5000, outcome: 180 }), null, { stages: [
      { key: 'tech', label: 'Tech', count: 3 }, { key: 'final', label: 'Final', count: 2 },
      { key: 'canceled', label: 'Canceled', count: 4 }, { key: 'hiring', label: 'Hiring', count: 0 },
    ] });
    const box = await screen.findByRole('group', { name: 'Interviews in progress' });
    expect(await within(box).findByText('3 Tech · 2 Final')).toBeTruthy();
    expect(within(box).queryByText(/waiting|follow-up/)).toBeNull();
    expect(screen.queryByRole('group', { name: 'Pass rate' })).toBeNull();
    expect(within(tile('Earnings')).getByText('$4,820')).toBeTruthy();
  });
});
