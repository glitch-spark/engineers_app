import { useId, useMemo } from 'react';
import type { EvalJobDescription, EvalRole } from '../../api/endpoints';
import { formatUsd } from '../../lib/modelCost';

export type ScopeKey = '5' | '25' | 'all' | 'custom';

/**
 * Round-robin across roles in library order: the first posting of every role, then the second of every role, and
 * so on, until `count`. A small scope therefore still spans several roles instead of five postings of one role.
 */
export function roundRobinIds(jds: EvalJobDescription[], roles: EvalRole[], count: number): string[] {
  const byRole = new Map<EvalRole, EvalJobDescription[]>();
  for (const jd of jds) byRole.set(jd.role, [...(byRole.get(jd.role) ?? []), jd]);
  const order = roles.filter((r) => byRole.has(r));
  const out: string[] = [];
  for (let depth = 0; out.length < count; depth++) {
    let added = false;
    for (const role of order) {
      const jd = byRole.get(role)?.[depth];
      if (!jd) continue;
      out.push(jd._id);
      added = true;
      if (out.length >= count) break;
    }
    if (!added) break;
  }
  return out;
}

/**
 * Scope presets with the price of each, given the per-JD cost of the chosen resume + judge models.
 * `perJdCost` is null when a model's price is unknown; the chips then show the count only.
 */
export default function ScopePicker({
  value,
  onChange,
  librarySize,
  perJdCost,
}: {
  value: ScopeKey;
  onChange: (key: ScopeKey) => void;
  librarySize: number;
  perJdCost: number | null;
}) {
  const id = useId();
  const options = useMemo(() => {
    const sizes: { key: ScopeKey; count: number; label: string }[] = [];
    if (librarySize > 5) sizes.push({ key: '5', count: 5, label: '5 JDs' });
    if (librarySize > 25) sizes.push({ key: '25', count: 25, label: '25 JDs' });
    sizes.push({ key: 'all', count: librarySize, label: `All ${librarySize}` });
    return sizes;
  }, [librarySize]);

  return (
    <div>
      <span id={id} className="block text-xs font-medium mb-1 text-muted">
        Scope
      </span>
      <div role="radiogroup" aria-labelledby={id} className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value === o.key;
          const price = perJdCost == null ? null : perJdCost * o.count;
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.key)}
              className={
                'focus-ring rounded-lg border px-2.5 py-1 text-xs font-medium transition ' +
                (on
                  ? 'border-sky-700 bg-sky-700 text-white dark:border-sky-500 dark:bg-sky-600'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800')
              }
            >
              {o.label}
              <span className={`ml-1 tabular-nums ${on ? 'opacity-80' : 'text-faint'}`}>{price == null ? '' : `· ~${formatUsd(price)}`}</span>
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={value === 'custom'}
          onClick={() => onChange('custom')}
          className={
            'focus-ring rounded-lg border px-2.5 py-1 text-xs font-medium transition ' +
            (value === 'custom'
              ? 'border-sky-700 bg-sky-700 text-white dark:border-sky-500 dark:bg-sky-600'
              : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800')
          }
        >
          Custom
        </button>
      </div>
      <p className="hint mt-1">
        Presets take one posting per role, then a second per role, and so on. Prices are catalog estimates for the models picked above; real spend has run about two thirds of that, and cached rows cost nothing.
      </p>
    </div>
  );
}
