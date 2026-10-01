import { ChevronRight } from 'lucide-react';
import type { DayPlan } from '../../api/endpoints';
import { dayLabel, parseDateParam, regionTotal } from '../../lib/reportWeek';
import GoalDone from './GoalDone';

/** One day of the week board: Goal → Done per category, or the goal still to come. */
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
  const isFuture = day.date > today;
  const logged = day.loggedAt !== null;
  const { goal, done } = day;
  const bidsGoal = goal.bidsSelf + goal.bidsBidder;
  const interviewsGoal = goal.interviewsSelf + goal.interviewsCaller;
  const ticked = day.goalItems.filter((i) => i.done).length;
  const hasGoal = bidsGoal > 0 || interviewsGoal > 0 || day.goalItems.length > 0;

  let body;
  if (isFuture || (!logged && !isToday && !day.exists)) {
    body = hasGoal ? (
      <span className="text-sm text-muted">
        Goal: Bids {bidsGoal} · Interviews {interviewsGoal}
        {day.goalItems.length > 0 && ` · ${day.goalItems.length} items`}
      </span>
    ) : (
      <span className="text-sm text-muted">{isFuture && canEdit ? 'Set goal' : '—'}</span>
    );
  } else if (isToday && !logged) {
    body = (
      <span className="flex flex-wrap items-center gap-3 text-sm">
        {canEdit && <span className="btn text-xs">Log today</span>}
        {hasGoal && <span className="text-muted">Goal: Bids {bidsGoal} · Interviews {interviewsGoal}</span>}
      </span>
    );
  } else {
    body = (
      <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <GoalDone label="Bids" done={done.bidsSelf + done.bidsBidder} goal={bidsGoal} />
        <GoalDone label="Interviews" done={done.interviewsSelf + done.interviewsCaller} goal={interviewsGoal} />
        {(regionTotal(goal.profiles) > 0 || regionTotal(done.profiles) > 0) && (
          <GoalDone label="Profiles" done={regionTotal(done.profiles)} goal={regionTotal(goal.profiles)} />
        )}
        {(regionTotal(goal.linkedin) > 0 || regionTotal(done.linkedin) > 0) && (
          <GoalDone label="LinkedIn" done={regionTotal(done.linkedin)} goal={regionTotal(goal.linkedin)} />
        )}
        {day.goalItems.length > 0 && <span className="text-muted">Items {ticked}/{day.goalItems.length}</span>}
      </span>
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
        <span className="min-w-0 flex-1">{body}</span>
        <ChevronRight size={16} className="shrink-0 text-muted" aria-hidden />
      </button>
    </li>
  );
}
