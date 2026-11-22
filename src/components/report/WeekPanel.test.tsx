// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import * as api from '../../api/endpoints';
import WeekPanel from './WeekPanel';

vi.mock('../../api/endpoints', async (orig) => ({ ...(await orig<object>()), getWeekPlan: vi.fn(), putWeekPlan: vi.fn(), putTeamWeek: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const counts = { bidsSelf: 0, bidsSelfUs: 0, bidsSelfEu: 0, bidsSelfLatam: 0, bidsBidder: 0, interviewsSelf: 0, interviewsCaller: 0 };
const plan = {
  weekStart: '2026-11-16', exists: false, draft: true, userId: 'u', goal: counts, done: counts,
  routines: [{ id: 'r1', text: 'Check inbox', kind: 'check', target: null, archived: false }],
  weeklyGoals: [{ id: 'g0', text: 'Old goal', kind: 'check', target: null, archived: true }], progress: {}, recapNotes: '', stages: { self: {}, caller: {} }, days: [],
};

describe('WeekPanel', () => {
  it('shows the draft banner and saves routines / weeklyGoals, new items without ids', async () => {
    vi.mocked(api.getWeekPlan).mockResolvedValue(plan as never);
    vi.mocked(api.putWeekPlan).mockResolvedValue(plan as never);
    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <WeekPanel weekStart="2026-11-16" mode="own" open onClose={() => {}} onSaved={() => {}} />
      </SWRConfig>,
    );
    expect(await screen.findByText(/Copied from last week — save to keep/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /add item/i })[1]);
    fireEvent.change(screen.getByLabelText('Weekly goal item 1'), { target: { value: '  Ship it ' } });
    fireEvent.click(screen.getByRole('button', { name: /save week/i }));
    await waitFor(() => expect(api.putWeekPlan).toHaveBeenCalled());
    const body = vi.mocked(api.putWeekPlan).mock.calls[0][1] as unknown as Record<string, unknown>;
    expect(body.routines).toEqual([{ id: 'r1', text: 'Check inbox', kind: 'check', target: null, archived: false }]);
    expect(body.weeklyGoals).toEqual([{ text: 'Ship it', kind: 'check', target: null, archived: false }]);
    expect(JSON.stringify(body)).not.toContain('Old goal');
    expect(body).not.toHaveProperty('goalItems');
    expect(body).not.toHaveProperty('dailyGoal');
  });

  const renderPanel = (mode: 'own' | 'admin' | 'view', over: object = {}, onClose = () => {}) => {
    vi.mocked(api.getWeekPlan).mockResolvedValue({ ...plan, draft: false, exists: true, recapNotes: 'old', goal: { ...counts, bidsSelf: 5, bidsSelfUs: 5, interviewsCaller: 2 }, ...over } as never);
    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <WeekPanel weekStart="2026-11-16" userId="u1" mode={mode} open onClose={onClose} onSaved={() => {}} />
      </SWRConfig>,
    );
  };

  it('own + plansOwnWeek false: read-only plan, note, recap editable, Save sends the recap', async () => {
    vi.mocked(api.putWeekPlan).mockResolvedValue(plan as never);
    renderPanel('own', { plansOwnWeek: false });
    expect(await screen.findByText('Planned by your admin')).toBeTruthy();
    expect(screen.queryByLabelText(/bids bidder goal/i)).toBeNull();
    fireEvent.change(screen.getByLabelText('Recap notes'), { target: { value: 'new recap' } });
    fireEvent.click(screen.getByRole('button', { name: /save week/i }));
    await waitFor(() => expect(api.putWeekPlan).toHaveBeenCalled());
    const body = vi.mocked(api.putWeekPlan).mock.calls[0][1] as unknown as Record<string, unknown>;
    expect(body.recapNotes).toBe('new recap');
    expect(body.goal).toMatchObject({ bidsSelf: 5 });
  });

  it('planned person: admin items are locked, own items editable, Add item adds an own item, Save sends both', async () => {
    vi.mocked(api.putWeekPlan).mockResolvedValue(plan as never);
    renderPanel('own', {
      plansOwnWeek: false,
      routines: [
        { id: 'r1', text: 'Admin routine', kind: 'check', target: null, archived: false, addedBy: 'admin' },
        { id: 'r2', text: 'Mine', kind: 'check', target: null, archived: false, addedBy: 'self' },
      ],
    });
    expect(await screen.findByText('Admin routine')).toBeTruthy();
    expect(screen.getAllByText('🔒').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText(/^routine item \d+$/i)).toHaveLength(1);
    fireEvent.click(screen.getAllByRole('button', { name: 'Add my item' })[0]);
    fireEvent.change(screen.getByLabelText('Routine item 2'), { target: { value: 'New one' } });
    fireEvent.click(screen.getByRole('button', { name: /save week/i }));
    await waitFor(() => expect(api.putWeekPlan).toHaveBeenCalled());
    const body = vi.mocked(api.putWeekPlan).mock.calls[0][1] as unknown as { routines: Record<string, unknown>[] };
    expect(body.routines).toHaveLength(3);
    expect(body.routines[0]).toMatchObject({ id: 'r1', text: 'Admin routine', addedBy: 'admin' });
    expect(body.routines[2]).toMatchObject({ text: 'New one', addedBy: 'self' });
  });

  it('planned person before the week is published: no Add item, no Save', async () => {
    renderPanel('own', { plansOwnWeek: false, exists: false });
    expect(await screen.findByText('Planned by your admin')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /add (my )?item/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /save week/i })).toBeNull();
  });

  it('own + plansOwnWeek false + not saved: recap read-only, no Save', async () => {
    renderPanel('own', { plansOwnWeek: false, exists: false });
    expect(await screen.findByText('Planned by your admin')).toBeTruthy();
    expect(screen.queryByLabelText('Recap notes')).toBeNull();
    expect(screen.queryByRole('button', { name: /save week/i })).toBeNull();
  });

  it('own + plansOwnWeek true: Save week calls putWeekPlan', async () => {
    vi.mocked(api.putWeekPlan).mockResolvedValue(plan as never);
    renderPanel('own', { plansOwnWeek: true });
    await screen.findByLabelText('Bids bidder goal');
    expect(screen.queryByText('Planned by your admin')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /save week/i }));
    await waitFor(() => expect(api.putWeekPlan).toHaveBeenCalled());
  });

  it('admin: editable, Save sends one team row, recap read-only', async () => {
    vi.mocked(api.putTeamWeek).mockResolvedValue({ results: [{ userId: 'u1', ok: true, error: null }] });
    renderPanel('admin', { plansOwnWeek: false });
    expect(screen.queryByLabelText('Recap notes')).toBeNull();
    fireEvent.change(await screen.findByLabelText('Bids self total goal'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('Interviews self goal'), { target: { value: '3' } });
    expect(screen.getAllByText('Edited by the person').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /save week/i }));
    await waitFor(() => expect(api.putTeamWeek).toHaveBeenCalled());
    const [week, rows] = vi.mocked(api.putTeamWeek).mock.calls[0];
    expect(week).toBe('2026-11-16');
    expect(rows).toEqual([{
      userId: 'u1', plansOwnWeek: false, goal: { bidsSelf: 9, bidsBidder: 0, interviewsSelf: 3 },
      routines: [{ id: 'r1', text: 'Check inbox', kind: 'check', target: null, archived: false }], weeklyGoals: [], exists: true,
    }]);
  });

  it('admin: a failed row shows its error and keeps the panel open', async () => {
    const onClose = vi.fn();
    vi.mocked(api.putTeamWeek).mockResolvedValue({ results: [{ userId: 'u1', ok: false, error: 'Too many items' }] });
    renderPanel('admin', {}, onClose);
    await screen.findByLabelText('Bids self total goal');
    fireEvent.click(screen.getByRole('button', { name: /save week/i }));
    expect((await screen.findByRole('alert')).textContent).toContain('Too many items');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('view: read-only with Close only', async () => {
    renderPanel('view');
    await screen.findByText('Check inbox');
    expect(screen.queryByRole('button', { name: /save week/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    expect(screen.queryByLabelText('Bids bidder goal')).toBeNull();
  });
});
