import { AlertTriangle, CheckCircle2, Loader2, RotateCcw } from 'lucide-react';
import type { JobApplyRun, JobApplyView } from '../../api/endpoints';
import ProgressBar from './ProgressBar';
import { RUN_STATUS_BADGE, RUN_STATUS_LABEL, isActive } from './format';

const DAY_MS = 86_400_000;

function Stat({ label, value, tone, sub }: { label: string; value: number; tone?: 'good' | 'primary'; sub?: React.ReactNode }) {
  const color =
    tone === 'good'
      ? 'text-emerald-700 dark:text-emerald-400'
      : tone === 'primary'
        ? 'text-zinc-900 dark:text-zinc-50'
        : 'text-zinc-800 dark:text-zinc-100';
  return (
    <div className="min-w-[7.5rem]">
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className={`mt-0.5 text-2xl font-semibold tabular-nums ${color}`}>{value}</dd>
      {sub && <dd className="mt-0.5 text-xs text-zinc-500">{sub}</dd>}
    </div>
  );
}

/** Run header: what's left to do and what's been done, with excluded/failed as shortcuts into the table. */
export default function RunSummary({
  run,
  onView,
  onRetry,
  retrying,
}: {
  run: JobApplyRun;
  onView: (view: JobApplyView) => void;
  onRetry: () => void;
  retrying: boolean;
}) {
  const active = isActive(run.status);
  const expiresInMs = run.expiresAt ? new Date(run.expiresAt.endsWith('Z') ? run.expiresAt : `${run.expiresAt}Z`).getTime() - Date.now() : null;
  const expiringSoon = expiresInMs !== null && expiresInMs > 0 && expiresInMs < DAY_MS;

  return (
    <section className="card-compact space-y-3" aria-label="Run summary">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <dl className="flex flex-wrap gap-x-8 gap-y-4">
          {run.applications ? (
            <Stat
              label="Applications to go"
              value={run.applications.toGo}
              tone="primary"
              sub={`on ${run.applications.jobs} job${run.applications.jobs === 1 ? '' : 's'}`}
            />
          ) : (
            <Stat label="To apply" value={run.toApply ?? 0} tone="primary" />
          )}
          <Stat label="Applied today" value={run.appliedSince ?? 0} tone="good" />
          <Stat label="This run" value={run.appliedInRun ?? 0} />
          <Stat
            label="Suggested"
            value={run.suggested}
            sub={
              <>
                of {run.counts.total} ·{' '}
                <button type="button" className="underline-offset-2 hover:underline" onClick={() => onView('excluded')}>
                  {run.excludedCount ?? run.counts.excluded} excluded
                </button>
                {run.counts.failed > 0 && (
                  <>
                    {' · '}
                    <button type="button" className="text-red-700 underline-offset-2 hover:underline dark:text-red-400" onClick={() => onView('failed')}>
                      {run.counts.failed} failed
                    </button>
                  </>
                )}
              </>
            }
          />
        </dl>
        <div className="flex flex-col items-end gap-2">
          {active ? (
            <div className="flex items-center gap-3">
              <span className={RUN_STATUS_BADGE[run.status]}>{RUN_STATUS_LABEL[run.status]}</span>
              <ProgressBar run={run} />
            </div>
          ) : run.status === 'done' ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden /> Done · {run.counts.total} jobs
            </span>
          ) : (
            <span className={RUN_STATUS_BADGE[run.status]}>{RUN_STATUS_LABEL[run.status]}</span>
          )}
          {!active && run.counts.failed > 0 && (
            <button type="button" className="btn-outline btn-sm" onClick={onRetry} disabled={retrying}>
              {retrying ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RotateCcw className="h-4 w-4" aria-hidden />}
              Retry {run.counts.failed} failed
            </button>
          )}
        </div>
      </div>

      {run.tailoring && run.tailoring.queued + run.tailoring.inProgress + run.tailoring.ready + run.tailoring.failed > 0 && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
          <span className="font-medium text-violet-700 dark:text-violet-300">Tailored resumes</span>
          <span>{run.tailoring.ready} ready</span>
          {run.tailoring.queued + run.tailoring.inProgress > 0 && (
            <span className="inline-flex items-center gap-1">
              <span className="spinner spinner-sm" aria-hidden /> {run.tailoring.inProgress} generating · {run.tailoring.queued} queued
            </span>
          )}
          {run.tailoring.failed > 0 && <span className="text-red-700 dark:text-red-400">{run.tailoring.failed} failed</span>}
        </p>
      )}
      {expiringSoon && run.expiresAt && (
        <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          Results are deleted {new Date(Date.now() + (expiresInMs ?? 0)).toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' })}.
          Your applied marks are kept; re-running the sheet is quick.
        </p>
      )}
      {run.error && <p className="text-sm text-red-700 dark:text-red-400">Run stopped: {run.error}</p>}
      {(run.notes ?? []).map((n) => (
        <p key={n} className="hint">
          {n}
        </p>
      ))}
    </section>
  );
}
