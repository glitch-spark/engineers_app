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
const week = (o: object = {}) => ({
  week: { start: '2026-11-16', end: '2026-11-21' },
  bids: { self: 0, bidder: 0, total: 988, target: 1000, pace: null, percentile: null, byDay: DATES.map((date, i) => ({ date, done: [219, 278, 130, 237, 124][i], target: 200 })) },
  interviews: { done: 5, self: 0, caller: 0, target: 10, pace: null, percentile: null },
  stages: [], streak: 0, hasWeeklyPlan: true, weeklyGoals: [],
  routines: { done: 12, expected: 15, rows: [
    { id: 'r1', text: 'Caller Manage', doneDays: 3, totalDays: 5, days: DATES.map((date, i) => ({ date, state: ['done', 'done', 'missed', 'done', 'today'][i], value: null, target: null })) },
  ] }, ...o,
});
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

const show = (props: object = {}) => render(
  <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
    <MemoryRouter><PersonPage userId="u7" name="Puma" day="2026-11-20" today="2026-11-20" {...props} /></MemoryRouter>
  </SWRConfig>,
);
const card = (name: string) => screen.findByRole('region', { name });
const cells = (table: HTMLElement) => within(table).getAllByRole('row').map((r) => within(r).queryAllByRole('cell').map((x) => x.textContent)).filter((r) => r.length > 1); // a one-cell row is a group heading

describe('PersonPage', () => {
  it("asks every read for that person, and the day's reads for the day shown", async () => {
    show({ day: '2026-11-19' });
    await card('Bids');
    expect(api.getDayPlan).toHaveBeenCalledWith('2026-11-19', 'u7');
    expect(api.getDashboardWeek).toHaveBeenCalledWith({ userId: 'u7', today: '2026-11-20' });
    expect(api.getInterviewPipeline).toHaveBeenCalledWith('u7');
    await waitFor(() => expect(api.getDashboardPending).toHaveBeenCalledWith('u7'));
  });

  it('Bids: the day, the region table with under-target numbers in amber, then the week and its days', async () => {
    show();
    const box = await card('Bids');
    expect(await within(box).findByText('186 of 200 today · 14 to go')).toBeTruthy();
    const table = within(box).getByRole('table', { name: 'Bids by region' });
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
    expect(await within(box).findByText('This week · 988 of 1,000')).toBeTruthy();
    expect(within(box).getAllByRole('listitem').map((li) => li.textContent)).toEqual(
      ['219Mon', '278Tue', '130Wed, under target', '237Thu', '124Fri · today, under target'],
    );
  });

  it('Bids for a person with one region and no targets', async () => {
    vi.mocked(api.getDayPlan).mockResolvedValue(day({
      bidsByRegion: [{ region: 'EU', self: 5, selfTarget: null, bidder: 20, total: 25 }],
      bidsTotals: { self: 5, selfTarget: null, bidder: 20, bidderTarget: null, total: 25, target: null },
    }) as never);
    show();
    const box = await card('Bids');
    expect(await within(box).findByText('25 today')).toBeTruthy();
    expect(cells(within(box).getByRole('table', { name: 'Bids by region' }))).toEqual([['5', '20', '25'], ['5', '20', '25']]);
    expect(within(box).getByRole('table').innerHTML).not.toContain('amber');
  });

  it('Bids for yesterday says so and has nothing "to go"', async () => {
    show({ day: '2026-11-19' });
    expect(await within(await card('Bids')).findByText('186 of 200 yesterday')).toBeTruthy();
  });

  it("Interviews: the summary, the day's rounds without buttons, and the pipeline with each status in words", async () => {
    show();
    const box = await card('Interviews');
    expect(await within(box).findByText('2 today · 1 not marked · 6 in pipeline')).toBeTruthy();
    const rounds = within(within(box).getByRole('list', { name: "Today's interviews" })).getAllByRole('listitem');
    expect(rounds[0].textContent).toContain('2:30 PM · superlinked · Backend · Self');
    expect(rounds[0].textContent).toContain('Completed ✓');
    expect(rounds[1].textContent).toContain('4:00 PM · Globex');
    expect(rounds[1].textContent).toContain('Ended 4:25 PM · not marked');
    expect(within(within(box).getByRole('list', { name: "Today's interviews" })).queryByRole('button')).toBeNull();
    expect(within(box).getByText('In pipeline (6)')).toBeTruthy();
    const table = within(box).getByRole('table', { name: 'In pipeline' });
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
    const table = await within(await card('Interviews')).findByRole('table', { name: 'In pipeline' });
    expect(within(table).getAllByRole('button').map((b) => b.textContent!.replace(/^[▾▸] /, ''))).toEqual(['Scheduled (2)']);
  });

  it('Interviews with none that day and nothing in the pipeline', async () => {
    vi.mocked(api.getDayPlan).mockResolvedValue(day({ todayInterviews: [], interviewsMarked: { marked: 0, total: 0 } }) as never);
    vi.mocked(api.getInterviewPipeline).mockResolvedValue({ items: [] } as never);
    show();
    const box = await card('Interviews');
    expect(await within(box).findByText('0 today · 0 not marked · 0 in pipeline')).toBeTruthy();
    expect(within(box).getByText('None today.')).toBeTruthy();
    expect(within(box).getByText('Nothing in the pipeline.')).toBeTruthy();
  });

  it('Daily to-dos: the week and day totals over the routines grid, read-only', async () => {
    show();
    const box = await card('Daily to-dos');
    expect(await within(box).findByText('12 of 15 this week · 1 of 3 today')).toBeTruthy();
    const table = within(box).getByRole('table', { name: 'Routines this week' });
    expect(within(table).getByRole('rowheader').textContent).toBe('Caller Manage');
    expect(within(table).getByRole('cell', { name: 'Wed: missed' }).textContent).toBe('✗');
    expect(within(table).getByText('3 of 5 days')).toBeTruthy();
    expect(within(box).getByText(/✓ done · ✗ missed/)).toBeTruthy();
    expect(within(box).queryByRole('checkbox')).toBeNull();
    expect(within(box).queryByRole('spinbutton')).toBeNull();
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

  it("Pending items in admin mode: named for the person, today's unmarked round included, no follow-up checkbox", async () => {
    show();
    const box = await screen.findByRole('group', { name: /Pending items/ });
    expect(within(box).getByRole('heading', { name: 'Pending items (2)' })).toBeTruthy();
    expect(within(box).getByText('Things waiting on Puma')).toBeTruthy();
    expect(box.textContent).toContain('Status unknownGlobex · Tech round 1 · ended today 4:25 PM, not marked');
    expect(within(box).queryByRole('checkbox')).toBeNull();
  });

  it("looking at yesterday, that day's rounds are not listed as ended today", async () => {
    show({ day: '2026-11-19' });
    const box = await screen.findByRole('group', { name: /Pending items/ });
    expect(within(box).getByRole('heading', { name: 'Pending items (1)' })).toBeTruthy();
    expect(box.textContent).not.toContain('ended today');
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
    expect(await within(box).findByText('2 today · 1 not marked')).toBeTruthy();
    expect(within(await card('Bids')).getByRole('table', { name: 'Bids by region' })).toBeTruthy();
    expect(within(await card('Daily to-dos')).getByRole('table')).toBeTruthy();
    expect(screen.getByRole('group', { name: /Pending items/ })).toBeTruthy();
    fireEvent.click(within(box).getByRole('button', { name: 'Retry' }));
    expect(await within(box).findByRole('table', { name: 'In pipeline' })).toBeTruthy();
  });

  it('a failed pending read leaves the page standing', async () => {
    vi.mocked(api.getDashboardPending).mockRejectedValue(new Error('500'));
    vi.mocked(api.getNeedsInput).mockRejectedValue(new Error('500'));
    show();
    expect(await within(await card('Bids')).findByRole('table', { name: 'Bids by region' })).toBeTruthy();
    expect(within(await card('Weekly goals')).getAllByRole('listitem')).toHaveLength(3);
  });

  it('a failed week read: the day parts still show', async () => {
    vi.mocked(api.getDashboardWeek).mockRejectedValue(new Error('500'));
    show();
    const todos = await card('Daily to-dos');
    expect(await within(todos).findByText('1 of 3 today')).toBeTruthy();
    expect(within(todos).getByText(/Couldn.t load the week/)).toBeTruthy();
    expect(within(await card('Bids')).getByText('186 of 200 today · 14 to go')).toBeTruthy();
    expect(within(await card('Bids')).queryByText(/This week/)).toBeNull();
  });

  it('a failed day read says so with a retry; the week and the pipeline still show', async () => {
    vi.mocked(api.getDayPlan).mockRejectedValue(new Error('500'));
    show();
    expect(await within(await card('Bids')).findByText(/Couldn.t load the day/)).toBeTruthy();
    expect(await within(await card('Bids')).findByText('This week · 988 of 1,000')).toBeTruthy();
    expect(await within(await card('Interviews')).findByRole('table', { name: 'In pipeline' })).toBeTruthy();
    expect(await within(await card('Daily to-dos')).findByRole('table')).toBeTruthy();
  });

  it('an old day response without the new fields: totals from what it has, no region table, no rounds list', async () => {
    vi.mocked(api.getDayPlan).mockResolvedValue(oldDay() as never);
    show();
    const box = await card('Bids');
    expect(await within(box).findByText('186 of 200 today · 14 to go')).toBeTruthy();
    expect(within(box).queryByRole('table')).toBeNull();
    const ivs = await card('Interviews');
    expect(await within(ivs).findByText('6 in pipeline')).toBeTruthy();
    expect(within(ivs).queryByRole('list', { name: "Today's interviews" })).toBeNull();
  });
});
