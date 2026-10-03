import { Link } from 'react-router-dom';
import { ArrowRight, ExternalLink, Trash2 } from 'lucide-react';
import type { JobApplyRun } from '../../api/endpoints';
import { expiresHint, formatDate, isActive, runStep } from './format';
import { STEPS } from './StepTrack';

const MARKET_SHORT: [keyof NonNullable<JobApplyRun['summary']>['markets'], string][] = [
  ['US', 'US'],
  ['UKEU', 'UK/EU'],
  ['LATAM', 'Latam'],
];
const STEP_BADGE = ['', 'badge-info', 'badge-warning', 'badge-success'];

/** One run on the landing page: which step it's at, its key numbers, and the one thing to do next. */
export default function RunCard({ run, onDelete }: { run: JobApplyRun; onDelete: (run: JobApplyRun) => void }) {
  const step = runStep(run);
  const active = isActive(run.status);
  const s = run.summary;
  const to = `/job-applies/${run._id}`;

  let numbers: string;
  let action: { label: string } | null = null;
  let progress: number | null = null;
  if (step === 1) {
    const done = Math.min(run.counts.total, run.counts.extracted + run.counts.failed);
    numbers = active ? `Checking ${done} / ${run.counts.total} jobs` : `${run.counts.total} jobs · ${run.status}`;
    progress = run.counts.total ? done / run.counts.total : 0;
  } else if (step === 2) {
    const markets = s ? MARKET_SHORT.filter(([k]) => s.markets[k] > 0).map(([k, l]) => `${l} ${s.markets[k]}`) : [];
    numbers = s
      ? [`${run.counts.total} links → ${s.worth} worth applying`, ...markets, s.closed ? `${s.closed} closed` : '']
          .filter(Boolean)
          .join(' · ')
      : `${run.counts.total} jobs checked`;
    action = { label: 'Review & pick profiles' };
  } else if (active) {
    numbers = `Scoring ${run.counts.scored} / ${run.counts.total}`;
    progress = run.counts.total ? run.counts.scored / run.counts.total : 0;
  } else if (s) {
    const total = s.toApply + s.applied;
    numbers =
      s.toApply > 0
        ? [`${s.toApply} to apply`, `${s.applied} applied`, s.tailoring ? `${s.tailoring} tailoring` : ''].filter(Boolean).join(' · ')
        : total
          ? `${s.applied} applied of ${total}`
          : run.status === 'done'
            ? 'Nothing suggested'
            : run.status;
    progress = total ? s.applied / total : null;
    if (s.toApply > 0) action = { label: 'Continue applying' };
  } else {
    numbers = `${run.suggested} suggested`;
  }

  return (
    <li className="panel p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link to={to} className="font-semibold text-zinc-900 hover:underline dark:text-zinc-50">
          {run.fileName}
        </Link>
        {run.sourceUrl && (
          <a href={run.sourceUrl} target="_blank" rel="noopener noreferrer" className="btn-icon" title="Open the Google Sheet">
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">Open the Google Sheet (new tab)</span>
          </a>
        )}
        <span className={STEP_BADGE[step]}>
          {['', '①', '②', '③'][step]} {STEPS[step - 1].title}
        </span>
        {(run.status === 'failed' || run.status === 'cancelled') && <span className="badge-neutral">{run.status}</span>}
      </div>
      <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{numbers}</p>
      {progress !== null && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800" aria-hidden>
          <div className={`h-full rounded-full ${active ? 'bg-sky-600' : 'bg-emerald-600'}`} style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="hint">
          {formatDate(run.createdAt)}
          {expiresHint(run.expiresAt) ? ` · ${expiresHint(run.expiresAt)}` : ''}
        </span>
        <span className="flex items-center gap-2">
          {!active && (
            <button type="button" className="btn-icon" onClick={() => onDelete(run)} title="Delete run" aria-label={`Delete run ${run.fileName}`}>
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          )}
          {action ? (
            <Link to={to} className="btn btn-sm">
              {action.label} <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : (
            <Link to={to} className="btn-outline btn-sm">
              Open
            </Link>
          )}
        </span>
      </div>
    </li>
  );
}
