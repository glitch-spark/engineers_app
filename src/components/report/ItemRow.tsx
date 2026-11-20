import type { DayItem } from '../../api/endpoints';

/** Archived items stay on days that have a result for them (the server rebuilds results from the body). */
export const kept = (i: DayItem) => !i.archived || i.result !== null;

export default function ItemRow({
  item, result, week, disabled, valueLocked, doneLocked, note, compact, onChange,
}: {
  item: DayItem;
  result: { done: boolean; value: number | null };
  /** A weekly goal's progress so far this week. */
  week?: { value: number; done: boolean; target: number | null };
  disabled: boolean;
  /** Keep the number box read-only while the checkbox stays usable. */
  valueLocked?: boolean;
  /** Keep the checkbox read-only while the number box stays usable. */
  doneLocked?: boolean;
  /** Muted trailing text, e.g. "done Mon". */
  note?: string;
  /** A number box as low as the small buttons beside it (Home). */
  compact?: boolean;
  onChange: (r: { done: boolean; value: number | null }) => void;
}) {
  const target = item.result?.target ?? item.target; // a saved day keeps the target it was frozen with
  const cls = result.done ? 'line-through text-muted' : '';
  const removed = item.archived ? <span className="ml-1 text-xs text-muted">(removed)</span> : null;
  const progress = week && (
    <span className="ml-auto text-xs tabular-nums text-muted">
      {item.kind === 'check' ? (note ? null : week.done ? '✓ this week' : 'Not yet this week') : <>{week.value}{week.target ? ` / ${week.target}` : ''} this week</>}
    </span>
  );
  const showTarget = !!target && !week;
  const reached = showTarget && (result.value ?? 0) >= target!;
  if (item.kind === 'check') {
    return (
      <li className="rounded-lg px-1 py-1.5 hover:bg-black/5 dark:hover:bg-white/5">
        <label className="flex items-center gap-2 text-sm text-body">
          <input
            type="checkbox"
            className="h-4 w-4"
            disabled={disabled || doneLocked}
            checked={result.done}
            onChange={(e) => onChange({ done: e.target.checked, value: null })}
          />
          <span className={cls}>{item.text}</span>{removed}
          {progress}
          {note && <span className="ml-auto text-xs text-muted">{note}</span>}
        </label>
      </li>
    );
  }
  return (
    <li className="flex items-center gap-2 rounded-lg px-1 py-1.5 text-sm text-body hover:bg-black/5 dark:hover:bg-white/5">
      <input
        type="checkbox"
        className="h-4 w-4"
        aria-label={`${item.text} done`}
        disabled={disabled || doneLocked}
        checked={result.done}
        onChange={(e) => onChange({ done: e.target.checked, value: result.value })}
      />
      <span className={`min-w-0 ${cls}`}>{item.text}{removed}</span>
      {/* the number and its target share one box, next to the text they belong to (user, 2026-11-20) */}
      <span
        data-count-box
        className="inline-flex shrink-0 items-center rounded-lg border border-zinc-300 bg-white pr-2 focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500 dark:border-zinc-700 dark:bg-zinc-900"
      >
        <input
          aria-label={item.text}
          type="number"
          min={0}
          step={item.kind === 'hours' ? 'any' : 1}
          placeholder="0"
          className={`w-12 bg-transparent pl-2 text-right tabular-nums outline-none disabled:opacity-60 ${compact ? 'py-0.5' : 'py-1'}`}
          disabled={disabled || valueLocked}
          value={result.value ?? ''}
          onChange={(e) => {
            const value = e.target.value === '' ? null : Math.max(0, Number(e.target.value));
            const reaches = value !== null && (target ? value >= target : value > 0);
            onChange({ done: result.done || reaches, value });
          }}
        />
        {showTarget ? <span className="ml-1 text-xs tabular-nums text-muted">/ {target}</span> : null}
      </span>
      {showTarget && (
        <span aria-hidden className="hidden h-1.5 w-20 shrink-0 overflow-hidden rounded bg-zinc-100 sm:block dark:bg-zinc-800">
          <span
            data-count-bar
            className={`block h-full rounded ${reached ? 'bg-green-500 dark:bg-green-400' : 'bg-sky-500 dark:bg-sky-400'}`}
            style={{ width: `${Math.min(100, Math.round(((result.value ?? 0) / target!) * 100))}%` }}
          />
        </span>
      )}
      <span className="flex-1" />
      {progress}
      {note && <span className="text-xs text-muted">{note}</span>}
    </li>
  );
}
