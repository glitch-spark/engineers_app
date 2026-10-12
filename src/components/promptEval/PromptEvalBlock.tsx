import { useState } from 'react';
import useSWR from 'swr';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, FlaskConical } from 'lucide-react';
import * as api from '../../api/endpoints';
import { formatDate } from '../jobApplies/format';
import { formatScore, isRunActive } from './format';
import NewEvalPanel from './NewEvalPanel';
import RoleRadar, { MetricToggle, type RadarMetric } from './RoleRadar';
import RunsTable from './RunsTable';

const OPEN_KEY = 'profileEdit.promptEvalOpen';

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

/** Profile page block: start an eval for this profile and see how its last runs scored. */
export default function PromptEvalBlock({ accountId }: { accountId: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(readOpen);
  const [showNew, setShowNew] = useState(false);
  const [metric, setMetric] = useState<RadarMetric>('match');
  const { data, isLoading } = useSWR(['prompt-eval-runs', accountId, 5], () => api.listPromptEvalRuns({ accountId, limit: 5 }), {
    refreshInterval: (latest) => (latest?.runs.some((r) => isRunActive(r.status)) ? 3000 : 0),
  });
  const runs = data?.runs ?? [];
  const latestDone = runs.find((r) => r.status === 'done');

  function toggle() {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(OPEN_KEY, next ? '1' : '0');
    } catch {
      /* storage unavailable: just don't remember */
    }
  }

  const summary = isLoading
    ? 'Loading…'
    : latestDone
      ? `Last run: ${formatScore(latestDone.avgMatch)} match · ${formatScore(latestDone.avgBelievability)} believability · ${formatDate(latestDone.createdAt)}`
      : runs.length
        ? 'A run is in progress'
        : 'No evals yet';

  return (
    <>
      <section className="panel">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls="profile-prompt-eval"
          className="flex w-full items-center gap-3 rounded-[inherit] p-6 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
        >
          {open ? <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden /> : <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />}
          <span className="card-title">Prompt eval</span>
          <span className="text-xs text-muted">{summary}</span>
        </button>
      </section>

      <div id="profile-prompt-eval" hidden={!open} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted">
            Scores this profile's resume prompt against sample job descriptions: one tailored resume per JD, judged for match and believability.
          </p>
          <button type="button" className="btn btn-sm" onClick={() => setShowNew(true)}>
            <FlaskConical className="h-4 w-4" aria-hidden /> Run eval for this profile
          </button>
        </div>

        {latestDone && (
          <section className="panel p-4">
            <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="card-title">Latest run by role</h3>
              <MetricToggle value={metric} onChange={setMetric} />
            </header>
            <RoleRadar series={[{ id: latestDone._id, label: latestDone.label || 'Latest run', scores: latestDone.roleScores }]} metric={metric} height={260} />
          </section>
        )}

        <RunsTable runs={runs} loading={isLoading} showProfile={false} compact />
        <p className="text-right">
          <Link to="/resume/eval" className="link-inline text-sm">
            All runs and job descriptions
          </Link>
        </p>
      </div>

      <NewEvalPanel open={showNew} onClose={() => setShowNew(false)} accountId={accountId} onStarted={(runId) => navigate(`/resume/eval/${runId}`)} />
    </>
  );
}
