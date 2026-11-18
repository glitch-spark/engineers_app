// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import * as api from '../../api/endpoints';
import DayPanel from './DayPanel';

vi.mock('../../api/endpoints', () => ({ getDayPlan: vi.fn(), putDayPlan: vi.fn(), deleteDayPlan: vi.fn() }));
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
    setup(plan());
    expect(await screen.findByText('Check inbox')).toBeTruthy();
    expect((screen.getByLabelText('Outreach') as HTMLInputElement).value).toBe('31');
    expect(screen.getByText('/ 50')).toBeTruthy();
    expect(screen.getByText(/180 \/ 250/)).toBeTruthy();
    expect(screen.queryByLabelText(/bids bidder done/i)).toBeNull();
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Post update' })).toBeTruthy();
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
    expect(body.results).toEqual({
      r1: { done: false, value: null },
      r2: { done: true, value: 50 },
      g1: { done: false, value: 12 },
      g2: { done: false, value: null },
    });
    expect([...body.focus].sort()).toEqual(['g1', 'g2']);
    expect(body).not.toHaveProperty('targetOverride');
    expect(body.done).not.toHaveProperty('bidsBidder');
    expect(JSON.stringify(body.results)).not.toContain('target');
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
});
