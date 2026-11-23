// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import * as api from '../../api/endpoints';
import DayPanel from './DayPanel';

vi.mock('../../api/endpoints', async (orig) => ({ ...(await orig<object>()), getDayPlan: vi.fn(), putDayPlan: vi.fn(), deleteDayPlan: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const c = { bidsSelf: 0, bidsSelfUs: 0, bidsSelfEu: 0, bidsSelfLatam: 0, bidsBidder: 0, interviewsSelf: 0, interviewsCaller: 0 };
const item = (o: object) => ({ text: 't', kind: 'check', target: null, archived: false, scope: 'routine', result: null, ...o });
const plan = (o: object = {}) => ({
  date: '2026-11-17', exists: true, userId: 'u', targets: { ...c, bidsSelf: 10 },
  items: [
    item({ id: 'r1', text: 'Check inbox' }),
    item({ id: 'r2', text: 'Outreach', kind: 'count', target: 50, result: { done: false, value: 31, target: 50 } }),
    item({ id: 'g1', text: 'Write post', kind: 'count', target: 250, scope: 'goal' }),
    item({ id: 'g2', text: 'Ship it', scope: 'goal' }),
  ],
  progress: { g1: { value: 180, done: false, target: 250 } }, focus: ['g2'],
  done: c, bidsBidderAuto: 7, interviews: { self: 0, caller: 0, stages: { self: {}, caller: {} } },
  notes: '', loggedAt: null, submitted: false, profiles: [], ...o,
});

function setup(p: object, date = '2026-11-17') {
  vi.mocked(api.getDayPlan).mockResolvedValue(p as never);
  vi.mocked(api.putDayPlan).mockResolvedValue(p as never);
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <DayPanel date={date} readOnly={false} open onClose={() => {}} onSaved={() => {}} />
    </SWRConfig>,
  );
}

describe('DayPanel', () => {
  it('shows items, number vs target, week progress and a read-only bidder', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-18T12:00:00'));
    setup(plan({ date: '2026-11-18' }), '2026-11-18');
    expect(await screen.findByText('Check inbox')).toBeTruthy();
    expect((screen.getByLabelText('Outreach') as HTMLInputElement).value).toBe('31');
    expect(screen.getByText('/ 50')).toBeTruthy();
    expect(screen.getByText(/180 \/ 250/)).toBeTruthy();
    expect(screen.queryByLabelText(/bids bidder done/i)).toBeNull();
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Post update' })).toBeTruthy();
    vi.useRealTimers();
  });

  it('shows the typed bidder bids on days before Bid Track counted them', async () => {
    setup(plan({ date: '2026-11-13', done: { ...c, bidsBidder: 9 } }), '2026-11-13');
    await screen.findByText('Check inbox');
    expect(screen.getByText('9')).toBeTruthy();
    expect(screen.queryByText('7')).toBeNull();
  });

  it('shows a migrated ticked count as done: at its target, or done without a number', async () => {
    setup(plan({ items: [
      item({ id: 'm1', text: 'Send 50 emails', kind: 'count', target: 50, result: { done: true, value: 50, target: 50 } }),
      item({ id: 'm2', text: 'Calls', kind: 'count', target: null, result: { done: true, value: null, target: null } }),
    ] }));
    expect((await screen.findByLabelText('Send 50 emails') as HTMLInputElement).value).toBe('50');
    expect(screen.getByText('/ 50')).toBeTruthy();
    expect((screen.getByLabelText('Send 50 emails done') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Calls done') as HTMLInputElement).checked).toBe(true);
    fireEvent.change(screen.getByLabelText('Send 50 emails'), { target: { value: '40' } });
    expect((screen.getByLabelText('Send 50 emails done') as HTMLInputElement).checked).toBe(true); // an edit keeps the tick
  });

  it('says "Update post" once submitted', async () => {
    setup(plan({ submitted: true, loggedAt: 'x' }));
    expect(await screen.findByRole('button', { name: 'Update post' })).toBeTruthy();
  });

  it('saves results for every item, focus, no target or bidder', async () => {
    setup(plan());
    await screen.findByText('Check inbox');
    fireEvent.change(screen.getByLabelText('Outreach'), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('Write post'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post update' }));
    await waitFor(() => expect(api.putDayPlan).toHaveBeenCalled());
    const [day, body] = vi.mocked(api.putDayPlan).mock.calls[0] as unknown as [string, Record<string, any>];
    expect(day).toBe('2026-11-17');
    // Counts / hours send done + value; typing the target ticks the row.
    expect(body.results).toEqual({ r1: { done: false }, r2: { done: true, value: 50 }, g1: { done: false, value: 12 }, g2: { done: false } });
    expect([...body.focus].sort()).toEqual(['g1', 'g2']);
    expect(body).not.toHaveProperty('targetOverride');
    expect(body.done).not.toHaveProperty('bidsBidder');
    expect(JSON.stringify(body.results)).not.toContain('target');
  });

  it("saving sends a log item's entries with empty notes dropped", async () => {
    setup(plan({
      items: [item({ id: 'l1', text: 'Profile review', kind: 'log' })],
      profiles: [{ id: 'p1', name: 'Anna', region: null, archived: false }],
    }));
    await screen.findByText('Profile review');
    fireEvent.click(screen.getByRole('button', { name: /add profile/i }));
    fireEvent.change(screen.getByLabelText('What changed 1'), { target: { value: ' New title ' } });
    fireEvent.click(screen.getByRole('button', { name: /add profile/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Post update' }));
    await waitFor(() => expect(api.putDayPlan).toHaveBeenCalled());
    const body = vi.mocked(api.putDayPlan).mock.calls[0][1] as unknown as Record<string, any>;
    expect(body.results.l1).toEqual({ done: true, entries: [{ profileId: 'p1', note: 'New title' }] });
  });

  it('sends targetOverride only after "change for today"', async () => {
    setup(plan());
    await screen.findByText('Check inbox');
    fireEvent.click(screen.getByRole('button', { name: /change for today/i }));
    fireEvent.change(screen.getByLabelText(/bids self \(us\) goal/i), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post update' }));
    await waitFor(() => expect(api.putDayPlan).toHaveBeenCalled());
    const body = vi.mocked(api.putDayPlan).mock.calls[0][1] as unknown as Record<string, any>;
    expect(body.targetOverride.bidsSelfUs).toBe(4);
  });

  it('works on a weekend with no targets or routines (Extra still there)', async () => {
    setup(plan({ date: '2026-11-14', targets: c, items: [], progress: {}, focus: [] }), '2026-11-14');
    expect(await screen.findByRole('button', { name: 'Post update' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: /add a note/i })).toBeTruthy();
  });

  it('resends an archived item that has a result, unchanged, read-only', async () => {
    const old = item({ id: 'a1', text: 'Old routine', kind: 'count', target: 5, archived: true, result: { done: true, value: 6, target: 5 } });
    setup(plan({ items: [old] }));
    expect(await screen.findByText('(removed)')).toBeTruthy();
    expect((screen.getByLabelText('Old routine') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Post update' }));
    await waitFor(() => expect(api.putDayPlan).toHaveBeenCalled());
    const body = vi.mocked(api.putDayPlan).mock.calls[0][1] as unknown as Record<string, any>;
    expect(body.results).toEqual({ a1: { done: true, value: 6 } });
    expect(body.focus).toEqual(['g2']);
  });

  it.each([
    [{ doneToday: ['Acme', 'Globex'], toDo: 3 }, 'Follow-ups · done today: Acme, Globex · still to do: 3'],
    [{ doneToday: [], toDo: 3 }, 'Follow-ups · still to do: 3'],
    [{ doneToday: ['Acme', 'Globex'], toDo: 0 }, 'Follow-ups · done today: Acme, Globex'],
    [{ doneToday: ['A', 'B', 'C', 'D', 'E', 'F', 'G'], toDo: 1 }, 'Follow-ups · done today: A, B, C, D, E +2 · still to do: 1'],
  ])('shows the read-only follow-ups line: %#', async (followUps, line) => {
    setup(plan({ followUps }));
    await screen.findByText('Check inbox');
    expect(screen.getByText('Follow-ups').parentElement?.textContent).toBe(line);
  });

  it.each([[{ doneToday: [], toDo: 0 }], [undefined]])('leaves the follow-ups line out when there is nothing: %#', async (followUps) => {
    setup(plan({ followUps }));
    await screen.findByText('Check inbox');
    expect(screen.queryByText(/Follow-ups/)).toBeNull();
  });

  it('saving the day does not send the follow-ups', async () => {
    setup(plan({ followUps: { doneToday: ['Acme'], toDo: 2 } }));
    await screen.findByText('Check inbox');
    fireEvent.click(screen.getByRole('button', { name: 'Post update' }));
    await waitFor(() => expect(api.putDayPlan).toHaveBeenCalled());
    expect(vi.mocked(api.putDayPlan).mock.calls[0][1]).not.toHaveProperty('followUps');
  });

  describe('text and choice', () => {
    const tc = (result: object | null = null, rc: object | null = null) => plan({ items: [
      item({ id: 't1', text: 'Blockers', kind: 'text', options: [], result }),
      item({ id: 'c1', text: 'Status', kind: 'choice', options: ['Done', 'Blocked'], result: rc }),
    ] });
    const sent = () => (vi.mocked(api.putDayPlan).mock.calls[0][1] as { results: Record<string, object> }).results;

    it('sends the text trimmed, and never a choice the person did not change', async () => {
      setup(tc({ done: true, value: null, text: ' hi ' }, { done: true, value: null, choice: 'Gone', text: null }));
      await screen.findByText('Blockers');
      fireEvent.click(screen.getByRole('button', { name: 'Post update' }));
      await waitFor(() => expect(api.putDayPlan).toHaveBeenCalled());
      expect(sent()).toEqual({ t1: { done: true, text: 'hi' }, c1: { done: true } });
    });

    it('sends an emptied text as "" and a changed pick and note', async () => {
      setup(tc({ done: true, value: null, text: 'old' }, null));
      await screen.findByText('Blockers');
      fireEvent.change(screen.getByLabelText('Blockers answer'), { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: 'Blocked' }));
      fireEvent.change(screen.getByLabelText('Status note'), { target: { value: ' why ' } });
      fireEvent.click(screen.getByRole('button', { name: 'Post update' }));
      await waitFor(() => expect(api.putDayPlan).toHaveBeenCalled());
      expect(sent()).toEqual({ t1: { done: false, text: '' }, c1: { done: true, choice: 'Blocked', text: 'why' } });
    });

    it('clearing the pick sends choice null', async () => {
      setup(tc(null, { done: true, value: null, choice: 'Done' }));
      await screen.findByText('Status');
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
      fireEvent.click(screen.getByRole('button', { name: 'Post update' }));
      await waitFor(() => expect(api.putDayPlan).toHaveBeenCalled());
      expect(sent().c1).toEqual({ done: false, choice: null });
    });
  });
});
