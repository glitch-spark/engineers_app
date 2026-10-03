import { useState } from 'react';
import useSWR from 'swr';
import { ExternalLink, Loader2, RotateCcw } from 'lucide-react';
import * as api from '../../api/endpoints';
import type { JobApplyScreenBucket } from '../../api/endpoints';
import { notify } from '../../lib/notify';
import Pagination from './Pagination';
import { BUCKET_LABEL, FORCEABLE_BUCKETS, formatDate, locationLabel } from './format';

const PAGE_SIZE = 25;

function reason(row: api.JobApplyRow): string {
  if (row.status === 'fetch_failed' || row.status === 'llm_failed') return row.statusReason ?? '';
  if (row.screen === 'not_job') return 'Not a single job posting (error page, job list or careers page)';
  const failing = (row.gates ?? []).filter((g) => g.result === 'fail').map((g) => g.reason || g.name);
  const unknown = (row.gates ?? []).filter((g) => g.result === 'unknown').map((g) => g.reason || g.name);
  if (row.forceInclude) return 'Included anyway';
  if (failing.length) return failing.join(' · ');
  if (row.groupKey === 'none') unknown.push('location not stated');
  return unknown.join(' · ');
}

/** The jobs in one screening bucket, with why they're there; Include anyway / Retry where that helps. */
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
  const { data, isLoading, mutate } = useSWR(['job-apply-bucket', runId, bucket, page], () =>
    api.listJobApplyRows(runId, { screen: bucket, page, limit: PAGE_SIZE }),
  );
  const rows = data?.rows ?? [];
  const canInclude = !readOnly && FORCEABLE_BUCKETS.includes(bucket);
  const includedView = bucket === 'check';

  const include = async (row: api.JobApplyRow, on: boolean) => {
    setBusy(row._id);
    try {
      await api.setJobApplyRowInclude(row._id, on);
      await mutate();
      onChanged();
    } catch (err) {
      notify.error(err, 'Could not update the job');
    } finally {
      setBusy(null);
    }
  };

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
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800">
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
          {rows.map((row) => (
            <li key={row._id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-zinc-900 dark:text-zinc-50">
                  {row.title || row.url}
                  {row.company && <span className="font-normal text-zinc-500"> · {row.company}</span>}
                </p>
                <p className="hint">
                  {[reason(row), row.groupKey ? locationLabel(row.groupKey) : '', row.postedDate ? `posted ${formatDate(row.postedDate)}` : '']
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              {row.url && (
                <a href={row.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-700 hover:underline dark:text-sky-400">
                  Open <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
              )}
              {canInclude && (
                <button type="button" className="btn-outline btn-sm" onClick={() => include(row, true)} disabled={busy !== null}>
                  {busy === row._id && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                  Include anyway
                </button>
              )}
              {includedView && row.forceInclude && !readOnly && (
                <button type="button" className="btn-outline btn-sm" onClick={() => include(row, false)} disabled={busy !== null}>
                  Undo include
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {(data?.pagination.totalPages ?? 1) > 1 && (
        <div className="border-t border-zinc-200 px-4 py-2 dark:border-zinc-800">
          <Pagination info={data?.pagination} onPage={setPage} label={`${BUCKET_LABEL[bucket]} pages`} />
        </div>
      )}
    </div>
  );
}
