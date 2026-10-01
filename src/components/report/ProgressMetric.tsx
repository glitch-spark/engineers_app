/** One Goal vs Done number: big count, thin progress bar and what's left. */
export default function ProgressMetric({
  label,
  done,
  goal,
  note,
}: {
  label: string;
  done: number;
  goal: number;
  /** Small text under the bar instead of "n to go" (e.g. where the number comes from). */
  note?: string;
}) {
  const pct = goal > 0 ? Math.round((done / goal) * 100) : 0;
  const met = goal > 0 && done >= goal;
  const status = goal === 0 ? 'No goal set' : met ? 'Goal met' : `${goal - done} to go`;
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xs font-medium text-muted">{label}</span>
        {goal > 0 && (
          <span className={`text-xs font-medium tabular-nums ${met ? 'text-success-700 dark:text-success-400' : 'text-muted'}`}>
            {pct}%
          </span>
        )}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="text-2xl font-semibold tabular-nums text-strong">{done}</span>
        <span className="text-sm tabular-nums text-muted">/ {goal || '—'}</span>
      </div>
      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={goal || 0}
        aria-valuenow={done}
        aria-valuetext={goal ? `${done} of ${goal}` : `${done}, no goal`}
      >
        <div
          className={`h-full rounded-full transition-all ${met ? 'bg-success-500' : 'bg-accent-500'}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <div className={`mt-1 text-xs ${met ? 'text-success-700 dark:text-success-400' : 'text-muted'}`}>
        {met ? `✓ ${status}` : status}
        {note && <span className="text-muted"> · {note}</span>}
      </div>
    </div>
  );
}
