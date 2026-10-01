import { ChevronRight } from 'lucide-react';
import type { DayPlan } from '../../api/endpoints';
import { dayLabel, dayState, parseDateParam } from '../../lib/reportWeek';
import GoalDone from './GoalDone';

/** One day of the week board: its goal (from the weekly plan), then what was done once followed up. */
export default function DayRow({
  day,
  today,
  canEdit,
  onOpen,
}: {
  day: DayPlan;
  today: string;
  canEdit: boolean;
  onOpen: () => void;
}) {
  const date = parseDateParam(day.date) ?? new Date();
  const isToday = day.date === today;
  const { goal, done } = day;
  const bidsGoal = goal.bidsSelf + goal.bidsBidder;
  const ticked = day.goalItems.filter((i) => i.done).length;
  const hasGoal = bidsGoal > 0 || day.goalItems.length > 0;
  const state = dayState({ date: day.date, today, hasGoal, logged: day.loggedAt !== null });
  const interviews = done.interviewsSelf + done.interviewsCaller;

  const interviewsText = (
    <span className="whitespace-nowrap text-muted">
      Interviews <span className="font-medium text-strong">{interviews}</span>
      {interviews > 0 && ` (${done.interviewsSelf} self · ${done.interviewsCaller} caller)`}
    </span>
  );
  const goalText = (
    <span className="text-muted">
      Goal: Bids {bidsGoal}
      {day.goalItems.length > 0 && ` · ${day.goalItems.length} goal${day.goalItems.length === 1 ? '' : 's'}`}
    </span>
  );

  let body;
  if (state === 'done') {
    body = (
      <>
        <GoalDone label="Bids" done={done.bidsSelf + done.bidsBidder} goal={bidsGoal} />
        {interviewsText}
        {day.goalItems.length > 0 && <span className="text-muted">Goals {ticked}/{day.goalItems.length}</span>}
      </>
    );
  } else if (state === 'follow-up') {
    body = (
      <>
        {canEdit && <span className="btn text-xs">Follow up</span>}
        {hasGoal ? goalText : <span className="text-muted">No daily goal yet</span>}
        {interviews > 0 && interviewsText}
      </>
    );
  } else if (state === 'planned') {
    body = goalText;
  } else if (state === 'none') {
    body = <span className="text-muted">—</span>;
  } else {
    body = (
      <>
        <span className="text-muted">No plan</span>
        {interviews > 0 && interviewsText}
      </>
    );
  }

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition hover:bg-zinc-50 focus-ring dark:hover:bg-zinc-900 ${
          isToday ? 'bg-sky-50/60 ring-1 ring-sky-200 dark:bg-sky-950/30 dark:ring-sky-900' : ''
        }`}
      >
        <span className="w-28 shrink-0 text-sm font-medium text-strong">
          {dayLabel(date)}
          {isToday && <span className="block text-xs font-normal text-sky-700 dark:text-sky-400">Today</span>}
        </span>
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-sm">{body}</span>
        <ChevronRight size={16} className="shrink-0 text-muted" aria-hidden />
      </button>
    </li>
  );
}
