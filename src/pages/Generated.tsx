import { useEffect, useId, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Loader2,
  RefreshCw,
  Download,
  Trash2,
  MessageSquare,
  X,
} from 'lucide-react';
import * as api from '../api/endpoints';
import type { ResumeJob, ResumeJobStatus, ResumeJobStep, ScreeningPair } from '../api/endpoints';
import { notify } from '../lib/notify';
import { archivedLabel, filterProfiles } from '../lib/profileArchive';
import { useDialog } from '../lib/useDialog';
import ResumeTabs from '../components/ResumeTabs';
import PageHeader from '../components/PageHeader';
import Select from '../components/Select';
import ModelSelect from '../components/ModelSelect';
import { useModelChoice } from '../lib/useModelChoice';
import { formatUsd } from '../lib/modelCost';
import { useAuth } from '../auth/useAuth';

const STEP_LABEL: Record<ResumeJobStep, string> = {
  queued: 'Queued',
  generating_resume: 'Drafting resume',
  rendering_pdf: 'Rendering PDF',
  uploading: 'Saving',
  generating_answers: 'Writing answers',
  done: 'Done',
};

const STATUS_BADGE: Record<ResumeJobStatus, string> = {
  queued: 'bg-zinc-100 dark:bg-zinc-800 text-body border-zinc-200 dark:border-zinc-700',
  in_progress: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
  completed: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800',
  failed: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800',
};

const STATUS_LABEL: Record<ResumeJobStatus, string> = {
  queued: 'Queued',
  in_progress: 'In progress',
  completed: 'Completed',
  failed: 'Failed',
};

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const EMPTY_JOBS: ResumeJob[] = [];

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

function shortModelName(model?: string | null): string {
  if (!model) return '';
  const slash = model.lastIndexOf('/');
  return slash >= 0 ? model.slice(slash + 1) : model;
}

const SHORT_DATE: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };

/** "Oct 3, 9:20 PM": compact so the table fits; the full timestamp is in the tooltip. */
function shortDate(d: Date | null): string {
  return d ? d.toLocaleString(undefined, SHORT_DATE) : '—';
}

function LlmProviderBadge({
  provider,
  model,
  fallbackUsed,
}: {
  provider?: api.LlmProvider | null;
  model?: string | null;
  fallbackUsed?: boolean | null;
}) {
  if (!provider) {
    return <span className="text-xs text-faint">—</span>;
  }

  const short = shortModelName(model);
  const baseLabel = provider === 'free' ? 'Free' : provider === 'anthropic' ? 'Anthropic' : 'OpenAI';
  const providerLabel = provider !== 'free' && fallbackUsed ? `${baseLabel} (fallback)` : baseLabel;
  const badgeClass =
    provider === 'free'
      ? 'badge-info'
      : fallbackUsed
        ? 'badge-warning'
        : 'badge-neutral';

  return (
    <div className="flex flex-col items-start gap-0.5" title={model || providerLabel}>
      <span className={badgeClass}>{providerLabel}</span>
      {short && (
        <span className="max-w-[140px] truncate reveal-on-focus font-mono text-[11px] text-muted">
          {short}
        </span>
      )}
    </div>
  );
}

export default function GeneratedResumesPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [panelJob, setPanelJob] = useState<ResumeJob | null>(null);
  // ?job=<id> (from Job Applies' Q&A link): open that resume's drawer.
  const [searchParams, setSearchParams] = useSearchParams();
  const deepJob = searchParams.get('job');
  useEffect(() => {
    if (!deepJob) return;
    let cancelled = false;
    api
      .getResumeJob(deepJob)
      .then((job) => !cancelled && setPanelJob(job))
      .catch(() => {
        if (cancelled) return;
        notify.error(new Error("That resume isn't available"), "That resume isn't available");
        setSearchParams({}, { replace: true });
      });
    return () => {
      cancelled = true;
    };
  }, [deepJob, setSearchParams]);
  // Closing the drawer (open -> closed) drops ?job= so a reload doesn't reopen it.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !panelJob && searchParams.has('job')) setSearchParams({}, { replace: true });
    wasOpen.current = !!panelJob;
  }, [panelJob, searchParams, setSearchParams]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const filterId = useId();

  // Filters
  const [filterAccountId, setFilterAccountId] = useState('');
  const [companyInput, setCompanyInput] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  useEffect(() => {
    const t = setTimeout(() => { setCompanyFilter(companyInput.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [companyInput]);
  const [qInput, setQInput] = useState('');
  const [qFilter, setQFilter] = useState('');
  useEffect(() => {
    const t = setTimeout(() => { setQFilter(qInput.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const { data: accountsData } = useSWR('generated-accounts-lookup', () => api.lookupAccounts());
  const profileOptions = useMemo(() => {
    const own = (accountsData?.accounts ?? []).filter(
      (a) => a.createdBy && user?.id && a.createdBy === user.id,
    );
    return [
      { value: '', label: 'All profiles' },
      ...filterProfiles(own).map((a) => ({ value: a._id, label: archivedLabel(a.name, a.archived) })),
    ];
  }, [accountsData, user?.id]);

  const { data, mutate, isLoading } = useSWR(
    ['resume-jobs-page', page, limit, filterAccountId, companyFilter, qFilter] as const,
    () => api.listResumeJobs({
      page,
      limit,
      accountId: filterAccountId || undefined,
      company: companyFilter || undefined,
      q: qFilter || undefined,
    }),
    { refreshInterval: 3000 },
  );

  const jobs = useMemo(() => data?.jobs ?? EMPTY_JOBS, [data?.jobs]);
  const pagination = data?.pagination;

  // Keep the panel's job in sync with the latest poll so newly-added
  // screening pairs (from the Ask POST or background polling) refresh
  // into the open panel.
  useEffect(() => {
    if (!panelJob) return;
    const fresh = jobs.find((j) => j._id === panelJob._id);
    if (fresh && fresh !== panelJob) setPanelJob(fresh);
  }, [jobs, panelJob]);
  const polling = jobs.some((j) => j.status === 'queued' || j.status === 'in_progress');

  // Auto-download newly-completed jobs (only newly-transitioned).
  const seenRef = useRef<Set<string>>(new Set());
  const initRef = useRef(false);
  useEffect(() => {
    if (!data) return;
    const seen = seenRef.current;
    if (!initRef.current) {
      for (const j of data.jobs) {
        if (j.status === 'completed' || j.status === 'failed') seen.add(j._id);
      }
      initRef.current = true;
      return;
    }
    const messages: string[] = [];
    for (const j of data.jobs) {
      if (j.status === 'completed' && !seen.has(j._id)) {
        seen.add(j._id);
        // Job Applies tailors in batches; those are downloaded from the Job Applies table, not here.
        const autoDownload = j.hasPdf && j.source !== 'job_applies';
        messages.push(`${j.companyName} resume completed${autoDownload ? ', downloading' : ''}.`);
        if (autoDownload) {
          api.downloadResumeJob(j).catch((err) =>
            notify.error(err, `Auto-download failed for ${j.companyName}`)
          );
        }
      } else if (j.status === 'failed') {
        if (!seen.has(j._id)) messages.push(`${j.companyName} resume failed.`);
        seen.add(j._id);
      }
    }
    // Polite live region: background job transitions are otherwise silent.
    if (messages.length) setAnnouncement(messages.join(' '));
  }, [data]);

  // Selection helpers — only completed-with-pdf rows are selectable.
  const selectableIds = useMemo(
    () => jobs.filter((j) => j.status === 'completed' && j.hasPdf).map((j) => j._id),
    [jobs],
  );
  const allChecked = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const someChecked = selected.size > 0;

  function toggleAll(checked: boolean) {
    if (checked) {
      setSelected(new Set(selectableIds));
    } else {
      setSelected(new Set());
    }
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // Drop selection IDs no longer in the visible page (stale).
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set<string>();
      for (const id of prev) if (selectableIds.includes(id)) next.add(id);
      return setsEqual(prev, next) ? prev : next;
    });
  }, [selectableIds]);

  async function downloadSelected() {
    const targetIds = jobs.filter((j) => selected.has(j._id)).map((j) => j._id);
    if (targetIds.length === 0) return;
    setBulkDownloading(true);
    try {
      await api.bulkDownloadResumeJobs(targetIds);
      notify.success(`Downloaded ${targetIds.length} resume${targetIds.length === 1 ? '' : 's'} as zip`);
    } catch (err) {
      notify.error(err, 'Bulk download failed');
    } finally {
      setBulkDownloading(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Generated resumes"
        action={
          <div className="flex items-center gap-3">
            {polling && (
              <span className="inline-flex items-center gap-1 text-xs text-blue-600">
                <Loader2 className="w-3 h-3 animate-spin" aria-hidden /> Live
              </span>
            )}
            <button
              type="button"
              onClick={() => mutate()}
              className="link-inline text-xs text-muted hover:text-sky-600 dark:hover:text-sky-400"
            >
              <RefreshCw className="w-3 h-3" aria-hidden /> Refresh
            </button>
          </div>
        }
      />
      <ResumeTabs />
      <div role="status" aria-live="polite" className="sr-only">{announcement}</div>

      {/* Filters + bulk actions — merged toolbar */}
      <div className="flex flex-wrap items-end justify-between gap-3 toolbar">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="w-56">
            <label htmlFor={`${filterId}-profile`} className="block text-xs text-muted mb-1">Profile</label>
            <Select
              id={`${filterId}-profile`}
              value={filterAccountId}
              onChange={(v) => { setFilterAccountId(v); setPage(1); }}
              options={profileOptions}
            />
          </div>
          <div className="w-56">
            <label htmlFor={`${filterId}-company`} className="block text-xs text-muted mb-1">Company</label>
            <input
              id={`${filterId}-company`}
              className="input w-full text-sm"
              placeholder="Filter by company name"
              value={companyInput}
              onChange={(e) => setCompanyInput(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-72">
            <label htmlFor={`${filterId}-q`} className="block text-xs text-muted mb-1">Search JD</label>
            <input
              id={`${filterId}-q`}
              className="input w-full text-sm"
              placeholder="skills, tech, anything (space = AND)"
              aria-describedby={`${filterId}-q-hint`}
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
            />
            <span id={`${filterId}-q-hint`} className="sr-only">Separate words with spaces; every word must match.</span>
          </div>
          {(filterAccountId || companyFilter || qFilter) && (
            <button
              type="button"
              onClick={() => {
                setFilterAccountId('');
                setCompanyInput(''); setCompanyFilter('');
                setQInput(''); setQFilter('');
                setPage(1);
              }}
              className="link text-xs text-muted"
            >
              Clear filters
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 pb-1">
          <SaveFolderStatus />
          <span className="text-xs text-muted" aria-live="polite">
            {someChecked ? `${selected.size} selected` : 'Select rows for bulk actions'}
          </span>
          <button
            type="button"
            onClick={downloadSelected}
            disabled={!someChecked || bulkDownloading}
            className="btn btn-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {bulkDownloading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Download className="w-4 h-4" aria-hidden />}
            Download {someChecked ? `(${selected.size})` : 'selected'}
          </button>
        </div>
      </div>

      <div className="table-wrap">
        {isLoading && jobs.length === 0 ? (
          <p role="status" className="p-6 text-sm text-muted flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Loading...
          </p>
        ) : jobs.length === 0 ? (
          <p className="p-6 text-sm text-muted">
            {filterAccountId || companyFilter
              ? 'No resumes match the filters.'
              : 'No builds yet. Generate one from the Resume Generator.'}
          </p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-3 py-2 font-medium w-8">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={(e) => toggleAll(e.target.checked)}
                    aria-label="Select all"
                  />
                </th>
                <th className="px-3 py-2 font-medium">Profile</th>
                <th className="px-3 py-2 font-medium">Company</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">LLM</th>
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Tokens</th>
                <th className="px-3 py-2 font-medium">File</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Created</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Generated</th>
                <th className="sticky right-0 z-10 bg-zinc-50 dark:bg-zinc-900/80 border-l border-zinc-200/80 dark:border-zinc-700/30 px-3 py-2 font-medium w-32 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="row-divider">
              {jobs.map((job) => (
                <JobRow
                  key={job._id}
                  job={job}
                  onOpen={() => setPanelJob(job)}
                  onChanged={mutate}
                  selected={selected.has(job._id)}
                  selectable={job.status === 'completed' && !!job.hasPdf}
                  onSelect={(checked) => toggleOne(job._id, checked)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pagination && pagination.totalPages > 0 && (
        <div className="flex items-center justify-between text-sm">
          <div className="text-muted">
            {pagination.total > 0 && (
              <>
                Showing {(pagination.page - 1) * pagination.limit + 1}–
                {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-muted flex items-center gap-2">
              Per page
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="border border-field dark:border-zinc-600 rounded-md px-2 py-1 text-sm"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={!pagination.hasPrev}
              className="px-3 py-1 border border-zinc-200 dark:border-zinc-700 rounded text-sm disabled:opacity-40 hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
            >
              Previous
            </button>
            <span className="text-muted">
              Page {pagination.page} / {pagination.totalPages || 1}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={!pagination.hasNext}
              className="px-3 py-1 border border-zinc-200 dark:border-zinc-700 rounded text-sm disabled:opacity-40 hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {panelJob && (
        <ScreeningPanel
          job={panelJob}
          onClose={() => setPanelJob(null)}
          onChanged={mutate}
        />
      )}
    </div>
  );
}

function JobRow({
  job,
  onOpen,
  onChanged,
  selected,
  selectable,
  onSelect,
}: {
  job: ResumeJob;
  onOpen: () => void;
  onChanged: () => void;
  selected: boolean;
  selectable: boolean;
  onSelect: (checked: boolean) => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const created = job.createdAt ? new Date(job.createdAt) : null;
  const generated = job.completedAt ? new Date(job.completedAt) : null;
  const elapsed = job.executionMs != null ? `${(job.executionMs / 1000).toFixed(1)}s` : '—';
  const inFlight = job.status === 'queued' || job.status === 'in_progress';
  const hasAnswers = job.screeningPairs && job.screeningPairs.length > 0;
  const isFailed = job.status === 'failed';
  const retryTitle = job.errorMessage
    ? `Retry: ${job.errorMessage}`
    : 'Retry generation';

  async function download() {
    setDownloading(true);
    try {
      await api.downloadResumeJob(job);
    } catch (err) {
      notify.error(err, 'Download failed');
    } finally {
      setDownloading(false);
    }
  }

  async function remove() {
    if (!confirm('Delete this build?')) return;
    setDeleting(true);
    try {
      await api.deleteResumeJob(job._id);
      notify.success('Build deleted');
      onChanged();
    } catch (err) {
      notify.error(err, 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  async function retry() {
    setRetrying(true);
    try {
      await api.retryResumeJob(job._id);
      notify.success('Retry queued');
      onChanged();
    } catch (err) {
      notify.error(err, 'Retry failed');
    } finally {
      setRetrying(false);
    }
  }

  return (
    <>
      <tr className="table-row group reveal-scope cursor-pointer" onClick={onOpen}>
        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected}
            disabled={!selectable}
            onChange={(e) => onSelect(e.target.checked)}
            aria-label={`Select ${job.companyName}`}
            title={selectable ? 'Select for bulk download' : 'Not selectable until completed'}
          />
        </td>
        <td className="px-3 py-2 text-strong truncate reveal-on-focus max-w-[140px]" title={job.profileName}>
          {job.profileName}
        </td>
        <td className="px-3 py-2 text-strong max-w-[200px]" title={job.jobUrl || job.companyName}>
          <div className="truncate reveal-on-focus">
            {job.jobUrl ? (
              <a href={job.jobUrl} target="_blank" rel="noreferrer" className="link">
                {job.companyName}
              </a>
            ) : (
              job.companyName
            )}
            {job.source === 'job_applies' &&
              (job.jobApplyRunId ? (
                <Link
                  to={`/job-applies/${job.jobApplyRunId}`}
                  className="badge-neutral ml-2 align-middle text-[10px] hover:underline"
                  title="Open the Job Applies run this resume was tailored in"
                  onClick={(e) => e.stopPropagation()}
                >
                  From run: {job.jobApplyRunName} ↗
                </Link>
              ) : (
                <span className="badge-neutral ml-2 align-middle text-[10px]" title="Tailored from a Job Applies run">
                  From a Job Applies run
                </span>
              ))}
          </div>
          {job.matchSnippet && (
            <div className="text-[11px] text-muted italic mt-0.5 line-clamp-2 reveal-on-focus" title={job.matchSnippet}>
              {job.matchSnippet}
            </div>
          )}
        </td>
        <td className="px-3 py-2">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_BADGE[job.status]}`}>
            {inFlight && <Loader2 className="w-3 h-3 animate-spin" aria-hidden />}
            {STATUS_LABEL[job.status]}
          </span>
          {inFlight && (
            <div className="text-[11px] text-muted mt-0.5">{STEP_LABEL[job.step]}…</div>
          )}
          {isFailed && job.errorMessage && (
            <div
              className="text-[11px] text-red-600 dark:text-red-400 mt-0.5 line-clamp-2 reveal-on-focus max-w-[220px]"
              title={job.errorMessage}
            >
              {job.errorMessage}
            </div>
          )}
        </td>
        <td className="px-3 py-2">
          <LlmProviderBadge
            provider={job.resumeLlmProvider}
            model={job.resumeLlmModel}
            fallbackUsed={job.resumeLlmFallbackUsed}
          />
        </td>
        <td className="px-3 py-2 text-xs text-muted whitespace-nowrap">{elapsed}</td>
        <td className="px-3 py-2 text-xs text-muted whitespace-nowrap tabular-nums" title={
          (job.inputTokens != null || job.outputTokens != null || job.reasoningTokens != null)
            ? `input ${job.inputTokens ?? 0} · output ${job.outputTokens ?? 0} · reasoning ${job.reasoningTokens ?? 0}` +
              (job.estimatedCostUsd != null ? ` · est. cost ${formatUsd(job.estimatedCostUsd)}` : '')
            : 'No usage recorded'
        }>
          {job.inputTokens != null || job.outputTokens != null
            ? `${(job.inputTokens ?? 0).toLocaleString()} / ${(job.outputTokens ?? 0).toLocaleString()}`
            : '—'}
          {job.estimatedCostUsd != null && (
            <div className="text-[11px] text-faint">{formatUsd(job.estimatedCostUsd)}</div>
          )}
        </td>
        <td className="px-3 py-2 text-xs max-w-[150px]">
          {job.pdfFilename ? (
            <span className="block truncate text-body font-mono" title={job.pdfFilename.split('/').pop()}>
              {job.pdfFilename.split('/').pop()}
            </span>
          ) : (
            <span className="text-faint">—</span>
          )}
        </td>
        <td className="px-3 py-2 text-xs text-muted whitespace-nowrap" title={created ? created.toLocaleString() : undefined}>
          {shortDate(created)}
        </td>
        <td className="px-3 py-2 text-xs text-muted whitespace-nowrap" title={generated ? generated.toLocaleString() : undefined}>
          {shortDate(generated)}
        </td>
        <td
          className="sticky right-0 z-10 bg-white dark:bg-zinc-950 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-900 border-l border-zinc-200/80 dark:border-zinc-700/30 px-3 py-2 text-right"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="inline-flex gap-1 justify-end">
            {isFailed && (
              <button
                type="button"
                onClick={retry}
                disabled={retrying}
                className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-muted disabled:opacity-50"
                title={retryTitle}
                aria-label={retryTitle}
              >
                {retrying ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RefreshCw className="w-4 h-4" aria-hidden />}
              </button>
            )}
            <button
              type="button"
              onClick={download}
              disabled={downloading || job.status !== 'completed'}
              className={`p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-muted disabled:opacity-30 disabled:cursor-not-allowed ${
                job.status === 'completed' ? '' : 'invisible'
              }`}
              title={job.hasPdf ? 'Download PDF' : 'PDF missing — try anyway'}
              aria-label={`Download PDF for ${job.companyName}${job.hasPdf ? '' : ' (PDF missing, try anyway)'}`}
            >
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Download className="w-4 h-4" aria-hidden />}
            </button>
            <button
              type="button"
              onClick={onOpen}
              className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-muted relative"
              title="Open screening Q&A panel"
              aria-label={`Open screening Q&A for ${job.companyName}${
                hasAnswers ? ` (${job.screeningPairs!.length} answer${job.screeningPairs!.length === 1 ? '' : 's'})` : ''
              }`}
            >
              <MessageSquare className="w-4 h-4" aria-hidden />
              {hasAnswers && (
                <span aria-hidden className="absolute -top-1 -right-1 inline-flex items-center justify-center text-[9px] font-semibold text-white bg-primary rounded-full w-3.5 h-3.5">
                  {job.screeningPairs!.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={deleting || inFlight}
              className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-muted disabled:opacity-50"
              title={inFlight ? 'Cannot delete while running' : 'Delete'}
              aria-label={`Delete build for ${job.companyName}${inFlight ? ' (cannot delete while running)' : ''}`}
            >
              <Trash2 className="w-4 h-4" aria-hidden />
            </button>
          </div>
        </td>
      </tr>
    </>
  );
}

function ScreeningPairsBlock({ pairs }: { pairs: ScreeningPair[] }) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const normalized = normalizeScreeningPairs(pairs);

  async function copyAnswer(index: number, answer: string) {
    try {
      await navigator.clipboard.writeText(answer);
      setCopiedIndex(index);
      notify.success('Answer copied');
      window.setTimeout(() => setCopiedIndex((i) => (i === index ? null : i)), 1200);
    } catch {
      notify.error('Failed to copy');
    }
  }

  return (
    <ol className="space-y-3">
      {normalized.map((p, i) => {
        const answer = p.answer;
        const copied = copiedIndex === i;
        return (
          <li key={i}>
            <button
              type="button"
              onClick={() => copyAnswer(i, answer)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  copyAnswer(i, answer);
                }
              }}
              className={
                'panel w-full text-left p-3 cursor-pointer transition-colors ' +
                'hover:bg-zinc-50 dark:hover:bg-zinc-800/60 ' +
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-600 dark:focus-visible:ring-sky-400 ' +
                (copied ? 'ring-1 ring-green-400/60 dark:ring-green-600/50' : '')
              }
              title="Click to copy answer"
            >
              {/* No aria-label: it would replace the question/answer text as the button's name. */}
              <span className="sr-only">Copy answer. </span>
              <p className="text-sm font-medium text-strong whitespace-pre-wrap mb-1.5">
                <span className="text-faint mr-2">{i + 1}.</span>
                {p.question}
              </p>
              <p className="text-sm text-body whitespace-pre-wrap leading-relaxed">{answer}</p>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** Decode leftover \\n / \\t escape sequences in plain answer text. */
function decodeAnswerEscapes(text: string): string {
  if (!text.includes('\\')) return text;
  return text.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r');
}

/**
 * Normalize legacy/bad stores where one or more answers are still a stringified
 * {"answers":[...]} or {"answer":"..."} dump. Redistributes a full answers
 * array stuffed into pair 0 across all pairs when later answers are empty.
 */
function normalizeScreeningPairs(pairs: ScreeningPair[]): ScreeningPair[] {
  if (pairs.length === 0) return pairs;

  const extracted = tryExtractAnswersArray(pairs[0]?.answer || '');
  if (extracted && extracted.length > 0) {
    const restEmpty = pairs.slice(1).every((p) => !(p.answer || '').trim());
    const enough = extracted.length >= pairs.length;
    if (restEmpty || enough) {
      return pairs.map((p, i) => ({
        question: p.question,
        answer: unwrapScreeningAnswer(extracted[i] ?? '', i),
      }));
    }
  }

  return pairs.map((p, i) => ({
    question: p.question,
    answer: unwrapScreeningAnswer(p.answer, i),
  }));
}

/** If raw is (or contains) {"answers":[...]}, return the string list. */
function tryExtractAnswersArray(raw: string): string[] | null {
  const text = (raw || '').trim();
  if (!text) return null;

  const tryObj = (obj: unknown): string[] | null => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    const ans = (obj as Record<string, unknown>).answers;
    if (!Array.isArray(ans) || ans.length === 0) return null;
    // Nested full payload stuffed into answers[0].
    if (ans.length === 1 && typeof ans[0] === 'string') {
      const nested = tryExtractAnswersArray(ans[0]);
      if (nested && nested.length > 1) return nested;
    }
    return ans.map((a) => {
      if (typeof a === 'string') return a;
      if (a && typeof a === 'object' && typeof (a as { answer?: unknown }).answer === 'string') {
        return (a as { answer: string }).answer;
      }
      return String(a ?? '');
    });
  };

  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const parsed = JSON.parse(text) as unknown;
      const fromObj = tryObj(parsed);
      if (fromObj) return fromObj;
      if (typeof parsed === 'string') return tryExtractAnswersArray(parsed);
    } catch {
      /* fall through */
    }
  }

  // Double-encoded JSON string: "\"{...}\""
  if (text.startsWith('"') && text.endsWith('"')) {
    try {
      const inner = JSON.parse(text) as unknown;
      if (typeof inner === 'string') return tryExtractAnswersArray(inner);
    } catch {
      /* fall through */
    }
  }

  return null;
}

/** Unwrap legacy/bad stores where the answer is a stringified object. */
function unwrapScreeningAnswer(raw: string, index = 0): string {
  const text = (raw || '').trim();
  if (!text) return '';

  const fromAnswers = tryExtractAnswersArray(text);
  if (fromAnswers && fromAnswers.length > 0) {
    const picked = fromAnswers[Math.min(index, fromAnswers.length - 1)] ?? '';
    // Avoid infinite recursion when the element is still a wrapper.
    if (picked !== text && (picked.startsWith('{') || picked.startsWith('"'))) {
      return unwrapScreeningAnswer(picked, index);
    }
    return decodeAnswerEscapes(picked);
  }

  if (!(text.startsWith('{') && text.endsWith('}'))) {
    return decodeAnswerEscapes(text);
  }

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object' && typeof parsed.answer === 'string') {
      return decodeAnswerEscapes(parsed.answer);
    }
  } catch {
    /* continue — often Python-style single-quoted dicts */
  }

  const keyMatch = text.match(/['"]answer['"]\s*:\s*/);
  if (!keyMatch || keyMatch.index == null) return decodeAnswerEscapes(text);
  const rest = text.slice(keyMatch.index + keyMatch[0].length);
  const quote = rest[0];
  if (quote !== "'" && quote !== '"') return decodeAnswerEscapes(text);

  let i = 1;
  let out = '';
  while (i < rest.length) {
    const ch = rest[i];
    if (ch === '\\' && i + 1 < rest.length) {
      const next = rest[i + 1];
      out += next === 'n' ? '\n' : next === 't' ? '\t' : next === 'r' ? '\r' : next;
      i += 2;
      continue;
    }
    if (ch === quote) {
      const after = rest.slice(i + 1).trimStart();
      if (after.startsWith(',') || after.startsWith('}')) return out;
    }
    out += ch;
    i += 1;
  }
  return decodeAnswerEscapes(text);
}

function ScreeningPanel({
  job, onClose, onChanged,
}: {
  job: ResumeJob;
  onClose: () => void;
  onChanged: () => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const [entered, setEntered] = useState(false);
  const [text, setText] = useState('');
  const [asking, setAsking] = useState(false);
  const [jdOpen, setJdOpen] = useState(false);
  const [jdCopied, setJdCopied] = useState(false);
  const [coverLetterOpen, setCoverLetterOpen] = useState(false);
  const [coverLetterCopied, setCoverLetterCopied] = useState(false);
  const screeningModel = useModelChoice('screening');
  const coverLetterModel = useModelChoice('cover_letter');
  const [regenerating, setRegenerating] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const coverLetterHistory = job.coverLetterHistory ?? [];
  const pairs = job.screeningPairs || [];

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useDialog(true, panelRef, onClose);

  async function copyJobDescription() {
    const content = job.jobDescription || '';
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setJdCopied(true);
      notify.success('Job description copied');
      window.setTimeout(() => setJdCopied(false), 1200);
    } catch {
      notify.error('Failed to copy');
    }
  }

  async function copyCoverLetter() {
    const content = job.coverLetterText || '';
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCoverLetterCopied(true);
      notify.success('Cover letter copied');
      window.setTimeout(() => setCoverLetterCopied(false), 1200);
    } catch {
      notify.error('Failed to copy');
    }
  }

  async function copyText(content: string) {
    try {
      await navigator.clipboard.writeText(content);
      notify.success('Cover letter copied');
    } catch {
      notify.error('Failed to copy');
    }
  }

  async function regenerateCover() {
    setRegenerating(true);
    try {
      // '' (model list unavailable) is omitted so the server picks its default.
      await api.regenerateCoverLetter(job._id, { model: coverLetterModel.value || undefined });
      notify.success('Cover letter written');
      onChanged();
    } catch (err) {
      notify.error(err, 'Cover letter generation failed');
      // A request that timed out client-side may still have saved on the server: refresh so it shows.
      onChanged();
    } finally {
      setRegenerating(false);
    }
  }

  async function ask() {
    const questions = parseNumberedQuestions(text);
    if (questions.length === 0) {
      notify.warn('Type at least one question. Number them (1. ... 2. ...) for multiple.');
      return;
    }
    setAsking(true);
    try {
      // '' (model list unavailable) is omitted so the server picks its default.
      await api.askResumeJobScreening(job._id, questions, screeningModel.value || undefined);
      setText('');
      notify.success(`Answered ${questions.length} question${questions.length === 1 ? '' : 's'}`);
      onChanged();
    } catch (err) {
      notify.error(err, 'Failed to get answers');
    } finally {
      setAsking(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`drawer-overlay ${entered ? 'is-open' : ''}`}
        onClick={onClose}
        aria-label="Close screening panel"
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`drawer right-0 w-full sm:w-[480px] outline-none ${entered ? 'is-open' : ''}`}
      >
        <header className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs text-muted">Screening Q&amp;A</div>
            <h2 id={titleId} className="font-semibold text-strong truncate">{job.companyName}</h2>
            <div className="text-xs text-muted truncate">{job.profileName}</div>
            {job.screeningLlmProvider && (
              <div className="mt-1">
                <span className="text-[11px] text-muted mr-1">Last Q&amp;A:</span>
                <LlmProviderBadge
                  provider={job.screeningLlmProvider}
                  model={job.screeningLlmModel}
                  fallbackUsed={job.screeningLlmFallbackUsed}
                />
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} className="btn-icon" aria-label="Close"><X className="w-4 h-4" aria-hidden /></button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {(job.resumeLlmFallbackReason || job.screeningLlmFallbackReason) && (
            <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-3 space-y-1.5">
              <div className="text-xs font-semibold text-amber-700 dark:text-amber-400">Fallback details</div>
              {job.resumeLlmFallbackReason && (
                <div className="text-[12px] text-amber-800 dark:text-amber-300 leading-snug">
                  <span className="font-medium">Resume:</span> {job.resumeLlmFallbackReason}
                </div>
              )}
              {job.screeningLlmFallbackReason && (
                <div className="text-[12px] text-amber-800 dark:text-amber-300 leading-snug">
                  <span className="font-medium">Screening:</span> {job.screeningLlmFallbackReason}
                </div>
              )}
            </div>
          )}

          <section className="space-y-2">
            <button
              type="button"
              onClick={() => setJdOpen((v) => !v)}
              className="link-inline text-xs text-muted hover:text-sky-600 dark:hover:text-sky-400"
              aria-expanded={jdOpen}
              aria-controls={`${titleId}-jd`}
            >
              <span aria-hidden>{jdOpen ? '▾' : '▸'}</span> Job description
            </button>
            {job.jobDescription && (
              <button
                type="button"
                onClick={copyJobDescription}
                className={
                  'panel w-full text-left px-3 py-2.5 cursor-pointer transition-colors ' +
                  'hover:bg-zinc-50 dark:hover:bg-zinc-800/60 ' +
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-600 dark:focus-visible:ring-sky-400 ' +
                  (jdCopied ? 'ring-1 ring-green-400/60 dark:ring-green-600/50' : '')
                }
                title="Click to copy job description"
              >
                <p className="text-sm text-body">
                  {jdCopied ? 'Copied!' : 'Click to copy job description'}
                </p>
              </button>
            )}
            {jdOpen && (
              <pre id={`${titleId}-jd`} className="text-xs text-body bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 whitespace-pre-wrap max-h-72 overflow-y-auto">
                {job.jobDescription || '(no JD stored)'}
              </pre>
            )}
          </section>

          {(job.coverLetterText || job.status === 'completed') && (
            <section className="space-y-2">
              {job.coverLetterText ? (
              <>
              <button
                type="button"
                onClick={() => setCoverLetterOpen((v) => !v)}
                className="link-inline text-xs text-muted hover:text-sky-600 dark:hover:text-sky-400"
                aria-expanded={coverLetterOpen}
                aria-controls={`${titleId}-cover`}
              >
                <span aria-hidden>{coverLetterOpen ? '▾' : '▸'}</span> Cover letter
              </button>
              <button
                type="button"
                onClick={copyCoverLetter}
                className={
                  'panel w-full text-left px-3 py-2.5 cursor-pointer transition-colors ' +
                  'hover:bg-zinc-50 dark:hover:bg-zinc-800/60 ' +
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-600 dark:focus-visible:ring-sky-400 ' +
                  (coverLetterCopied ? 'ring-1 ring-green-400/60 dark:ring-green-600/50' : '')
                }
                title="Click to copy cover letter"
              >
                <p className="text-sm text-body">
                  {coverLetterCopied ? 'Copied!' : 'Click to copy cover letter'}
                </p>
              </button>
              {coverLetterOpen && (
                <pre id={`${titleId}-cover`} className="text-sm text-strong bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                  {job.coverLetterText}
                </pre>
              )}
              </>
              ) : (
                <p className="text-xs text-faint italic">No cover letter yet.</p>
              )}

              {job.coverLetterLlmProvider && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted">Written by:</span>
                  <LlmProviderBadge
                    provider={job.coverLetterLlmProvider}
                    model={job.coverLetterLlmModel}
                    fallbackUsed={job.coverLetterLlmFallbackUsed}
                  />
                </div>
              )}
              {job.coverLetterLlmFallbackReason && (
                <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-snug">
                  <span className="font-medium">Cover letter fallback:</span> {job.coverLetterLlmFallbackReason}
                </p>
              )}

              <ModelSelect
                label={job.coverLetterText ? 'Regenerate with' : 'Write with'}
                choice={coverLetterModel}
                disabled={regenerating}
              />
              <button type="button" className="btn" onClick={regenerateCover} disabled={regenerating}>
                {regenerating ? (
                  <><Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Writing...</>
                ) : job.coverLetterText ? (
                  'Regenerate cover letter'
                ) : (
                  'Write cover letter'
                )}
              </button>

              {coverLetterHistory.length > 0 && (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setHistoryOpen((v) => !v)}
                    className="link-inline text-xs text-muted hover:text-sky-600 dark:hover:text-sky-400"
                    aria-expanded={historyOpen}
                    aria-controls={`${titleId}-cover-history`}
                  >
                    <span aria-hidden>{historyOpen ? '▾' : '▸'}</span> Previous versions ({coverLetterHistory.length})
                  </button>
                  {historyOpen && (
                    <ul id={`${titleId}-cover-history`} className="space-y-2">
                      {coverLetterHistory.map((v, i) => (
                        <li key={`${v.createdAt}-${i}`} className="panel p-3 space-y-1.5">
                          <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
                            <span className="font-mono truncate" title={v.model}>{v.model || v.provider}</span>
                            <span className="whitespace-nowrap">{new Date(v.createdAt).toLocaleString()}</span>
                          </div>
                          <pre className="text-xs text-strong whitespace-pre-wrap max-h-40 overflow-y-auto leading-relaxed">{v.text}</pre>
                          <button type="button" className="link-inline text-xs" onClick={() => copyText(v.text)}>
                            Copy
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
          )}

          <section>
            <h3 className="card-title mb-2">Answers ({pairs.length})</h3>
            {pairs.length > 0 ? (
              <ScreeningPairsBlock pairs={pairs} />
            ) : (
              <p className="text-xs text-faint italic">No questions asked yet. Add one below.</p>
            )}
          </section>
        </div>

        <footer className="px-6 py-5 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
          <label htmlFor={`${titleId}-ask`} className="block text-xs text-muted">Ask screening questions — number them (<code>1.</code>, <code>2.</code>) for multiple. Unnumbered = one question.</label>
          <textarea
            id={`${titleId}-ask`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder={'e.g.\n1. Why are you a fit for this role?\n2. Tell me about a recent challenging project.\n3. Where do you see yourself in 5 years?'}
            className="input w-full text-sm"
          />
          <ModelSelect label="Screening model" choice={screeningModel} />
          <div className="flex justify-end">
            <button type="button" className="btn" onClick={ask} disabled={asking || !text.trim()}>
              {asking ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Asking...</> : 'Ask'}
            </button>
          </div>
        </footer>
      </aside>
    </>
  );
}

function SaveFolderStatus() {
  const [fsa, setFsa] = useState(false);
  const [dirName, setDirName] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const m = await import('../lib/downloadDir');
      setFsa(m.isFsaSupported());
      setDirName(m.cachedDirName());
    })();
  }, []);
  if (!fsa) return null;
  return (
    <span className="text-[11px] text-muted flex items-center gap-1">
      {dirName ? (
        <>
          Saving to <code className="bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-body">{dirName}/</code>
          <button
            type="button"
            onClick={async () => {
              const m = await import('../lib/downloadDir');
              m.resetDownloadDir();
              setDirName(null);
            }}
            className="link text-faint underline"
            aria-label="Change download folder"
          >
            change
          </button>
        </>
      ) : (
        <span className="text-faint">First download will ask for a folder</span>
      )}
    </span>
  );
}

/**
 * Split a multi-question textarea by numbered prefixes ("1.", "2)", "3:").
 * Supports multi-line questions: everything between two prefixes is one
 * question. Unnumbered text becomes a single question.
 */
function parseNumberedQuestions(text: string): string[] {
  const raw = text.trim();
  if (!raw) return [];
  // Split on a number-prefix that sits at start of a line.
  const chunks = raw.split(/(?:^|\n)\s*(?=\d+\s*[.)\]:]\s)/g);
  const stripped = chunks
    .map((s) => s.replace(/^\s*\d+\s*[.)\]:]\s*/, '').trim())
    .filter(Boolean);
  // No numbered prefixes found → whole input is one question.
  return stripped.length ? stripped : [raw];
}
