import { compare } from '../../lib/reportWeek';

const STATE_CLASS = {
  met: 'text-success-700 dark:text-success-400',
  over: 'text-success-700 dark:text-success-400',
  short: 'text-amber-700 dark:text-amber-400',
  none: 'text-muted',
} as const;

/** "done/goal" with ✓ met, ▼n short or ▲n over. */
export default function GoalDone({
  done,
  goal,
  label,
  showGoalOnly = false,
}: {
  done: number;
  goal: number;
  label?: string;
  showGoalOnly?: boolean;
}) {
  if (showGoalOnly) {
    return (
      <span className="tabular-nums text-muted">
        {label && <span className="mr-1">{label}</span>}
        {goal}
      </span>
    );
  }
  const { state, diff } = compare(done, goal);
  const mark = state === 'met' ? '✓' : state === 'short' ? `▼${diff}` : state === 'over' ? `▲${diff}` : '';
  const spoken =
    state === 'met' ? 'goal met' : state === 'short' ? `${diff} short` : state === 'over' ? `${diff} over goal` : 'no goal';
  return (
    <span className="whitespace-nowrap tabular-nums">
      {label && <span className="mr-1 text-muted">{label}</span>}
      <span className="font-medium text-strong">{done}</span>
      <span className="text-muted">/{goal}</span>
      {mark && <span className={`ml-1 text-xs ${STATE_CLASS[state]}`} aria-hidden>{mark}</span>}
      <span className="sr-only">{`, ${spoken}`}</span>
    </span>
  );
}
