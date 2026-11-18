// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SWRConfig } from 'swr';
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

function setup(p: object, rounds: object[] = []) {
  vi.mocked(api.getDayPlan).mockResolvedValue(p as never);
  vi.mocked(api.putDayProgress).mockResolvedValue(p as never);
  vi.mocked(api.listInterviewRounds).mockResolvedValue({ rounds, interviews: {} } as never);
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <MemoryRouter><TodayCard /></MemoryRouter>
    </SWRConfig>,
  );
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
});
