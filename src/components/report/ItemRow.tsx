import type { DayItem } from '../../api/endpoints';

/** Archived items stay on days that have a result for them (the server rebuilds results from the body). */
export const kept = (i: DayItem) => !i.archived || i.result !== null;

export default function ItemRow({
  item, result, week, disabled, onChange,
}: {
  item: DayItem;
  result: { done: boolean; value: number | null };
  /** A weekly goal's progress so far this week. */
  week?: { value: number; done: boolean; target: number | null };
  disabled: boolean;
  onChange: (r: { done: boolean; value: number | null }) => void;
}) {
  const target = item.result?.target ?? item.target; // a saved day keeps the target it was frozen with
  const removed = item.archived ? <span className="ml-1 text-xs text-muted">(removed)</span> : null;
  // The saved done (decided by the server), while the number is the saved one; a migrated tick may have no number.
  const savedDone = !!item.result?.done && result.value === (item.result.value ?? null);
  const progress = week && (
    <span className="ml-auto text-xs tabular-nums text-muted">
      {item.kind === 'check' ? (week.done ? '✓ this week' : 'Not yet this week') : <>This week {week.value}{week.target ? ` / ${week.target}` : ''}</>}
    </span>
  );
  if (item.kind === 'check') {
    return (
      <li>
        <label className="flex items-center gap-2 text-sm text-body">
          <input
            type="checkbox"
            className="h-4 w-4"
            disabled={disabled}
            checked={result.done}
            onChange={(e) => onChange({ done: e.target.checked, value: null })}
          />
          {item.text}{removed}
          {progress}
        </label>
      </li>
    );
  }
  return (
    <li className="flex items-center gap-2 text-sm text-body">
      <span className="min-w-0 flex-1">{item.text}{removed}</span>
      <input
        aria-label={item.text}
        type="number"
        min={0}
        step={item.kind === 'hours' ? 'any' : 1}
        className="input !w-24 shrink-0 text-right tabular-nums"
        disabled={disabled}
        value={result.value ?? ''}
        onChange={(e) => {
          const value = e.target.value === '' ? null : Math.max(0, Number(e.target.value));
          onChange({ ...result, value });
        }}
      />
      {target ? <span className="text-xs tabular-nums text-muted">/ {target}</span> : null}
      {savedDone && <span className="text-xs">{result.value === null ? '✅ done' : '✅'}</span>}
      {progress}
    </li>
  );
}
