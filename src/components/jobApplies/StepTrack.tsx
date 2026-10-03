import { Fragment } from 'react';
import { ChevronRight } from 'lucide-react';

export type Step = 1 | 2 | 3;

export const STEPS: { n: Step; title: string; about: string }[] = [
  { n: 1, title: 'Check jobs', about: 'Paste a sheet. We open every link and drop closed, old, on-site and clearance jobs.' },
  {
    n: 2,
    title: 'Pick profiles',
    about: 'Jobs are grouped by candidate location (US · UK/EU · Latam). Choose who applies where.',
  },
  { n: 3, title: 'Tailor & apply', about: 'Best resume per job, tailor the rest, export to your sheet, mark applied.' },
];

const NUM = ['①', '②', '③'];

/** The 3 Job Applies steps: a compact track with the current one highlighted, or (large) three explained boxes. */
export default function StepTrack({ current, hint, large }: { current?: Step; hint?: string; large?: boolean }) {
  if (large) {
    return (
      <ol className="grid gap-3 sm:grid-cols-3" aria-label="How Job Applies works">
        {STEPS.map((s) => (
          <li key={s.n} className="panel p-4">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              <span aria-hidden>{NUM[s.n - 1]}</span> {s.title}
            </p>
            <p className="hint mt-1">{s.about}</p>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <div>
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm" aria-label="Job Applies steps">
        {STEPS.map((s, i) => (
          <Fragment key={s.n}>
            {i > 0 && <ChevronRight className="h-4 w-4 text-zinc-400" aria-hidden />}
            <li
              aria-current={current === s.n ? 'step' : undefined}
              title={s.about}
              className={`rounded-full px-2.5 py-0.5 ${
                current === s.n
                  ? 'bg-sky-100 font-semibold text-sky-900 dark:bg-sky-900/40 dark:text-sky-100'
                  : current && s.n < current
                    ? 'text-zinc-500 line-through decoration-zinc-300 dark:decoration-zinc-600'
                    : 'text-zinc-500'
              }`}
            >
              {NUM[s.n - 1]} {s.title}
            </li>
          </Fragment>
        ))}
      </ol>
      {hint && <p className="hint mt-1">{hint}</p>}
    </div>
  );
}
