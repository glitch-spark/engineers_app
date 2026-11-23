// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { WeekPlan } from '../../api/endpoints';
import WeekGoalCard from './WeekGoalCard';

afterEach(cleanup);

const counts = { bidsSelf: 0, bidsSelfUs: 0, bidsSelfEu: 0, bidsSelfLatam: 0, bidsBidder: 0, interviewsSelf: 0, interviewsCaller: 0 };
const week = (over: Partial<WeekPlan> = {}): WeekPlan => ({
  weekStart: '2026-11-16', exists: true, draft: false, userId: 'u', goal: { ...counts, bidsSelf: 50 }, done: counts,
  routines: [{ id: 'r1', text: 'Check inbox', kind: 'check', target: null, archived: false, options: [], addedBy: 'admin' as const }],
  weeklyGoals: [{ id: 'g1', text: 'Send proposals', kind: 'count', target: 250, archived: false, options: [], addedBy: 'admin' as const }],
  progress: { g1: { value: 180, done: false, target: 250 } },
  recapNotes: '', stages: { self: {}, caller: {} }, days: [], plansOwnWeek: true, ...over,
});

describe('WeekGoalCard', () => {
  it('shows the three blocks and goal progress 180 / 250', () => {
    render(<WeekGoalCard week={week()} canEdit onOpen={() => {}} />);
    expect(screen.getByText('Targets')).toBeTruthy();
    expect(screen.getByText('Routines')).toBeTruthy();
    expect(screen.getByText('Weekly goals')).toBeTruthy();
    expect(screen.getByText('Check inbox')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Send proposals' }).getAttribute('aria-valuetext')).toBe('180 of 250');
    expect(screen.getByText('/ 250')).toBeTruthy();
  });

  it('marks a done count goal', () => {
    render(<WeekGoalCard week={week({ progress: { g1: { value: 140, done: true, target: 250 } } })} canEdit onOpen={() => {}} />);
    expect(screen.getByText('(done)')).toBeTruthy();
  });

  it('shows the draft banner only for a draft', () => {
    const { unmount } = render(<WeekGoalCard week={week({ exists: false, draft: true })} canEdit onOpen={() => {}} />);
    expect(screen.getByText(/Copied from last week — save to keep/)).toBeTruthy();
    unmount();
    render(<WeekGoalCard week={week()} canEdit onOpen={() => {}} />);
    expect(screen.queryByText(/Copied from last week/)).toBeNull();
  });

  it('an admin viewing a person gets "Edit plan" / "Set plan" and an open button when there is no plan yet', () => {
    const onOpen = vi.fn();
    const { unmount } = render(<WeekGoalCard week={week()} canEdit={false} adminEdit onOpen={onOpen} />);
    expect(screen.getByRole('button', { name: 'Edit plan' })).toBeTruthy();
    unmount();
    const empty = week({ exists: false, goal: counts, routines: [], weeklyGoals: [] });
    render(<WeekGoalCard week={empty} canEdit={false} adminEdit onOpen={onOpen} />);
    expect(screen.getByRole('button', { name: 'Set plan' })).toBeTruthy();
    screen.getByRole('button', { name: 'Set week plan' }).click();
    expect(onOpen).toHaveBeenCalled();
  });

  it('a teammate viewing gets "View" and no set button', () => {
    render(<WeekGoalCard week={week({ exists: false, goal: counts, routines: [], weeklyGoals: [] })} canEdit={false} onOpen={() => {}} />);
    expect(screen.getByRole('button', { name: 'View' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Set week plan' })).toBeNull();
  });
});
