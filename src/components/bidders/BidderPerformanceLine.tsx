// One bidder's performance over a period, in one line, with the platform's interviews per 100 bids beside it. The
// period is the list's month or Custom range when the user came from it, else Last month (`bidderPerfRequest`); the
// line's own label says which. The owner is the bidder's own (an admin may open another owner's bidder).
import useSWR from 'swr';
import * as api from '../../api/endpoints';
import type { BidderPeriodRequest } from '../../lib/bidderFilters';
import { rowPer100Verdict } from '../../lib/bidderInsights';
import { relativeTime } from '../../lib/bidsWords';

const DASH = '—';
const count = (n: number) => Math.round(n).toLocaleString('en-US');

export default function BidderPerformanceLine({
  bidderId, ownerId, request,
}: {
  bidderId: string;
  /** The bidder's own owner (the board row's `ownerId`), not the filter bar's. */
  ownerId: string;
  request: BidderPeriodRequest;
}) {
  const key = [request.period, request.date ?? '', request.to ?? '', request.weeks ?? 1, ownerId] as const;
  // The keys start with the families a review decision refreshes (isReviewedDataKey); `line` keeps them apart from the list's.
  const perf = useSWR(
    ['bid-performance', 'line', ...key] as const,
    () => api.getBidPerformance({ ...request, ownerId, includeArchived: true }),
  );
  const insights = useSWR(['bid-insights', 'line', ...key] as const, () => api.getBidInsights({ ...request, ownerId }));

  if (perf.error) {
    return (
      <p className="text-sm text-red-600 dark:text-red-400" role="alert">
        Couldn&apos;t load performance.{' '}
        <button type="button" className="underline" onClick={() => { void perf.mutate(); void insights.mutate(); }}>Retry</button>
      </p>
    );
  }
  // The platform only adds the arrow: wait for it, but if it fails the arrow is just left out.
  if (!perf.data || (!insights.data && !insights.error)) {
    return <div className="skeleton h-5 w-full max-w-3xl" role="status" aria-label="Loading performance" />;
  }
  const row = perf.data.bidders.find((b) => b.id === bidderId);
  if (!row) return null;

  const dir = rowPer100Verdict(row, insights.data?.platform?.per100);
  const interviews = row.interviews == null ? `${DASH} interviews` : `${count(row.interviews)} ${row.interviews === 1 ? 'interview' : 'interviews'}`;
  const per100 = row.per100 == null ? DASH : row.per100.toFixed(2);
  const days = row.weekdays > 0 ? `${count(row.hitDays)} of ${count(row.weekdays)}` : DASH;
  const approval = row.approvalRate == null ? DASH : `${Math.round(row.approvalRate * 100)}%`;
  const cost = row.costPerInterview == null ? DASH : `$${count(row.costPerInterview)}`;
  const last = row.lastBidAt ? relativeTime(row.lastBidAt, Date.now()) : DASH;
  const arrow = dir === 'up' ? ' ▲ vs the platform' : dir === 'down' ? ' ▼ vs the platform' : '';

  return (
    <p className="text-sm text-body tabular-nums">
      {`${perf.data.label}: 50+ on ${days} weekdays · ${interviews} (${per100} per 100${arrow}) · ${approval} approved · ${cost} per interview · last bid ${last}`}
    </p>
  );
}
