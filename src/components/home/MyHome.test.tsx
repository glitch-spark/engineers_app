// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SWRConfig, unstable_serialize } from 'swr';
import * as api from '../../api/endpoints';
import MyHome from './MyHome';

vi.mock('../../api/endpoints', async (orig) => ({ ...(await orig<object>()),
  getDayPlan: vi.fn(), putDayProgress: vi.fn(), getDashboardWeek: vi.fn(), getInterviewPipeline: vi.fn(), getNeedsInput: vi.fn(), getDashboardPending: vi.fn(), followUpInterviewStage: vi.fn(), updateInterviewStage: vi.fn(),
}));
const auth = vi.hoisted(() => ({ role: 'staff' }));
vi.mock('../../lib/useInterviewTimezone', () => ({ useInterviewTimezone: () => ({ tz: 'America/Chicago' }) }));
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'me', role: auth.role } }) }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-11-18T19:00:00-06:00'));
  auth.role = 'staff';
  vi.mocked(api.getNeedsInput).mockResolvedValue({ items: [], counts: {} } as never);
  vi.mocked(api.getInterviewPipeline).mockResolvedValue({ items: [] } as never);
  vi.mocked(api.getDashboardWeek).mockResolvedValue(week() as never);
  vi.mocked(api.getDashboardPending).mockResolvedValue({ interviews: [], profiles: [], bidders: [], counts: {} } as never);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); });

const c = { bidsSelf: 0, bidsSelfUs: 0, bidsSelfEu: 0, bidsSelfLatam: 0, bidsBidder: 0, interviewsSelf: 0, interviewsCaller: 0 };
const item = (o: object) => ({ text: 't', kind: 'check', target: null, archived: false, scope: 'routine', result: null, ...o });
const plan = (o: object = {}) => ({
  date: '2026-11-18', exists: true, userId: 'u1', weekSaved: true,
  targets: { ...c, bidsSelf: 80, bidsBidder: 120, interviewsSelf: 1, interviewsCaller: 1 },
  items: [
    item({ id: 'r1', text: 'Bidder Management' }),
    item({ id: 'r2', text: 'Email outreach', kind: 'count', target: 50, result: { done: false, value: 10, target: 50 } }),
  ],
  progress: {}, focus: [], done: { ...c, bidsSelf: 52 }, bidsBidderAuto: 86,
  interviews: { self: 1, caller: 1, stages: { self: {}, caller: {} } },
  notes: '', loggedAt: null, submitted: false, profiles: [], ...o,
});

/** A round of today (Nov 18, Chicago): Acme at 10:00 AM, held and marked completed. */
const iv = (o: object = {}) => ({
  interviewId: 'iv-a', roundId: 'r-a', companyName: 'Acme', profileName: 'Backend profile', stage: 'tech1', status: 'completed', state: 'completed',
  scheduledAt: '2026-11-18T16:00:00Z', endsAt: '2026-11-18T16:45:00Z', rescheduledTo: null,
  who: { kind: 'self', name: null, assigned: false, confirmed: false },
  steps: [{ stage: 'intro', state: 'passed' }, { stage: 'tech1', state: 'today' }], ...o,
});

const DATES = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'];
/** The week of Nov 16 (today is Wed, Nov 18). */
const week = (o: object = {}) => ({
  week: { start: '2026-11-16', end: '2026-11-21' },
  bids: {
    self: 440, bidder: 494, total: 934, target: 2100, pace: null, percentile: null,
    byDay: DATES.map((date, i) => ({ date, done: [410, 380, 124, 0, 0][i], target: 400, self: 0, bidder: 0 })),
    week: { self: 440, selfTarget: 1000, bidder: 474, bidderTarget: 1000, total: 914, target: 2000 },
  },
  interviews: { done: 3, self: 2, caller: 1, target: 4, pace: null, percentile: null, rounds: [] },
  stages: [], streak: 0, hasWeeklyPlan: true, routines: { done: 0, expected: 0, rows: [] }, weeklyGoals: [], ...o,
});
const head = (name: RegExp) => screen.getByRole('heading', { name }).parentElement?.textContent;

let cache = new Map<string, unknown>();
let unmountCard = () => {};
function setup(p: object) {
  cache = new Map();
  vi.mocked(api.getDayPlan).mockResolvedValue(p as never);
  vi.mocked(api.putDayProgress).mockResolvedValue(p as never);
  const ui = (card: boolean) => (
    <SWRConfig value={{ provider: () => cache as never }}>
      <MemoryRouter>{card && <MyHome />}</MemoryRouter>
    </SWRConfig>
  );
  const { rerender } = render(ui(true));
  unmountCard = () => rerender(ui(false)); // keep the SWR provider, drop only the card (as navigating away does)
}

describe('MyHome', () => {
  it('ticking a routine saves a draft once after the pause', async () => {
    setup(plan());
    fireEvent.click(await screen.findByLabelText('Bidder Management'));
    await act(async () => { vi.advanceTimersByTime(799); });
    expect(api.putDayProgress).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(api.putDayProgress).toHaveBeenCalledTimes(1);
    expect(api.putDayProgress).toHaveBeenCalledWith('2026-11-18', { results: { r1: { done: true, value: null } } });
  });

  it('debounces and reverts on failure', async () => {
    setup(plan());
    const input = (await screen.findByLabelText('Email outreach')) as HTMLInputElement;
    vi.mocked(api.putDayProgress).mockRejectedValueOnce(new Error('boom'));
    fireEvent.change(input, { target: { value: '3' } });
    await act(async () => { vi.advanceTimersByTime(300); });
    fireEvent.change(input, { target: { value: '31' } });
    await act(async () => { vi.advanceTimersByTime(800); });
    expect(api.putDayProgress).toHaveBeenCalledTimes(1);
    expect(api.putDayProgress).toHaveBeenLastCalledWith('2026-11-18', { results: { r2: { done: false, value: 31 } } });
    expect(input.value).toBe('10');
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    await act(async () => {});
    expect(api.putDayProgress).toHaveBeenCalledTimes(2);
    expect(api.putDayProgress).toHaveBeenLastCalledWith('2026-11-18', { results: { r2: { done: false, value: 31 } } });
  });

  it('read-only without a saved week', async () => {
    setup(plan({ weekSaved: false }));
    expect(((await screen.findByLabelText('Bidder Management')) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByRole('link', { name: "Set this week's plan" }).getAttribute('href')).toBe('/plans');
  });

  it('keeps archived routines only with a result, and disables them', async () => {
    setup(plan({ items: [
      item({ id: 'a1', text: 'Old with result', archived: true, result: { done: false, value: null, target: null } }),
      item({ id: 'a2', text: 'Old without result', archived: true }),
    ] }));
    expect(((await screen.findByLabelText(/Old with result/)) as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByText('Old without result')).toBeNull();
  });

  it('flushes a pending edit on unmount', async () => {
    setup(plan());
    fireEvent.click(await screen.findByLabelText('Bidder Management'));
    unmountCard();
    expect(api.putDayProgress).toHaveBeenCalledTimes(1);
    expect(api.putDayProgress).toHaveBeenCalledWith('2026-11-18', { results: { r1: { done: true, value: null } } });
  });

  it('unmount flush refreshes the Daily plan cache with the saved plan', async () => {
    setup(plan());
    fireEvent.click(await screen.findByLabelText('Bidder Management'));
    const saved = plan({ notes: 'fresh' });
    vi.mocked(api.putDayProgress).mockResolvedValue(saved as never);
    unmountCard();
    await act(async () => {});
    const entry = cache.get(unstable_serialize(['day-plan', '2026-11-18', 'me'])) as { data: unknown } | undefined;
    expect(entry?.data).toBe(saved);
  });

  it('logs a failed unmount flush', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    setup(plan());
    fireEvent.click(await screen.findByLabelText('Bidder Management'));
    vi.mocked(api.putDayProgress).mockRejectedValue(new Error('boom'));
    unmountCard();
    await act(async () => {});
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('refetches the week and the pending items after a save', async () => {
    setup(plan());
    fireEvent.click(await screen.findByLabelText('Bidder Management'));
    await act(async () => { vi.advanceTimersByTime(800); });
    await waitFor(() => expect(api.getDashboardWeek).toHaveBeenCalledTimes(2));
    expect(api.getDashboardWeek).toHaveBeenCalledWith({ today: '2026-11-18' });
    expect(api.getDashboardPending).toHaveBeenCalledTimes(2);
    expect(api.getDayPlan).toHaveBeenCalledTimes(1); // the save's answer is the day
  });

  it('shows a skeleton while loading and a retry on error', async () => {
    vi.mocked(api.getDayPlan).mockRejectedValue(new Error('boom'));
    cache = new Map();
    render(
      <SWRConfig value={{ provider: () => cache as never, shouldRetryOnError: false }}>
        <MemoryRouter><MyHome /></MemoryRouter>
      </SWRConfig>,
    );
    expect(document.querySelector('.skeleton')).toBeTruthy();
    expect(await screen.findByText(/Couldn.t load today/)).toBeTruthy();
    vi.mocked(api.getDayPlan).mockResolvedValue(plan() as never);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect((await screen.findByRole('list', { name: 'Daily' })).textContent).toContain('138 of 200 · self 52 / 80 · bidder 86 / 120');
  });

  it('has no chips and no update links', async () => {
    setup(plan());
    await screen.findByLabelText('Bidder Management');
    expect(screen.queryByText(/· auto/)).toBeNull();
    expect(screen.queryByText('Write my update')).toBeNull();
    expect(screen.queryByText('edit')).toBeNull();
  });

  const goals = () => plan({
    items: [
      item({ id: 'r1', text: 'Routine A', result: { done: true, value: null, target: null } }),
      item({ id: 'r2', text: 'Routine B' }),
      item({ id: 'r3', text: 'Routine C' }),
      item({ id: 'g1', text: 'Goal one', scope: 'goal' }),
      item({ id: 'g2', text: 'Goal two', scope: 'goal' }),
    ],
    focus: ['g1'],
    progress: {
      g1: { value: 0, done: false, target: null, doneOn: null },
      g2: { value: 0, done: false, target: null, doneOn: null },
    },
  });

  it('lists every weekly goal, not only focus', async () => {
    setup(goals());
    expect(await screen.findByLabelText(/Goal one/)).toBeTruthy();
    expect(screen.getByLabelText(/Goal two/)).toBeTruthy();
  });

  it('the headers count: today the rows with a box and what is left, the week its goals and the days left', async () => {
    setup(goals());
    await screen.findByLabelText(/Goal one/);
    // The Bids row (under its target) and the three routines; the old response has no Interviews box.
    expect(head(/^Today/)).toBe('Today · Wed, Nov 181 of 4 done · 3 to go');
    expect(head(/^This week/)).toBe('This week · Nov 16 – Nov 200 of 2 done · 3 days left');
    expect(screen.getByText('Weekly goals').parentElement?.textContent).toBe('Weekly goals · 0 of 2 done');
  });

  it('This week: the read-only table sits above the weekly goals', async () => {
    setup(goals());
    const table = await screen.findByRole('table', { name: 'This week' });
    expect(within(table).getByRole('rowheader', { name: 'Bids' })).toBeTruthy();
    const goal = screen.getByLabelText(/Goal one/);
    expect(table.compareDocumentPosition(goal) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(table.closest('section')).toBe(goal.closest('section'));
    expect(screen.queryByRole('radio')).toBeNull(); // no Week / Day picker
    expect(screen.queryByText(/This month/)).toBeNull();
  });

  it('a week that cannot be read: a retry in its card, today and the goals still work', async () => {
    vi.mocked(api.getDashboardWeek).mockRejectedValue(new Error('boom'));
    cache = new Map();
    vi.mocked(api.getDayPlan).mockResolvedValue(goals() as never);
    render(
      <SWRConfig value={{ provider: () => cache as never, shouldRetryOnError: false }}>
        <MemoryRouter><MyHome /></MemoryRouter>
      </SWRConfig>,
    );
    expect(await screen.findByText(/Couldn.t load this week/)).toBeTruthy();
    expect(screen.getByLabelText(/Goal one/)).toBeTruthy();
    expect(head(/^This week/)).toContain('This week · Nov 16 – Nov 20');
    expect(screen.queryByText(/this week \d/)).toBeNull();
    vi.mocked(api.getDashboardWeek).mockResolvedValue(week() as never);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('table', { name: 'This week' })).toBeTruthy();
  });

  it('unticks a goal done on an earlier day on that day', async () => {
    const p = goals() as ReturnType<typeof goals> & { progress: Record<string, unknown>; items: unknown[] };
    p.progress.g1 = { value: 0, done: true, target: null, doneOn: '2026-11-16' };
    setup(p);
    await screen.findByLabelText(/Goal one/);
    expect(head(/^This week/)).toContain('1 of 2 done');
    expect(screen.getByText('done Mon')).toBeTruthy();
    const box = screen.getByLabelText(/Goal one/) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    await act(async () => {});
    expect(api.putDayProgress).toHaveBeenCalledTimes(1);
    expect(api.putDayProgress).toHaveBeenCalledWith('2026-11-16', { results: { g1: { done: false } } });
  });

  const logGoal = (progress: object) => {
    const p = goals() as ReturnType<typeof goals> & { progress: Record<string, unknown>; items: unknown[]; profiles: unknown[] };
    p.items[3] = item({ id: 'g1', text: 'Profile review', scope: 'goal', kind: 'log' }) as never;
    p.progress.g1 = progress;
    p.profiles = [{ id: 'p1', name: 'Anna', region: null, archived: false }] as never;
    return p;
  };

  it('a log draft save drops blank rows and trims notes', async () => {
    setup(logGoal({ value: 0, done: false, target: null, doneOn: null }));
    await screen.findByText('Profile review');
    fireEvent.click(screen.getByRole('button', { name: /add profile/i }));
    fireEvent.change(screen.getByLabelText('What changed 1'), { target: { value: ' New title ' } });
    fireEvent.click(screen.getByRole('button', { name: /add profile/i }));
    await act(async () => { vi.advanceTimersByTime(800); });
    expect(api.putDayProgress).toHaveBeenLastCalledWith('2026-11-18', {
      results: { g1: { done: true, value: null, entries: [{ profileId: 'p1', note: 'New title' }] } },
    });
  });

  it('editing a log goal done on an earlier day saves today and never un-ticks', async () => {
    setup(logGoal({ value: 0, done: true, target: null, doneOn: '2026-11-16' }));
    await screen.findByText('Profile review');
    expect(screen.getByText('done Mon')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /add profile/i }));
    fireEvent.change(screen.getByLabelText('What changed 1'), { target: { value: 'Retitled' } });
    await act(async () => { vi.advanceTimersByTime(800); });
    expect(api.putDayProgress).toHaveBeenCalledTimes(1);
    expect(api.putDayProgress).toHaveBeenCalledWith('2026-11-18', {
      results: { g1: { done: true, value: null, entries: [{ profileId: 'p1', note: 'Retitled' }] } },
    });
  });

  const textChoice = (progress: object = {}) => {
    const p = goals() as ReturnType<typeof goals> & { progress: Record<string, unknown>; items: unknown[] };
    p.items[3] = item({ id: 'g1', text: 'Mood', scope: 'goal', kind: 'choice', options: ['Good', 'Bad'] }) as never;
    p.items.push(item({ id: 'r9', text: 'Blockers', kind: 'text', options: [] }));
    p.progress.g1 = progress;
    return p;
  };

  it('a half-typed text answer is saved by the debounce, trimmed', async () => {
    setup(textChoice({ value: 0, done: false, target: null, doneOn: null }));
    await screen.findByText('Blockers');
    fireEvent.change(screen.getByLabelText('Blockers answer'), { target: { value: 'waiting' } });
    await act(async () => { vi.advanceTimersByTime(800); });
    expect(api.putDayProgress).toHaveBeenCalledWith('2026-11-18', { results: { r9: { done: true, value: null, text: 'waiting' } } });
  });

  it('a text answer saved with a trailing space keeps the space while typing on', async () => {
    setup(textChoice({ value: 0, done: false, target: null, doneOn: null }));
    await screen.findByText('Blockers');
    const box = () => screen.getByLabelText('Blockers answer') as HTMLTextAreaElement;
    fireEvent.change(box(), { target: { value: 'hello ' } });
    await act(async () => { vi.advanceTimersByTime(800); });
    expect(api.putDayProgress).toHaveBeenLastCalledWith('2026-11-18', { results: { r9: { done: true, value: null, text: 'hello ' } } });
    expect(box().value).toBe('hello ');
    fireEvent.change(box(), { target: { value: 'hello world' } });
    expect(box().value).toBe('hello world');
    await act(async () => { vi.advanceTimersByTime(800); });
    expect(api.putDayProgress).toHaveBeenLastCalledWith('2026-11-18', { results: { r9: { done: true, value: null, text: 'hello world' } } });
  });

  it('a choice goal done on an earlier day saves today and never un-ticks', async () => {
    setup(textChoice({ value: 1, done: true, target: null, doneOn: '2026-11-16' }));
    await screen.findByText('Mood');
    fireEvent.click(screen.getByRole('button', { name: 'Bad' }));
    await act(async () => { vi.advanceTimersByTime(800); });
    expect(api.putDayProgress).toHaveBeenCalledTimes(1);
    expect(api.putDayProgress).toHaveBeenCalledWith('2026-11-18', { results: { g1: { done: true, value: null, choice: 'Bad' } } });
  });

  it('a log goal met by the week keeps the typed entries', async () => {
    setup(logGoal({ value: 0, done: true, target: null, doneOn: null }));
    await screen.findByText('Profile review');
    fireEvent.click(screen.getByRole('button', { name: /add profile/i }));
    fireEvent.change(screen.getByLabelText('What changed 1'), { target: { value: 'Note' } });
    await act(async () => { vi.advanceTimersByTime(800); });
    const [day, body] = vi.mocked(api.putDayProgress).mock.calls[0] as unknown as [string, { results: Record<string, { entries: unknown }> }];
    expect(day).toBe('2026-11-18');
    expect(body.results.g1.entries).toEqual([{ profileId: 'p1', note: 'Note' }]);
  });

  it('retries a failed untick', async () => {
    const p = goals() as ReturnType<typeof goals> & { progress: Record<string, unknown>; items: unknown[] };
    p.progress.g1 = { value: 0, done: true, target: null, doneOn: '2026-11-16' };
    setup(p);
    vi.mocked(api.putDayProgress).mockRejectedValueOnce(new Error('boom'));
    fireEvent.click(await screen.findByLabelText(/Goal one/));
    await act(async () => {});
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    await act(async () => {});
    expect(api.putDayProgress).toHaveBeenCalledTimes(2);
    expect(api.putDayProgress).toHaveBeenLastCalledWith('2026-11-16', { results: { g1: { done: false } } });
  });

  it("weekly count goal shows today's box and week total", async () => {
    const p = goals() as ReturnType<typeof goals> & { progress: Record<string, unknown>; items: unknown[] };
    p.items[3] = item({ id: 'g1', text: 'Contact', scope: 'goal', kind: 'count', target: 250 }) as never;
    p.progress.g1 = { value: 140, done: false, target: 250, doneOn: null };
    setup(p);
    expect(await screen.findByLabelText('Contact')).toBeTruthy();
    expect(screen.getByText('140 / 250 this week')).toBeTruthy();
    expect(screen.queryByText('/ 250')).toBeNull(); // the week line carries the target
  });

  it('goal done by week total shows ticked and locked', async () => {
    const p = goals() as ReturnType<typeof goals> & { progress: Record<string, unknown>; items: unknown[] };
    p.items[3] = item({ id: 'g1', text: 'Contact', scope: 'goal', kind: 'count', target: 250 }) as never;
    p.progress.g1 = { value: 250, done: true, target: 250, doneOn: null };
    setup(p);
    const box = (await screen.findByLabelText('Contact done')) as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(box.disabled).toBe(true);
    expect((screen.getByLabelText('Contact') as HTMLInputElement).disabled).toBe(false);
    expect(screen.getByText('week target met')).toBeTruthy();
    expect(head(/^This week/)).toContain('1 of 2 done');
  });

  it('shows the un-tick immediately and locks the box while saving', async () => {
    const p = goals() as ReturnType<typeof goals> & { progress: Record<string, unknown>; items: unknown[] };
    p.progress.g1 = { value: 0, done: true, target: null, doneOn: '2026-11-16' };
    setup(p);
    let release = () => {};
    vi.mocked(api.putDayProgress).mockReturnValue(new Promise((r) => { release = () => r(p as never); }));
    const box = (await screen.findByLabelText(/Goal one/)) as HTMLInputElement;
    fireEvent.click(box);
    await act(async () => {});
    expect(box.checked).toBe(false);
    expect(box.disabled).toBe(true);
    expect(api.putDayProgress).toHaveBeenCalledTimes(1);
    await act(async () => { release(); });
  });

  it('weekend: no days left', async () => {
    vi.setSystemTime(new Date('2026-11-21T10:00:00-06:00'));
    setup(goals());
    await screen.findByLabelText(/Goal one/);
    expect(head(/^This week/)).toBe('This week · Nov 16 – Nov 200 of 2 done');
    expect(screen.queryByText(/days left|last day/)).toBeNull();
  });

  it('friday: last day', async () => {
    vi.setSystemTime(new Date('2026-11-20T10:00:00-06:00'));
    setup(goals());
    await screen.findByLabelText(/Goal one/);
    expect(head(/^This week/)).toBe('This week · Nov 16 – Nov 200 of 2 done · last day');
  });
});

describe("MyHome seen by an admin (the person's view)", () => {
  it('reads that person, shows their to-dos read-only and leaves following up to them', async () => {
    auth.role = 'admin';
    vi.mocked(api.getDashboardPending).mockResolvedValue({
      interviews: [{ interviewId: 'iv-f', roundId: 'r-f', companyName: 'Acme', profileName: null, ownerId: 'u2', ownerName: 'Puma', stage: 'intro',
        status: 'completed', scheduledAt: '2026-11-09T16:00:00Z', endsAt: '2026-11-09T17:00:00Z', need: 'follow_up' }],
      profiles: [], bidders: [], counts: {},
    } as never);
    cache = new Map();
    vi.mocked(api.getDayPlan).mockResolvedValue(plan() as never);
    render(<SWRConfig value={{ provider: () => cache as never }}><MemoryRouter><MyHome userId="u2" name="Puma" /></MemoryRouter></SWRConfig>);
    const routine = (await screen.findByLabelText('Bidder Management')) as HTMLInputElement;
    expect(routine.disabled).toBe(true);
    expect(api.getDayPlan).toHaveBeenCalledWith('2026-11-18', 'u2');
    expect(api.getDashboardWeek).toHaveBeenCalledWith({ today: '2026-11-18', userId: 'u2' });
    expect(api.getDashboardPending).toHaveBeenCalledWith('u2');
    // the admin's own-rounds guard does not hide the person's follow-up; its box is theirs to tick
    expect(((await screen.findByRole('checkbox', { name: 'I followed up with Acme' })) as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole('link', { name: /Set this week/ })).toBeNull();
  });
});

describe('MyHome: Interview pipeline', () => {
  const pipe = (o: object) => ({
    interviewId: 'p1', companyName: 'Trellix', profileName: null, stage: 'intro', at: '2026-11-23T16:00:00Z', upcoming: true,
    status: 'scheduled', days: null, followedUpAt: null, ...o,
  });
  const block = () => screen.findByRole('region', { name: 'Interview pipeline' });

  it('is the last block, folded to one line that counts each group, and opens to the grouped table', async () => {
    vi.mocked(api.getInterviewPipeline).mockResolvedValue({ items: [
      pipe({}), pipe({ interviewId: 'p2', companyName: 'HackerOne' }),
      pipe({ interviewId: 'p3', companyName: 'Wiz', status: 'waiting', upcoming: false, at: '2026-11-17T16:00:00Z' }),
      pipe({ interviewId: 'p4', companyName: 'Reach', status: 'no_result', upcoming: false, at: '2026-11-03T16:00:00Z', days: 15 }),
    ] } as never);
    setup(plan());
    const box = await block();
    const fold = within(box).getByRole('button', { name: /Interview pipeline/ });
    expect(fold.getAttribute('aria-expanded')).toBe('false');
    expect(box.textContent).toContain('4 open');
    expect(box.textContent).toContain('2 scheduled · 1 waiting · 1 no result');
    expect(within(box).queryByRole('table')).toBeNull();
    fireEvent.click(fold);
    const table = within(box).getByRole('table', { name: 'Pipeline' });
    expect(within(table).getByRole('link', { name: 'Trellix' }).getAttribute('href')).toBe('/interviews?panel=p1');
    expect(within(table).getByRole('button', { name: /Waiting for a result \(1\)/ })).toBeTruthy();
    const week = screen.getByRole('heading', { name: /^This week/ });
    expect(week.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('is left out with nothing open, and when the read fails', async () => {
    setup(plan());
    await screen.findByRole('heading', { name: /^This week/ });
    await waitFor(() => expect(api.getInterviewPipeline).toHaveBeenCalled());
    expect(screen.queryByText(/Interview pipeline/)).toBeNull();
    cleanup();
    vi.mocked(api.getInterviewPipeline).mockRejectedValue(new Error('down'));
    setup(plan());
    await screen.findByRole('heading', { name: /^This week/ });
    expect(screen.queryByText(/Interview pipeline/)).toBeNull();
  });
});

describe("MyHome as the admin's view of a person", () => {
  const followUp = { interviewId: 'iv-f', roundId: 'r-f', companyName: 'Acme', profileName: null, ownerId: 'u2', ownerName: 'Puma', stage: 'intro',
    status: 'completed', scheduledAt: '2026-11-09T16:00:00Z', endsAt: '2026-11-09T17:00:00Z', need: 'follow_up' };
  const show = (day?: string, p: object = plan()) => {
    auth.role = 'admin';
    vi.mocked(api.getDashboardPending).mockResolvedValue({ interviews: [followUp], profiles: [], bidders: [], counts: {} } as never);
    vi.mocked(api.getDayPlan).mockResolvedValue(p as never);
    render(<SWRConfig value={{ provider: () => new Map() }}><MemoryRouter><MyHome userId="u2" name="Puma" day={day} /></MemoryRouter></SWRConfig>);
  };

  it('today: Pending items is open, and the follow-up is a row of the day block, not of Pending', async () => {
    show(undefined, plan({ todayInterviews: [], interviewsMarked: { marked: 0, total: 0 } }));
    expect(await screen.findByRole('heading', { name: 'Today · Wed, Nov 18' })).toBeTruthy();
    expect(await screen.findByRole('checkbox', { name: 'I followed up with Acme' })).toBeTruthy();
    expect(screen.queryByText(/Pending items/)).toBeNull(); // the follow-up was its only row
  });

  it('a past day: read for that day and its week, read-only, with the follow-up back in an open Pending items and no result buttons', async () => {
    const ended = iv({ roundId: 'r-old', state: 'unmarked', status: 'scheduled', scheduledAt: '2026-11-10T16:00:00Z', endsAt: '2026-11-10T16:45:00Z' });
    show('2026-11-10', plan({ date: '2026-11-10', todayInterviews: [ended], interviewsMarked: { marked: 0, total: 1 } }));
    expect(await screen.findByRole('heading', { name: 'Tue, Nov 10' })).toBeTruthy();
    expect(api.getDayPlan).toHaveBeenCalledWith('2026-11-10', 'u2');
    expect(api.getDashboardWeek).toHaveBeenCalledWith({ today: '2026-11-18', userId: 'u2', weekOf: '2026-11-10' });
    expect(((await screen.findByLabelText('Bidder Management')) as HTMLInputElement).disabled).toBe(true);
    const daily = screen.getByRole('list', { name: 'Daily' });
    expect(within(daily).queryByRole('checkbox', { name: /I followed up/ })).toBeNull();
    expect(within(daily).queryByRole('button', { name: 'Passed' })).toBeNull(); // the old round is listed, not answered here
    expect(within(daily).getByText(/Acme/)).toBeTruthy();
    const pending = await screen.findByRole('group', { name: /Pending items \(1\)/ });
    expect(within(pending).getByText('Follow-up due')).toBeTruthy();
    expect(within(pending).getByText(/Things waiting on Puma/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: /^Week · / })).toBeTruthy();
  });
});

describe('MyHome: Bids and Interviews rows', () => {
  const daily = () => screen.findByRole('list', { name: 'Daily' });
  const rowOf = async (name: string) => within(await daily()).getByText(name).closest('li') as HTMLElement;
  const AUTO_BIDS = 'Bids target reached — ticks itself';
  const AUTO_INTERVIEWS = "Today's interviews all marked — ticks itself";
  const DONE = "All done for today. You're good to go.";

  it('Bids under the target: total of target, self and bidder against theirs, a bar, the week, and an unticked box that cannot be ticked', async () => {
    setup(plan({ targets: { ...c, bidsSelf: 80, bidsBidder: 195 }, done: { ...c, bidsSelf: 38 }, bidsBidderAuto: 86 }));
    const row = await rowOf('Bids');
    expect(row.textContent).toContain('124 of 275 · self 38 / 80 · bidder 86 / 195');
    expect(within(row).getByText('124').className).toContain('amber');
    const box = within(row).getByRole('checkbox', { name: AUTO_BIDS }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(box.disabled).toBe(true);
    expect(within(row).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('45');
    expect(await within(row).findByText('this week 914 of 2,000')).toBeTruthy();
  });

  it('Bids ticks itself at the target', async () => {
    setup(plan({ targets: { ...c, bidsSelf: 100 }, done: { ...c, bidsSelf: 60 }, bidsBidderAuto: 45 }));
    const row = await rowOf('Bids');
    expect(row.textContent).toContain('105 of 100 · self 60 / 100 · bidder 45');
    expect(within(row).getByText('105').className).toContain('emerald');
    expect((within(row).getByRole('checkbox', { name: AUTO_BIDS }) as HTMLInputElement).checked).toBe(true);
  });

  it('Bids without a target: the counts alone, and the box counts as ticked', async () => {
    setup(plan({ targets: { ...c } }));
    const row = await rowOf('Bids');
    expect(row.textContent).toContain('138 · self 52 · bidder 86');
    expect(row.textContent).not.toContain(' of 0');
    const box = within(row).getByRole('checkbox', { name: AUTO_BIDS }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(box.disabled).toBe(true);
    expect(within(row).queryByRole('progressbar')).toBeNull();
  });

  it("Bids use the day's totals when the server sends them", async () => {
    setup(plan({ bidsTotals: { self: 60, selfTarget: 50, bidder: 85, bidderTarget: null, total: 145, target: 150 } }));
    expect((await rowOf('Bids')).textContent).toContain('145 of 150 · self 60 / 50 · bidder 85');
  });

  it('the week numbers fall back to the whole-week count on an older server, and leave out a target that is not set', async () => {
    const w = week();
    vi.mocked(api.getDashboardWeek).mockResolvedValue(week({
      bids: { ...w.bids, week: undefined, byDay: undefined }, interviews: { ...w.interviews, target: null, rounds: undefined },
    }) as never);
    setup(plan({ todayInterviews: [], interviewsMarked: { marked: 0, total: 0 } }));
    expect(await within(await rowOf('Bids')).findByText('this week 934 of 2,100')).toBeTruthy();
    expect(within(await rowOf('Interviews')).getByText('this week 3')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull(); // no days: no week table
  });

  it('the location table shows whenever the day has a location', async () => {
    const us = { region: 'US', self: 60, selfTarget: 50, bidder: 85, total: 145 };
    setup(plan({ bidsByRegion: [us, { region: 'EU', self: 22, selfTarget: 30, bidder: 35, total: 57 }, { region: 'Latam', self: 10, selfTarget: null, bidder: 0, total: 10 }] }));
    const table = within(await daily()).getByRole('table', { name: 'Bids by location' });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Location', 'Self', 'Bidder', 'Total']);
    expect(within(table).getAllByRole('row').slice(1).map((r) => [...r.children].map((x) => x.textContent))).toEqual([
      ['US', '60 / 50', '85', '145'], ['EU', '22 / 30', '35', '57'], ['Latam', '10', '0', '10'],
    ]);
    expect(within(table).getByText('22 / 30').className).toContain('amber');
    expect(within(table).getByText('60 / 50').className).not.toContain('amber');
    cleanup();
    setup(plan({ bidsByRegion: [us] })); // one location: still shown
    expect(within(within(await daily()).getByRole('table', { name: 'Bids by location' })).getAllByRole('row')).toHaveLength(2);
    cleanup();
    setup(plan({ bidsByRegion: [] }));
    await daily();
    expect(screen.queryByRole('table', { name: 'Bids by location' })).toBeNull();
  });

  it('Interviews with none today: says so, counts as ticked, with the week against what is planned', async () => {
    setup(plan({ todayInterviews: [], interviewsMarked: { marked: 0, total: 0 } }));
    const row = await rowOf('Interviews');
    expect(row.textContent).toContain('none today · self 0 · caller 0');
    expect((within(row).getByRole('checkbox', { name: AUTO_INTERVIEWS }) as HTMLInputElement).checked).toBe(true);
    expect(await within(row).findByText('this week 3 of 4 planned')).toBeTruthy();
  });

  it('Interviews partly marked: unticked, with who takes them', async () => {
    setup(plan({
      todayInterviews: [iv(), iv({ roundId: 'r-b', state: 'unmarked', status: 'scheduled', who: { kind: 'caller', name: 'Sam', assigned: true, confirmed: true } })],
      interviewsMarked: { marked: 1, total: 2 },
    }));
    const row = await rowOf('Interviews');
    expect(row.textContent).toContain('1 of 2 marked · self 1 · caller 1');
    const box = within(row).getByRole('checkbox', { name: AUTO_INTERVIEWS }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(box.disabled).toBe(true);
  });

  it('Interviews all marked: ticked', async () => {
    setup(plan({ todayInterviews: [iv(), iv({ roundId: 'r-b', state: 'passed', status: 'passed' })], interviewsMarked: { marked: 2, total: 2 } }));
    const row = await rowOf('Interviews');
    expect(row.textContent).toContain('2 of 2 marked · self 2 · caller 0');
    expect((within(row).getByRole('checkbox', { name: AUTO_INTERVIEWS }) as HTMLInputElement).checked).toBe(true);
  });

  it('Interviews with one still to come is not ticked, whatever the marked count says', async () => {
    setup(plan({
      todayInterviews: [iv(), iv({ roundId: 'r-c', state: 'upcoming', status: 'scheduled', scheduledAt: '2026-11-19T03:00:00Z', endsAt: '2026-11-19T03:45:00Z' })],
      interviewsMarked: { marked: 2, total: 2 },
    }));
    const row = await rowOf('Interviews');
    expect((within(row).getByRole('checkbox', { name: AUTO_INTERVIEWS }) as HTMLInputElement).checked).toBe(false);
  });

  it('the heading counts every row with a box, the two that tick themselves included, and what is left', async () => {
    setup(plan({
      targets: { ...c, bidsSelf: 100 }, done: { ...c, bidsSelf: 100 }, bidsBidderAuto: 0,
      todayInterviews: [iv()], interviewsMarked: { marked: 1, total: 1 },
      items: [item({ id: 'r1', text: 'A', result: { done: true, value: null, target: null } }), item({ id: 'r2', text: 'B' }), item({ id: 'r3', text: 'C' })],
    }));
    await daily();
    expect(head(/^Today/)).toBe('Today · Wed, Nov 183 of 5 done · 2 to go');
    expect(screen.queryByText(DONE)).toBeNull();
  });

  it('no bids target and no round today both count as ticked', async () => {
    setup(plan({ targets: { ...c }, todayInterviews: [], interviewsMarked: { marked: 0, total: 0 } }));
    await daily();
    expect(head(/^Today/)).toBe('Today · Wed, Nov 182 of 4 done · 2 to go');
  });

  it('every box ticked: all done, good to go', async () => {
    setup(plan({
      targets: { ...c, bidsSelf: 100 }, done: { ...c, bidsSelf: 100 }, bidsBidderAuto: 0,
      todayInterviews: [iv()], interviewsMarked: { marked: 1, total: 1 },
      items: [item({ id: 'r1', text: 'A', result: { done: true, value: null, target: null } })],
    }));
    await daily();
    expect(head(/^Today/)).toBe('Today · Wed, Nov 183 of 3 done');
    expect(screen.getByRole('status').textContent).toBe(`✓ ${DONE}`);
  });

  it('an old response without the interviews fields still shows the count it has, with no box', async () => {
    setup(plan());
    const row = await rowOf('Interviews');
    expect(row.textContent).toContain('2 of 2');
    expect(row.textContent).not.toContain('marked');
    expect(within(row).queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('list', { name: "Today's interviews" })).toBeNull();
  });
});

describe("MyHome: today's interviews", () => {
  const rounds = async () => within(await screen.findByRole('list', { name: "Today's interviews" })).getAllByRole('listitem');
  const show = (list: object[]) => setup(plan({ todayInterviews: list, interviewsMarked: { marked: 0, total: list.length } }));
  const unmarked = (o: object = {}) => iv({
    interviewId: 'iv-b', roundId: 'r-b', companyName: 'Globex', profileName: 'Data profile', stage: 'intro', status: 'scheduled', state: 'unmarked',
    scheduledAt: '2026-11-18T20:30:00Z', endsAt: '2026-11-18T20:55:00Z',
    who: { kind: 'caller', name: 'Muhammad', assigned: true, confirmed: true }, steps: [{ stage: 'intro', state: 'today' }], ...o,
  });

  it('lists the rounds in the order given with time, company, profile, who, the steps and the status', async () => {
    show([
      iv(),
      unmarked(),
      iv({
        interviewId: 'iv-c', roundId: 'r-c', companyName: 'Initech', stage: 'final', status: 'scheduled', state: 'upcoming',
        scheduledAt: '2026-11-19T03:00:00Z', endsAt: '2026-11-19T03:45:00Z', who: { kind: 'caller', name: null, assigned: false, confirmed: false },
        steps: [{ stage: 'intro', state: 'passed' }, { stage: 'tech1', state: 'passed' }, { stage: 'final', state: 'today' }],
      }),
    ]);
    const [a, b, d] = await rounds();
    expect(a.textContent).toContain('10:00 AM · Acme · Backend profile · Self');
    expect(a.textContent).toContain('Completed ✓');
    expect(a.textContent).toContain('Intro ✓ passed → Tech round 1 · today');
    expect(within(a).queryByRole('button')).toBeNull();
    expect(b.textContent).toContain('2:30 PM · Globex · Data profile · Caller: Muhammad ✓ confirmed');
    expect(b.textContent).toContain('Ended 2:55 PM · not marked');
    expect(within(b).getAllByRole('button').map((x) => x.textContent)).toEqual(['Completed', 'Passed', 'Rejected', 'Rescheduled', 'Canceled']);
    expect(d.textContent).toContain('9:00 PM · Initech · Backend profile · Caller: not assigned yet');
    expect(d.textContent).toContain('In 2 hours');
    expect(d.textContent).toContain('Intro ✓ passed → Tech round 1 ✓ passed → Final · today');
    expect(within(d).queryByRole('button')).toBeNull();
  });

  it.each([
    [{ kind: 'self', name: null, assigned: false, confirmed: false }, 'Self'],
    [{ kind: 'caller', name: 'Muhammad', assigned: true, confirmed: true }, 'Caller: Muhammad ✓ confirmed'],
    [{ kind: 'caller', name: 'Muhammad', assigned: true, confirmed: false }, 'Caller: Muhammad'],
    [{ kind: 'caller', name: null, assigned: false, confirmed: false }, 'Caller: not assigned yet'],
  ])('who takes it: %#', async (who, text) => {
    show([iv({ who })]);
    expect((await rounds())[0].textContent).toContain(`10:00 AM · Acme · Backend profile · ${text}Completed`);
  });

  it.each([
    [{ state: 'upcoming', status: 'scheduled', scheduledAt: '2026-11-19T01:25:00Z', endsAt: '2026-11-19T02:00:00Z' }, 'In 25 minutes'],
    [{ state: 'upcoming', status: 'scheduled', scheduledAt: '2026-11-19T01:01:00Z', endsAt: '2026-11-19T02:00:00Z' }, 'In 1 minute'],
    [{ state: 'upcoming', status: 'scheduled', scheduledAt: '2026-11-19T02:00:00Z', endsAt: '2026-11-19T02:30:00Z' }, 'In 1 hour'],
    [{ state: 'upcoming', status: 'scheduled', scheduledAt: '2026-11-19T04:00:00Z', endsAt: '2026-11-19T04:30:00Z' }, 'In 3 hours'],
    [{ state: 'now', status: 'scheduled', scheduledAt: '2026-11-19T00:30:00Z', endsAt: '2026-11-19T01:30:00Z' }, 'Happening now'],
    [{ state: 'unmarked', status: 'scheduled', scheduledAt: '2026-11-18T20:30:00Z', endsAt: '2026-11-18T20:55:00Z' }, 'Ended 2:55 PM · not marked'],
    [{ state: 'completed', status: 'completed' }, 'Completed ✓'],
    [{ state: 'passed', status: 'passed' }, 'Passed ✓'],
    [{ state: 'rejected', status: 'rejected' }, 'Rejected'],
    [{ state: 'canceled', status: 'canceled' }, 'Canceled'],
    [{ state: 'rescheduled', status: 'scheduled', rescheduledTo: '2026-11-20T16:00:00Z' }, 'Rescheduled to Nov 20'],
  ])('status of the round: %#', async (over, text) => {
    show([iv(over)]);
    const [row] = await rounds();
    expect(within(row).getByText(text)).toBeTruthy();
    expect(within(row).queryAllByRole('button').length).toBe(text.endsWith('not marked') ? 5 : 0);
  });

  it('the steps trail names how each earlier round ended', async () => {
    show([iv({ steps: [
      { stage: 'intro', state: 'passed' }, { stage: 'tech1', state: 'rejected' }, { stage: 'tech1', state: 'canceled' },
      { stage: 'tech1', state: 'held' }, { stage: 'final', state: 'today' },
    ] })]);
    expect((await rounds())[0].textContent).toContain('Intro ✓ passed → Tech round 1 ✗ rejected → Tech round 1 canceled → Tech round 1 → Final · today');
  });

  it('the time left and the state follow the clock without asking the server again', async () => {
    show([iv({ state: 'upcoming', status: 'scheduled', scheduledAt: '2026-11-19T01:01:30Z', endsAt: '2026-11-19T01:02:30Z' })]);
    const [row] = await rounds();
    expect(within(row).getByText('In 2 minutes')).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(60000); });
    expect(within(row).getByText('In 1 minute')).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(60000); });
    expect(within(row).getByText('Happening now')).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(60000); });
    expect(within(row).getByText('Ended 7:02 PM · not marked')).toBeTruthy();
    expect(within(row).getAllByRole('button')).toHaveLength(5);
    expect(api.getDayPlan).toHaveBeenCalledTimes(1);
  });

  it('Completed saves at once, then refetches the day, the week and the pending items', async () => {
    vi.mocked(api.updateInterviewStage).mockResolvedValue({} as never);
    show([unmarked()]);
    const [row] = await rounds();
    fireEvent.click(within(row).getByRole('button', { name: 'Completed' }));
    await waitFor(() => expect(api.updateInterviewStage).toHaveBeenCalledWith('iv-b', 'r-b', { status: 'completed' }));
    await waitFor(() => expect(api.getDayPlan).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(api.getDashboardWeek).toHaveBeenCalledTimes(2));
    expect(api.getDashboardPending).toHaveBeenCalledTimes(2);
  });

  it("a round's buttons are disabled while its save is in flight", async () => {
    vi.mocked(api.updateInterviewStage).mockReturnValue(new Promise(() => {}) as never);
    show([unmarked()]);
    const [row] = await rounds();
    fireEvent.click(within(row).getByRole('button', { name: 'Completed' }));
    await waitFor(() => expect(within(row).getAllByRole('button').every((b) => (b as HTMLButtonElement).disabled)).toBe(true));
  });

  it('Passed asks for optional feedback', async () => {
    vi.mocked(api.updateInterviewStage).mockResolvedValue({} as never);
    show([unmarked()]);
    fireEvent.click(within((await rounds())[0]).getByRole('button', { name: 'Passed' }));
    const dialog = await screen.findByRole('dialog', { name: /Passed to next round · Globex/ });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save as Passed' }));
    await waitFor(() => expect(api.updateInterviewStage).toHaveBeenCalledWith('iv-b', 'r-b', { status: 'passed', statusNote: '' }));
  });

  it.each([
    ['Rejected', /Reject round · Globex/, /Why was it rejected\?/, 'experience', 'rejected'],
    ['Canceled', /Cancel round · Globex/, /Why was it canceled\?/, 'company', 'canceled'],
  ])('%s asks the reason before saving', async (label, title, question, reason, status) => {
    vi.mocked(api.updateInterviewStage).mockResolvedValue({} as never);
    show([unmarked()]);
    fireEvent.click(within((await rounds())[0]).getByRole('button', { name: label }));
    const dialog = await screen.findByRole('dialog', { name: title });
    const save = within(dialog).getByRole('button', { name: `Save as ${label}` }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(question), { target: { value: reason } });
    fireEvent.click(save);
    await waitFor(() => expect(api.updateInterviewStage).toHaveBeenCalledWith('iv-b', 'r-b', { status, statusNote: '', statusReason: reason }));
  });

  it('Rescheduled opens the Change time dialog and sends the new time with the reason', async () => {
    vi.mocked(api.updateInterviewStage).mockResolvedValue({} as never);
    show([unmarked()]);
    fireEvent.click(within((await rounds())[0]).getByRole('button', { name: 'Rescheduled' }));
    const dialog = await screen.findByRole('dialog', { name: 'Change time · Intro' });
    fireEvent.change(within(dialog).getByLabelText('Date'), { target: { value: '2026-11-25' } });
    fireEvent.change(within(dialog).getByLabelText(/Why was it rescheduled\?/), { target: { value: 'technical' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.updateInterviewStage).toHaveBeenCalledWith('iv-b', 'r-b', {
      scheduledAt: '2026-11-25T20:30:00.000Z', rescheduleReason: 'technical', rescheduleNote: '',
    }));
    await waitFor(() => expect(api.getDayPlan).toHaveBeenCalledTimes(2));
  });
});

describe('MyHome: Pending items and Follow up', () => {
  const round = (o: object = {}) => ({
    interviewId: 'iv1', roundId: 'r1', companyName: 'Acme', profileName: 'John D', ownerId: 'me', ownerName: 'Me',
    stage: 'intro', status: 'completed', scheduledAt: '2026-11-10T15:00:00Z', endsAt: '2026-11-10T16:00:00Z', need: 'follow_up', ...o,
  });
  const outcome = (n: number) => round({ interviewId: `o${n}`, roundId: `o${n}`, companyName: `Out ${n}`, status: 'scheduled', need: 'outcome' });
  const waiting = (interviews: object[], rest: object = {}) =>
    vi.mocked(api.getDashboardPending).mockResolvedValue({ interviews, profiles: [], bidders: [], counts: {}, ...rest } as never);
  const block = () => screen.findByRole('group', { name: /Pending items/ });
  const tickOf = (company: string) => screen.findByRole('checkbox', { name: `I followed up with ${company}` }) as Promise<HTMLInputElement>;

  it('Pending items is hidden when nothing waits, and there is no Follow up row', async () => {
    setup(plan());
    await screen.findByLabelText('Bidder Management');
    await waitFor(() => expect(api.getDashboardPending).toHaveBeenCalledWith(undefined));
    await act(async () => {});
    expect(screen.queryByText(/Pending items|Follow up/)).toBeNull();
  });

  it('Pending items is its own block above Today, folded; the follow-ups are rows of Today with a box', async () => {
    waiting([round(), round({ interviewId: 'iv2', roundId: 'r2', companyName: 'Initech', stage: 'final' }), outcome(1)], {
      profiles: [{ accountId: 'a2', name: 'Theo Deng', kind: 'no_bids', idleDays: 21, capped: false, bids: null, tailorScore: null }],
      bidders: [{ bidderId: 'b1', name: 'Ali', kind: 'not_bidding', days: 2, recent: null, before: null }],
    });
    setup(plan());
    const box = await block();
    const today = screen.getByRole('heading', { name: /^Today/ });
    expect(today.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(box.contains(today) || today.closest('section')?.contains(box)).toBe(false);
    const fold = within(box).getByRole('button', { name: 'Pending items 3' });
    expect(fold.getAttribute('aria-expanded')).toBe('false');
    expect(within(box).queryByRole('list')).toBeNull();
    fireEvent.click(fold);
    expect(within(box).getAllByRole('list').map((l) => l.getAttribute('aria-label'))).toEqual(['Interviews', 'Profiles', 'Bidders']);
    expect(box.textContent).not.toContain('Acme');

    const daily = screen.getByRole('list', { name: 'Daily' });
    const rows = within(daily).getAllByText('Follow up').map((x) => x.closest('li') as HTMLElement);
    expect(rows.map((r) => r.textContent)).toEqual([
      'Follow upAcme · Intro · no result for 8 daystick when you have followed up', 'Follow upInitech · Final · no result for 8 days',
    ]);
    const tick = within(rows[0]).getByRole('checkbox', { name: 'I followed up with Acme' }) as HTMLInputElement;
    expect(tick.checked).toBe(false);
    expect(within(rows[0]).queryByRole('button')).toBeNull();
    // Bids (under target) and the two follow-ups and the two routines are open; the old response has no Interviews box
    expect(head(/^Today/)).toBe('Today · Wed, Nov 180 of 5 done · 5 to go');
  });

  it("Pending items does not repeat today's unmarked rounds: they are answered in the Today list", async () => {
    waiting([round(), outcome(1), outcome(2)]);
    setup(plan({
      todayInterviews: [iv({ interviewId: 'o1', roundId: 'o1', state: 'unmarked', status: 'scheduled' })],
      interviewsMarked: { marked: 0, total: 1 },
    }));
    const box = await block();
    fireEvent.click(within(box).getByRole('button', { name: 'Pending items 1' }));
    expect(box.textContent).toContain('Out 2');
    expect(box.textContent).not.toContain('Out 1');
  });

  it('ticking a follow-up records it, stays ticked and disabled meanwhile, then the row leaves and the page is read again', async () => {
    waiting([round()]);
    let done: (v: unknown) => void = () => {};
    vi.mocked(api.followUpInterviewStage).mockReturnValue(new Promise((resolve) => { done = resolve; }) as never);
    setup(plan());
    const tick = await tickOf('Acme');
    fireEvent.click(tick);
    expect(api.followUpInterviewStage).toHaveBeenCalledWith('iv1', 'r1');
    await waitFor(() => expect(tick.disabled).toBe(true));
    expect(tick.checked).toBe(true);
    fireEvent.click(tick);
    expect(api.followUpInterviewStage).toHaveBeenCalledTimes(1);
    waiting([]);
    await act(async () => { done({}); });
    await waitFor(() => expect(screen.queryByText('Follow up')).toBeNull());
    expect(api.getDashboardPending).toHaveBeenCalledTimes(2);
    expect(api.getDayPlan).toHaveBeenCalledTimes(2);
    expect(api.getDashboardWeek).toHaveBeenCalledTimes(2);
  });

  it('a failed follow-up keeps the row, unticked and usable again', async () => {
    waiting([round()]);
    vi.mocked(api.followUpInterviewStage).mockRejectedValue(new Error('nope'));
    setup(plan());
    const tick = await tickOf('Acme');
    fireEvent.click(tick);
    await waitFor(() => expect(api.followUpInterviewStage).toHaveBeenCalled());
    await waitFor(() => expect(tick.disabled).toBe(false));
    expect(tick.checked).toBe(false);
  });

  it('a pending row is answered from the block: Rejected asks the reason before saving', async () => {
    waiting([round({ need: 'heard_back', followedUpAt: '2026-11-11T12:00:00Z' })]);
    vi.mocked(api.updateInterviewStage).mockResolvedValue({} as never);
    setup(plan());
    const box = await block();
    fireEvent.click(within(box).getByRole('button', { name: 'Pending items 1' }));
    fireEvent.click(within(box).getByRole('button', { name: 'Rejected' }));
    const dialog = await screen.findByRole('dialog', { name: /Reject round · Acme/ });
    const save = within(dialog).getByRole('button', { name: 'Save as Rejected' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/Why was it rejected\?/), { target: { value: 'experience' } });
    fireEvent.click(save);
    await waitFor(() => expect(api.updateInterviewStage).toHaveBeenCalledWith(
      'iv1', 'r1', { status: 'rejected', statusNote: '', statusReason: 'experience' },
    ));
  });

  it("an old server without the pending read: the follow-ups come from the needs-input list, an admin's by their own id", async () => {
    auth.role = 'admin';
    vi.mocked(api.getDashboardPending).mockRejectedValue(new Error('404'));
    vi.mocked(api.getNeedsInput).mockResolvedValue({
      items: [round(), round({ interviewId: 'iv8', roundId: 'r8', companyName: 'Theirs', ownerId: 'other' })], counts: {},
    } as never);
    setup(plan());
    expect(await tickOf('Acme')).toBeTruthy();
    expect(screen.queryByText('Theirs')).toBeNull();
    expect(screen.queryByText(/Pending items/)).toBeNull();
    expect(vi.mocked(api.getNeedsInput).mock.calls.every(([u]) => u === 'me')).toBe(true);
  });
});
