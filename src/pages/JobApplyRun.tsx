import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { useParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, ExternalLink, Loader2, RotateCcw, Square } from 'lucide-react';
import * as api from '../api/endpoints';
import type { JobApplyRow, JobApplyView } from '../api/endpoints';
import PageHeader from '../components/PageHeader';
import Select from '../components/Select';
import RowDetail from '../components/jobApplies/RowDetail';
import {
  ROW_STATUS_LABEL,
  RUN_STATUS_BADGE,
  RUN_STATUS_LABEL,
  TONE_CLASS,
  ageDays,
  bandClass,
  formatDate,
  gateChip,
  isActive,
} from '../components/jobApplies/format';
import { ProgressBar } from './JobApplies';
import { notify } from '../lib/notify';

const VIEWS: { value: JobApplyView; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'suggested', label: 'Suggested' },
  { value: 'excluded', label: 'Excluded' },
  { value: 'failed', label: 'Failed' },
];
const PAGE_SIZE = 50;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'open';
  }
}

function capitalize(s?: string | null): string {
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}

function Flags({ row, profileNames }: { row: JobApplyRow; profileNames: Record<string, string> }) {
  if (row.status === 'fetch_failed' || row.status === 'llm_failed') {
    return (
      <span className="badge-danger" title={row.statusReason ?? undefined}>
        {ROW_STATUS_LABEL[row.status]}
      </span>
    );
  }
  if (row.status === 'pending' || row.status === 'fetched') return <span className="hint">{ROW_STATUS_LABEL[row.status]}…</span>;
  const chips = row.gates.map(gateChip).filter((c): c is NonNullable<typeof c> => c !== null);
  for (const pg of row.profileGates) {
    for (const g of pg.gates) {
      if (g.result === 'fail') {
        chips.push({
          label: `${profileNames[pg.accountId] ?? 'Profile'}: ${g.name === 'workAuth' ? 'work auth' : 'location'}`,
          tone: 'fail',
          title: g.reason,
        });
      }
    }
  }
  if (chips.length === 0) return <span className="hint">—</span>;
  return (
    <ul className="flex flex-wrap gap-1">
      {chips.map((c, i) => (
        <li key={i} className={TONE_CLASS[c.tone]} title={c.title}>
          {c.label}
        </li>
      ))}
    </ul>
  );
}

export default function JobApplyRun() {
  const { runId = '' } = useParams();
  const [view, setView] = useState<JobApplyView>('all');
  const [accountId, setAccountId] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [thresholdDraft, setThresholdDraft] = useState<number | null>(null);
  const [busy, setBusy] = useState<'cancel' | 'retry' | null>(null);

  const { data: run, mutate: mutateRun } = useSWR(['job-apply-run', runId], () => api.getJobApplyRun(runId), {
    refreshInterval: (latest) => (latest && isActive(latest.status) ? 3000 : 0),
  });
  const active = run ? isActive(run.status) : false;

  const { data: rowsData, isLoading: rowsLoading, mutate: mutateRows } = useSWR(
    run ? ['job-apply-rows', runId, view, accountId, page, run.threshold] : null,
    () => api.listJobApplyRows(runId, { view, accountId, page, limit: PAGE_SIZE }),
    { refreshInterval: active ? 3000 : 0, keepPreviousData: true },
  );
  const rows = rowsData?.rows ?? [];
  const pagination = rowsData?.pagination;

  const profileNames = useMemo(
    () => Object.fromEntries((run?.profiles ?? []).map((p) => [p.accountId, p.name])),
    [run?.profiles],
  );
  const healthByResume = useMemo(
    () => Object.fromEntries((run?.resumes ?? []).map((r) => [r.resumeId, r.health])),
    [run?.resumes],
  );

  // Debounced threshold change: PATCH the run, then the rows key (which includes the threshold) refetches.
  const threshold = thresholdDraft ?? run?.threshold ?? 75;
  const debounce = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (thresholdDraft === null || !run || thresholdDraft === run.threshold) return;
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(async () => {
      try {
        const updated = await api.updateJobApplyRun(runId, { threshold: thresholdDraft });
        await mutateRun(updated, { revalidate: false });
        setThresholdDraft(null);
      } catch (err) {
        notify.error(err, 'Could not update the minimum score');
      }
    }, 400);
    return () => window.clearTimeout(debounce.current);
  }, [thresholdDraft, run, runId, mutateRun]);

  const changeView = (v: JobApplyView) => {
    setView(v);
    setPage(1);
    setExpanded(null);
  };

  const onCancel = async () => {
    setBusy('cancel');
    try {
      await api.cancelJobApplyRun(runId);
      await mutateRun();
    } catch (err) {
      notify.error(err, 'Could not cancel the run');
    } finally {
      setBusy(null);
    }
  };

  const onRetry = async () => {
    setBusy('retry');
    try {
      const res = await api.retryJobApplyRun(runId);
      notify.info(`Retrying ${res.reset} job${res.reset === 1 ? '' : 's'}`);
      await mutateRun();
      await mutateRows();
    } catch (err) {
      notify.error(err, 'Could not retry');
    } finally {
      setBusy(null);
    }
  };

  const toggleApplied = async (row: JobApplyRow, applied: boolean) => {
    try {
      await api.setJobApplyRowApplied(row._id, applied);
      await mutateRows(
        (prev) => prev && { ...prev, rows: prev.rows.map((r) => (r._id === row._id ? { ...r, applied } : r)) },
        { revalidate: false },
      );
    } catch (err) {
      notify.error(err, 'Could not update');
    }
  };

  if (!run) {
    return (
      <div>
        <PageHeader title="Job Applies" backTo="/job-applies" />
        <p role="status" className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading run…
        </p>
      </div>
    );
  }

  const profileOptions = [
    { value: '', label: 'All profiles' },
    ...(run.profiles ?? []).map((p) => ({ value: p.accountId, label: p.name })),
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={run.fileName}
        backTo="/job-applies"
        action={
          <>
            {active && (
              <button type="button" className="btn-outline btn-sm" onClick={onCancel} disabled={busy !== null}>
                {busy === 'cancel' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Square className="h-4 w-4" aria-hidden />}
                Cancel run
              </button>
            )}
            {!active && run.counts.failed > 0 && (
              <button type="button" className="btn-outline btn-sm" onClick={onRetry} disabled={busy !== null}>
                {busy === 'retry' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RotateCcw className="h-4 w-4" aria-hidden />}
                Retry {run.counts.failed} failed
              </button>
            )}
          </>
        }
      />

      <section className="card-compact flex flex-wrap items-center gap-x-6 gap-y-3" aria-label="Run summary">
        <span className={RUN_STATUS_BADGE[run.status]}>{RUN_STATUS_LABEL[run.status]}</span>
        <ProgressBar run={run} />
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <div className="flex gap-1"><dt className="text-zinc-500">Jobs</dt><dd className="font-medium tabular-nums">{run.counts.total}</dd></div>
          <div className="flex gap-1"><dt className="text-zinc-500">Suggested</dt><dd className="font-medium tabular-nums">{run.suggested}</dd></div>
          <div className="flex gap-1"><dt className="text-zinc-500">Excluded</dt><dd className="font-medium tabular-nums">{run.counts.excluded}</dd></div>
          <div className="flex gap-1"><dt className="text-zinc-500">Failed</dt><dd className="font-medium tabular-nums">{run.counts.failed}</dd></div>
          <div className="flex gap-1"><dt className="text-zinc-500">Max age</dt><dd className="font-medium tabular-nums">{run.maxAgeDays} days</dd></div>
          {run.expiresAt && (
            <div className="flex gap-1"><dt className="text-zinc-500">Kept until</dt><dd className="font-medium">{formatDate(run.expiresAt)}</dd></div>
          )}
        </dl>
        {run.error && <p className="w-full text-sm text-red-700 dark:text-red-400">Run stopped: {run.error}</p>}
        {(run.notes ?? []).map((n) => (
          <p key={n} className="hint w-full">{n}</p>
        ))}
      </section>

      <div className="toolbar flex flex-wrap items-end gap-4">
        <div role="group" aria-label="Show" className="flex flex-wrap gap-1">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              aria-pressed={view === v.value}
              onClick={() => changeView(v.value)}
              className={view === v.value ? 'btn btn-sm' : 'btn-outline btn-sm'}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="w-52">
          <Select
            value={accountId}
            onChange={(v) => {
              setAccountId(v);
              setPage(1);
            }}
            options={profileOptions}
            ariaLabel="Profile"
          />
        </div>
        <div className="min-w-[14rem] flex-1 sm:max-w-xs">
          <label htmlFor="threshold" className="form-label">
            Minimum score: <span className="font-semibold text-zinc-900 dark:text-zinc-50">{threshold}</span>
          </label>
          <input
            id="threshold"
            type="range"
            min={50}
            max={95}
            value={threshold}
            onChange={(e) => setThresholdDraft(Number(e.target.value))}
            className="w-full accent-sky-600"
          />
        </div>
      </div>

      <div className="table-wrap">
        {rowsLoading && rows.length === 0 ? (
          <p role="status" className="flex items-center gap-2 p-6 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading jobs…
          </p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted">
            {active ? 'Jobs appear here as they are processed.' : 'No jobs match this view.'}
          </p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="w-10 px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Job</th>
                <th className="px-3 py-2 font-medium">Posted</th>
                <th className="px-3 py-2 font-medium">Work mode</th>
                <th className="px-3 py-2 font-medium">Location</th>
                <th className="px-3 py-2 font-medium">Flags</th>
                <th className="px-3 py-2 font-medium">Suggested resumes</th>
                <th className="px-3 py-2 font-medium text-center">Applied</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isOpen = expanded === row._id;
                const age = ageDays(row.postedDate);
                return (
                  <Fragment key={row._id}>
                    <tr className="table-row align-top">
                      <td className="px-3 py-2 tabular-nums text-zinc-500">{row.rowIndex}</td>
                      <td className="max-w-xs px-3 py-2">
                        <div className="flex items-start gap-1.5">
                          <button
                            type="button"
                            className="btn-icon -ml-1.5"
                            aria-expanded={isOpen}
                            aria-label={isOpen ? 'Hide score breakdown' : 'Show score breakdown'}
                            onClick={() => setExpanded(isOpen ? null : row._id)}
                            disabled={!row.topScore && row.status !== 'scored' && row.status !== 'excluded'}
                          >
                            {isOpen ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
                          </button>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-zinc-800 dark:text-zinc-100">{row.title || 'Untitled role'}</p>
                            <p className="truncate text-xs text-zinc-500">
                              {row.company}
                              {row.url && (
                                <a
                                  href={row.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="ml-1 inline-flex items-center gap-0.5 text-sky-700 hover:underline dark:text-sky-400"
                                >
                                  {row.company ? 'open' : hostOf(row.url)}
                                  <ExternalLink className="h-3 w-3" aria-hidden />
                                  <span className="sr-only">(opens in a new tab)</span>
                                </a>
                              )}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {row.postedDate ? (
                          <>
                            {formatDate(row.postedDate)}
                            {age !== null && <span className="hint block">{age === 0 ? 'today' : `${age}d ago`}</span>}
                          </>
                        ) : (
                          <span className="hint">Unknown</span>
                        )}
                      </td>
                      <td className="px-3 py-2">{capitalize(row.workMode) || <span className="hint">—</span>}</td>
                      <td className="max-w-[10rem] px-3 py-2">
                        {row.allowedLocations.length ? row.allowedLocations.map((l) => l.value).join(', ') : <span className="hint">Not stated</span>}
                      </td>
                      <td className="max-w-[14rem] px-3 py-2">
                        <Flags row={row} profileNames={profileNames} />
                      </td>
                      <td className="px-3 py-2">
                        {row.suggestions.length ? (
                          <ul className="flex flex-col gap-1">
                            {row.suggestions.map((s) => (
                              <li key={s.resumeId} className="flex items-center gap-1.5" title={s.knockouts.join('\n') || undefined}>
                                <span className={bandClass(s.band)}>{s.total}</span>
                                <span className="truncate">
                                  <span className="font-medium">{profileNames[s.accountId] ?? 'Profile'}</span>
                                  <span className="text-zinc-500"> · {s.filename}</span>
                                </span>
                                {s.knockouts.length > 0 && <span className="text-amber-700 dark:text-amber-400" aria-label="Has knockout risks">!</span>}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="hint">
                            {row.status === 'scored' && row.topScore !== null ? `Best ${row.topScore} (below ${run.threshold})` : '—'}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={row.applied}
                          onChange={(e) => toggleApplied(row, e.target.checked)}
                          aria-label={`Mark ${row.title || 'job'} as applied`}
                        />
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={8} className="bg-zinc-50/60 px-4 py-4 dark:bg-zinc-900/40">
                          <RowDetail rowId={row._id} profileNames={profileNames} healthByResume={healthByResume} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {pagination && pagination.totalPages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-end gap-3 text-sm">
          <button type="button" className="btn-outline btn-sm" onClick={() => setPage((p) => p - 1)} disabled={!pagination.hasPrev}>
            Previous
          </button>
          <span className="tabular-nums text-zinc-600 dark:text-zinc-400">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <button type="button" className="btn-outline btn-sm" onClick={() => setPage((p) => p + 1)} disabled={!pagination.hasNext}>
            Next
          </button>
        </nav>
      )}
    </div>
  );
}
