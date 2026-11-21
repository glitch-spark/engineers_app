// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useSWR, { SWRConfig, unstable_serialize } from 'swr';
import * as api from '../../api/endpoints';
import TodayCard from './TodayCard';

vi.mock('../../api/endpoints', () => ({
  getDayPlan: vi.fn(), putDayProgress: vi.fn(), getNeedsInput: vi.fn(), getDashboardPending: vi.fn(), followUpInterviewStage: vi.fn(), updateInterviewStage: vi.fn(),
}));
const auth = vi.hoisted(() => ({ role: 'staff' }));
vi.mock('../../lib/useInterviewTimezone', () => ({ useInterviewTimezone: () => ({ tz: 'America/Chicago' }) }));
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'me', role: auth.role } }) }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-11-18T19:00:00-06:00'));
  auth.role = 'staff';
  vi.mocked(api.getNeedsInput).mockResolvedValue({ items: [], counts: {} } as never);
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

let cache = new Map<string, unknown>();
let unmountCard = () => {};
function setup(p: object) {
  cache = new Map();
  vi.mocked(api.getDayPlan).mockResolvedValue(p as never);
  vi.mocked(api.putDayProgress).mockResolvedValue(p as never);
  const ui = (card: boolean) => (
    <SWRConfig value={{ provider: () => cache as never }}>
      <MemoryRouter>{card && <TodayCard />}</MemoryRouter>
    </SWRConfig>
  );
  const { rerender } = render(ui(true));
  unmountCard = () => rerender(ui(false)); // keep the SWR provider, drop only the card (as navigating away does)
}

describe('TodayCard', () => {
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

  it('revalidates the week after a save', async () => {
    const weekFetch = vi.fn().mockResolvedValue({});
    const Probe = () => { useSWR(['home-week', '2026-11-18'], weekFetch, { revalidateOnFocus: false }); return null; };
    vi.mocked(api.getDayPlan).mockResolvedValue(plan() as never);
    vi.mocked(api.putDayProgress).mockResolvedValue(plan() as never);
    cache = new Map();
    render(
      <SWRConfig value={{ provider: () => cache as never }}>
        <MemoryRouter><TodayCard /><Probe /></MemoryRouter>
      </SWRConfig>,
    );
    fireEvent.click(await screen.findByLabelText('Bidder Management'));
    await act(async () => { vi.advanceTimersByTime(800); });
    await act(async () => {});
    expect(weekFetch).toHaveBeenCalledTimes(2);
  });

  it('shows a skeleton while loading and a retry on error', async () => {
    vi.mocked(api.getDayPlan).mockRejectedValue(new Error('boom'));
    cache = new Map();
    render(
      <SWRConfig value={{ provider: () => cache as never, shouldRetryOnError: false }}>
        <MemoryRouter><TodayCard /></MemoryRouter>
      </SWRConfig>,
    );
    expect(document.querySelector('.skeleton')).toBeTruthy();
    expect(await screen.findByText(/Couldn.t load today/)).toBeTruthy();
    vi.mocked(api.getDayPlan).mockResolvedValue(plan() as never);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect((await screen.findByRole('list', { name: 'Daily' })).textContent).toContain('Bids · 138 of 200 · 62 to go');
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

  it('section counts', async () => {
    setup(goals());
    // The heading counts the daily rows with a box: the Bids row (it has a target) and the three routines.
    expect(await screen.findByText('1 of 4 done')).toBeTruthy();
    expect(screen.getByText('3 days left · 0 of 2 done')).toBeTruthy();
  });

  it('unticks a goal done on an earlier day on that day', async () => {
    const p = goals() as ReturnType<typeof goals> & { progress: Record<string, unknown>; items: unknown[] };
    p.progress.g1 = { value: 0, done: true, target: null, doneOn: '2026-11-16' };
    setup(p);
    expect(await screen.findByText('1 of 2 done', { exact: false })).toBeTruthy();
    expect(screen.getByText('done Mon')).toBeTruthy();
    const box = screen.getByLabelText(/Goal one/) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    await act(async () => {});
    expect(api.putDayProgress).toHaveBeenCalledTimes(1);
    expect(api.putDayProgress).toHaveBeenCalledWith('2026-11-16', { results: { g1: { done: false } } });
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
    expect(screen.getByText('1 of 2 done', { exact: false, selector: 'span' })).toBeTruthy();
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
    expect(await screen.findByText('0 of 2 done')).toBeTruthy();
    expect(screen.queryByText(/days left|last day/)).toBeNull();
  });

  it('friday: last day', async () => {
    vi.setSystemTime(new Date('2026-11-20T10:00:00-06:00'));
    setup(goals());
    expect(await screen.findByText('last day · 0 of 2 done')).toBeTruthy();
  });
});

describe('TodayCard: Bids and Interviews rows', () => {
  const daily = () => screen.findByRole('list', { name: 'Daily' });
  const rowOf = async (name: string) => within(await daily()).getByText(name).closest('li') as HTMLElement;
  const AUTO_BIDS = 'Bids target reached — ticks itself';
  const AUTO_INTERVIEWS = "Today's interviews all marked — ticks itself";

  it('Bids with a target: done of target, what is left, a bar and an unticked box that cannot be ticked', async () => {
    setup(plan({ targets: { ...c, bidsSelf: 80, bidsBidder: 195 }, done: { ...c, bidsSelf: 38 }, bidsBidderAuto: 86 }));
    const row = await rowOf('Bids');
    expect(row.textContent).toContain('Bids · 124 of 275 · 151 to go');
    expect(within(row).getByText('ticks itself')).toBeTruthy();
    const box = within(row).getByRole('checkbox', { name: AUTO_BIDS }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(box.disabled).toBe(true);
    expect(within(row).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('45');
  });

  it('Bids ticks itself at the target', async () => {
    setup(plan({ targets: { ...c, bidsSelf: 100 }, done: { ...c, bidsSelf: 60 }, bidsBidderAuto: 45 }));
    const row = await rowOf('Bids');
    expect(row.textContent).toContain('Bids · 105 of 100');
    expect(row.textContent).not.toContain('to go');
    expect((within(row).getByRole('checkbox', { name: AUTO_BIDS }) as HTMLInputElement).checked).toBe(true);
  });

  it('Bids without a target: only the count, no box', async () => {
    setup(plan({ targets: { ...c } }));
    const row = await rowOf('Bids');
    expect(row.textContent).toBe('Bids · 138');
    expect(within(row).queryByRole('checkbox')).toBeNull();
    expect(within(row).queryByRole('progressbar')).toBeNull();
  });

  it('Interviews with none today: says so, no box', async () => {
    setup(plan({ todayInterviews: [], interviewsMarked: { marked: 0, total: 0 } }));
    const row = await rowOf('Interviews');
    expect(row.textContent).toBe('Interviews · none today');
    expect(within(row).queryByRole('checkbox')).toBeNull();
  });

  it('Interviews partly marked: unticked', async () => {
    setup(plan({ todayInterviews: [iv(), iv({ roundId: 'r-b', state: 'unmarked', status: 'scheduled' })], interviewsMarked: { marked: 1, total: 2 } }));
    const row = await rowOf('Interviews');
    expect(row.textContent).toContain('Interviews · 1 of 2 marked');
    const box = within(row).getByRole('checkbox', { name: AUTO_INTERVIEWS }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(box.disabled).toBe(true);
  });

  it('Interviews all marked: ticked', async () => {
    setup(plan({ todayInterviews: [iv(), iv({ roundId: 'r-b', state: 'passed', status: 'passed' })], interviewsMarked: { marked: 2, total: 2 } }));
    const row = await rowOf('Interviews');
    expect(row.textContent).toContain('Interviews · 2 of 2 marked');
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

  it('the heading counts the daily rows that have a box, the auto rows included', async () => {
    setup(plan({
      targets: { ...c, bidsSelf: 100 }, done: { ...c, bidsSelf: 100 }, bidsBidderAuto: 0,
      todayInterviews: [iv()], interviewsMarked: { marked: 1, total: 1 },
      items: [item({ id: 'r1', text: 'A', result: { done: true, value: null, target: null } }), item({ id: 'r2', text: 'B' }), item({ id: 'r3', text: 'C' })],
    }));
    await daily();
    expect(screen.getByRole('heading', { name: /Today/ }).parentElement?.textContent).toContain('3 of 5 done');
  });

  it('auto rows without a box are not counted', async () => {
    setup(plan({ targets: { ...c }, todayInterviews: [], interviewsMarked: { marked: 0, total: 0 } }));
    await daily();
    expect(screen.getByRole('heading', { name: /Today/ }).parentElement?.textContent).toContain('0 of 2 done');
  });

  it('an old response without the interviews fields still shows the count it has, with no box', async () => {
    setup(plan());
    const row = await rowOf('Interviews');
    expect(row.textContent).toBe('Interviews · 2 of 2');
    expect(within(row).queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('list', { name: "Today's interviews" })).toBeNull();
  });
});

describe("TodayCard: today's interviews", () => {
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

  it('Completed saves at once, then refetches the day, the week and the month', async () => {
    const weekFetch = vi.fn().mockResolvedValue({});
    const monthFetch = vi.fn().mockResolvedValue({});
    const Probe = () => {
      useSWR(['home-week', '2026-11-18'], weekFetch, { revalidateOnFocus: false });
      useSWR(['home-month-interviews', '2026-11-18'], monthFetch, { revalidateOnFocus: false });
      return null;
    };
    const p = plan({ todayInterviews: [unmarked()], interviewsMarked: { marked: 0, total: 1 } });
    vi.mocked(api.getDayPlan).mockResolvedValue(p as never);
    vi.mocked(api.updateInterviewStage).mockResolvedValue({} as never);
    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <MemoryRouter><TodayCard /><Probe /></MemoryRouter>
      </SWRConfig>,
    );
    const [row] = await rounds();
    fireEvent.click(within(row).getByRole('button', { name: 'Completed' }));
    await waitFor(() => expect(api.updateInterviewStage).toHaveBeenCalledWith('iv-b', 'r-b', { status: 'completed' }));
    await waitFor(() => expect(api.getDayPlan).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(weekFetch).toHaveBeenCalledTimes(2));
    expect(monthFetch).toHaveBeenCalledTimes(2);
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

describe('TodayCard: Pending items (where Follow-ups was)', () => {
  const round = (o: object = {}) => ({
    interviewId: 'iv1', roundId: 'r1', companyName: 'Acme', profileName: 'John D', ownerId: 'me', ownerName: 'Me',
    stage: 'intro', status: 'completed', scheduledAt: '2026-11-10T15:00:00Z', endsAt: '2026-11-10T16:00:00Z', need: 'follow_up', ...o,
  });
  const outcome = (n: number) => round({ interviewId: `o${n}`, roundId: `o${n}`, companyName: `Out ${n}`, status: 'scheduled', need: 'outcome' });
  const waiting = (interviews: object[], rest: object = {}) =>
    vi.mocked(api.getDashboardPending).mockResolvedValue({ interviews, profiles: [], bidders: [], counts: {}, ...rest } as never);
  const block = () => screen.findByRole('group', { name: /Pending items/ });

  it('is hidden when nothing waits, and the old Follow-ups block is gone', async () => {
    setup(plan());
    await screen.findByLabelText('Bidder Management');
    await waitFor(() => expect(api.getDashboardPending).toHaveBeenCalledWith(undefined));
    await act(async () => {});
    expect(screen.queryByText(/Pending items|Follow-ups/)).toBeNull();
  });

  it('sits at the top, above the to-dos, with the interviews, profiles and bidders that wait on the person', async () => {
    waiting([round(), outcome(1)], {
      profiles: [{ accountId: 'a2', name: 'Theo Deng', kind: 'no_bids', idleDays: 21, capped: false, bids: null, tailorScore: null }],
      bidders: [{ bidderId: 'b1', name: 'Ali', kind: 'not_bidding', days: 2, recent: null, before: null }],
    });
    setup(plan({ items: [item({ id: 'g1', text: 'Goal one', scope: 'goal' })] }));
    const box = await block();
    expect(within(box).getByRole('heading', { name: 'Pending items (4)' })).toBeTruthy();
    expect(within(box).getByText('Things waiting on you')).toBeTruthy();
    expect(within(box).getAllByRole('list').map((l) => l.getAttribute('aria-label'))).toEqual(['Interviews', 'Profiles', 'Bidders']);
    expect(within(box).getByRole('checkbox', { name: 'I followed up with Acme' })).toBeTruthy();
    expect(screen.queryByText(/Follow-ups \(/)).toBeNull();
    const goal = screen.getByLabelText(/Goal one/);
    expect(goal.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it("does not repeat today's unmarked rounds: they are answered in the Today list above", async () => {
    waiting([round(), outcome(1), outcome(2)]);
    setup(plan({
      todayInterviews: [iv({ interviewId: 'o1', roundId: 'o1', state: 'unmarked', status: 'scheduled' })],
      interviewsMarked: { marked: 0, total: 1 },
    }));
    const box = await block();
    expect(within(box).getByRole('heading', { name: 'Pending items (2)' })).toBeTruthy();
    expect(box.textContent).toContain('Out 2');
    expect(box.textContent).not.toContain('Out 1');
  });

  it('ticking a follow-up records it, disables the row meanwhile, then refetches the block and the day', async () => {
    waiting([round()]);
    let done: (v: unknown) => void = () => {};
    vi.mocked(api.followUpInterviewStage).mockReturnValue(new Promise((resolve) => { done = resolve; }) as never);
    setup(plan());
    const box = await block();
    const tick = within(box).getByRole('checkbox', { name: 'I followed up with Acme' }) as HTMLInputElement;
    fireEvent.click(tick);
    expect(api.followUpInterviewStage).toHaveBeenCalledWith('iv1', 'r1');
    await waitFor(() => expect(tick.disabled).toBe(true));
    expect(tick.checked).toBe(true);
    fireEvent.click(tick);
    expect(api.followUpInterviewStage).toHaveBeenCalledTimes(1);
    waiting([]);
    await act(async () => { done({}); });
    await waitFor(() => expect(screen.queryByText(/Pending items/)).toBeNull());
    expect(api.getDashboardPending).toHaveBeenCalledTimes(2);
    expect(api.getDayPlan).toHaveBeenCalledTimes(2);
  });

  it('a failed follow-up keeps the row, unticked and usable again', async () => {
    waiting([round()]);
    vi.mocked(api.followUpInterviewStage).mockRejectedValue(new Error('nope'));
    setup(plan());
    const tick = within(await block()).getByRole('checkbox') as HTMLInputElement;
    fireEvent.click(tick);
    await waitFor(() => expect(api.followUpInterviewStage).toHaveBeenCalled());
    await waitFor(() => expect(tick.disabled).toBe(false));
    expect(tick.checked).toBe(false);
  });

  it('Rejected asks the reason before saving', async () => {
    waiting([round()]);
    vi.mocked(api.updateInterviewStage).mockResolvedValue({} as never);
    setup(plan());
    fireEvent.click(within(await block()).getByRole('button', { name: 'Rejected' }));
    const dialog = await screen.findByRole('dialog', { name: /Reject round · Acme/ });
    const save = within(dialog).getByRole('button', { name: 'Save as Rejected' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/Why was it rejected\?/), { target: { value: 'experience' } });
    fireEvent.click(save);
    await waitFor(() => expect(api.updateInterviewStage).toHaveBeenCalledWith(
      'iv1', 'r1', { status: 'rejected', statusNote: '', statusReason: 'experience' },
    ));
  });

  it("an old server without the pending read: the interviews come from the needs-input list, an admin's by their own id", async () => {
    auth.role = 'admin';
    vi.mocked(api.getDashboardPending).mockRejectedValue(new Error('404'));
    vi.mocked(api.getNeedsInput).mockResolvedValue({
      items: [round(), round({ interviewId: 'iv8', roundId: 'r8', companyName: 'Theirs', ownerId: 'other' })], counts: {},
    } as never);
    setup(plan());
    const box = await block();
    expect(within(box).getByRole('heading', { name: 'Pending items (1)' })).toBeTruthy();
    expect(box.textContent).not.toContain('Theirs');
    expect(vi.mocked(api.getNeedsInput).mock.calls.every(([u]) => u === 'me')).toBe(true);
  });
});
