import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CheckCheck, ChevronDown, ChevronRight, ExternalLink, Keyboard, Loader2, RotateCcw, Square } from 'lucide-react';
import * as api from '../api/endpoints';
import type { JobApplyAppliedFilter, JobApplyRow, JobApplySuggestion, JobApplyView } from '../api/endpoints';
import PageHeader from '../components/PageHeader';
import Select from '../components/Select';
import Modal from '../components/Modal';
import RowDetail from '../components/jobApplies/RowDetail';
import Pagination, { PAGE_SIZES } from '../components/jobApplies/Pagination';
import Suggestions from '../components/jobApplies/Suggestions';
import {
  ROW_STATUS_LABEL,
  RUN_STATUS_BADGE,
  RUN_STATUS_LABEL,
  TONE_CLASS,
  ageDays,
  formatDate,
  gateChip,
  isActive,
} from '../components/jobApplies/format';
import { ProgressBar } from './JobApplies';
import { notify } from '../lib/notify';

const VIEWS: { value: JobApplyView; label: string }[] = [
  { value: 'suggested', label: 'Suggested' },
  { value: 'all', label: 'All' },
  { value: 'excluded', label: 'Excluded' },
  { value: 'failed', label: 'Failed' },
];
const APPLIED_FILTERS: { value: JobApplyAppliedFilter; label: string }[] = [
  { value: 'no', label: 'Not applied yet' },
  { value: 'yes', label: 'Applied' },
  { value: 'any', label: 'All' },
];
const PAGE_SIZE_KEY = 'jobApplies.pageSize';
const SHORTCUTS: [string, string][] = [
  ['j / k', 'Next / previous job'],
  ['o', 'Open the job posting in a new tab'],
  ['d', 'Download the top suggestion’s resume PDF'],
  ['1 – 9', 'Toggle “applied” for suggestion 1–9'],
  ['a', 'Mark the top suggestion applied and go to the next job'],
  ['x', 'Select / unselect the job (for bulk marking)'],
  ['Enter', 'Show / hide the score breakdown'],
  ['?', 'Show this list'],
];

function readPageSize(): number {
  try {
    const n = Number(window.localStorage.getItem(PAGE_SIZE_KEY));
    return PAGE_SIZES.includes(n) ? n : 50;
  } catch {
    return 50;
  }
}

function localMidnightIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

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

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
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

type RowsPage = Awaited<ReturnType<typeof api.listJobApplyRows>>;

export default function JobApplyRun() {
  const { runId = '' } = useParams();
  const [view, setView] = useState<JobApplyView>('suggested');
  const [appliedFilter, setAppliedFilter] = useState<JobApplyAppliedFilter>('no');
  const [accountId, setAccountId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(readPageSize);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showHelp, setShowHelp] = useState(false);
  const [thresholdDraft, setThresholdDraft] = useState<number | null>(null);
  const [busy, setBusy] = useState<'cancel' | 'retry' | 'bulk' | null>(null);
  const [since] = useState(localMidnightIso);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());

  const { data: run, mutate: mutateRun } = useSWR(
    ['job-apply-run', runId, since],
    () => api.getJobApplyRun(runId, since),
    { refreshInterval: (latest) => (latest && isActive(latest.status) ? 3000 : 0) },
  );
  const active = run ? isActive(run.status) : false;

  const { data: rowsData, isLoading: rowsLoading, mutate: mutateRows } = useSWR(
    run ? ['job-apply-rows', runId, view, appliedFilter, accountId, page, pageSize, run.threshold] : null,
    () => api.listJobApplyRows(runId, { view, applied: appliedFilter, accountId, page, limit: pageSize }),
    { refreshInterval: active ? 3000 : 0, keepPreviousData: true },
  );
  const rows = useMemo(() => rowsData?.rows ?? [], [rowsData]);
  const pagination = rowsData?.pagination;

  const profileNames = useMemo(
    () => Object.fromEntries((run?.profiles ?? []).map((p) => [p.accountId, p.name])),
    [run?.profiles],
  );
  const resumesById = useMemo(() => new Map((run?.resumes ?? []).map((r) => [r.resumeId, r])), [run?.resumes]);
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
        await mutateRun({ ...updated, appliedInRun: run.appliedInRun, appliedSince: run.appliedSince }, { revalidate: false });
        setThresholdDraft(null);
        setPage(1);
      } catch (err) {
        notify.error(err, 'Could not update the minimum score');
      }
    }, 400);
    return () => window.clearTimeout(debounce.current);
  }, [thresholdDraft, run, runId, mutateRun]);

  // Keep the keyboard focus on a row that exists; scroll it into view.
  useEffect(() => {
    if (rows.length && (!focusedId || !rows.some((r) => r._id === focusedId))) setFocusedId(rows[0]._id);
  }, [rows, focusedId]);
  useEffect(() => {
    if (focusedId) rowRefs.current.get(focusedId)?.scrollIntoView({ block: 'nearest' });
  }, [focusedId]);

  const resetPaging = () => {
    setPage(1);
    setExpanded(null);
    setSelected(new Set());
  };
  const changePageSize = (n: number) => {
    setPageSize(n);
    resetPaging();
    try {
      window.localStorage.setItem(PAGE_SIZE_KEY, String(n));
    } catch {
      /* storage unavailable */
    }
  };
  const goToPage = (p: number) => {
    setPage(p);
    setExpanded(null);
    setSelected(new Set());
    setFocusedId(null);
  };

  /** Optimistic: the row shows the change at once; on failure the server state is reloaded. */
  const toggleApplied = useCallback(
    async (row: JobApplyRow, s: JobApplySuggestion, applied: boolean, { undo = true } = {}) => {
      const already = row.appliedResumes.some((m) => m.resumeId === s.resumeId);
      if (already === applied) return;
      await mutateRows(
        (prev: RowsPage | undefined) =>
          prev && {
            ...prev,
            rows: prev.rows.map((r) =>
              r._id !== row._id
                ? r
                : {
                    ...r,
                    applied: applied || r.appliedResumes.some((m) => m.resumeId !== s.resumeId),
                    appliedResumes: applied
                      ? [...r.appliedResumes, { accountId: s.accountId, resumeId: s.resumeId, at: new Date().toISOString() }]
                      : r.appliedResumes.filter((m) => m.resumeId !== s.resumeId),
                  },
            ),
          },
        { revalidate: false },
      );
      const delta = applied ? 1 : -1;
      void mutateRun(
        (prev) => prev && { ...prev, appliedInRun: (prev.appliedInRun ?? 0) + delta, appliedSince: (prev.appliedSince ?? 0) + delta },
        { revalidate: false },
      );
      try {
        await api.setJobApplyResumeApplied(row._id, { accountId: s.accountId, resumeId: s.resumeId, applied });
        if (applied && undo) {
          toast(
            (t) => (
              <span className="flex items-center gap-3">
                <span>
                  Applied: {row.title || 'job'} · {profileNames[s.accountId] ?? 'Profile'}
                </span>
                <button
                  type="button"
                  className="font-semibold text-sky-700 underline dark:text-sky-400"
                  onClick={() => {
                    toast.dismiss(t.id);
                    void toggleApplied({ ...row, appliedResumes: [...row.appliedResumes, { ...s, at: null }] }, s, false, { undo: false });
                  }}
                >
                  Undo
                </button>
              </span>
            ),
            { duration: 4000, style: { fontSize: '0.875rem' } },
          );
        }
      } catch (err) {
        notify.error(err, 'Could not save — reloaded the list');
        void mutateRows();
        void mutateRun();
      }
    },
    [mutateRows, mutateRun, profileNames],
  );

  const download = useCallback(
    async (s: JobApplySuggestion) => {
      if (!resumesById.get(s.resumeId)?.hasFile) {
        notify.info('The original file isn’t stored for this resume');
        return;
      }
      const tab = window.open('', '_blank'); // opened now, while this is still a user action, so it isn't blocked
      try {
        const { url } = await api.getAccountResumeFileUrl(s.accountId, s.resumeId);
        if (tab) tab.location.href = url;
        else window.location.href = url;
      } catch (err) {
        tab?.close();
        notify.error(err, 'Could not download the resume');
      }
    },
    [resumesById],
  );

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const bulkMarkTop = async () => {
    setBusy('bulk');
    try {
      const res = await api.markTopJobApplied(runId, [...selected]);
      notify.success(`Marked ${res.marked} job${res.marked === 1 ? '' : 's'} applied`);
      setSelected(new Set());
      await Promise.all([mutateRows(), mutateRun()]);
    } catch (err) {
      notify.error(err, 'Could not mark the selected jobs');
    } finally {
      setBusy(null);
    }
  };

  // Keyboard flow for fast applying (see SHORTCUTS).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      if (e.key === '?') {
        e.preventDefault();
        setShowHelp((v) => !v);
        return;
      }
      if (document.documentElement.classList.contains('dialog-open') || !rows.length) return;
      const idx = Math.max(0, rows.findIndex((r) => r._id === focusedId));
      const row = rows[idx];
      const move = (delta: number) => {
        const next = idx + delta;
        if (next >= 0 && next < rows.length) setFocusedId(rows[next]._id);
        else if (next >= rows.length && pagination?.hasNext) goToPage(page + 1);
        else if (next < 0 && pagination?.hasPrev) goToPage(page - 1);
      };
      const key = e.key.toLowerCase();
      if (key === 'j') move(1);
      else if (key === 'k') move(-1);
      else if (key === 'o' && row.url) window.open(row.url, '_blank', 'noopener');
      else if (key === 'd' && row.suggestions[0]) void download(row.suggestions[0]);
      else if (key === 'x') toggleSelected(row._id);
      else if (e.key === 'Enter') setExpanded((cur) => (cur === row._id ? null : row._id));
      else if (key === 'a') {
        const top = row.suggestions[0];
        if (top) void toggleApplied(row, top, true);
        move(1);
      } else if (/^[1-9]$/.test(e.key)) {
        const s = row.suggestions[Number(e.key) - 1];
        if (!s) return;
        void toggleApplied(row, s, !row.appliedResumes.some((m) => m.resumeId === s.resumeId));
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

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
  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r._id));

  return (
    <div className="space-y-5">
      <PageHeader
        title={run.fileName}
        backTo="/job-applies"
        action={
          <>
            <button type="button" className="btn-outline btn-sm" onClick={() => setShowHelp(true)}>
              <Keyboard className="h-4 w-4" aria-hidden />
              Shortcuts
            </button>
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
          <div className="flex gap-1">
            <dt className="text-zinc-500">Applied today</dt>
            <dd className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{run.appliedSince ?? 0}</dd>
          </div>
          <div className="flex gap-1"><dt className="text-zinc-500">This run</dt><dd className="font-medium tabular-nums">{run.appliedInRun ?? 0}</dd></div>
          {run.expiresAt && (
            <div
              className="flex gap-1"
              title="This run's results (jobs and scores) are deleted on this date. Your applied history is kept permanently."
            >
              <dt className="text-zinc-500">Results kept until</dt>
              <dd className="font-medium">{formatDate(run.expiresAt)}</dd>
            </div>
          )}
        </dl>
        {run.error && <p className="w-full text-sm text-red-700 dark:text-red-400">Run stopped: {run.error}</p>}
        {(run.notes ?? []).map((n) => (
          <p key={n} className="hint w-full">{n}</p>
        ))}
      </section>

      <div className="toolbar flex flex-wrap items-end gap-4">
        <div role="group" aria-label="Jobs" className="flex flex-wrap gap-1">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              aria-pressed={view === v.value}
              onClick={() => {
                setView(v.value);
                resetPaging();
              }}
              className={view === v.value ? 'btn btn-sm' : 'btn-outline btn-sm'}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Applied" className="flex flex-wrap gap-1">
          {APPLIED_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={appliedFilter === f.value}
              onClick={() => {
                setAppliedFilter(f.value);
                resetPaging();
              }}
              className={appliedFilter === f.value ? 'btn btn-sm' : 'btn-outline btn-sm'}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="w-52">
          <Select
            value={accountId}
            onChange={(v) => {
              setAccountId(v);
              resetPaging();
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

      <div className="flex flex-wrap items-center gap-3">
        <Pagination info={pagination} onPage={goToPage} pageSize={pageSize} onPageSize={changePageSize} label="Pages (top)" />
        {selected.size > 0 && (
          <button type="button" className="btn btn-sm" onClick={bulkMarkTop} disabled={busy !== null}>
            {busy === 'bulk' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCheck className="h-4 w-4" aria-hidden />}
            Mark top suggestion applied ({selected.size})
          </button>
        )}
      </div>

      <div className="table-wrap">
        {rowsLoading && rows.length === 0 ? (
          <p role="status" className="flex items-center gap-2 p-6 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading jobs…
          </p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted">
            {active
              ? 'Jobs appear here as they are processed.'
              : appliedFilter === 'no' && view === 'suggested'
                ? 'Nothing left to apply to here. Switch to “All” or lower the minimum score.'
                : 'No jobs match this view.'}
          </p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="w-8 px-3 py-2 font-medium">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r._id)) : new Set())}
                    aria-label="Select all jobs on this page"
                  />
                </th>
                <th className="w-10 px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Job</th>
                <th className="px-3 py-2 font-medium">Posted</th>
                <th className="px-3 py-2 font-medium">Work mode</th>
                <th className="px-3 py-2 font-medium">Location</th>
                <th className="px-3 py-2 font-medium">Flags</th>
                <th className="px-3 py-2 font-medium">Suggested resumes · applied</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isOpen = expanded === row._id;
                const isFocused = focusedId === row._id;
                const age = ageDays(row.postedDate);
                return (
                  <Fragment key={row._id}>
                    <tr
                      ref={(el) => {
                        if (el) rowRefs.current.set(row._id, el);
                        else rowRefs.current.delete(row._id);
                      }}
                      onClick={() => setFocusedId(row._id)}
                      className={`table-row align-top ${row.applied ? 'opacity-60' : ''} ${
                        isFocused ? 'bg-sky-50/70 shadow-[inset_3px_0_0_0] shadow-sky-600 dark:bg-sky-950/30 dark:shadow-sky-400' : ''
                      }`}
                      aria-current={isFocused ? 'true' : undefined}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selected.has(row._id)}
                          onChange={() => toggleSelected(row._id)}
                          aria-label={`Select ${row.title || 'job'}`}
                        />
                      </td>
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
                        <Suggestions
                          row={row}
                          threshold={run.threshold}
                          profileNames={profileNames}
                          hasFile={(id) => !!resumesById.get(id)?.hasFile}
                          onToggle={(s, applied) => void toggleApplied(row, s, applied)}
                          onDownload={(s) => void download(s)}
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

      <Pagination info={pagination} onPage={goToPage} pageSize={pageSize} onPageSize={changePageSize} label="Pages (bottom)" />

      <Modal open={showHelp} onClose={() => setShowHelp(false)} title="Keyboard shortcuts" size="sm">
        <p className="hint mb-3">The highlighted job is the one the keys act on. Click a row to highlight it.</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {SHORTCUTS.map(([k, what]) => (
            <Fragment key={k}>
              <dt>
                <kbd className="rounded-md border border-zinc-300 bg-zinc-50 px-1.5 py-0.5 font-mono text-xs dark:border-zinc-600 dark:bg-zinc-800">
                  {k}
                </kbd>
              </dt>
              <dd className="text-zinc-700 dark:text-zinc-300">{what}</dd>
            </Fragment>
          ))}
        </dl>
      </Modal>
    </div>
  );
}
