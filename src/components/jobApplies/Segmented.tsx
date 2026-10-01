import { useId } from 'react';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/** A labelled group of mutually exclusive options that reads as one control (not loose pill buttons). */
export default function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <span id={id} className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={id}
        className="inline-flex rounded-xl border border-zinc-200 bg-zinc-100/70 p-0.5 dark:border-zinc-700 dark:bg-zinc-800/60"
      >
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.value)}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-[10px] px-3 py-1 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 ${
                on
                  ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-50'
                  : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
              }`}
            >
              {o.label}
              {o.count !== undefined && (
                <span
                  className={`rounded-md px-1.5 text-xs tabular-nums ${
                    on ? 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300' : 'text-zinc-500'
                  }`}
                >
                  {o.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
