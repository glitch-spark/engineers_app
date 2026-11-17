// The Bidders tab body (spec 2026-11-16-bidders-page-redesign-design.md, "Bidders tab table"): the View switch
// (Week, the default, or Performance; `lens` in the URL) beside the click help, then that view's table. The Week view
// shows Pay only for whole pay weeks; the Performance view carries the comparison card, folded to one line. The period
// and the search are the page's filter bar; the performance request is the page's too (its label is the bar's), so this
// gets the result.
import { useState, type ReactNode } from 'react';
import useSWR from 'swr';
import * as api from '../../api/endpoints';
import type { BidPerformance, BidPerformanceRow } from '../../api/endpoints';
import { useAuth } from '../../auth/useAuth';
import { matchesBidderSearch, type BidderPeriodRequest } from '../../lib/bidderFilters';
import { cardOpen } from '../../lib/bidderPage';
import type { BidsLens } from '../../lib/bidsUrl';
import Segmented from '../Segmented';
import BiddersBand from './BiddersBand';
import BiddersPerformanceTable from './BiddersPerformanceTable';
import BiddersWeekTable from './BiddersWeekTable';
import BidsHelp from './BidsHelp';

const CARD_KEY = 'bidders.card.open';

const LENS_OPTIONS: { value: BidsLens; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'performance', label: 'Performance' },
];

export const PAY_POINTER = 'Pay is shown for whole pay weeks. Pick This pay week, Last pay week or Last 2 pay weeks to see it.';

type Props = {
  /** The table's view (`lens`) and its switch. */
  lens: BidsLens;
  onLensChange: (lens: BidsLens) => void;
  /** The range is whole pay weeks (isWholePayWeeks): only then does the Week view show Pay. */
  wholePayWeeks: boolean;
  /** The owner whose team this is ('' = every owner, or staff's own: the server decides). */
  ownerId: string;
  /** All owners (admin): the table gets an Owner column. */
  allOwners: boolean;
  /** Open a bidder at a day of `week` (a report day inside the pay week or period end). */
  onOpenBidder: (id: string, week: string, day?: string) => void;
  /** The review overlay over one bidder's pending bids of the shown period (the page's range review). */
  onReview: (bidderId: string) => void;
  renderStatus: (row: BidPerformanceRow) => ReactNode;
  renderActions: (row: BidPerformanceRow) => ReactNode;
  empty: ReactNode;
  /** The period the bar asks for (null while a Custom range is incomplete or invalid), and its performance result. */
  request: BidderPeriodRequest | null;
  data: BidPerformance | undefined;
  error: unknown;
  onRetry: () => void;
  /** The bar's search: narrows the table (not the totals) to bidders whose name or profile contains it. */
  search: string;
  onClearSearch: () => void;
};

export default function BiddersOverview({
  lens, onLensChange, wholePayWeeks, ownerId, allOwners, onOpenBidder, onReview, renderStatus, renderActions, empty, request, data, error, onRetry, search, onClearSearch,
}: Props) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [open, setOpen] = useState(() => {
    try {
      return cardOpen(localStorage.getItem(CARD_KEY));
    } catch {
      return false;
    }
  });
  const toggleCard = () => {
    setOpen((v) => {
      try {
        localStorage.setItem(CARD_KEY, v ? 'closed' : 'open');
      } catch {
        /* the card just won't remember */
      }
      return !v;
    });
  };
  // The card and the platform's per-100 (Performance view only): this owner's bidders vs the platform over the same
  // period (its own request: the table never waits).
  const insights = useSWR(
    lens !== 'performance' || !request || (isAdmin && !ownerId)
      ? null
      : (['bid-insights', request.period, request.date ?? '', request.to ?? '', request.weeks ?? 1, ownerId] as const),
    () => api.getBidInsights({ ...request!, ownerId: ownerId || undefined }),
    { revalidateOnFocus: false },
  );
  // A day inside the shown period: the pay week's first report day (week mode), else the period's end.
  const anchor = data ? (data.payWeek?.days[0]?.day ?? data.end) : '';
  const shown = data ? data.bidders.filter((b) => matchesBidderSearch(b, search)) : [];
  const searchMiss = !!data && !!search.trim() && shown.length === 0;

  return (
    <section className="space-y-4" aria-label="Bidders">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label="View" value={lens} options={LENS_OPTIONS} onChange={onLensChange} />
        <BidsHelp />
      </div>
      {!request ? (
        <div className="panel p-4 text-sm text-muted">Pick a valid date range to see bidders.</div>
      ) : error ? (
        <div className="panel p-4 text-sm text-red-600 dark:text-red-400" role="alert">
          Couldn&apos;t load bidders.{' '}
          <button type="button" className="underline" onClick={onRetry}>Retry</button>
        </div>
      ) : !data ? (
        <div className="space-y-3" aria-busy="true">
          <div className="skeleton h-10 w-full" />
          <div className="skeleton h-40 w-full" />
          <div className="skeleton h-64 w-full" />
        </div>
      ) : data.bidders.length === 0 ? (
        empty
      ) : (
        <>
          {lens === 'performance' && insights.data?.mine && insights.data.platform && (
            <BiddersBand
              insights={insights.data}
              whose={isAdmin && ownerId && ownerId !== user?.id ? 'These' : 'Your'}
              total={data.bidders.filter((b) => b.status === 'active').length}
              onOpenBidder={(id) => onOpenBidder(id, anchor)}
              open={open}
              onToggle={toggleCard}
            />
          )}

          {lens === 'week' && !wholePayWeeks && <p className="text-sm text-muted">{PAY_POINTER}</p>}

          {data.recordsStart && data.recordsStart.slice(0, 10) > data.start.slice(0, 10) && !data.payWeek && (
            <p className="text-xs text-muted">
              Bids before {data.recordsStart.slice(0, 10)} were counted from screenshot folders and aren&apos;t included.
            </p>
          )}

          {searchMiss ? (
            <div className="empty-state">
              <p className="font-medium text-strong">No bidders match &ldquo;{search.trim()}&rdquo;.</p>
              <button type="button" className="btn mt-4" onClick={onClearSearch}>Clear search</button>
            </div>
          ) : (
            lens === 'performance' ? (
              <BiddersPerformanceTable
                data={data}
                rows={shown}
                platformPer100={insights.data?.platform?.per100}
                showOwner={allOwners}
                onOpenBidder={(id) => onOpenBidder(id, anchor)}
                renderStatus={renderStatus}
                renderActions={renderActions}
              />
            ) : (
              <BiddersWeekTable
                data={data}
                rows={shown}
                showOwner={allOwners}
                showPay={wholePayWeeks}
                onOpenBidder={(id, day) => onOpenBidder(id, day ?? anchor, day)}
                onReview={onReview}
                renderStatus={renderStatus}
                renderActions={renderActions}
              />
            )
          )}
        </>
      )}
    </section>
  );
}
