// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useSWR, { SWRConfig, unstable_serialize } from 'swr';
import * as api from '../../api/endpoints';
import TodayCard from './TodayCard';

vi.mock('../../api/endpoints', () => ({ getDayPlan: vi.fn(), putDayProgress: vi.fn(), listInterviewRounds: vi.fn() }));
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-11-18T19:00:00-06:00'));
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
function setup(p: object, rounds: object[] = []) {
  cache = new Map();
  vi.mocked(api.getDayPlan).mockResolvedValue(p as never);
  vi.mocked(api.putDayProgress).mockResolvedValue(p as never);
  vi.mocked(api.listInterviewRounds).mockResolvedValue({ rounds, interviews: {} } as never);
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
    vi.mocked(api.listInterviewRounds).mockResolvedValue({ rounds: [], interviews: {} } as never);
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
    vi.mocked(api.listInterviewRounds).mockResolvedValue({ rounds: [], interviews: {} } as never);
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
