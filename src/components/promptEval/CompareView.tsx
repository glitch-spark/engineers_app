import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import * as api from '../../api/endpoints';
import type { EvalRole, PromptEvalRun } from '../../api/endpoints';
import { formatUsd } from '../../lib/modelCost';
import { useTheme } from '../../theme/ThemeProvider';
import { formatDateTime } from '../jobApplies/format';
import { MAX_COMPARE, ROLE_LABEL, SERIES_COLORS, formatScore, judgeLabel, modelShort, runTitle, scoreClass } from './format';
import RoleRadar, { MetricToggle, type RadarMetric } from './RoleRadar';

type MatrixRow = { jdId: string; role: EvalRole; title: string; company: string };

/** Two to four runs side by side: overlaid radar, per-JD score matrix, prompts next to each other. */
export default function CompareView({ ids }: { ids: string[] }) {
  const shown = ids.slice(0, MAX_COMPARE);
  const { data: runs, error, isLoading } = useSWR(['prompt-eval-compare', shown.join(',')], () => Promise.all(shown.map((id) => api.getPromptEvalRun(id))));
  const [metric, setMetric] = useState<RadarMetric>('match');
  const { theme } = useTheme();
  const mode = theme === 'dark' ? 'dark' : 'light';

  const matrix = useMemo<MatrixRow[]>(() => {
    const seen = new Map<string, MatrixRow>();
    for (const run of runs ?? []) {
      for (const row of run.rows) {
        if (!seen.has(row.jdId)) seen.set(row.jdId, { jdId: row.jdId, role: row.role, title: row.jdTitle, company: row.jdCompany });
      }
    }
    return [...seen.values()];
  }, [runs]);

  if (shown.length < 2) {
    return (
      <div className="empty-state">
        <p className="empty-state-title">Pick at least two runs to compare</p>
        <p className="empty-state-desc">Tick runs in the list, then use the Compare bar.</p>
        <Link to="/resume/eval" className="link-inline mt-3">
          Back to runs
        </Link>
      </div>
    );
  }
  if (isLoading && !runs) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading runs…
      </p>
    );
  }
  if (error || !runs) {
    return (
      <div className="empty-state">
        <p className="empty-state-title">Could not load one of the runs</p>
        <p className="empty-state-desc">It may have been deleted.</p>
      </div>
    );
  }

  const score = (run: PromptEvalRun, jdId: string) => run.rows.find((r) => r.jdId === jdId);
  const best = (jdId: string, key: 'matchScore' | 'believabilityScore') =>
    Math.max(...runs.map((run) => score(run, jdId)?.verdict?.[key] ?? -1));

  return (
    <div className="space-y-6">
      {ids.length > MAX_COMPARE && <p className="banner-info text-sm">Showing the first {MAX_COMPARE} of {ids.length} selected runs.</p>}

      <section className="panel p-4">
        <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="card-title">Score per role</h3>
          <MetricToggle value={metric} onChange={setMetric} />
        </header>
        <RoleRadar series={runs.map((run) => ({ id: run._id, label: runTitle(run), scores: run.roleScores }))} metric={metric} height={380} />
      </section>

      <div className="table-wrap">
        <table className="min-w-full text-sm">
          <thead className="table-head">
            <tr>
              <th className="px-3 py-2 text-left font-medium align-top">Job description</th>
              {runs.map((run, i) => (
                <th key={run._id} className="px-3 py-2 text-left font-normal align-top">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length][mode] }} aria-hidden />
                    <Link to={`/resume/eval/${run._id}`} className="link-inline font-medium normal-case tracking-normal">
                      {runTitle(run)}
                    </Link>
                  </div>
                  <div className="mt-1 text-xs normal-case tracking-normal text-muted">
                    {run.accountName} · {formatDateTime(run.createdAt)}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] normal-case tracking-normal text-muted">
                    {modelShort(run.resumeModelId)} · judge {judgeLabel(run)}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1 normal-case tracking-normal">
                    <span className={scoreClass(run.avgMatch)}>M {formatScore(run.avgMatch)}</span>
                    <span className={scoreClass(run.avgBelievability)}>B {formatScore(run.avgBelievability)}</span>
                    <span className="text-xs tabular-nums text-muted">{formatUsd(run.totalCostUsd)}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((m) => {
              const bestMatch = best(m.jdId, 'matchScore');
              const bestBelievability = best(m.jdId, 'believabilityScore');
              return (
                <tr key={m.jdId} className="table-row align-middle">
                  <td className="px-3 py-2">
                    <span className="badge-neutral mr-2">{ROLE_LABEL[m.role]}</span>
                    <span className="text-strong">{m.title}</span>
                    <span className="text-muted"> · {m.company}</span>
                  </td>
                  {runs.map((run) => {
                    const row = score(run, m.jdId);
                    if (!row) {
                      return (
                        <td key={run._id} className="px-3 py-2 text-faint">
                          —
                        </td>
                      );
                    }
                    if (!row.verdict) {
                      return (
                        <td key={run._id} className="px-3 py-2">
                          <span className={row.status === 'failed' ? 'badge-danger' : 'badge-neutral'} title={row.error ?? undefined}>
                            {row.status === 'failed' ? 'failed' : row.status}
                          </span>
                        </td>
                      );
                    }
                    const v = row.verdict;
                    return (
                      <td key={run._id} className="px-3 py-2 whitespace-nowrap">
                        <span className={`${scoreClass(v.matchScore)} ${v.matchScore === bestMatch ? 'font-semibold ring-1 ring-current' : ''}`} title="Match">
                          M {v.matchScore}
                        </span>{' '}
                        <span className={`${scoreClass(v.believabilityScore)} ${v.believabilityScore === bestBelievability ? 'font-semibold ring-1 ring-current' : ''}`} title="Believability">
                          B {v.believabilityScore}
                        </span>
                        {row.genCached && <span className="badge-neutral ml-1" title="Resume reused from the cache">cached</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">M = match (location ignored), B = believability. The best value per row is outlined. Single-call judge scores vary by a few points; read differences for direction.</p>

      <section>
        <h3 className="card-title mb-2">Prompts</h3>
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${runs.length}, minmax(0, 1fr))` }}>
          {runs.map((run) => (
            <div key={run._id} className="panel p-3">
              <div className="mb-2 text-xs font-medium text-body">{runTitle(run)}</div>
              {run.promptBody ? (
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs text-body">{run.promptBody}</pre>
              ) : (
                <p className="text-xs text-muted">No custom prompt text.</p>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
