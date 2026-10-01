import type { JobApplyRun } from '../../api/endpoints';
import { isActive, runProgress } from './format';

export default function ProgressBar({ run }: { run: JobApplyRun }) {
  const { pct, label } = runProgress(run.counts);
  const active = isActive(run.status);
  return (
    <div className="min-w-[9rem]">
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Run progress: ${label}`}
      >
        <div
          className={`h-full rounded-full ${active ? 'bg-sky-600 dark:bg-sky-400' : 'bg-zinc-400 dark:bg-zinc-500'}`}
          style={{ width: `${run.status === 'done' ? 100 : pct}%` }}
        />
      </div>
      <p className="hint mt-1">{run.status === 'done' ? `${run.counts.total} jobs` : label}</p>
    </div>
  );
}
