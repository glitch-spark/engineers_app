import useSWR from 'swr';
import * as api from '../../api/endpoints';
import { INTERVIEW_STATUSES } from '../../lib/stageBadge';

/** SWR key prefix of the totals; whatever refreshes the list or calendar after an edit refreshes this too. */
export const SUMMARY_KEY = 'interview-summary';
export const isSummaryKey = (key: unknown): boolean => Array.isArray(key) && key[0] === SUMMARY_KEY;

const DOT: Record<string, string> = {
  scheduled: 'bg-sky-500', completed: 'bg-amber-500', passed: 'bg-emerald-500', rejected: 'bg-red-500', canceled: 'bg-zinc-400',
};

/**
 * One row above the list / calendar: how many rounds match the filters, and how many per status. A status sets the
 * Status filter (again, or Total, clears it). `query` is the view's own request (see `summaryQuery`); null = nothing
 * to count. The Status filter never changes the numbers: the breakdown always covers every status.
 */
export default function InterviewTotals({
  query,
  status,
  onStatus,
}: {
  query: api.InterviewSummaryParams | null;
  status: string;
  onStatus: (status: string) => void;
}) {
  const { data, error } = useSWR(query ? [SUMMARY_KEY, JSON.stringify(query)] : null, () => api.getInterviewSummary(query!), {
    keepPreviousData: true,
    // The list below works without the totals: log the failure once instead of retrying in a loop.
    shouldRetryOnError: false,
    onError: (err) => console.error('Interview totals failed to load', err),
  });
  if (!query || error) return null;
  if (!data) return <div className="skeleton h-[4.25rem] w-full" aria-busy="true" data-testid="interview-totals-loading" />;
  const n = (v: number | undefined) => (v ?? 0).toLocaleString('en-US');
  const tile = 'focus-ring flex min-w-[5.5rem] flex-col items-start rounded-lg border px-3 py-1.5 text-left transition';
  const label = 'flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted';
  const big = 'text-lg font-semibold leading-tight tabular-nums';
  return (
    <div role="group" aria-label="Round totals" className="panel flex flex-wrap items-stretch gap-2 p-2">
      <button
        type="button" title="Show every status" onClick={() => onStatus('')}
        className={`${tile} border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800`}
      >
        <span className={label}>Total</span>{' '}
        <span className="text-xs text-muted"><span className={`${big} text-strong`}>{n(data.total)}</span> {data.total === 1 ? 'round' : 'rounds'}</span>
      </button>
      <span aria-hidden className="my-1 w-px bg-zinc-200 dark:bg-zinc-700" />
      {INTERVIEW_STATUSES.map((s) => {
        const active = status === s.value;
        const count = data.byStatus?.[s.value] ?? 0;
        return (
          <button
            key={s.value}
            type="button"
            aria-pressed={active}
            title={active ? 'Show every status' : `Show only ${s.label.toLowerCase()} rounds`}
            onClick={() => onStatus(active ? '' : s.value)}
            className={`${tile} ${active
              ? 'border-sky-500 bg-sky-50 ring-1 ring-sky-500 dark:bg-sky-950'
              : 'border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800'}`}
          >
            <span className={label}><span aria-hidden className={`h-2 w-2 rounded-full ${DOT[s.value] ?? 'bg-zinc-400'}`} />{s.label}</span>{' '}
            <span className="text-xs text-muted">
              <span className={`${big} ${count ? 'text-strong' : 'text-zinc-400 dark:text-zinc-600'}`}>{n(count)}</span>
              {data.total > 0 && count > 0 && ` ${Math.round((count / data.total) * 100) || '<1'}%`}
            </span>
          </button>
        );
      })}
      <span className="ml-auto self-center px-1 text-xs text-muted">counts rounds, not companies</span>
    </div>
  );
}
