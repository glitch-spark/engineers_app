import useSWR from 'swr';
import * as api from '../../api/endpoints';
import { INTERVIEW_STATUSES } from '../../lib/stageBadge';

/** SWR key prefix of the totals; whatever refreshes the list or calendar after an edit refreshes this too. */
export const SUMMARY_KEY = 'interview-summary';
export const isSummaryKey = (key: unknown): boolean => Array.isArray(key) && key[0] === SUMMARY_KEY;

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
  if (!data) return <div className="skeleton h-8 w-full" aria-busy="true" data-testid="interview-totals-loading" />;
  const n = (v: number | undefined) => (v ?? 0).toLocaleString('en-US');
  const chip = 'focus-ring badge';
  return (
    <div role="group" aria-label="Round totals" className="flex min-h-8 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <button type="button" className={`${chip} border-transparent text-body hover:bg-zinc-100 dark:hover:bg-zinc-800`} onClick={() => onStatus('')}>
        Total <span className="font-semibold tabular-nums text-strong">{n(data.total)}</span> {data.total === 1 ? 'round' : 'rounds'}
      </button>
      {INTERVIEW_STATUSES.map((s) => {
        const active = status === s.value;
        return (
          <button
            key={s.value}
            type="button"
            aria-pressed={active}
            onClick={() => onStatus(active ? '' : s.value)}
            className={`${chip} ${active
              ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
              : 'border-zinc-200 bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'}`}
          >
            {s.label} <span className="font-semibold tabular-nums">{n(data.byStatus?.[s.value])}</span>
          </button>
        );
      })}
      <span className="text-xs text-muted">counts rounds, not companies</span>
    </div>
  );
}
