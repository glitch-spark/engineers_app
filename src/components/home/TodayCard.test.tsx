// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useSWR, { SWRConfig, unstable_serialize } from 'swr';
import * as api from '../../api/endpoints';
import TodayCard from './TodayCard';

vi.mock('../../api/endpoints', () => ({
  getDayPlan: vi.fn(), putDayProgress: vi.fn(), getNeedsInput: vi.fn(), followUpInterviewStage: vi.fn(), updateInterviewStage: vi.fn(),
}));
const auth = vi.hoisted(() => ({ role: 'staff' }));
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'me', role: auth.role } }) }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-11-18T19:00:00-06:00'));
  auth.role = 'staff';
  vi.mocked(api.getNeedsInput).mockResolvedValue({ items: [], counts: {} } as never);
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
    expect(await screen.findByText(/Bids 138 \/ 200 · auto/)).toBeTruthy();
  });

  it('shows auto chips and no update links', async () => {
    setup(plan({ targets: { ...c, bidsSelf: 80, bidsBidder: 195, interviewsSelf: 1 }, done: { ...c, bidsSelf: 20 }, bidsBidderAuto: 46 }));
    expect(await screen.findByText('Bids 66 / 275 · auto')).toBeTruthy();
    expect(screen.getByText('Interviews 2 / 1 · auto')).toBeTruthy();
    expect(screen.queryByText('Write my update')).toBeNull();
    expect(screen.queryByText('edit')).toBeNull();
  });

  it('omits chip targets when 0', async () => {
    setup(plan({ targets: { ...c }, interviews: { self: 0, caller: 0, stages: { self: {}, caller: {} } } }));
    expect(await screen.findByText('Bids 138 · auto')).toBeTruthy();
    expect(screen.getByText('Interviews 0 · auto')).toBeTruthy();
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
    expect(await screen.findByText('1 of 3 done')).toBeTruthy();
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

describe('TodayCard: interviews waiting on you', () => {
  const round = (o: object = {}) => ({
    interviewId: 'iv1', roundId: 'r1', companyName: 'Acme', profileName: 'John D', ownerId: 'me', ownerName: 'Me',
    stage: 'intro', status: 'completed', scheduledAt: '2026-11-10T15:00:00Z', endsAt: '2026-11-10T16:00:00Z', need: 'follow_up', ...o,
  });
  const heardBack = round({
    interviewId: 'iv2', roundId: 'r2', companyName: 'Initech', need: 'heard_back',
    scheduledAt: '2026-10-08T15:00:00Z', endsAt: '2026-10-08T16:00:00Z', followedUpAt: '2026-11-11T12:00:00Z',
  });
  const outcome = (n: number) => round({ interviewId: `o${n}`, roundId: `o${n}`, companyName: `Out ${n}`, status: 'scheduled', need: 'outcome' });
  const reason = (n: number) => round({ interviewId: `x${n}`, roundId: `x${n}`, companyName: `Why ${n}`, status: 'canceled', need: 'reason' });
  const waiting = (items: object[]) => vi.mocked(api.getNeedsInput).mockResolvedValue({ items, counts: {} } as never);
  const block = () => screen.findByRole('group', { name: /Interviews waiting on you/ });
  const texts = (el: HTMLElement) => within(el).getAllByRole('listitem').map((li) => li.textContent);

  it('is hidden when nothing waits', async () => {
    setup(plan());
    await screen.findByLabelText('Bidder Management');
    await waitFor(() => expect(api.getNeedsInput).toHaveBeenCalled());
    expect(screen.queryByText(/Interviews waiting on you/)).toBeNull();
  });

  it('counts every waiting round in the heading and lists follow-up and heard-back rows, oldest first', async () => {
    waiting([round(), heardBack, outcome(1), outcome(2), reason(1)]);
    setup(plan());
    const box = await block();
    expect(within(box).getByText('Interviews waiting on you (5)')).toBeTruthy();
    const rows = within(box).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain('Did you hear back? Initech · Intro, Oct 8 · followed up Nov 11');
    expect(within(rows[0]).queryByRole('checkbox')).toBeNull();
    expect(within(rows[0]).getAllByRole('button').map((b) => b.textContent)).toEqual(['No, close as rejected', 'Passed', 'Rejected']);
    expect(rows[1].textContent).toContain('Follow up with Acme · Intro, Nov 10 · no result for 8 days');
    expect(within(rows[1]).getByRole('checkbox', { name: 'I followed up with Acme' })).toBeTruthy();
    expect(within(rows[1]).getAllByRole('button').map((b) => b.textContent)).toEqual(['Passed', 'Rejected']);
    expect(rows[2].textContent).toContain('2 rounds need "How did it go?" · 1 needs a reason');
    expect(within(rows[2]).getByRole('link', { name: /Interviews/ }).getAttribute('href')).toBe('/interviews');
  });

  it.each([
    [[outcome(1)], '1 round needs "How did it go?"'],
    [[outcome(1), outcome(2)], '2 rounds need "How did it go?"'],
    [[reason(1)], '1 needs a reason'],
    [[reason(1), reason(2)], '2 need a reason'],
    [[outcome(1), reason(1), reason(2)], '1 round needs "How did it go?" · 2 need a reason'],
  ])('the counts line leaves out a kind with none: %#', async (items, line) => {
    waiting(items);
    setup(plan());
    const rows = texts(await block());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toBe(`${line}Interviews →`);
  });

  it('has no counts line when only follow-ups wait', async () => {
    waiting([round()]);
    setup(plan());
    const box = await block();
    expect(within(box).getByText('Interviews waiting on you (1)')).toBeTruthy();
    expect(within(box).getAllByRole('listitem')).toHaveLength(1);
    expect(within(box).queryByRole('link')).toBeNull();
  });

  it('lists at most 5 rows, then "…and n more" linking to Interviews', async () => {
    waiting([1, 2, 3, 4, 5, 6, 7].map((n) => round({
      interviewId: `iv${n}`, roundId: `r${n}`, companyName: `Co ${n}`, scheduledAt: `2026-11-0${n}T15:00:00Z`, endsAt: undefined,
    })).reverse());
    setup(plan());
    const box = await block();
    expect(within(box).getByText('Interviews waiting on you (7)')).toBeTruthy();
    expect(within(box).getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'))).toEqual(
      [1, 2, 3, 4, 5].map((n) => `I followed up with Co ${n}`),
    );
    const more = within(box).getByRole('link', { name: /…and 2 more/ });
    expect(more.getAttribute('href')).toBe('/interviews');
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
    expect(within(box).getAllByRole('button').every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    fireEvent.click(tick);
    expect(api.followUpInterviewStage).toHaveBeenCalledTimes(1);
    waiting([]);
    await act(async () => { done({}); });
    await waitFor(() => expect(screen.queryByText(/Interviews waiting on you/)).toBeNull());
    expect(api.getNeedsInput).toHaveBeenCalledTimes(2);
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
    expect(api.updateInterviewStage).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText(/Why was it rejected\?/), { target: { value: 'experience' } });
    fireEvent.click(save);
    await waitFor(() => expect(api.updateInterviewStage).toHaveBeenCalledWith(
      'iv1', 'r1', { status: 'rejected', statusNote: '', statusReason: 'experience' },
    ));
  });

  it('Passed opens the optional feedback dialog', async () => {
    waiting([round()]);
    vi.mocked(api.updateInterviewStage).mockResolvedValue({} as never);
    setup(plan());
    fireEvent.click(within(await block()).getByRole('button', { name: 'Passed' }));
    const dialog = await screen.findByRole('dialog', { name: /Passed to next round · Acme/ });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save as Passed' }));
    await waitFor(() => expect(api.updateInterviewStage).toHaveBeenCalledWith('iv1', 'r1', { status: 'passed', statusNote: '' }));
  });

  it('"No, close as rejected" saves rejected with no answer in one click', async () => {
    waiting([heardBack]);
    vi.mocked(api.updateInterviewStage).mockResolvedValue({} as never);
    setup(plan());
    fireEvent.click(within(await block()).getByRole('button', { name: 'No, close as rejected' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(api.updateInterviewStage).toHaveBeenCalledWith('iv2', 'r2', { status: 'rejected', statusReason: 'no_answer' }));
  });

  it("an admin asks without a userId and sees only their own rounds, not the team's", async () => {
    auth.role = 'admin';
    waiting([round(), round({ interviewId: 'iv8', roundId: 'r8', companyName: 'Theirs', ownerId: 'other' }), { ...outcome(1), ownerId: 'other' }]);
    setup(plan());
    const box = await block();
    expect(within(box).getByText('Interviews waiting on you (1)')).toBeTruthy();
    expect(box.textContent).not.toContain('Theirs');
    expect(vi.mocked(api.getNeedsInput).mock.calls.every((args) => args.length === 0 || args[0] === undefined)).toBe(true);
  });
});
