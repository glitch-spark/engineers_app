import { Link } from 'react-router-dom';
import { Loader2, Square, Trash2 } from 'lucide-react';
import type { PromptEvalRun } from '../../api/endpoints';
import { formatUsd } from '../../lib/modelCost';
import { formatDateTime } from '../jobApplies/format';
import { RUN_STATUS_BADGE, RUN_STATUS_LABEL, formatScore, isRunActive, judgeLabel, modelShort, promptModeLabel, scoreClass } from './format';

/** Runs list: tick runs to compare them, open one for its rows, or delete it. */
export default function RunsTable({
  runs,
  loading,
  selected,
  onToggle,
  onDelete,
  onStop,
  showProfile = true,
  compact = false,
}: {
  runs: PromptEvalRun[];
  loading: boolean;
  selected?: Set<string>;
  onToggle?: (id: string) => void;
  onDelete?: (run: PromptEvalRun) => void;
  /** Shows a Stop button on runs that are still running. */
  onStop?: (run: PromptEvalRun) => void;
  showProfile?: boolean;
  compact?: boolean;
}) {
  const selectable = !!selected && !!onToggle;
  const cols = 9 + (selectable ? 1 : 0) + (showProfile ? 1 : 0) + (onDelete ? 1 : 0);
  return (
    <div className="table-wrap">
      <table className="min-w-full text-sm">
        <thead className="table-head whitespace-nowrap">
          <tr>
            {selectable && (
              <th className="px-3 py-2">
                <span className="sr-only">Compare</span>
              </th>
            )}
            <th className="px-3 py-2 text-left font-medium">When</th>
            {showProfile && <th className="px-3 py-2 text-left font-medium">Profile</th>}
            <th className="px-3 py-2 text-left font-medium">Label</th>
            <th className="px-3 py-2 text-left font-medium">Models</th>
            <th className="px-3 py-2 text-right font-medium">JDs</th>
            <th className="px-3 py-2 text-right font-medium">Match</th>
            <th className="px-3 py-2 text-right font-medium">Believability</th>
            <th className="px-3 py-2 text-right font-medium">Cost</th>
            <th className="px-3 py-2 text-left font-medium">Status</th>
            <th className="px-3 py-2 text-right font-medium">
              <span className="sr-only">Open</span>
            </th>
            {onDelete && (
              <th className="px-3 py-2">
                <span className="sr-only">Delete</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={cols} className="p-6 text-sm text-muted">
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
                </span>
              </td>
            </tr>
          ) : runs.length === 0 ? (
            <tr>
              <td colSpan={cols} className="p-6 text-sm text-muted">
                No evals yet. Start one to score a prompt against the sample job descriptions.
              </td>
            </tr>
          ) : (
            runs.map((run) => {
              const active = isRunActive(run.status);
              return (
                <tr key={run._id} className="table-row align-middle">
                  {selectable && (
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-zinc-300 text-sky-700 focus-ring dark:border-zinc-600"
                        checked={selected!.has(run._id)}
                        onChange={() => onToggle!(run._id)}
                        disabled={active}
                        aria-label={`Compare ${run.label || run.accountName}`}
                      />
                    </td>
                  )}
                  <td className="px-3 py-2 whitespace-nowrap text-body">{formatDateTime(run.createdAt)}</td>
                  {showProfile && (
                    <td className="px-3 py-2">
                      <Link to={`/accounts/${run.accountId}`} className="link-inline">
                        {run.accountName}
                      </Link>
                    </td>
                  )}
                  <td className="px-3 py-2 text-body max-w-[14rem] truncate" title={run.label ?? undefined}>
                    {run.label || <span className="text-faint">—</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted whitespace-nowrap">
                    <div title="Resume model">{modelShort(run.resumeModelId)}</div>
                    {!compact && <div title="Judge">judge: {judgeLabel(run)}</div>}
                    {!compact && <div title="Resume units" className="font-sans">{promptModeLabel(run)}</div>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                    {run.counts.done}/{run.counts.total}
                    {run.counts.failed > 0 && <span className="ml-1 text-xs text-red-700 dark:text-red-400">{run.counts.failed} failed</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className={scoreClass(run.avgMatch)} aria-label={`Average match ${formatScore(run.avgMatch)}`}>
                      {formatScore(run.avgMatch)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className={scoreClass(run.avgBelievability)} aria-label={`Average believability ${formatScore(run.avgBelievability)}`}>
                      {formatScore(run.avgBelievability)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{formatUsd(run.totalCostUsd)}</td>
                  <td className="px-3 py-2">
                    <span className="flex flex-wrap items-center gap-1">
                      <span className={RUN_STATUS_BADGE[run.status]}>
                        {active && <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />}
                        {RUN_STATUS_LABEL[run.status]}
                      </span>
                      {run.cachedRows > 0 && (
                        <span className="badge-neutral" title="Resumes reused from the cache: identical prompt + JD + model seen before, so these rows show no run-to-run variance">
                          cached {run.cachedRows}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="inline-flex items-center gap-1">
                      {active && onStop && (
                        <button type="button" className="btn-outline btn-sm" onClick={() => onStop(run)} aria-label={`Stop ${run.label || run.accountName}`} title="Stop this run">
                          <Square className="h-3.5 w-3.5" aria-hidden /> Stop
                        </button>
                      )}
                      <Link to={`/resume/eval/${run._id}`} className="btn-outline btn-sm">
                        Open
                      </Link>
                    </span>
                  </td>
                  {onDelete && (
                    <td className="px-3 py-2">
                      <button type="button" className="btn-icon" onClick={() => onDelete(run)} aria-label="Delete run" title="Delete">
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
