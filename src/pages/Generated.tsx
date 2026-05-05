import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import {
  Loader2,
  RefreshCw,
  Download,
  Trash2,
  Copy,
  MessageSquare,
} from 'lucide-react';
import * as api from '../api/endpoints';
import type { ResumeJob, ResumeJobStatus, ResumeJobStep, ScreeningPair } from '../api/endpoints';
import { notify } from '../lib/notify';
import ResumeTabs from '../components/ResumeTabs';

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
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDownloading, setBulkDownloading] = useState(false);

  const { data, mutate, isLoading } = useSWR(
    ['resume-jobs-page', page, limit] as const,
    () => api.listResumeJobs({ page, limit }),
    { refreshInterval: 3000 },
  );

  const jobs = data?.jobs ?? [];
  const pagination = data?.pagination;
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
    const targets = jobs.filter((j) => selected.has(j._id));
    if (targets.length === 0) return;
    setBulkDownloading(true);
    let failed = 0;
    for (const job of targets) {
      try {
        await api.downloadResumeJob(job);
        // Small delay so the browser doesn't drop concurrent anchor clicks.
        await new Promise((r) => setTimeout(r, 250));
      } catch (err) {
        failed++;
        notify.error(err, `Download failed: ${job.companyName}`);
      }
    }
    setBulkDownloading(false);
    if (failed === 0) notify.success(`Downloaded ${targets.length} resume${targets.length === 1 ? '' : 's'}`);
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Generated resumes</h1>
          <p className="text-sm text-gray-500 mt-1">
            All resume builds — past and in-flight. Select rows to bulk download.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {polling && (
            <span className="inline-flex items-center gap-1 text-xs text-blue-600">
              <Loader2 className="w-3 h-3 animate-spin" />
              Live
            </span>
          )}
          <button
            type="button"
            onClick={() => mutate()}
            className="text-xs text-gray-500 hover:text-primary inline-flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
        </div>
      </header>
      <ResumeTabs />

      {/* Bulk actions bar */}
      <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 px-4 py-3 shadow-sm">
        <span className="text-sm text-gray-600">
          {someChecked ? `${selected.size} selected` : 'Select rows for bulk actions'}
        </span>
        <button
          type="button"
          onClick={downloadSelected}
          disabled={!someChecked || bulkDownloading}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-white text-sm font-medium shadow-sm hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {bulkDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Download {someChecked ? `(${selected.size})` : 'selected'}
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading && jobs.length === 0 ? (
          <p className="p-6 text-sm text-gray-500 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading...
          </p>
        ) : jobs.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">No builds yet. Generate one from the Resume Generator.</p>
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
                <th className="px-3 py-2 font-medium">File</th>
                <th className="px-3 py-2 font-medium w-32 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {jobs.map((job) => (
                <JobRow
                  key={job._id}
                  job={job}
                  expanded={expanded === job._id}
                  onToggleExpand={() => setExpanded((p) => (p === job._id ? null : job._id))}
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
    </div>
  );
}

function JobRow({
  job,
  expanded,
  onToggleExpand,
  onChanged,
  selected,
  selectable,
  onSelect,
}: {
  job: ResumeJob;
  expanded: boolean;
  onToggleExpand: () => void;
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
      <tr className="hover:bg-gray-50">
        <td className="px-3 py-2">
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
        <td className="px-3 py-2 text-gray-900 truncate max-w-[160px]" title={job.jobUrl || job.companyName}>
          {job.jobUrl ? (
            <a href={job.jobUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
              {job.companyName}
            </a>
          ) : (
            job.companyName
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
        <td className="px-3 py-2 text-xs">
          {job.pdfFilename ? (
            <span className="text-gray-700 font-mono break-all" title={job.pdfFilename}>
              {job.pdfFilename.split('/').pop()}
            </span>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </td>
        <td className="px-3 py-2 text-right">
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
              onClick={onToggleExpand}
              disabled={!hasAnswers}
              className={`p-1.5 rounded-md hover:bg-gray-100 text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed ${
                hasAnswers ? '' : 'invisible'
              } ${expanded ? 'bg-gray-100' : ''}`}
              title={hasAnswers ? (expanded ? 'Hide answers' : 'Show answers') : 'No answers'}
            >
              <MessageSquare className="w-4 h-4" />
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
      {expanded && hasAnswers && (
        <tr>
          <td colSpan={8} className="px-3 py-3 bg-gray-50">
            <ScreeningPairsBlock pairs={job.screeningPairs} />
          </td>
        </tr>
      )}
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
