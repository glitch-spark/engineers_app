import { ChevronRight } from 'lucide-react';
import type { Counts, DayPlan } from '../../api/endpoints';
import { compare, dayLabel, dayState, parseDateParam, preSplitSelf, SELF_REGIONS } from '../../lib/reportWeek';
import GoalDone from './GoalDone';

type BidPart = { label: string; done: number; goal: number };

/** LATAM, EU, US, then Bidder, the order the daily follow-up reads them. */
const SPLIT_REGIONS = [...SELF_REGIONS].reverse();

/** The day's bids by region and bidder; self bids saved before the region
 *  split show as "Self". Parts with neither goal nor done are left out. */
function bidParts(goal: Counts, done: Counts): BidPart[] {
  const parts: BidPart[] = [
    ...SPLIT_REGIONS.map((r) => ({ label: r.label, done: done[r.field] ?? 0, goal: goal[r.field] ?? 0 })),
    { label: 'Self', done: preSplitSelf(done), goal: preSplitSelf(goal) },
    { label: 'Bidder', done: done.bidsBidder, goal: goal.bidsBidder },
  ];
  return parts.filter((p) => p.done > 0 || p.goal > 0);
}

/** "(LATAM 20/50, EU 30/50, …)", or just the goals "(LATAM 50, …)" before follow-up. */
function BidSplit({ parts, showDone }: { parts: BidPart[]; showDone: boolean }) {
  if (parts.length === 0) return null;
  return (
    <span className="ml-1 text-muted">
      (
      {parts.map((p, i) => (
        <span key={p.label} className="whitespace-nowrap tabular-nums">
          {i > 0 && ', '}
          {p.label}{' '}
          {showDone ? (
            <>
              <span
                className={`font-medium ${
                  compare(p.done, p.goal).state === 'short' ? 'text-amber-700 dark:text-amber-400' : 'text-strong'
                }`}
              >
                {p.done}
              </span>
              /{p.goal}
            </>
          ) : (
            p.goal
          )}
        </span>
      ))}
      )
    </span>
  );
}

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
  const parts = bidParts(goal, done);

  const interviewsText = (
    <span className="whitespace-nowrap text-muted">
      Interviews <span className="font-medium text-strong">{interviews}</span>
      {interviews > 0 && ` (${done.interviewsSelf} self · ${done.interviewsCaller} caller)`}
    </span>
  );
  const goalText = (
    <span className="text-muted">
      Goal: Bids {bidsGoal}
      <BidSplit parts={parts.filter((p) => p.goal > 0)} showDone={false} />
      {day.goalItems.length > 0 && ` · ${day.goalItems.length} goal${day.goalItems.length === 1 ? '' : 's'}`}
    </span>
  );

  let body;
  if (state === 'done') {
    body = (
      <>
        <span>
          <GoalDone label="Bids" done={done.bidsSelf + done.bidsBidder} goal={bidsGoal} />
          <BidSplit parts={parts} showDone />
        </span>
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
