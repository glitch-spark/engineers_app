// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SWRConfig } from 'swr';
import * as api from '../../api/endpoints';
import WeekCard from './WeekCard';
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
const DATES = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'];
const byDay = (done: number[], target: number | null = 400) => DATES.map((date, i) => ({ date, done: done[i], target }));
const bids = (o: object = {}) => ({ ...week().bids, byDay: byDay([410, 400, 124, 0, 0]), ...o });
const outcomes = (o: object = {}) => ({
  ...week().interviews,
  outcomes: { held: 3, passed: 1, rejected: 0, noAnswer: 0, waiting: 2, canceled: 1, scheduled: 2, ...o },
});
const days = (states: (string | [string, number, number])[]) => states.map((s, i) => (
  typeof s === 'string' ? { date: DATES[i], state: s, value: null, target: null } : { date: DATES[i], state: s[0], value: s[1], target: s[2] }
));
const wrap = (ui: React.ReactElement) =>
  render(<SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}><MemoryRouter>{ui}</MemoryRouter></SWRConfig>);
const showWeek = async (o: object = {}) => {
  vi.mocked(api.getDashboardWeek).mockResolvedValue(week(o) as never);
  wrap(<WeekCard />);
  await screen.findByRole('heading', { name: 'This week · Nov 16 – Nov 20' });
};
const tile = (name: string) => screen.getByRole('group', { name });

describe('WeekCard', () => {
  it.each([
    ['2026-11-16T12:00:00-06:00', 'Mon · 5 days left'],
    ['2026-11-18T12:00:00-06:00', 'Wed · 3 days left'],
    ['2026-11-19T12:00:00-06:00', 'Thu · 2 days left'],
    ['2026-11-20T12:00:00-06:00', 'Fri · last day'],
  ])('the heading says the weekday and what is left of the week: %s', async (now, text) => {
    vi.setSystemTime(new Date(now));
    await showWeek();
    expect(screen.getByText(text)).toBeTruthy();
  });

  it('says nothing about days left on a weekend', async () => {
    vi.setSystemTime(new Date('2026-11-21T12:00:00-06:00'));
    await showWeek();
    expect(screen.queryByText(/days left|last day/)).toBeNull();
  });

  it('Bids behind: the sentence, an amber bar, each day with the short ones marked, and the target note', async () => {
    await showWeek({ bids: bids() });
    const box = tile('Bids');
    expect(box.textContent).toContain('734 of 2,000 · 1,266 to go this week');
    expect(within(box).getByRole('progressbar').firstElementChild?.className).toContain('bg-amber-500');
    const list = within(box).getAllByRole('listitem');
    expect(list.map((li) => li.textContent)).toEqual(['410Mon', '400Tue', '124Wed · today, under target', '–Thu', '–Fri']);
    expect(list[2].querySelector('b')?.className).toContain('text-amber-600');
    expect(list[0].querySelector('b')?.className).not.toContain('amber');
    expect(within(box).getByText('Target 400 a day · amber = under target')).toBeTruthy();
    expect(screen.queryByText(/vs pace/)).toBeNull();
    expect(screen.queryByTestId('pace-tick')).toBeNull();
  });

  it('Bids on the last day says what is left today; a past short day is amber too', async () => {
    vi.setSystemTime(new Date('2026-11-20T12:00:00-06:00'));
    await showWeek({ bids: bids({ total: 1326, target: 1375, byDay: byDay([280, 275, 262, 385, 124], 275) }) });
    const box = tile('Bids');
    expect(box.textContent).toContain('1,326 of 1,375 · 49 to go today');
    expect(within(box).getAllByRole('listitem').map((li) => li.textContent)).toEqual(
      ['280Mon', '275Tue', '262Wed, under target', '385Thu', '124Fri · today, under target'],
    );
  });

  it('Bids on track: a green bar; at the target nothing is left to go', async () => {
    await showWeek({ bids: bids({ total: 2100, pace: { expected: 800, behindBy: 0, perDayNeeded: null, onTrack: true } }) });
    const box = tile('Bids');
    expect(box.textContent).toContain('2,100 of 2,000');
    expect(box.textContent).not.toContain('to go');
    expect(within(box).getByRole('progressbar').firstElementChild?.className).toContain('bg-success-500');
  });

  it('Bids without a target: the count and the days, no colours, no note, no bar', async () => {
    await showWeek({ bids: bids({ total: 934, target: null, pace: null, byDay: byDay([410, 400, 124, 0, 0], null) }) });
    const box = tile('Bids');
    expect(box.textContent).toContain('934');
    expect(box.textContent).not.toContain(' of ');
    expect(within(box).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['410Mon', '400Tue', '124Wed · today', '–Thu', '–Fri']);
    expect(box.innerHTML).not.toContain('amber');
    expect(within(box).queryByText(/a day/)).toBeNull();
    expect(within(box).queryByRole('progressbar')).toBeNull();
  });

  it('Interviews: the sentence, a stacked bar with a text alternative, and the second line', async () => {
    await showWeek({ interviews: outcomes() });
    const box = tile('Interviews');
    expect(box.textContent).toContain('3 held · 1 passed · 2 waiting for a result');
    expect(within(box).getByRole('img', { name: '1 passed, 2 waiting for a result, 1 canceled' })).toBeTruthy();
    expect(within(box).getByText('1 canceled · 2 more scheduled this week')).toBeTruthy();
  });

  it('Interviews: every outcome is named in the bar', async () => {
    await showWeek({ interviews: outcomes({ held: 7, passed: 2, rejected: 1, noAnswer: 1, waiting: 3, canceled: 2, scheduled: 0 }) });
    const box = tile('Interviews');
    expect(within(box).getByRole('img', { name: '2 passed, 1 rejected, 1 no answer, 3 waiting for a result, 2 canceled' })).toBeTruthy();
    expect(within(box).getByText('2 canceled')).toBeTruthy();
  });

  it.each([
    [{ held: 3, passed: 0, waiting: 3, canceled: 0, scheduled: 0 }, '3 held · 3 waiting for a result', null],
    [{ held: 2, passed: 2, waiting: 0, canceled: 0, scheduled: 4 }, '2 held · 2 passed', '4 more scheduled this week'],
    [{ held: 0, passed: 0, waiting: 0, canceled: 0, scheduled: 0 }, '0 held', null],
  ])('Interviews leaves out the parts that are zero: %#', async (o, sentence, second) => {
    await showWeek({ interviews: outcomes(o) });
    const box = tile('Interviews');
    expect(box.querySelector('p')?.textContent).toBe(sentence);
    expect(box.textContent).not.toMatch(/ 0 (passed|waiting|canceled|more)/);
    if (second) expect(within(box).getByText(second)).toBeTruthy();
    else expect(within(box).queryByText(/canceled|more scheduled/)).toBeNull();
  });

  it('Routines: the total, one line per routine with every kind of day named, and the legend', async () => {
    await showWeek({ routines: { done: 8, expected: 15, rows: [
      { id: 'a', text: 'Send 50 emails', days: days(['done', 'missed', ['short', 30, 50], 'future', 'future']), doneDays: 1, totalDays: 5 },
      { id: 'b', text: 'Talk with callers', days: days(['off', 'done', 'today', 'future', 'future']), doneDays: 1, totalDays: 4 },
    ] } });
    expect(screen.getByText('8 of 15 done this week')).toBeTruthy();
    const table = screen.getByRole('table', { name: 'Routines this week' });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Routine', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Days done']);
    const [, a, b] = within(table).getAllByRole('row');
    const cells = (row: HTMLElement) => within(row).getAllByRole('cell').map((c) => [c.getAttribute('aria-label'), c.textContent]);
    expect(within(a).getByRole('rowheader').textContent).toBe('Send 50 emails');
    expect(cells(a)).toEqual([
      ['Mon: done', '✓'], ['Tue: missed', '✗'], ['Wed: 30 of 50, short of the target', '30 / 50'],
      ['Thu: still to come', ''], ['Fri: still to come', ''], [null, '1 of 5 days'],
    ]);
    expect(cells(b)).toEqual([
      ['Mon: not planned', ''], ['Tue: done', '✓'], ['Wed: today, not done yet', '·'],
      ['Thu: still to come', ''], ['Fri: still to come', ''], [null, '1 of 4 days'],
    ]);
    expect(screen.getByText("✓ done · ✗ missed · a number = short of that day's target · · = today, not done yet")).toBeTruthy();
  });

  it('hides routines when none expected', async () => {
    await showWeek({ routines: { done: 0, expected: 0, rows: [] } });
    expect(screen.queryByText('Routines')).toBeNull();
  });

  it('an old response still renders: counts with their targets, the routines total, no days, bar parts or grid', async () => {
    await showWeek();
    expect(tile('Bids').textContent).toContain('734 of 2,000 · 1,266 to go this week');
    expect(within(tile('Bids')).queryByRole('listitem')).toBeNull();
    expect(tile('Interviews').textContent).toContain('5 of 10');
    expect(within(tile('Interviews')).queryByRole('img')).toBeNull();
    expect(screen.getByText('11 of 15 done this week')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText(/✓ done/)).toBeNull();
  });

  it('an old response without targets shows only the counts', async () => {
    const w = week();
    await showWeek({ bids: { ...w.bids, total: 3, target: null, pace: null }, interviews: { ...w.interviews, done: 7, target: 0, pace: null } });
    expect(tile('Bids').textContent).toBe('Bids3');
    expect(tile('Interviews').textContent).toBe('Interviews7');
  });

  it('no weekly goals list on the week card', async () => {
    await showWeek({ weeklyGoals: [{ id: 'g1', text: 'Reach outs', kind: 'count', value: 140, target: 250, done: false }] });
    expect(screen.queryByText('Reach outs')).toBeNull();
    expect(screen.queryByText('140 / 250')).toBeNull();
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
