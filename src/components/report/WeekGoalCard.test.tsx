// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
    render(<WeekGoalCard today="2026-11-18" onOpenDay={() => {}} week={week()} canEdit onOpen={() => {}} />);
    expect(screen.getByText('Targets')).toBeTruthy();
    expect(screen.getByText('Daily to-dos')).toBeTruthy();
    expect(screen.getByText('Weekly to-dos')).toBeTruthy();
    expect(screen.getByText('Check inbox')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Send proposals' }).getAttribute('aria-valuetext')).toBe('180 of 250');
    expect(screen.getByText('180 / 250')).toBeTruthy();
  });

  it('marks a done count goal', () => {
    render(<WeekGoalCard today="2026-11-18" onOpenDay={() => {}} week={week({ progress: { g1: { value: 140, done: true, target: 250 } } })} canEdit onOpen={() => {}} />);
    expect(screen.getByText('(done)')).toBeTruthy();
  });

  it('shows the draft banner only for a draft', () => {
    const { unmount } = render(<WeekGoalCard today="2026-11-18" onOpenDay={() => {}} week={week({ exists: false, draft: true })} canEdit onOpen={() => {}} />);
    expect(screen.getByText(/Copied from last week — save to keep/)).toBeTruthy();
    unmount();
    render(<WeekGoalCard today="2026-11-18" onOpenDay={() => {}} week={week()} canEdit onOpen={() => {}} />);
    expect(screen.queryByText(/Copied from last week/)).toBeNull();
  });

  it('an admin viewing a person gets "Edit plan" / "Set plan" and an open button when there is no plan yet', () => {
    const onOpen = vi.fn();
    const { unmount } = render(<WeekGoalCard today="2026-11-18" onOpenDay={() => {}} week={week()} canEdit={false} adminEdit onOpen={onOpen} />);
    expect(screen.getByRole('button', { name: 'Edit plan' })).toBeTruthy();
    unmount();
    const empty = week({ exists: false, goal: counts, routines: [], weeklyGoals: [] });
    render(<WeekGoalCard today="2026-11-18" onOpenDay={() => {}} week={empty} canEdit={false} adminEdit onOpen={onOpen} />);
    expect(screen.getByRole('button', { name: 'Set plan' })).toBeTruthy();
    screen.getByRole('button', { name: 'Set week plan' }).click();
    expect(onOpen).toHaveBeenCalled();
  });

  it('a teammate viewing gets "View" and no set button', () => {
    render(<WeekGoalCard today="2026-11-18" onOpenDay={() => {}} week={week({ exists: false, goal: counts, routines: [], weeklyGoals: [] })} canEdit={false} onOpen={() => {}} />);
    expect(screen.getByRole('button', { name: 'View' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Set week plan' })).toBeNull();
  });

  const days = ['16', '17', '18', '19', '20', '21'].map((d, i) => ({
    date: `2026-11-${d}`, logged: false, submitted: false, goal: counts, done: counts, itemsDone: i === 2 ? 2 : 0, itemsTotal: 5,
  }));
  const grid = [
    { id: 'r1', text: 'Check inbox', doneDays: 2, totalDays: 3, days: days.map((d, i) => ({ date: d.date, state: (['done', 'done', 'today', 'future', 'future', 'future'] as const)[i], value: null, target: null })) },
    { id: 'r2', text: 'Contact', doneDays: 0, totalDays: 3, days: days.map((d, i) => ({ date: d.date, state: (['missed', 'missed', 'short', 'future', 'future', 'future'] as const)[i], value: i === 2 ? 30 : null, target: i === 2 ? 50 : null })) },
  ];
  const routines = [
    { id: 'r1', text: 'Check inbox', kind: 'check' as const, target: null, archived: false, options: [], addedBy: 'admin' as const },
    { id: 'r2', text: 'Contact', kind: 'count' as const, target: 50, archived: false, options: [], addedBy: 'self' as const },
  ];

  it('this week: today bar opens today, checklist shows today states, MINE and the folded grid', () => {
    const onOpenDay = vi.fn();
    render(<WeekGoalCard today="2026-11-18" onOpenDay={onOpenDay} week={week({ days, routines, routineDays: grid, plansOwnWeek: false })} canEdit onOpen={() => {}} />);
    expect(screen.getByText(/2 of 5 done · standup not sent yet/)).toBeTruthy();
    expect(screen.getByText('Planned by your admin')).toBeTruthy();
    screen.getByRole('button', { name: "Fill today's standup" }).click();
    expect(onOpenDay).toHaveBeenCalledWith('2026-11-18');
    expect(screen.getByText("Today's to-dos")).toBeTruthy();
    expect(screen.getByText('30 / 50')).toBeTruthy();
    expect(screen.getByText('MINE')).toBeTruthy();
    expect(screen.getByRole('button', { name: '+ Add my own item' })).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'Daily to-dos by day' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Show week by day/ }));
    expect(screen.getByRole('table', { name: 'Daily to-dos by day' })).toBeTruthy();
  });

  it('targets: only set ones, against the pace of the week', () => {
    const goal = { ...counts, bidsSelf: 600, interviewsSelf: 6 };
    const done = { ...counts, bidsSelf: 100, interviewsSelf: 3 };
    render(<WeekGoalCard today="2026-11-18" onOpenDay={() => {}} week={week({ days, goal, done })} canEdit onOpen={() => {}} />);
    expect(screen.queryByText('Bids · bidder')).toBeNull();
    expect(screen.getByText('200 behind')).toBeTruthy(); // 600 × 3/6 = 300 expected by tonight
    expect(screen.getByText('on pace')).toBeTruthy(); // 3 of 6, 3 expected
  });

  it('an admin viewing gets "Open today" and no add button; an older server has no grid toggle', () => {
    render(<WeekGoalCard today="2026-11-18" onOpenDay={() => {}} week={week({ days, routines, plansOwnWeek: false })} canEdit={false} adminEdit onOpen={() => {}} />);
    expect(screen.getByRole('button', { name: 'Open today' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '+ Add my own item' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Show week by day/ })).toBeNull();
  });

  it('a past week: no today bar, the grid shown open', () => {
    render(<WeekGoalCard today="2026-11-30" onOpenDay={() => {}} week={week({ days, routines, routineDays: grid })} canEdit onOpen={() => {}} />);
    expect(screen.queryByText(/standup/)).toBeNull();
    expect(screen.getByRole('table', { name: 'Daily to-dos by day' })).toBeTruthy();
  });
});
