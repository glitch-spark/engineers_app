import { DAY_NAMES, PRESETS, normDays, sameDays, type Days } from '../../lib/planDays';

/** "Runs on": a preset (Mon–Sat / Mon–Fri / Sat only) or single days; at least one day stays picked. */
export default function DaysPicker({ value, onChange, label = 'Runs on' }: { value: Days; onChange: (d: Days) => void; label?: string }) {
  const on = normDays(value) ?? [0, 1, 2, 3, 4, 5];
  const toggle = (d: number) => {
    const next = on.includes(d) ? on.filter((x) => x !== d) : [...on, d];
    if (next.length) onChange(normDays(next));
  };
  const btn = (active: boolean) =>
    `rounded-md border px-2 py-1 text-xs font-medium ${active ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900' : 'border-zinc-300 bg-white text-body dark:border-zinc-700 dark:bg-zinc-950'}`;
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1">
      <span className="form-label">{label}</span>
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((p) => (
          <button key={p.label} type="button" aria-pressed={sameDays(p.days, value)} className={btn(sameDays(p.days, value))} onClick={() => onChange(p.days)}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex gap-1">
        {DAY_NAMES.map((n, d) => (
          <button key={n} type="button" aria-label={n} aria-pressed={on.includes(d)} onClick={() => toggle(d)}
            className={`w-9 rounded-md border py-1 text-[11px] font-semibold ${on.includes(d) ? 'border-violet-300 bg-violet-100 text-violet-800 dark:border-violet-700 dark:bg-violet-900/40 dark:text-violet-200' : 'border-zinc-300 text-muted dark:border-zinc-700'}`}>
            {n.slice(0, 2)}
          </button>
        ))}
      </div>
    </div>
  );
}
