import type { DayItem } from '../../api/endpoints';

/** Archived items stay on days that have a result for them (the server rebuilds results from the body). */
export const kept = (i: DayItem) => !i.archived || i.result !== null;

export default function ItemRow({
  item, result, week, disabled, valueLocked, doneLocked, note, onChange,
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
      <span className={`min-w-0 flex-1 ${cls}`}>{item.text}{removed}</span>
      <input
        aria-label={item.text}
        type="number"
        min={0}
        step={item.kind === 'hours' ? 'any' : 1}
        className="input !w-16 shrink-0 text-right tabular-nums"
        disabled={disabled || valueLocked}
        value={result.value ?? ''}
        onChange={(e) => {
          const value = e.target.value === '' ? null : Math.max(0, Number(e.target.value));
          const reaches = value !== null && (target ? value >= target : value > 0);
          onChange({ done: result.done || reaches, value });
        }}
      />
      {target && !week ? <span className="text-xs tabular-nums text-muted">/ {target}</span> : null}
      {progress}
      {note && <span className="text-xs text-muted">{note}</span>}
    </li>
  );
}
