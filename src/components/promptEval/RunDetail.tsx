import { useState } from 'react';
import useSWR from 'swr';
import { Link, useNavigate } from 'react-router-dom';
import { GitCompareArrows, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import * as api from '../../api/endpoints';
import type { PromptEvalRow, PromptEvalRun } from '../../api/endpoints';
import { formatUsd } from '../../lib/modelCost';
import { notify } from '../../lib/notify';
import ConfirmDialog from '../ConfirmDialog';
import { formatDateTime } from '../jobApplies/format';
import {
  PROMPT_SOURCE_LABEL,
  ROLE_LABEL,
  ROW_STATUS_BADGE,
  ROW_STATUS_LABEL,
  RUN_STATUS_BADGE,
  RUN_STATUS_LABEL,
  formatDuration,
  formatScore,
  isRunActive,
  modelShort,
  runTitle,
  scoreClass,
} from './format';
import RoleRadar, { MetricToggle, type RadarMetric } from './RoleRadar';
import RowDetailPanel from './RowDetailPanel';

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="stat-card">
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

/** One run: aggregates, the per-role radar, the prompt it used, and every scored JD. */
export default function RunDetail({ runId, onRerun }: { runId: string; onRerun: (run: PromptEvalRun) => void }) {
  const navigate = useNavigate();
  const { data: run, error, isLoading, mutate } = useSWR(['prompt-eval-run', runId], () => api.getPromptEvalRun(runId), {
    refreshInterval: (latest) => (latest && isRunActive(latest.status) ? 3000 : 0),
  });
  const [metric, setMetric] = useState<RadarMetric>('match');
  const [openRow, setOpenRow] = useState<PromptEvalRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (isLoading && !run) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading run…
      </p>
    );
  }
  if (error || !run) {
    return (
      <div className="empty-state">
        <p className="empty-state-title">Run not found</p>
        <p className="empty-state-desc">It may have been deleted.</p>
        <Link to="/resume/eval" className="link-inline mt-3">
          Back to runs
        </Link>
      </div>
    );
  }

  const active = isRunActive(run.status);
  // Keep the panel's row fresh while polling.
  const currentRow = openRow ? run.rows.find((r) => r.jdId === openRow.jdId) ?? openRow : null;

  async function doDelete() {
    setDeleting(true);
    try {
      await api.deletePromptEvalRun(run!._id);
      notify.success('Run deleted');
      navigate('/resume/eval');
    } catch (err) {
      notify.error(err, 'Could not delete the run');
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="section-title flex flex-wrap items-center gap-2">
            <span className="truncate">{runTitle(run)}</span>
            <span className={RUN_STATUS_BADGE[run.status]}>
              {active && <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />}
              {RUN_STATUS_LABEL[run.status]}
            </span>
          </h2>
          <p className="mt-1 text-sm text-muted">
            <Link to={`/accounts/${run.accountId}`} className="link-inline">
              {run.accountName}
            </Link>
            {' · '}
            {formatDateTime(run.createdAt)}
            {' · resume '}
            <span className="font-mono text-xs">{modelShort(run.resumeModelId)}</span>
            {' · judge '}
            <span className="font-mono text-xs">{modelShort(run.judgeModelId)}</span>
          </p>
          {run.error && <p className="mt-1 text-sm text-red-700 dark:text-red-400">{run.error}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-outline btn-sm" onClick={() => onRerun(run)}>
            <RotateCcw className="h-4 w-4" aria-hidden /> Re-run with same settings
          </button>
          <Link to={`/resume/eval?with=${run._id}`} className="btn-outline btn-sm">
            <GitCompareArrows className="h-4 w-4" aria-hidden /> Compare with…
          </Link>
          <button type="button" className="btn-icon" onClick={() => setConfirmDelete(true)} aria-label="Delete run" title="Delete run">
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Avg match" value={<span className={scoreClass(run.avgMatch)}>{formatScore(run.avgMatch)}</span>} sub="location ignored" />
        <Stat label="Avg believability" value={<span className={scoreClass(run.avgBelievability)}>{formatScore(run.avgBelievability)}</span>} sub="reads like a real resume" />
        <Stat
          label="Job descriptions"
          value={`${run.counts.done}/${run.counts.total}`}
          sub={
            <>
              {run.counts.failed > 0 && <span className="text-red-700 dark:text-red-400">{run.counts.failed} failed · </span>}
              {run.cachedRows > 0 ? `${run.cachedRows} resume${run.cachedRows === 1 ? '' : 's'} from cache` : 'all freshly generated'}
              {run.cachedJudgeRows > 0 && ` · ${run.cachedJudgeRows} verdict${run.cachedJudgeRows === 1 ? '' : 's'} from cache`}
            </>
          }
        />
        <Stat label="Cost" value={formatUsd(run.totalCostUsd)} sub={run.durationMs != null ? formatDuration(run.durationMs) : active ? 'running…' : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <section className="panel p-4 lg:col-span-3">
          <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="card-title">Score per role</h3>
            <MetricToggle value={metric} onChange={setMetric} />
          </header>
          <RoleRadar series={[{ id: run._id, label: runTitle(run), scores: run.roleScores }]} metric={metric} />
        </section>
        <section className="panel p-4 lg:col-span-2">
          <h3 className="card-title">Prompt used</h3>
          <p className="hint mt-0.5 mb-2">{PROMPT_SOURCE_LABEL[run.promptSource]}</p>
          {run.promptBody ? (
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-body dark:border-zinc-700 dark:bg-zinc-900">
              {run.promptBody}
            </pre>
          ) : (
            <p className="text-sm text-muted">No custom prompt text; the built-in rules ran alone.</p>
          )}
        </section>
      </div>

      <div className="table-wrap">
        <table className="min-w-full text-sm">
          <thead className="table-head whitespace-nowrap">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Role</th>
              <th className="px-3 py-2 text-left font-medium">Job description</th>
              <th className="px-3 py-2 text-left font-medium">Resume model</th>
              <th className="px-3 py-2 text-left font-medium">Judge</th>
              <th className="px-3 py-2 text-right font-medium">Match</th>
              <th className="px-3 py-2 text-right font-medium">Believability</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {run.rows.map((row) => {
              const busy = row.status === 'generating' || row.status === 'judging';
              return (
                <tr
                  key={row.jdId}
                  className="table-row cursor-pointer align-middle"
                  onClick={() => setOpenRow(row)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setOpenRow(row);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`Open ${row.jdTitle}`}
                >
                  <td className="px-3 py-2">
                    <span className="badge-neutral">{ROLE_LABEL[row.role]}</span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-strong">{row.jdTitle}</div>
                    <div className="text-xs text-muted">{row.jdCompany}</div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="font-mono text-xs text-muted">{modelShort(row.genModelId ?? row.genModel)}</span>
                    {row.genCached && <span className="badge-neutral ml-1" title="Reused from the cache">cached</span>}
                    {row.genFallbackUsed && <span className="badge-warning ml-1">fallback</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="font-mono text-xs text-muted">{row.judgeModelId || row.judgeModel ? modelShort(row.judgeModelId ?? row.judgeModel) : '—'}</span>
                    {row.judgeCached && <span className="badge-neutral ml-1" title="Verdict reused from the cache">cached</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className={scoreClass(row.verdict?.matchScore)}>{formatScore(row.verdict?.matchScore)}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className={scoreClass(row.verdict?.believabilityScore)}>{formatScore(row.verdict?.believabilityScore)}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={ROW_STATUS_BADGE[row.status]}>
                      {busy && <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />}
                      {ROW_STATUS_LABEL[row.status]}
                    </span>
                    {row.error && (
                      <div className="mt-0.5 max-w-[16rem] truncate text-xs text-red-700 dark:text-red-400" title={row.error}>
                        {row.error}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{formatDuration(row.durationMs)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <RowDetailPanel run={run} row={currentRow} onClose={() => setOpenRow(null)} />
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this run?"
        body="The scores and generated resumes of this run are removed. Other runs are untouched."
        busy={deleting}
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(false)}
      />
      {active && <span className="sr-only" aria-live="polite">Run in progress, {run.counts.done} of {run.counts.total} done</span>}
      <button type="button" className="sr-only" onClick={() => mutate()}>
        Refresh
      </button>
    </div>
  );
}
