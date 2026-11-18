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
const at = (h: number, m: number) => new Date(2026, 10, 18, h, m).toISOString();

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
  it("shows targets, bidder auto count and today's interviews", async () => {
    setup(plan({ targets: { ...c, bidsSelf: 80, bidsBidder: 120, interviewsSelf: 1, interviewsCaller: 1 } }), [
      { roundId: 'b', scheduledAt: at(16, 30), companyName: 'Globex' },
      { roundId: 'a', scheduledAt: at(14, 0), companyName: 'Acme' },
    ]);
    expect(await screen.findByText('52 / 80')).toBeTruthy();
    expect(screen.getByText('86 / 120')).toBeTruthy();
    expect(screen.getByText('2 / 2')).toBeTruthy();
    expect(await screen.findByText('2:00 PM Acme · 4:30 PM Globex')).toBeTruthy();
  });

  it('shows just the interview count when the target is 0', async () => {
    setup(plan({ targets: { ...c, bidsSelf: 80, bidsBidder: 120 } }));
    expect(await screen.findByText('2')).toBeTruthy();
    expect(screen.queryByText(/^2 \/ 0/)).toBeNull();
  });

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

  it('amber after 6 PM when not posted; posted state links Edit update', async () => {
    setup(plan());
    expect((await screen.findByText('Update not posted yet')).className).toContain('amber');
    cleanup();
    setup(plan({ submitted: true }));
    expect(await screen.findByText('✓ Posted')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Edit update' }).getAttribute('href')).toBe('/report?day=2026-11-18');
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
    expect(await screen.findByText('52 / 80')).toBeTruthy();
  });

  it('shows just the count for bids when the day target is 0', async () => {
    setup(plan({ targets: { ...c } }));
    expect(await screen.findByText('52')).toBeTruthy();
    expect(screen.getByText('86')).toBeTruthy();
    expect(screen.queryByText(/ \/ 0$/)).toBeNull();
  });
});
