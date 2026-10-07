import { useState } from 'react';
import useSWR from 'swr';
import { Check, ExternalLink, Loader2, RotateCcw, Undo2 } from 'lucide-react';
import * as api from '../../api/endpoints';
import type { JobApplyScreenBucket } from '../../api/endpoints';
import { notify } from '../../lib/notify';
import JobInfoPanel from './JobInfoPanel';
import Pagination from './Pagination';
import { useApproveJob } from './useApproveJob';
import { APPROVABLE_BUCKETS, BUCKET_LABEL, formatDate, locationLabel } from './format';
import { safeHref } from '../../lib/safeHref';

const PAGE_SIZE = 25;

function reason(row: api.JobApplyRow): string {
  if (row.status === 'fetch_failed' || row.status === 'llm_failed') return row.statusReason ?? '';
  if (row.screen === 'not_job') return 'Not a single job posting (error page, job list or careers page)';
  const failing = (row.gates ?? []).filter((g) => g.result === 'fail').map((g) => g.reason || g.name);
  const unknown = (row.gates ?? []).filter((g) => g.result === 'unknown').map((g) => g.reason || g.name);
  if (row.forceInclude) return failing.length ? `Approved despite: ${failing.join(' · ')}` : 'Approved';
  if (failing.length) return failing.join(' · ');
  if (row.groupKey === 'none') unknown.push('location not stated');
  if (row.jdStructured === false) unknown.push('read from page text, not job-site data');
  return unknown.join(' · ');
}

/** The jobs in one screening bucket, with why they're there; Approve / Retry where that helps. */
export default function BucketJobs({
  runId,
  bucket,
  readOnly,
  onChanged,
  onRetried,
}: {
  runId: string;
  bucket: JobApplyScreenBucket;
  readOnly?: boolean;
  onChanged: () => void;
  /** The run went back to checking jobs: refresh it so the page shows progress again. */
  onRetried?: () => void;
}) {
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [infoRow, setInfoRow] = useState<string | null>(null);
  const { data, isLoading } = useSWR(['job-apply-bucket', runId, bucket, page], () =>
    api.listJobApplyRows(runId, { screen: bucket, page, limit: PAGE_SIZE }),
  );
  const rows = data?.rows ?? [];
  const { setApproved, busyId: approvingId } = useApproveJob(runId, onChanged);
  // A person can approve the jobs in these buckets into Worth applying, and undo an approval there.
  const canApprove = !readOnly && APPROVABLE_BUCKETS.includes(bucket);
  const anyBusy = busy !== null || approvingId !== null;

  const retry = async () => {
    setBusy('retry');
    try {
      const res = await api.retryJobApplyRun(runId);
      notify.info(`Checking ${res.reset} job${res.reset === 1 ? '' : 's'} again`);
      onChanged();
      onRetried?.();
    } catch (err) {
      notify.error(err, 'Could not retry');
    } finally {
      setBusy(null);
    }
  };

  return (
    // The job's details open beside the list, on the right (above it on narrow screens).
    <div className="flex flex-col-reverse gap-4 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1 rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
          <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {BUCKET_LABEL[bucket]} · {data?.pagination.total ?? '…'}
          </h4>
          {!readOnly && (bucket === 'not_fetched' || bucket === 'read_failed') && (data?.pagination.total ?? 0) > 0 && (
            <button type="button" className="btn-outline btn-sm" onClick={retry} disabled={busy !== null}>
              {busy === 'retry' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RotateCcw className="h-4 w-4" aria-hidden />}
              Retry jobs that failed
            </button>
          )}
        </div>
        {isLoading ? (
          <p role="status" className="flex items-center gap-2 p-4 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading jobs…
          </p>
        ) : rows.length === 0 ? (
          <p className="hint p-4">No jobs here.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {rows.map((row) => {
              const isOpen = infoRow === row._id;
              const undoable = !readOnly && bucket === 'valid' && row.forceInclude;
              return (
                // The whole row is one button that opens the job's info. It is stretched over the row from its
                // ::after, so the link and the action below (z-10) stay separate controls rather than nested ones.
                <li
                  key={row._id}
                  className={`relative flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-sm ${
                    isOpen ? 'bg-sky-50/70 dark:bg-sky-950/30' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setInfoRow(row._id)}
                    aria-current={isOpen ? 'true' : undefined}
                    className="min-w-0 flex-1 cursor-pointer text-left outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-sky-600 dark:focus-visible:after:ring-sky-400"
                  >
                    <span className="block truncate font-medium text-zinc-900 dark:text-zinc-50">
                      {row.title || row.url}
                      {row.company && <span className="font-normal text-zinc-500"> · {row.company}</span>}
                      {row.humanEdited && <span className="badge-info ml-2 align-middle">Edited</span>}
                      {row.forceInclude && bucket === 'valid' && <span className="badge-success ml-2 align-middle">Approved</span>}
                    </span>
                    <span className="hint block">
                      {[reason(row), row.groupKey ? locationLabel(row.groupKey) : '', row.postedDate ? `posted ${formatDate(row.postedDate)}` : '']
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </button>
                  {safeHref(row.url) && (
                    <a
                      href={safeHref(row.url)}
                      target="_blank"
                      rel="noreferrer"
                      className="relative z-10 inline-flex items-center gap-1 text-sky-700 hover:underline dark:text-sky-400"
                    >
                      Open <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  )}
                  {(canApprove || undoable) && (
                    <button
                      type="button"
                      className="btn-outline btn-sm relative z-10"
                      title={undoable ? 'Take it out of Worth applying again' : 'Checked it: move it to Worth applying'}
                      onClick={() => void setApproved(row._id, !undoable)}
                      disabled={anyBusy}
                    >
                      {approvingId === row._id ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : undoable ? (
                        <Undo2 className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <Check className="h-3.5 w-3.5" aria-hidden />
                      )}
                      {undoable ? 'Undo approval' : 'Approve'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {(data?.pagination.totalPages ?? 1) > 1 && (
          <div className="border-t border-zinc-200 px-4 py-2 dark:border-zinc-800">
            <Pagination info={data?.pagination} onPage={setPage} label={`${BUCKET_LABEL[bucket]} pages`} />
          </div>
        )}
      </div>
      {infoRow && (
        <JobInfoPanel
          rowId={infoRow}
          runId={runId}
          onClose={() => setInfoRow(null)}
          canEdit
          canApprove={!readOnly}
          onChanged={onChanged}
        />
      )}
    </div>
  );
}
