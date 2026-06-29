import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import {
  Loader2,
  RefreshCw,
  Download,
  Trash2,
  Copy,
  MessageSquare,
  X,
} from 'lucide-react';
import * as api from '../api/endpoints';
import type { ResumeJob, ResumeJobStatus, ResumeJobStep, ScreeningPair } from '../api/endpoints';
import { notify } from '../lib/notify';
import ResumeTabs from '../components/ResumeTabs';
import PageHeader from '../components/PageHeader';
import Select from '../components/Select';
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
  queued: 'bg-gray-100 text-gray-700 border-gray-200',
  in_progress: 'bg-blue-100 text-blue-800 border-blue-200',
  completed: 'bg-green-100 text-green-800 border-green-200',
  failed: 'bg-red-100 text-red-800 border-red-200',
};

const STATUS_LABEL: Record<ResumeJobStatus, string> = {
  queued: 'Queued',
  in_progress: 'In progress',
  completed: 'Completed',
  failed: 'Failed',
};

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export default function GeneratedResumesPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [panelJob, setPanelJob] = useState<ResumeJob | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDownloading, setBulkDownloading] = useState(false);

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
      ...own.map((a) => ({ value: a._id, label: a.name })),
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

  const jobs = data?.jobs ?? [];
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
    for (const j of data.jobs) {
      if (j.status === 'completed' && !seen.has(j._id)) {
        seen.add(j._id);
        if (j.hasPdf) {
          api.downloadResumeJob(j).catch((err) =>
            notify.error(err, `Auto-download failed for ${j.companyName}`)
          );
        }
      } else if (j.status === 'failed') {
        seen.add(j._id);
      }
    }
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
      return next;
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
                <Loader2 className="w-3 h-3 animate-spin" /> Live
              </span>
            )}
            <button
              type="button"
              onClick={() => mutate()}
              className="text-xs text-gray-500 hover:text-primary inline-flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          </div>
        }
      />
      <ResumeTabs />

      {/* Filters + bulk actions — merged toolbar */}
      <div className="flex flex-wrap items-end justify-between gap-3 bg-white rounded-[12px] border border-gray-100 px-4 py-3 shadow-sm">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="w-56">
            <label className="block text-xs text-gray-500 mb-1">Profile</label>
            <Select
              value={filterAccountId}
              onChange={(v) => { setFilterAccountId(v); setPage(1); }}
              options={profileOptions}
            />
          </div>
          <div className="w-56">
            <label className="block text-xs text-gray-500 mb-1">Company</label>
            <input
              className="input w-full text-sm"
              placeholder="Filter by company name"
              value={companyInput}
              onChange={(e) => setCompanyInput(e.target.value)}
            />
          </div>
          <div className="w-72">
            <label className="block text-xs text-gray-500 mb-1">Search JD</label>
            <input
              className="input w-full text-sm"
              placeholder="skills, tech, anything (space = AND)"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
            />
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
              className="text-xs text-gray-500 hover:text-primary pb-2"
            >
              Clear filters
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 pb-1">
          <SaveFolderStatus />
          <span className="text-xs text-gray-500">
            {someChecked ? `${selected.size} selected` : 'Select rows for bulk actions'}
          </span>
          <button
            type="button"
            onClick={downloadSelected}
            disabled={!someChecked || bulkDownloading}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-[8px] bg-primary text-white text-sm font-medium shadow-sm hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {bulkDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Download {someChecked ? `(${selected.size})` : 'selected'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[12px] border border-gray-100 shadow-sm overflow-hidden">
        {isLoading && jobs.length === 0 ? (
          <p className="p-6 text-sm text-gray-500 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading...
          </p>
        ) : jobs.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">
            {filterAccountId || companyFilter
              ? 'No resumes match the filters.'
              : 'No builds yet. Generate one from the Resume Generator.'}
          </p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 font-medium w-8">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={(e) => toggleAll(e.target.checked)}
                    aria-label="Select all"
                  />
                </th>
                <th className="px-3 py-2 font-medium">Created</th>
                <th className="px-3 py-2 font-medium">Profile</th>
                <th className="px-3 py-2 font-medium">Company</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Tokens</th>
                <th className="px-3 py-2 font-medium">File</th>
                <th className="px-3 py-2 font-medium w-32 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
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
          <div className="text-gray-600">
            {pagination.total > 0 && (
              <>
                Showing {(pagination.page - 1) * pagination.limit + 1}–
                {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-500 flex items-center gap-2">
              Per page
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="border border-gray-200 rounded-md px-2 py-1 text-sm"
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
              className="px-3 py-1 border border-gray-200 rounded text-sm disabled:opacity-40 hover:bg-gray-50"
            >
              Previous
            </button>
            <span className="text-gray-600">
              Page {pagination.page} / {pagination.totalPages || 1}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={!pagination.hasNext}
              className="px-3 py-1 border border-gray-200 rounded text-sm disabled:opacity-40 hover:bg-gray-50"
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
  const created = job.createdAt ? new Date(job.createdAt) : null;
  const elapsed = job.executionMs != null ? `${(job.executionMs / 1000).toFixed(1)}s` : '—';
  const inFlight = job.status === 'queued' || job.status === 'in_progress';
  const hasAnswers = job.screeningPairs && job.screeningPairs.length > 0;

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

  return (
    <>
      <tr className="hover:bg-gray-50 cursor-pointer" onClick={onOpen}>
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
        <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
          {created ? created.toLocaleString() : '—'}
        </td>
        <td className="px-3 py-2 text-gray-900 truncate max-w-[160px]" title={job.profileName}>
          {job.profileName}
        </td>
        <td className="px-3 py-2 text-gray-900 max-w-[280px]" title={job.jobUrl || job.companyName}>
          <div className="truncate">
            {job.jobUrl ? (
              <a href={job.jobUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                {job.companyName}
              </a>
            ) : (
              job.companyName
            )}
          </div>
          {job.matchSnippet && (
            <div className="text-[11px] text-gray-500 italic mt-0.5 line-clamp-2" title={job.matchSnippet}>
              {job.matchSnippet}
            </div>
          )}
        </td>
        <td className="px-3 py-2">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_BADGE[job.status]}`}>
            {inFlight && <Loader2 className="w-3 h-3 animate-spin" />}
            {STATUS_LABEL[job.status]}
          </span>
          {inFlight && (
            <div className="text-[11px] text-gray-500 mt-0.5">{STEP_LABEL[job.step]}…</div>
          )}
        </td>
        <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{elapsed}</td>
        <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap tabular-nums" title={
          (job.inputTokens != null || job.outputTokens != null || job.reasoningTokens != null)
            ? `input ${job.inputTokens ?? 0} · output ${job.outputTokens ?? 0} · reasoning ${job.reasoningTokens ?? 0}`
            : 'No usage recorded'
        }>
          {job.inputTokens != null || job.outputTokens != null
            ? `${(job.inputTokens ?? 0).toLocaleString()} / ${(job.outputTokens ?? 0).toLocaleString()}`
            : '—'}
        </td>
        <td className="px-3 py-2 text-xs">
          {job.pdfFilename ? (
            <span className="text-gray-700 font-mono break-all" title={job.pdfFilename}>
              {job.pdfFilename.split('/').pop()}
            </span>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </td>
        <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
          <div className="inline-flex gap-1 justify-end">
            <button
              type="button"
              onClick={download}
              disabled={downloading || job.status !== 'completed'}
              className={`p-1.5 rounded-md hover:bg-gray-100 text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed ${
                job.status === 'completed' ? '' : 'invisible'
              }`}
              title={job.hasPdf ? 'Download PDF' : 'PDF missing — try anyway'}
            >
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onOpen}
              className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600 relative"
              title="Open screening Q&A panel"
            >
              <MessageSquare className="w-4 h-4" />
              {hasAnswers && (
                <span className="absolute -top-1 -right-1 inline-flex items-center justify-center text-[9px] font-semibold text-white bg-primary rounded-full w-3.5 h-3.5">
                  {job.screeningPairs!.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={deleting || inFlight}
              className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600 disabled:opacity-50"
              title={inFlight ? 'Cannot delete while running' : 'Delete'}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </td>
      </tr>
    </>
  );
}

function ScreeningPairsBlock({ pairs }: { pairs: ScreeningPair[] }) {
  return (
    <ol className="space-y-3">
      {pairs.map((p, i) => (
        <li key={i} className="border border-gray-200 rounded-lg p-3 bg-white">
          <div className="flex items-start justify-between gap-2 mb-1">
            <p className="text-sm font-medium text-gray-900 whitespace-pre-wrap">
              <span className="text-gray-400 mr-2">{i + 1}.</span>
              {p.question}
            </p>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(p.answer).then(() => notify.success('Answer copied'))}
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-primary flex-shrink-0"
            >
              <Copy className="w-3 h-3" />
              Copy
            </button>
          </div>
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{p.answer}</p>
        </li>
      ))}
    </ol>
  );
}

function ScreeningPanel({
  job, onClose, onChanged,
}: {
  job: ResumeJob;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [text, setText] = useState('');
  const [asking, setAsking] = useState(false);
  const [jdOpen, setJdOpen] = useState(false);
  const pairs = job.screeningPairs || [];

  async function ask() {
    const questions = parseNumberedQuestions(text);
    if (questions.length === 0) {
      notify.warn('Type at least one question. Number them (1. ... 2. ...) for multiple.');
      return;
    }
    setAsking(true);
    try {
      await api.askResumeJobScreening(job._id, questions);
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
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <aside className="fixed top-0 right-0 bottom-0 w-full sm:w-[480px] bg-white shadow-strong border-l border-gray-100 z-50 flex flex-col">
        <header className="px-4 py-3 border-b border-gray-100 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs text-gray-500">Screening Q&amp;A</div>
            <div className="font-semibold text-gray-900 truncate">{job.companyName}</div>
            <div className="text-xs text-gray-500 truncate">{job.profileName}</div>
          </div>
          <button type="button" onClick={onClose} className="btn-icon" title="Close"><X className="w-4 h-4" /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <section>
            <button
              type="button"
              onClick={() => setJdOpen((v) => !v)}
              className="text-xs text-gray-500 hover:text-primary inline-flex items-center gap-1"
            >
              {jdOpen ? '▾' : '▸'} Job description
            </button>
            {jdOpen && (
              <pre className="mt-2 text-xs text-gray-700 bg-gray-50 border border-gray-100 rounded-[8px] p-3 whitespace-pre-wrap max-h-72 overflow-y-auto">
                {job.jobDescription || '(no JD stored)'}
              </pre>
            )}
          </section>

          {job.coverLetterText && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="card-title">Cover letter</h3>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(job.coverLetterText || '').then(() => notify.success('Cover letter copied'))}
                  className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-primary"
                >
                  <Copy className="w-3 h-3" /> Copy
                </button>
              </div>
              <pre className="text-sm text-gray-800 bg-gray-50 border border-gray-100 rounded-[8px] p-3 whitespace-pre-wrap max-h-[400px] overflow-y-auto leading-relaxed">
                {job.coverLetterText}
              </pre>
            </section>
          )}

          <section>
            <h3 className="card-title mb-2">Answers ({pairs.length})</h3>
            {pairs.length > 0 ? (
              <ScreeningPairsBlock pairs={pairs} />
            ) : (
              <p className="text-xs text-gray-400 italic">No questions asked yet. Add one below.</p>
            )}
          </section>
        </div>

        <footer className="p-4 border-t border-gray-100 space-y-2">
          <label className="block text-xs text-gray-500">Ask screening questions — number them (<code>1.</code>, <code>2.</code>) for multiple. Unnumbered = one question.</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder={'e.g.\n1. Why are you a fit for this role?\n2. Tell me about a recent challenging project.\n3. Where do you see yourself in 5 years?'}
            className="input w-full text-sm"
          />
          <div className="flex justify-end">
            <button type="button" className="btn" onClick={ask} disabled={asking || !text.trim()}>
              {asking ? <><Loader2 className="w-4 h-4 animate-spin" /> Asking...</> : 'Ask'}
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
  });
  if (!fsa) return null;
  return (
    <span className="text-[11px] text-gray-500 flex items-center gap-1">
      {dirName ? (
        <>
          Saving to <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">{dirName}/</code>
          <button
            type="button"
            onClick={async () => {
              const m = await import('../lib/downloadDir');
              m.resetDownloadDir();
              setDirName(null);
            }}
            className="text-gray-400 hover:text-primary underline"
          >
            change
          </button>
        </>
      ) : (
        <span className="text-gray-400">First download will ask for a folder</span>
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
