// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import * as api from '../../api/endpoints';
import WeekPanel from './WeekPanel';

vi.mock('../../api/endpoints', () => ({ getWeekPlan: vi.fn(), putWeekPlan: vi.fn() }));
afterEach(cleanup);

const counts = { bidsSelf: 0, bidsSelfUs: 0, bidsSelfEu: 0, bidsSelfLatam: 0, bidsBidder: 0, interviewsSelf: 0, interviewsCaller: 0 };
const plan = {
  weekStart: '2026-11-16', exists: false, draft: true, userId: 'u', goal: counts, done: counts,
  routines: [{ id: 'r1', text: 'Check inbox', kind: 'check', target: null, archived: false }],
  weeklyGoals: [], progress: {}, recapNotes: '', stages: { self: {}, caller: {} }, days: [],
};

describe('WeekPanel', () => {
  it('shows the draft banner and saves routines / weeklyGoals, new items without ids', async () => {
    vi.mocked(api.getWeekPlan).mockResolvedValue(plan as never);
    vi.mocked(api.putWeekPlan).mockResolvedValue(plan as never);
    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <WeekPanel weekStart="2026-11-16" readOnly={false} open onClose={() => {}} onSaved={() => {}} />
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
    expect(body).not.toHaveProperty('goalItems');
    expect(body).not.toHaveProperty('dailyGoal');
  });
});
