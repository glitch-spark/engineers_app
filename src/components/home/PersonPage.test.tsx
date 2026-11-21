// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SWRConfig } from 'swr';
import * as api from '../../api/endpoints';
import PersonPage from './PersonPage';

vi.mock('../../api/endpoints', () => ({
  getDayPlan: vi.fn(), getDashboardWeek: vi.fn(), getInterviewPipeline: vi.fn(), getDashboardPending: vi.fn(), getNeedsInput: vi.fn(),
  followUpInterviewStage: vi.fn(), updateInterviewStage: vi.fn(), putDayProgress: vi.fn(),
}));
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'boss', role: 'admin' } }) }));
vi.mock('../../lib/useInterviewTimezone', () => ({ useInterviewTimezone: () => ({ tz: 'America/Chicago' }) }));

const c = { bidsSelf: 0, bidsSelfUs: 0, bidsSelfEu: 0, bidsSelfLatam: 0, bidsBidder: 0, interviewsSelf: 0, interviewsCaller: 0 };
const item = (o: object) => ({ text: 't', kind: 'check', target: null, archived: false, scope: 'routine', result: null, ...o });
const iv = (o: object = {}) => ({
  interviewId: 'iv-a', roundId: 'r-a', companyName: 'superlinked', profileName: 'Backend', stage: 'intro', status: 'completed', state: 'completed',
  scheduledAt: '2026-11-20T20:30:00Z', endsAt: '2026-11-20T21:00:00Z', rescheduledTo: null,
  who: { kind: 'self', name: null, assigned: false, confirmed: false }, steps: [{ stage: 'intro', state: 'today' }], ...o,
});
const unmarked = iv({
  interviewId: 'iv-b', roundId: 'r-b', companyName: 'Globex', stage: 'tech1', status: 'scheduled', state: 'unmarked',
  scheduledAt: '2026-11-20T22:00:00Z', endsAt: '2026-11-20T22:25:00Z', steps: [{ stage: 'tech1', state: 'today' }],
});
/** The day as an older server sends it; `day()` adds the admin page's fields. */
const oldDay = (o: object = {}) => ({
  date: '2026-11-20', exists: true, userId: 'u7', weekSaved: true,
  targets: { ...c, bidsSelf: 50, bidsBidder: 150 },
  items: [
    item({ id: 'r1', text: 'Caller Manage', result: { done: true, value: null, target: null } }),
    item({ id: 'r2', text: 'Work Review' }), item({ id: 'r3', text: 'Gmail' }),
    item({ id: 'g1', text: 'Citizen Contact', kind: 'count', target: 250, scope: 'goal' }),
    item({ id: 'g2', text: 'Company Onboarding', scope: 'goal' }),
    item({ id: 'g3', text: 'Update prompts', scope: 'goal' }),
  ],
  progress: {
    g1: { value: 120, done: false, target: 250, doneOn: null },
    g2: { value: 0, done: false, target: null, doneOn: null },
    g3: { value: 0, done: true, target: null, doneOn: '2026-11-18' },
  },
  focus: [], done: { ...c, bidsSelf: 36 }, bidsBidderAuto: 150,
  interviews: { self: 1, caller: 1, stages: { self: {}, caller: {} } },
  notes: '', loggedAt: null, submitted: false, profiles: [], ...o,
});
const day = (o: object = {}) => oldDay({
  bidsByRegion: [
    { region: 'US', self: 32, selfTarget: 40, bidder: 118, total: 150 },
    { region: 'EU', self: 0, selfTarget: null, bidder: 24, total: 24 },
    { region: 'Latam', self: 4, selfTarget: 10, bidder: 8, total: 12 },
  ],
  bidsTotals: { self: 36, selfTarget: 50, bidder: 150, bidderTarget: 150, total: 186, target: 200 },
  todayInterviews: [iv(), unmarked], interviewsMarked: { marked: 1, total: 2 }, ...o,
});
const DATES = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'];
const byDay = (done: number[], target: number | null | (number | null)[] = 200) => DATES.map((date, i) => ({ date, done: done[i], target: Array.isArray(target) ? target[i] : target }));
const week = (o: object = {}) => ({
  week: { start: '2026-11-16', end: '2026-11-21' },
  bids: {
    // `total` also counts weekend bids: the page reads the Mon–Fri `week` when it is there
    self: 0, bidder: 0, total: 1010, target: 1000, pace: null, percentile: null, byDay: byDay([219, 278, 130, 175, 186]),
    week: { self: 204, selfTarget: 250, bidder: 784, bidderTarget: 750, total: 988, target: 1000 },
  },
  interviews: {
    done: 6, self: 0, caller: 0, target: 10, pace: null, percentile: null,
    outcomes: { held: 6, passed: 1, rejected: 1, noAnswer: 0, waiting: 4, canceled: 1, scheduled: 2 },
    // Tuesday's `scheduled` is a round that ended and was never marked
    byDay: DATES.map((date, i) => ({ date, held: [1, 2, 0, 1, 2][i], canceled: [0, 0, 1, 0, 0][i], scheduled: [0, 1, 0, 0, 1][i] })),
  },
  stages: [], streak: 0, hasWeeklyPlan: true, weeklyGoals: [],
  routines: { done: 12, expected: 15, rows: [
    { id: 'r1', text: 'Caller Manage', doneDays: 3, totalDays: 5, days: DATES.map((date, i) => ({ date, state: ['done', 'done', 'missed', 'done', 'today'][i], value: null, target: null })) },
  ] }, ...o,
});
/** The week as an older server sends it: no `bids.week`, no `interviews.byDay`. */
const oldWeek = () => {
  const w = week();
  const { week: _w, ...bids } = w.bids;
  const { byDay: _d, ...interviews } = w.interviews;
  return { ...w, bids, interviews };
};
const pipe = (o: object = {}) => ({
  interviewId: 'p1', companyName: 'Voxology', profileName: 'Backend', stage: 'final', at: '2026-11-21T05:00:00Z', upcoming: true,
  status: 'scheduled', days: null, followedUpAt: null, ...o,
});
const pipeline = [
  pipe(),
  pipe({ interviewId: 'p2', companyName: 'Impelsys', stage: 'panel', at: '2026-11-23T16:00:00Z' }),
  pipe({ interviewId: 'p3', companyName: 'superlinked', stage: 'intro', at: '2026-11-20T20:30:00Z', upcoming: false, status: 'waiting' }),
  pipe({ interviewId: 'p4', companyName: 'Liberty', stage: 'intro', at: '2026-11-12T16:00:00Z', upcoming: false, status: 'no_result', days: 8 }),
  pipe({ interviewId: 'p5', companyName: 'Smart Working', stage: 'intro', at: '2026-10-08T16:00:00Z', upcoming: false, status: 'followed_up', followedUpAt: '2026-11-13T12:00:00Z' }),
  pipe({ interviewId: 'p6', companyName: 'Curotec', stage: 'tech1', at: '2026-11-17T16:00:00Z', upcoming: false, status: 'passed' }),
];
const followUp = {
  interviewId: 'iv1', roundId: 'r1', companyName: 'Liberty', profileName: 'John D', ownerId: 'u7', ownerName: 'Puma',
  stage: 'intro', status: 'completed', scheduledAt: '2026-11-12T16:00:00Z', endsAt: '2026-11-12T17:00:00Z', need: 'follow_up',
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-11-20T17:00:00-06:00')); // Friday, 5 PM in Chicago
  vi.mocked(api.getDayPlan).mockResolvedValue(day() as never);
  vi.mocked(api.getDashboardWeek).mockResolvedValue(week() as never);
  vi.mocked(api.getInterviewPipeline).mockResolvedValue({ items: pipeline } as never);
  vi.mocked(api.getDashboardPending).mockResolvedValue({ interviews: [followUp], profiles: [], bidders: [], counts: {} } as never);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); });

const onPickDay = vi.fn();
const page = (props: object = {}) => (
  <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
    <MemoryRouter><PersonPage userId="u7" name="Puma" day="2026-11-20" today="2026-11-20" onPickDay={onPickDay} {...props} /></MemoryRouter>
  </SWRConfig>
);
const show = (props: object = {}) => render(page(props));
const card = (name: string) => screen.findByRole('region', { name });
const tile = (name: string) => screen.findByRole('group', { name });
const cells = (table: HTMLElement) => within(table).getAllByRole('row').map((r) => within(r).queryAllByRole('cell').map((x) => x.textContent)).filter((r) => r.length > 1); // a one-cell row is a group heading
/** A half's heading with what stands beside it. */
const half = (box: HTMLElement, name: string) => within(box).getByRole('heading', { name }).parentElement!.textContent;
/** A past day's plan differs from today's, so a test can tell which one a part shows. */
const pastDay = () => day({
  date: '2026-11-18',
  bidsByRegion: [{ region: 'US', self: 22, selfTarget: 50, bidder: 108, total: 130 }],
  bidsTotals: { self: 22, selfTarget: 50, bidder: 108, bidderTarget: 150, total: 130, target: 200 },
  todayInterviews: [iv({ interviewId: 'iv-w', roundId: 'r-w', companyName: 'Acme', status: 'canceled', state: 'canceled', scheduledAt: '2026-11-18T20:30:00Z', endsAt: '2026-11-18T21:00:00Z' })],
});
const byDate = () => vi.mocked(api.getDayPlan).mockImplementation(((d: string) => Promise.resolve(d === '2026-11-20' ? day() : pastDay())) as never);

describe('PersonPage', () => {
  it('asks every read for that person: the picked day, today for the pending items, and the current week without weekOf', async () => {
    show({ day: '2026-11-19' });
    await card('Bids');
    expect(api.getDayPlan).toHaveBeenCalledWith('2026-11-19', 'u7');
    expect(api.getDayPlan).toHaveBeenCalledWith('2026-11-20', 'u7');
    expect(vi.mocked(api.getDashboardWeek).mock.calls).toEqual([[{ userId: 'u7', today: '2026-11-20' }]]);
    expect(Object.keys(vi.mocked(api.getDashboardWeek).mock.calls[0][0])).not.toContain('weekOf');
    expect(api.getInterviewPipeline).toHaveBeenCalledWith('u7');
    await waitFor(() => expect(api.getDashboardPending).toHaveBeenCalledWith('u7'));
  });

  it('today is read once', async () => {
    show();
    await card('Bids');
    expect(api.getDayPlan).toHaveBeenCalledTimes(1);
  });

  it('a past week: the week read gets the real today and the picked day as weekOf, and is not read again for another day of that week', async () => {
    const view = show({ day: '2026-11-11' });
    await card('Bids');
    expect(vi.mocked(api.getDashboardWeek).mock.calls).toEqual([[{ userId: 'u7', today: '2026-11-20', weekOf: '2026-11-11' }]]);
    view.rerender(page({ day: '2026-11-12' }));
    await waitFor(() => expect(api.getDayPlan).toHaveBeenCalledWith('2026-11-12', 'u7'));
    expect(api.getDashboardWeek).toHaveBeenCalledTimes(1);
    view.rerender(page({ day: '2026-11-06' }));
    await waitFor(() => expect(api.getDashboardWeek).toHaveBeenLastCalledWith({ userId: 'u7', today: '2026-11-20', weekOf: '2026-11-06' }));
  });

  describe('tiles', () => {
    it('Bids today: done of target, an amber bar, what is left to go, self and bidder', async () => {
      show();
      const t = await tile('Bids today');
      expect(await within(t).findByText('186')).toBeTruthy();
      expect(t.textContent).toBe('Bids today186 of 20014 to go · self 36 · bidder 150');
      const bar = within(t).getByRole('progressbar', { name: 'Bids today' });
      expect(bar.getAttribute('aria-valuenow')).toBe('93');
      expect(bar.innerHTML).toContain('amber');
    });

    it('Bids on a past day: named by its date, and short instead of to go', async () => {
      byDate();
      show({ day: '2026-11-18' });
      const t = await tile('Bids on Wed, Nov 18');
      await within(t).findByText('130');
      expect(t.textContent).toBe('Bids on Wed, Nov 18130 of 20070 short · self 22 · bidder 108');
      expect(screen.queryByRole('group', { name: 'Bids today' })).toBeNull();
    });

    it('Bids at the target: target reached, a green bar', async () => {
      vi.mocked(api.getDayPlan).mockResolvedValue(day({ bidsTotals: { self: 50, selfTarget: 50, bidder: 160, bidderTarget: 150, total: 210, target: 200 } }) as never);
      show();
      const t = await tile('Bids today');
      await within(t).findByText('210');
      expect(t.textContent).toBe('Bids today210 of 200target reached · self 50 · bidder 160');
      const bar = within(t).getByRole('progressbar');
      expect(bar.getAttribute('aria-valuenow')).toBe('100');
      expect(bar.innerHTML).toContain('success');
    });

    it('Bids without a target: the number, self and bidder, no bar', async () => {
      vi.mocked(api.getDayPlan).mockResolvedValue(day({ bidsTotals: { self: 5, selfTarget: null, bidder: 20, bidderTarget: null, total: 25, target: null } }) as never);
      show();
      const t = await tile('Bids today');
      await within(t).findByText('25');
      expect(t.textContent).toBe('Bids today25self 5 · bidder 20');
      expect(within(t).queryByRole('progressbar')).toBeNull();
    });

    it('Bids this week: the Mon–Fri total of its target, what is left and the days left', async () => {
      show();
      const t = await tile('Bids this week');
      await within(t).findByText('988');
      expect(t.textContent).toBe('Bids this week988 of 1,00012 to go · last day of the week');
      expect(within(t).getByRole('progressbar', { name: 'Bids this week' }).getAttribute('aria-valuenow')).toBe('99');
    });

    it('Bids this week earlier in the week counts the days left; at the target says so', async () => {
      vi.mocked(api.getDashboardWeek).mockResolvedValue(week({ bids: { ...week().bids, week: { ...week().bids.week, total: 1000 } } }) as never);
      show({ today: '2026-11-18', day: '2026-11-18' });
      const t = await tile('Bids this week');
      await within(t).findByText('1,000');
      expect(t.textContent).toBe('Bids this week1,000 of 1,000target reached · 3 days left');
    });

    it('Bids in a past week: named by its Monday, short or target reached, no days left', async () => {
      show({ day: '2026-11-11' });
      const t = await tile('Bids in the week of Nov 9');
      await within(t).findByText('988');
      expect(t.textContent).toBe('Bids in the week of Nov 9988 of 1,00012 short');
    });

    it('Interviews this week: held and still to come, a stacked bar with a text alternative, the outcomes with zero parts left out', async () => {
      show();
      const t = await tile('Interviews this week');
      await within(t).findByText('6');
      // of the 2 not held yet, one is a past round nobody marked: it is not "still to come"
      expect(t.textContent).toBe('Interviews this week6 held · 1 still to come1 passed · 1 rejected · 4 waiting · 1 canceled');
      expect(within(t).getByRole('img').getAttribute('aria-label')).toBe('1 passed, 1 rejected, 4 waiting for a result');
    });

    it('Interviews this week with nothing decided: no bar, no second line', async () => {
      vi.mocked(api.getDashboardWeek).mockResolvedValue(week({ interviews: {
        ...week().interviews, outcomes: { held: 0, passed: 0, rejected: 0, noAnswer: 0, waiting: 0, canceled: 0, scheduled: 0 }, byDay: undefined,
      } }) as never);
      show();
      const t = await tile('Interviews this week');
      await within(t).findByText('0');
      expect(t.textContent).toBe('Interviews this week0 held · 0 still to come');
      expect(within(t).queryByRole('img')).toBeNull();
    });

    it('Pending: the total, its parts with zero parts left out, and in red the interviews that ended and are not marked', async () => {
      show();
      const t = await tile('Pending');
      await within(t).findByText('2');
      expect(t.textContent).toBe("Pending22 interviews1 interview ended and isn't marked");
      expect(within(t).getByText("1 interview ended and isn't marked").className).toContain('red');
    });

    it('Pending with every part, and no red line when every interview is marked', async () => {
      vi.mocked(api.getDayPlan).mockResolvedValue(day({ todayInterviews: [iv()] }) as never);
      vi.mocked(api.getDashboardPending).mockResolvedValue({
        interviews: [followUp],
        profiles: [{ accountId: 'a1', name: 'Ross', kind: 'no_bids', idleDays: 21, capped: false, bids: null, tailorScore: null }],
        bidders: [{ bidderId: 'b1', name: 'Ali', kind: 'not_bidding', days: 2, recent: null, before: null }, { bidderId: 'b2', name: 'Sam', kind: 'not_bidding', days: 3, recent: null, before: null }],
        counts: {},
      } as never);
      show();
      const t = await tile('Pending');
      await within(t).findByText('4');
      expect(t.textContent).toBe('Pending41 interview · 1 profile · 2 bidders');
    });

    it('Pending counts several unmarked interviews', async () => {
      vi.mocked(api.getDashboardPending).mockResolvedValue({ interviews: [{ ...followUp, interviewId: 'iv9', roundId: 'r9', need: 'outcome' }], profiles: [], bidders: [], counts: {} } as never);
      show();
      expect(await within(await tile('Pending')).findByText("2 interviews ended and aren't marked")).toBeTruthy();
    });
  });

  it('jump links scroll to each section and move focus to its heading; Pending carries the count', async () => {
    show();
    const nav = await screen.findByRole('navigation', { name: 'Sections' });
    await within(nav).findByRole('button', { name: 'Pending 2' });
    expect(within(nav).getAllByRole('button').map((b) => b.textContent)).toEqual(['Bids', 'Interviews', 'Daily to-dos', 'Weekly goals', 'Pending 2']);
    for (const [link, heading] of [['Interviews', 'Interviews'], ['Weekly goals', 'Weekly goals'], ['Pending 2', 'Pending items (2)'], ['Bids', 'Bids']]) {
      fireEvent.click(within(nav).getByRole('button', { name: link }));
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: heading }));
    }
  });

  it('no Pending jump link when nothing is pending', async () => {
    vi.mocked(api.getDayPlan).mockResolvedValue(day({ todayInterviews: [] }) as never);
    vi.mocked(api.getDashboardPending).mockResolvedValue({ interviews: [], profiles: [], bidders: [], counts: {} } as never);
    show();
    await within(await tile('Pending')).findByText('0');
    expect(within(screen.getByRole('navigation', { name: 'Sections' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['Bids', 'Interviews', 'Daily to-dos', 'Weekly goals']);
  });

  it('Bids, the day half: the day and its total, the region table with under-target numbers in amber', async () => {
    show();
    const box = await card('Bids');
    const table = await within(box).findByRole('table', { name: 'Bids by region' });
    expect(half(box, 'Today')).toBe('Today186 of 200');
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Region', 'Self', 'Bidder', 'Total']);
    expect(cells(table)).toEqual([
      ['32 / 40, under target', '118', '150'],
      ['0', '24', '24'],
      ['4 / 10, under target', '8', '12'],
      ['36 / 50, under target', '150 / 150', '186 / 200, under target'],
    ]);
    expect(within(table).getAllByRole('rowheader').map((h) => h.textContent)).toEqual(['US', 'EU', 'Latam', 'All']);
    const amber = (text: string) => within(table).getByText(text, { exact: false }).closest('td')?.className ?? '';
    expect(amber('4 / 10')).toContain('amber');
    expect(amber('150 / 150')).not.toContain('amber');
    expect(amber('118')).not.toContain('amber');
  });

  it('Bids for a person with one region and no targets', async () => {
    vi.mocked(api.getDayPlan).mockResolvedValue(day({
      bidsByRegion: [{ region: 'EU', self: 5, selfTarget: null, bidder: 20, total: 25 }],
      bidsTotals: { self: 5, selfTarget: null, bidder: 20, bidderTarget: null, total: 25, target: null },
    }) as never);
    show();
    const box = await card('Bids');
    const table = await within(box).findByRole('table', { name: 'Bids by region' });
    expect(half(box, 'Today')).toBe('Today25');
    expect(cells(table)).toEqual([['5', '20', '25'], ['5', '20', '25']]);
    expect(table.innerHTML).not.toContain('amber');
  });

  it("Bids on a past day: the half is headed by the date and shows that day's regions", async () => {
    byDate();
    show({ day: '2026-11-18' });
    const box = await card('Bids');
    const table = await within(box).findByRole('table', { name: 'Bids by region' });
    expect(half(box, 'Wed, Nov 18')).toBe('Wed, Nov 18130 of 200');
    expect(cells(table)).toEqual([['22 / 50, under target', '108', '130'], ['22 / 50, under target', '108 / 150, under target', '130 / 200, under target']]);
  });

  it('Bids, the week half: a bar per weekday that says its day, number and target, coloured green, amber and blue for today, with the target line', async () => {
    show({ day: '2026-11-18' });
    const box = await card('Bids');
    const bars = within(await within(box).findByRole('group', { name: 'Bids by weekday' })).getAllByRole('button');
    expect(half(box, 'This week')).toBe('This week988 of 1,000');
    expect(bars.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Mon, Nov 16: 219 bids, at or over the 200 target — show this day',
      'Tue, Nov 17: 278 bids, at or over the 200 target — show this day',
      'Wed, Nov 18: 130 bids, under the 200 target — show this day',
      'Thu, Nov 19: 175 bids, under the 200 target — show this day',
      'Fri, Nov 20, today: 186 bids, under the 200 target — show this day',
    ]);
    expect(bars.map((b) => b.textContent)).toEqual(['219', '278', '130', '175', '186']);
    const colour = (b: HTMLElement) => ['success', 'amber', 'sky'].find((c) => b.lastElementChild!.className.includes(c));
    expect(bars.map(colour)).toEqual(['success', 'success', 'amber', 'amber', 'sky']);
    expect(bars.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true', 'false', 'false']);
    expect(within(box).getByText('target 200 a day')).toBeTruthy();
    expect(within(box).getByText('Fri · today')).toBeTruthy();
    fireEvent.click(bars[1]);
    expect(onPickDay).toHaveBeenCalledWith('2026-11-17');
  });

  it('Bids bars: days still to come are disabled and say so; no target line when the days differ in target, and no colour without one', async () => {
    vi.mocked(api.getDashboardWeek).mockResolvedValue(week({ bids: { ...week().bids, byDay: byDay([219, 150, 130, 0, 0], [200, 200, null, 300, 300]) } }) as never);
    show({ today: '2026-11-18', day: '2026-11-17' });
    const box = await card('Bids');
    const bars = within(await within(box).findByRole('group', { name: 'Bids by weekday' })).getAllByRole('button') as HTMLButtonElement[];
    expect(bars.map((b) => [b.getAttribute('aria-label'), b.disabled])).toEqual([
      ['Mon, Nov 16: 219 bids, at or over the 200 target — show this day', false],
      ['Tue, Nov 17: 150 bids, under the 200 target — show this day', false],
      ['Wed, Nov 18, today: 130 bids — show this day', false],
      ['Thu, Nov 19: still to come', true],
      ['Fri, Nov 20: still to come', true],
    ]);
    expect(bars.map((b) => b.textContent)).toEqual(['219', '150', '130', '–', '–']);
    expect(within(box).queryByText(/target \d+ a day/)).toBeNull();
    fireEvent.click(bars[3]);
    expect(onPickDay).not.toHaveBeenCalled();
  });

  it('Bids, the week totals row: Self, Bidder and Total against their targets, amber under', async () => {
    show();
    const table = await within(await card('Bids')).findByRole('table', { name: 'Bids this week' });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['This week', 'Self', 'Bidder', 'Total']);
    expect(within(table).getByRole('rowheader').textContent).toBe('All regions');
    expect(cells(table)).toEqual([['204 / 250, under target', '784 / 750', '988 / 1,000, under target']]);
    expect(within(table).getByText('204 / 250', { exact: false }).closest('td')!.className).toContain('amber');
    expect(within(table).getByText('784 / 750').closest('td')!.className).not.toContain('amber');
  });

  it('Bids week totals without targets are plain numbers', async () => {
    vi.mocked(api.getDashboardWeek).mockResolvedValue(week({ bids: { ...week().bids, week: { self: 100, selfTarget: null, bidder: 100, bidderTarget: null, total: 200, target: null } } }) as never);
    show();
    const box = await card('Bids');
    expect(cells(await within(box).findByRole('table', { name: 'Bids this week' }))).toEqual([['100', '100', '200']]);
    expect(half(box, 'This week')).toBe('This week200');
  });

  it("Interviews, the day half: the rounds and how many are not marked, the day's rounds without buttons", async () => {
    show();
    const box = await card('Interviews');
    const list = await within(box).findByRole('list', { name: "Today's interviews" });
    expect(half(box, 'Today')).toBe('Today2 rounds · 1 not marked');
    const rounds = within(list).getAllByRole('listitem');
    expect(rounds[0].textContent).toContain('2:30 PM · superlinked · Backend · Self');
    expect(rounds[0].textContent).toContain('Completed ✓');
    expect(rounds[1].textContent).toContain('4:00 PM · Globex');
    expect(rounds[1].textContent).toContain('Ended 4:25 PM · not marked');
    expect(within(list).queryByRole('button')).toBeNull();
  });

  it("Interviews on a past day: that day's rounds under its date", async () => {
    byDate();
    show({ day: '2026-11-18' });
    const box = await card('Interviews');
    const list = await within(box).findByRole('list', { name: 'Interviews on Wed, Nov 18' });
    expect(half(box, 'Wed, Nov 18')).toBe('Wed, Nov 181 round · 0 not marked');
    expect(within(list).getByRole('listitem').textContent).toContain('Acme');
  });

  it('Interviews, the week half: held, canceled and still to come by weekday; a past round nobody marked says so in amber', async () => {
    show();
    const box = await card('Interviews');
    const table = await within(box).findByRole('table', { name: 'Interviews by weekday' });
    expect(half(box, 'This week')).toBe('This week6 held · 1 to come · 1 not marked');
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['What', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Week']);
    expect(within(table).getAllByRole('rowheader').map((h) => h.textContent)).toEqual(['Held', 'Canceled', 'Still to come']);
    expect(cells(table)).toEqual([
      ['1', '2', '0', '1', '2', '6'],
      ['0', '0', '1', '0', '0', '1'],
      ['–', '1 not marked', '–', '–', '1', '1'],
    ]);
    const stale = within(table).getByRole('cell', { name: 'Tue: 1 not marked' });
    expect(stale.className).toContain('amber');
    expect(within(within(box).getByRole('list', { name: 'Outcomes' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['1 passed', '1 rejected', '4 waiting for a result']);
    expect(within(box).getByRole('img').getAttribute('aria-label')).toBe('1 passed, 1 rejected, 4 waiting for a result');
  });

  it('Interviews in a past week: nothing is still to come, only what was never marked', async () => {
    const BEFORE = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'];
    const past = (scheduled: number[]) => week({ interviews: { ...week().interviews, byDay: BEFORE.map((date, i) => ({ date, held: 1, canceled: 0, scheduled: scheduled[i] })) } });
    vi.mocked(api.getDashboardWeek).mockResolvedValue(past([0, 1, 0, 0, 1]) as never);
    show({ day: '2026-11-11' });
    const box = await card('Interviews');
    const table = await within(box).findByRole('table', { name: 'Interviews by weekday' });
    expect(half(box, 'Week of Nov 9')).toBe('Week of Nov 96 held · 2 not marked');
    expect(cells(table)[2]).toEqual(['–', '1 not marked', '–', '–', '1 not marked', '2 not marked']);
    expect(within(table).getByRole('cell', { name: 'Week: 2 not marked' }).className).toContain('amber');
    vi.mocked(api.getDashboardWeek).mockResolvedValue(past([0, 0, 0, 0, 0]) as never);
    cleanup();
    show({ day: '2026-11-11' });
    expect(cells(await within(await card('Interviews')).findByRole('table', { name: 'Interviews by weekday' }))[2]).toEqual(['–', '–', '–', '–', '–', '–']);
  });

  it('the pipeline: how many are open, grouped by status, each group foldable', async () => {
    show();
    const box = await card('Interviews');
    const table = await within(box).findByRole('table', { name: 'Pipeline' });
    expect(half(box, 'Pipeline')).toBe('Pipeline6 open interviews');
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Company', 'Stage', 'Next / last round', 'Status']);
    // grouped by where each interview stands, each group a button that folds it; only Scheduled starts open
    const groups = () => within(table).getAllByRole('button').map((b) => [b.textContent!.replace(/^[▾▸] /, ''), b.getAttribute('aria-expanded')]);
    expect(groups()).toEqual([
      ['Scheduled (2)', 'true'], ['Waiting for a result (1)', 'false'], ['No result for a week or more (1)', 'false'],
      ['Followed up (1)', 'false'], ['Passed, next round not set (1)', 'false'],
    ]);
    expect(cells(table)).toEqual([['Final', 'today 11:00 PM', 'scheduled'], ['Panel', 'Mon, Nov 23', 'scheduled']]);
    fireEvent.click(within(table).getByRole('button', { name: 'No result for a week or more (1)' }));
    fireEvent.click(within(table).getByRole('button', { name: 'Waiting for a result (1)' }));
    fireEvent.click(within(table).getByRole('button', { name: 'Scheduled (2)' }));
    expect(cells(table)).toEqual([['Intro', 'today', 'waiting for a result'], ['Intro', 'Nov 12', 'no result for 8 days']]);
    expect(within(table).getAllByRole('rowheader').map((h) => h.textContent)).toEqual(['superlinked', 'Liberty']);
    expect(within(table).getByText('no result for 8 days').className).toContain('amber');
    expect(within(table).getByText('waiting for a result').className).not.toContain('amber');
    fireEvent.click(within(table).getByRole('button', { name: 'Followed up (1)' }));
    fireEvent.click(within(table).getByRole('button', { name: 'Passed, next round not set (1)' }));
    expect(cells(table).slice(2)).toEqual([['Intro', 'Oct 8', 'followed up Nov 13'], ['Tech round 1', 'Nov 17', 'passed, next round not set']]);
  });

  it('a pipeline group with no interviews is left out', async () => {
    vi.mocked(api.getInterviewPipeline).mockResolvedValue({ items: pipeline.slice(0, 2) } as never);
    show();
    const table = await within(await card('Interviews')).findByRole('table', { name: 'Pipeline' });
    expect(within(table).getAllByRole('button').map((b) => b.textContent!.replace(/^[▾▸] /, ''))).toEqual(['Scheduled (2)']);
  });

  it('Interviews with none that day and nothing in the pipeline', async () => {
    vi.mocked(api.getDayPlan).mockResolvedValue(day({ todayInterviews: [], interviewsMarked: { marked: 0, total: 0 } }) as never);
    vi.mocked(api.getInterviewPipeline).mockResolvedValue({ items: [pipe()] } as never);
    show();
    const box = await card('Interviews');
    expect(await within(box).findByText('None today.')).toBeTruthy();
    expect(half(box, 'Today')).toBe('Today0 rounds · 0 not marked');
    await within(box).findByRole('table', { name: 'Pipeline' });
    expect(half(box, 'Pipeline')).toBe('Pipeline1 open interview');
    vi.mocked(api.getInterviewPipeline).mockResolvedValue({ items: [] } as never);
    cleanup();
    show({ day: '2026-11-18' });
    const again = await card('Interviews');
    expect(await within(again).findByText('None on Wed, Nov 18.')).toBeTruthy();
    expect(await within(again).findByText('Nothing in the pipeline.')).toBeTruthy();
  });

  it('Daily to-dos: the day and week totals over the routines grid, read-only', async () => {
    show();
    const box = await card('Daily to-dos');
    expect(await within(box).findByText('1 of 3 today · 12 of 15 this week')).toBeTruthy();
    const table = within(box).getByRole('table', { name: 'Routines this week' });
    expect(within(table).getByRole('rowheader').textContent).toBe('Caller Manage');
    expect(within(table).getByRole('cell', { name: 'Wed: missed' }).textContent).toBe('✗');
    expect(within(table).getByText('3 of 5 days')).toBeTruthy();
    expect(within(box).getByText(/✓ done · ✗ missed/)).toBeTruthy();
    expect(within(box).queryByRole('checkbox')).toBeNull();
    expect(within(box).queryByRole('spinbutton')).toBeNull();
  });

  it("Daily to-dos: a weekday's column head picks that day; days still to come cannot be picked", async () => {
    show({ today: '2026-11-19', day: '2026-11-18' });
    const box = await card('Daily to-dos');
    expect(await within(box).findByText('1 of 3 on Wed, Nov 18 · 12 of 15 this week')).toBeTruthy();
    const heads = within(box).getAllByRole('button') as HTMLButtonElement[];
    expect(heads.map((b) => [b.getAttribute('aria-label'), b.textContent, b.disabled])).toEqual([
      ['Mon, Nov 16 — show this day', 'Mon', false], ['Tue, Nov 17 — show this day', 'Tue', false], ['Wed, Nov 18 — show this day', 'Wed', false],
      ['Thu, Nov 19 — show this day', 'Thu', false], ['Fri, Nov 20: still to come', 'Fri', true],
    ]);
    fireEvent.click(heads[0]);
    expect(onPickDay).toHaveBeenCalledWith('2026-11-16');
  });

  it('Daily to-dos and Weekly goals in a past week say which week and count no days left', async () => {
    show({ day: '2026-11-11' });
    expect(await within(await card('Daily to-dos')).findByText('1 of 3 on Wed, Nov 11 · 12 of 15 in the week of Nov 9')).toBeTruthy();
    expect(await within(await card('Weekly goals')).findByText('1 of 3 done')).toBeTruthy();
  });

  it('Weekly goals: read-only rows with a count and its bar, not yet, or done with its day', async () => {
    show();
    const box = await card('Weekly goals');
    expect(await within(box).findByText('1 of 3 done · last day')).toBeTruthy();
    const [count, open, done] = within(box).getAllByRole('listitem');
    expect(count.textContent).toContain('Citizen Contact120 / 250');
    expect(within(count).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('48');
    expect(open.textContent).toBe('Company Onboardingnot yet');
    expect(done.textContent).toBe('Update promptsdone Wed');
    const boxes = within(box).getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes.map((b) => [b.getAttribute('aria-label'), b.checked, b.disabled])).toEqual([
      ['Citizen Contact', false, true], ['Company Onboarding', false, true], ['Update prompts', true, true],
    ]);
    expect(within(box).queryByRole('spinbutton')).toBeNull();
  });

  it("Pending items in admin mode: named for the person, today's unmarked round included, no follow-up checkbox, groups that fold", async () => {
    show();
    const box = await screen.findByRole('group', { name: /Pending items/ });
    expect(within(box).getByRole('heading', { name: 'Pending items (2)' })).toBeTruthy();
    expect(within(box).getByText('Things waiting on Puma')).toBeTruthy();
    expect(box.textContent).toContain('Status unknownGlobex · Tech round 1 · ended today 4:25 PM, not marked');
    expect(within(box).queryByRole('checkbox')).toBeNull();
    fireEvent.click(within(box).getByRole('button', { name: 'Interviews (2)' }));
    expect(within(box).queryByRole('list')).toBeNull();
  });

  it("looking at a past day, Pending still shows how things stand now: today's unmarked round, not that day's rounds", async () => {
    byDate();
    show({ day: '2026-11-18' });
    const box = await screen.findByRole('group', { name: /Pending items/ });
    expect(await within(box).findByRole('heading', { name: 'Pending items (2)' })).toBeTruthy();
    expect(box.textContent).toContain('Globex · Tech round 1 · ended today 4:25 PM, not marked');
    expect(box.textContent).not.toContain('Acme');
    expect(await within(await tile('Pending')).findByText('2')).toBeTruthy();
  });

  it("an admin's result button sends what the Interviews page sends, then the person's reads and the list are refetched", async () => {
    vi.mocked(api.updateInterviewStage).mockResolvedValue({} as never);
    show();
    const box = await screen.findByRole('group', { name: /Pending items/ });
    fireEvent.click(within(box).getByRole('button', { name: 'Completed' }));
    await waitFor(() => expect(api.updateInterviewStage).toHaveBeenCalledWith('iv-b', 'r-b', { status: 'completed' }));
    await waitFor(() => expect(api.getDayPlan).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(api.getDashboardPending).toHaveBeenCalledTimes(2));
    expect(api.getInterviewPipeline).toHaveBeenCalledTimes(2);
    expect(api.getDashboardWeek).toHaveBeenCalledTimes(2);
    expect(api.putDayProgress).not.toHaveBeenCalled();
    expect(api.followUpInterviewStage).not.toHaveBeenCalled();
  });

  it('a failed pipeline read leaves the rest of the page standing, with a retry', async () => {
    vi.mocked(api.getInterviewPipeline).mockRejectedValueOnce(new Error('500'));
    show();
    const box = await card('Interviews');
    expect(await within(box).findByText(/Couldn.t load the pipeline/)).toBeTruthy();
    expect(await within(box).findByText('2 rounds · 1 not marked')).toBeTruthy();
    expect(within(await card('Bids')).getByRole('table', { name: 'Bids by region' })).toBeTruthy();
    expect(within(await card('Daily to-dos')).getByRole('table')).toBeTruthy();
    expect(screen.getByRole('group', { name: /Pending items/ })).toBeTruthy();
    fireEvent.click(within(box).getByRole('button', { name: 'Retry' }));
    expect(await within(box).findByRole('table', { name: 'Pipeline' })).toBeTruthy();
  });

  it('a failed pending read leaves the page standing; the tile says so', async () => {
    vi.mocked(api.getDashboardPending).mockRejectedValue(new Error('500'));
    vi.mocked(api.getNeedsInput).mockRejectedValue(new Error('500'));
    show();
    expect(await within(await card('Bids')).findByRole('table', { name: 'Bids by region' })).toBeTruthy();
    expect(within(await card('Weekly goals')).getAllByRole('listitem')).toHaveLength(3);
    expect(await within(await tile('Pending')).findByText(/Couldn.t load the pending items/)).toBeTruthy();
  });

  it('a failed week read: the day parts still show, the week parts say so', async () => {
    vi.mocked(api.getDashboardWeek).mockRejectedValue(new Error('500'));
    show();
    const todos = await card('Daily to-dos');
    expect(await within(todos).findByText('1 of 3 today')).toBeTruthy();
    expect(within(todos).getByText(/Couldn.t load the week/)).toBeTruthy();
    const bids = await card('Bids');
    expect(half(bids, 'Today')).toBe('Today186 of 200');
    expect(within(bids).getByText(/Couldn.t load the week/)).toBeTruthy();
    expect(within(bids).queryByRole('group', { name: 'Bids by weekday' })).toBeNull();
    expect(within(await tile('Bids this week')).getByText(/Couldn.t load the week/)).toBeTruthy();
    expect((await tile('Bids today')).textContent).toContain('186 of 200');
  });

  it('a failed day read says so with a retry; the week and the pipeline still show', async () => {
    vi.mocked(api.getDayPlan).mockRejectedValue(new Error('500'));
    show();
    const bids = await card('Bids');
    expect(await within(bids).findByText(/Couldn.t load the day/)).toBeTruthy();
    expect(await within(bids).findByRole('group', { name: 'Bids by weekday' })).toBeTruthy();
    expect(await within(await card('Interviews')).findByRole('table', { name: 'Pipeline' })).toBeTruthy();
    expect(await within(await card('Daily to-dos')).findByRole('table')).toBeTruthy();
    expect(within(await tile('Bids today')).getByText(/Couldn.t load the day/)).toBeTruthy();
  });

  it('an old day response without the new fields: totals from what it has, no region table, no rounds list', async () => {
    vi.mocked(api.getDayPlan).mockResolvedValue(oldDay() as never);
    show();
    const box = await card('Bids');
    expect(await within(box).findByText('186 of 200')).toBeTruthy();
    expect(within(box).queryByRole('table', { name: 'Bids by region' })).toBeNull();
    expect((await tile('Bids today')).textContent).toBe('Bids today186 of 20014 to go · self 36 · bidder 150');
    const ivs = await card('Interviews');
    expect(await within(ivs).findByText('6 open interviews')).toBeTruthy();
    expect(within(ivs).queryByRole('list', { name: "Today's interviews" })).toBeNull();
  });

  it('an old week response: no week totals row and no weekday table; the totals come from what it has and the outcome bar still shows', async () => {
    vi.mocked(api.getDashboardWeek).mockResolvedValue(oldWeek() as never);
    show();
    const bids = await card('Bids');
    await within(bids).findByRole('group', { name: 'Bids by weekday' });
    expect(half(bids, 'This week')).toBe('This week1,010 of 1,000');
    expect(within(bids).queryByRole('table', { name: 'Bids this week' })).toBeNull();
    expect((await tile('Bids this week')).textContent).toBe('Bids this week1,010 of 1,000target reached · last day of the week');
    const ivs = await card('Interviews');
    expect(half(ivs, 'This week')).toBe('This week6 held · 2 to come');
    expect(within(ivs).queryByRole('table', { name: 'Interviews by weekday' })).toBeNull();
    expect(within(within(ivs).getByRole('list', { name: 'Outcomes' })).getAllByRole('listitem')).toHaveLength(3);
    expect((await tile('Interviews this week')).textContent).toBe('Interviews this week6 held · 2 still to come1 passed · 1 rejected · 4 waiting · 1 canceled');
  });

  it('a week response older still, without outcomes or days: the held count only', async () => {
    const w = oldWeek();
    const { outcomes: _o, ...interviews } = w.interviews;
    const { byDay: _b, ...bids } = w.bids;
    vi.mocked(api.getDashboardWeek).mockResolvedValue({ ...w, bids, interviews, routines: { done: 12, expected: 15 } } as never);
    show();
    expect(await within(await tile('Interviews this week')).findByText('6')).toBeTruthy();
    expect((await tile('Interviews this week')).textContent).toBe('Interviews this week6 held');
    expect(within(await card('Bids')).queryByRole('group', { name: 'Bids by weekday' })).toBeNull();
    expect(within(await card('Interviews')).queryByRole('img')).toBeNull();
    expect(within(await card('Daily to-dos')).getByText('No daily to-dos this week.')).toBeTruthy();
  });
});
