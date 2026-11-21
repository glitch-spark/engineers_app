// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SWRConfig } from 'swr';
import * as api from '../../api/endpoints';
import WeekTable from './WeekTable';
import MetricsCard from './MetricsCard';

vi.mock('../../lib/useInterviewTimezone', () => ({ useInterviewTimezone: () => ({ tz: 'America/Chicago' }) }));
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
const DATES = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'];
const byDay = (done: number[], target: number | null = 400) => DATES.map((date, i) => ({ date, done: done[i], target }));
const bids = (o: object = {}) => ({ ...week().bids, byDay: byDay([410, 400, 124, 0, 0]), ...o });
const days = (states: (string | [string, number, number])[]) => states.map((s, i) => (
  typeof s === 'string' ? { date: DATES[i], state: s, value: null, target: null } : { date: DATES[i], state: s[0], value: s[1], target: s[2] }
));
const wrap = (ui: React.ReactElement) =>
  render(<SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}><MemoryRouter>{ui}</MemoryRouter></SWRConfig>);
const tile = (name: string) => screen.getByRole('group', { name });

describe('WeekTable (This week, read-only)', () => {
  const round = (o: object = {}) => ({
    date: '2026-11-18', interviewId: 'i1', companyName: 'Acme', stage: 'tech1', at: '2026-11-18T16:00:00Z', who: 'self', callerName: null, status: 'passed', ...o,
  });
  const full = () => week({
    bids: {
      ...week().bids,
      byDay: DATES.map((date, i) => ({ date, done: [410, 380, 124, 0, 0][i], target: 400, self: [200, 180, 60, 0, 0][i], bidder: [210, 200, 64, 0, 0][i] })),
      week: { self: 440, selfTarget: 1000, bidder: 474, bidderTarget: null, total: 914, target: 2000 },
    },
    interviews: { ...week().interviews, done: 3, self: 2, caller: 1, target: 4, rounds: [
      round({ date: '2026-11-16', interviewId: 'i0', companyName: 'Old Co', stage: 'intro', at: '2026-11-16T15:00:00Z', status: 'scheduled' }),
      round({ date: '2026-11-17', interviewId: 'i2', companyName: 'Hooli', at: '2026-11-17T20:30:00Z', who: 'caller', callerName: 'Sam', status: 'canceled' }),
      round(),
      round({ interviewId: 'i3', companyName: 'Globex', stage: 'intro', at: '2026-11-18T20:00:00Z', who: 'caller', status: 'scheduled' }),
    ] },
    routines: { done: 1, expected: 5, rows: [
      { id: 'a', text: 'Send 50 emails', days: days(['done', 'missed', ['short', 30, 50], 'future', 'future']), doneDays: 1, totalDays: 5 },
    ] },
  });
  const show = (w: object) => wrap(<WeekTable week={w as never} today="2026-11-18" />);
  const rowOf = (name: string | RegExp) => screen.getByRole('rowheader', { name }).closest('tr') as HTMLElement;
  const cells = (name: string | RegExp) => within(rowOf(name)).getAllByRole('cell').map((c) => c.textContent);

  it('one table: the days with their dates and today marked, then Week and Planned', () => {
    show(full());
    const table = screen.getByRole('table', { name: 'This week' });
    expect(table.parentElement?.className).toContain('overflow-x-auto');
    expect([...table.querySelectorAll('thead th')].map((h) => [h.textContent, h.getAttribute('scope')])).toEqual([
      ['Row', 'col'], ['Mon 16', 'col'], ['Tue 17', 'col'], ['Wed 18 · today', 'col'], ['Thu 19', 'col'], ['Fri 20', 'col'], ['Week', 'col'], ['Planned', 'col'],
    ]);
    expect(within(table).queryByRole('checkbox')).toBeNull();
    expect(within(table).queryByRole('button')).toBeNull();
  });

  it('Bids: each day against its target, days to come as a dash, then the self and bidder rows', () => {
    show(full());
    expect(cells('Bids')).toEqual(['410', '380, under target', '124, under target', '–', '–', '914, under target', '2,000']);
    const [mon, tue] = within(rowOf('Bids')).getAllByRole('cell');
    expect(mon.className).toContain('emerald');
    expect(tue.className).toContain('amber');
    expect(cells('self')).toEqual(['200', '180', '60', '–', '–', '440', '1,000']);
    expect(cells('bidder')).toEqual(['210', '200', '64', '–', '–', '474', '–']);
  });

  it("Interviews: each day lists its rounds with the time, stage, who takes it and the status in words", () => {
    show(full());
    expect(rowOf(/^Interviews/).querySelector('th')?.textContent).toBe('Interviewsself 2 · caller 1');
    expect(cells(/^Interviews/)).toEqual([
      'Old Co9:00 AM · Intro · selfnot marked',
      'Hooli2:30 PM · Tech round 1 · caller Samcanceled',
      'Acme10:00 AM · Tech round 1 · selfpassedGlobex2:00 PM · Intro · callerscheduled',
      '–', '–', '3, under target', '4',
    ]);
    expect(screen.getByText('Old Co').parentElement?.className).toContain('amber'); // scheduled on a day before today
    expect(screen.getByText('Globex').parentElement?.className).toContain('sky');
    expect(screen.getByText('Acme').parentElement?.className).toContain('emerald');
    expect(screen.getByText('Hooli').className).toContain('line-through');
  });

  it('Daily to-dos: a heading row, then each routine with its marks, days done and days planned', () => {
    show(full());
    expect(screen.getByRole('rowheader', { name: 'Daily to-dos' })).toBeTruthy();
    expect(within(rowOf('Send 50 emails')).getAllByRole('cell').map((c) => [c.getAttribute('aria-label'), c.textContent])).toEqual([
      ['Mon: done', '✓'], ['Tue: missed', '✗'], ['Wed: 30 of 50, short of the target', '30 / 50'],
      ['Thu: still to come', ''], ['Fri: still to come', ''], [null, '1'], [null, '5'],
    ]);
  });

  it('the legend names every colour', () => {
    show(full());
    expect(within(screen.getByRole('list', { name: 'Interview colours' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(
      ['scheduled', 'not marked', 'completed', 'completed · followed up', 'passed', 'rejected', 'no answer', 'canceled'],
    );
  });

  it('an older server (days, but no self / bidder / rounds / routine rows): the rows show what they have', () => {
    show(week({ bids: bids() }));
    expect(cells('Bids')).toEqual(['410', '400', '124, under target', '–', '–', '734, under target', '2,000']);
    expect(cells('self')).toEqual(['–', '–', '–', '–', '–', '0', '–']);
    expect(cells(/^Interviews/)).toEqual(['', '', '', '', '', '5, under target', '10']);
    expect(screen.queryByText('Daily to-dos')).toBeNull();
  });

  it('no days at all: no table', () => {
    show(week());
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
  });
});

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
