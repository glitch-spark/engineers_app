// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import * as api from '../../api/endpoints';
import WeekPanel from './WeekPanel';

vi.mock('../../api/endpoints', async (orig) => ({ ...(await orig<object>()), getWeekPlan: vi.fn(), putWeekPlan: vi.fn(), putTeamWeek: vi.fn(), getDayPlans: vi.fn() }));
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
    fireEvent.change(screen.getByLabelText('Weekly to-do item 1'), { target: { value: '  Ship it ' } });
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

  it('Save week is held while a choice item has invalid options', async () => {
    vi.mocked(api.putWeekPlan).mockResolvedValue(plan as never);
    renderPanel('own', { plansOwnWeek: true, routines: [{ id: 'r1', text: 'Status', kind: 'choice', options: ['Only'], target: null, archived: false }] });
    const options = await screen.findByLabelText('Daily to-do item 1 options');
    const save = screen.getByRole('button', { name: /save week/i }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(options, { target: { value: 'Yes, No' } });
    expect(save.disabled).toBe(false);
  });

  it('the person splits the self total by the regions they have profiles in; over the total blocks Save', async () => {
    vi.mocked(api.getDayPlans).mockResolvedValue({ weekStart: '2026-11-16', days: [], profiles: [
      { id: 'p1', name: 'A', region: 'US', archived: false }, { id: 'p2', name: 'B', region: 'EU', archived: false },
    ] } as never);
    vi.mocked(api.putWeekPlan).mockResolvedValue(plan as never);
    renderPanel('own', { plansOwnWeek: false, goal: { ...counts, bidsSelf: 1000 } });
    const us = await screen.findByLabelText('Self bids US this week');
    expect(screen.queryByLabelText('Self bids LATAM this week')).toBeNull(); // no LATAM profile
    fireEvent.change(us, { target: { value: '1200' } });
    expect(screen.getByRole('alert').textContent).toContain('200 more than the total');
    expect((screen.getByRole('button', { name: /save week/i }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(us, { target: { value: '600' } });
    fireEvent.change(screen.getByLabelText('Self bids EU this week'), { target: { value: '300' } });
    // every profile is in US / EU: bids left out of the split would make the day's region targets fall short
    const warn = screen.getByText(/not in any region/);
    expect(warn.textContent).toBe('100 not in any region: US + EU targets will add up to less than the total');
    expect(warn.className).toContain('amber');
    expect((screen.getByRole('button', { name: /save week/i }) as HTMLButtonElement).disabled).toBe(false); // a warning, not a block
    fireEvent.change(us, { target: { value: '700' } });
    expect(screen.queryByText(/not in any region|Other \/ no region/)).toBeNull(); // split adds up: nothing left over
    fireEvent.change(us, { target: { value: '600' } });
    fireEvent.click(screen.getByRole('button', { name: /save week/i }));
    await waitFor(() => expect(api.putWeekPlan).toHaveBeenCalled());
    const body = vi.mocked(api.putWeekPlan).mock.calls[0][1] as unknown as { goal: Record<string, number> };
    expect(body.goal).toMatchObject({ bidsSelf: 1000, bidsSelfUs: 600, bidsSelfEu: 300 });
  });

  it('with a profile outside US / EU / LATAM the rest of the total is theirs: a plain note, no warning', async () => {
    vi.mocked(api.getDayPlans).mockResolvedValue({ weekStart: '2026-11-16', days: [], profiles: [
      { id: 'p1', name: 'A', region: 'US', archived: false }, { id: 'p2', name: 'C', region: 'Canada', archived: false },
    ] } as never);
    renderPanel('own', { plansOwnWeek: false, goal: { ...counts, bidsSelf: 1100 } });
    fireEvent.change(await screen.findByLabelText('Self bids US this week'), { target: { value: '1000' } });
    expect(screen.getByText('Other / no region: 100')).toBeTruthy();
    expect(screen.queryByText(/not in any region/)).toBeNull();
  });

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
    expect(screen.getAllByLabelText(/^daily to-do item \d+$/i)).toHaveLength(1);
    fireEvent.click(screen.getAllByRole('button', { name: 'Add my item' })[0]);
    fireEvent.change(screen.getByLabelText('Daily to-do item 2'), { target: { value: 'New one' } });
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
    await screen.findByLabelText('Bidder bids / day');
    expect(screen.queryByText('Planned by your admin')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /save week/i }));
    await waitFor(() => expect(api.putWeekPlan).toHaveBeenCalled());
  });

  it('admin: editable, Save sends one team row, recap read-only', async () => {
    vi.mocked(api.putTeamWeek).mockResolvedValue({ results: [{ userId: 'u1', ok: true, error: null }] });
    renderPanel('admin', { plansOwnWeek: false });
    expect(screen.queryByLabelText('Recap notes')).toBeNull();
    fireEvent.change(await screen.findByLabelText('Bids / day'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('Interviews this week'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /save week/i }));
    await waitFor(() => expect(api.putTeamWeek).toHaveBeenCalled());
    const [week, rows] = vi.mocked(api.putTeamWeek).mock.calls[0];
    expect(week).toBe('2026-11-16');
    expect(rows).toEqual([{
      // 9 a day Mon–Fri + the older plan's even Saturday share (ceil(5 / 6) = 1), kept as shown
      userId: 'u1', plansOwnWeek: false, goal: { bidsSelf: 46, bidsBidder: 0, interviewsSelf: 3 },
      routines: [{ id: 'r1', text: 'Check inbox', kind: 'check', target: null, archived: false }], weeklyGoals: [], exists: true, removedIds: [],
      satGoal: { bidsSelf: 1, bidsBidder: null },
    }]);
  });

  it('admin: archiving a saved own item sends its id in removedIds', async () => {
    vi.mocked(api.putTeamWeek).mockResolvedValue({ results: [{ userId: 'u1', ok: true, error: null }] });
    renderPanel('admin', { plansOwnWeek: false, routines: [
      { id: 'r1', text: 'Check inbox', kind: 'check', target: null, archived: false, addedBy: 'admin' },
      { id: 'r2', text: 'Discord', kind: 'check', target: null, archived: false, addedBy: 'self' },
    ] });
    fireEvent.click(await screen.findByRole('button', { name: 'Archive Daily to-do item 2' }));
    fireEvent.click(screen.getByRole('button', { name: /save week/i }));
    await waitFor(() => expect(api.putTeamWeek).toHaveBeenCalled());
    const [, rows] = vi.mocked(api.putTeamWeek).mock.calls[0];
    expect(rows[0].removedIds).toEqual(['r2']);
    expect(rows[0].routines.map((i) => i.id)).toEqual(['r1']);
  });

  it('admin: a failed row shows its error and keeps the panel open', async () => {
    const onClose = vi.fn();
    vi.mocked(api.putTeamWeek).mockResolvedValue({ results: [{ userId: 'u1', ok: false, error: 'Too many items' }] });
    renderPanel('admin', {}, onClose);
    await screen.findByLabelText('Bids / day');
    fireEvent.click(screen.getByRole('button', { name: /save week/i }));
    expect((await screen.findByRole('alert')).textContent).toContain('Too many items');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('view: read-only with Close only', async () => {
    renderPanel('view');
    await screen.findByText('Check inbox');
    expect(screen.queryByRole('button', { name: /save week/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    expect(screen.queryByLabelText('Bidder bids / day')).toBeNull();
  });
});
