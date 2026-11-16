import { useEffect, useId, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { GitCompareArrows, Plus, X } from 'lucide-react';
import * as api from '../api/endpoints';
import type { PromptEvalRun } from '../api/endpoints';
import { useAuth } from '../auth/useAuth';
import ConfirmDialog from '../components/ConfirmDialog';
import PageHeader from '../components/PageHeader';
import Select from '../components/Select';
import Tabs from '../components/Tabs';
import FilterBar, { FilterField } from '../components/filters/FilterBar';
import CompareView from '../components/promptEval/CompareView';
import JdLibrary from '../components/promptEval/JdLibrary';
import NewEvalPanel, { type EvalPrefill } from '../components/promptEval/NewEvalPanel';
import RunDetail from '../components/promptEval/RunDetail';
import RunsTable from '../components/promptEval/RunsTable';
import { MAX_COMPARE, isRunActive } from '../components/promptEval/format';
import { notify } from '../lib/notify';
import { useUrlFilters } from '../lib/useUrlFilters';
import {
  RUNS_CLEAR_KEYS, RUNS_URL_DEFAULTS, parseRunsValues, runsCanClear, runsListParams, type RunsKey,
} from '../lib/promptEvalFilters';

const TABS = [
  { key: 'runs', label: 'Runs' },
  { key: 'jds', label: 'Job descriptions' },
];

/** Sidebar → Prompt Eval: all runs (compare any two to four), one run's detail, and the sample-JD library. */
export default function ResumePromptEvalPage() {
  const { runId } = useParams<{ runId?: string }>();
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [showNew, setShowNew] = useState(false);
  const [prefill, setPrefill] = useState<EvalPrefill | undefined>(undefined);

  const isCompare = pathname.endsWith('/compare');
  const compareIds = useMemo(() => (params.get('ids') ?? '').split(',').filter(Boolean), [params]);
  const tab = params.get('tab') === 'jds' ? 'jds' : 'runs';
  const filterId = useId();
  const [urlValues, patchUrl] = useUrlFilters(RUNS_URL_DEFAULTS);
  const runFilters = useMemo(() => parseRunsValues(urlValues), [urlValues]);
  const accountFilter = runFilters.account;

  // "Compare with…" from a run page preselects that run.
  const [selected, setSelected] = useState<Set<string>>(() => new Set(params.get('with') ? [params.get('with')!] : []));
  useEffect(() => {
    const w = params.get('with');
    if (w) setSelected((prev) => (prev.has(w) ? prev : new Set([...prev, w])));
  }, [params]);

  const listActive = !runId && !isCompare && tab === 'runs';
  const { data, isLoading, mutate } = useSWR(listActive ? ['prompt-eval-runs', accountFilter || 'all', 50] : null, () => api.listPromptEvalRuns(runsListParams(runFilters)), {
    refreshInterval: (latest) => (latest?.runs.some((r) => isRunActive(r.status)) ? 3000 : 0),
  });
  const runs = data?.runs ?? [];

  const { data: lookup } = useSWR(listActive ? 'resume-accounts-lookup' : null, () => api.lookupAccounts());
  const profiles = useMemo(() => (lookup?.accounts ?? []).filter((a) => user?.role === 'admin' || a.createdBy === user?.id), [lookup, user]);

  const [pendingDelete, setPendingDelete] = useState<PromptEvalRun | null>(null);
  const [deleting, setDeleting] = useState(false);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size >= MAX_COMPARE) {
        notify.warn(`Compare up to ${MAX_COMPARE} runs at a time`);
        return prev;
      } else next.add(id);
      return next;
    });
  }

  function openNew(p?: EvalPrefill) {
    setPrefill(p);
    setShowNew(true);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api.deletePromptEvalRun(pendingDelete._id);
      notify.success('Run deleted');
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(pendingDelete._id);
        return next;
      });
      setPendingDelete(null);
      await mutate();
    } catch (err) {
      notify.error(err, 'Could not delete the run');
    } finally {
      setDeleting(false);
    }
  }

  let content: React.ReactNode;
  if (runId) {
    content = (
      <RunDetail
        runId={runId}
        onRerun={(run) =>
          openNew({
            accountId: run.accountId,
            promptBody: run.promptBody,
            jdIds: run.rows.map((r) => r.jdId),
            label: run.label ?? undefined,
            judgeMode: run.judgeMode ?? 'llm',
            promptMode: run.promptMode ?? 'single',
            unitId: run.promptMode === 'profile' ? undefined : run.units?.[0]?.id,
            unitPrompts:
              run.promptMode === 'profile'
                ? Object.fromEntries((run.units ?? []).filter((u) => u.edited).map((u) => [u.id, u.body ?? '']))
                : undefined,
            unitOverrides: run.unitOverrides,
          })
        }
      />
    );
  } else if (isCompare) {
    content = <CompareView ids={compareIds} />;
  } else {
    content = (
      <Tabs tabs={TABS} value={tab} onChange={(k) => setParam('tab', k === 'runs' ? '' : k)} ariaLabel="Prompt tests sections">
        {tab === 'runs' ? (
          <div className="space-y-4">
            <FilterBar
              canClear={runsCanClear(runFilters)}
              onClear={() => patchUrl(Object.fromEntries(RUNS_CLEAR_KEYS.map((k) => [k, undefined])) as Partial<Record<RunsKey, string>>)}
            >
              <FilterField label="Profile" htmlFor={`${filterId}-profile`} width="w-64">
                <Select
                  id={`${filterId}-profile`}
                  className="w-full text-sm"
                  value={accountFilter}
                  onChange={(v) => patchUrl({ account: v })}
                  options={[{ value: '', label: 'All profiles' }, ...profiles.map((p) => ({ value: p._id, label: p.name }))]}
                />
              </FilterField>
            </FilterBar>
            {selected.size > 0 && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="text-xs text-muted tabular-nums">{selected.size} selected</span>
                <button type="button" className="btn-outline btn-sm" onClick={() => setSelected(new Set())}>
                  <X className="h-4 w-4" aria-hidden /> Clear selection
                </button>
                <button
                  type="button"
                  className="btn-accent btn-sm"
                  disabled={selected.size < 2}
                  onClick={() => navigate(`/resume/eval/compare?ids=${[...selected].join(',')}`)}
                >
                  <GitCompareArrows className="h-4 w-4" aria-hidden /> Compare {selected.size} runs
                </button>
              </div>
            )}
            <RunsTable runs={runs} loading={isLoading} selected={selected} onToggle={toggleSelected} onDelete={setPendingDelete} />
          </div>
        ) : (
          <JdLibrary />
        )}
      </Tabs>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prompt tests"
        backTo={runId || isCompare ? '/resume/eval' : undefined}
        action={
          <button type="button" className="btn btn-sm" onClick={() => openNew(undefined)}>
            <Plus className="h-4 w-4" aria-hidden /> New eval
          </button>
        }
      />
      {content}

      <NewEvalPanel
        open={showNew}
        onClose={() => setShowNew(false)}
        prefill={prefill}
        onStarted={(id) => {
          setShowNew(false);
          navigate(`/resume/eval/${id}`);
        }}
      />
      <ConfirmDialog
        open={pendingDelete != null}
        title="Delete this run?"
        body="The scores and generated resumes of this run are removed. Other runs are untouched."
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
