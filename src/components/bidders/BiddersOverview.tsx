// The single Bidders page body (spec 2026-11-14-bidders-single-page-design.md): the one-line totals strip, the
// comparison card (collapsible) and one table — replacing the Pay week and Performance tabs. The period and the search
// are the page's filter bar; the performance request is the page's too (its label is the bar's), so this gets the
// result.
import { useState, type ReactNode } from 'react';
import useSWR from 'swr';
import * as api from '../../api/endpoints';
import type { BidPerformance, BidPerformanceRow } from '../../api/endpoints';
import { useAuth } from '../../auth/useAuth';
import { matchesBidderSearch, type BidderPeriodRequest, type BidderRowFilter } from '../../lib/bidderFilters';
import { cardOpen, stripItems, type StripItem } from '../../lib/bidderPage';
import BiddersBand from './BiddersBand';
import BiddersTable from './BiddersTable';

const CARD_KEY = 'bidders.card.open';

const TONE: Record<NonNullable<StripItem['tone']> | 'none', string> = {
  good: 'text-emerald-700 dark:text-emerald-300',
  warn: 'text-amber-700 dark:text-amber-300',
  bad: 'text-red-700 dark:text-red-300',
  none: 'text-muted',
};

/** What the Self panel opens: a day or the shown pay week, optionally one profile's applies only. */
export type SelfOpenScope = { day?: string; week?: string; accountId?: string; profileName?: string };

type Props = {
  ownerId: string;
  /** Open a bidder at a day of `week` (a report day inside the pay week or period end). */
  onOpenBidder: (id: string, week: string, day?: string) => void;
  /** The review overlay over a pay week's pending bids (one bidder's, or everyone's). */
  onReview: (week: string, bidderId?: string) => void;
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
  /** The bar's Show filter: every row, the bidders only, or the owners' self-bid rows only. */
  show: BidderRowFilter;
  /** Open an owner's self bids for a day, or for the shown pay week. */
  onOpenSelf: (ownerId: string, ownerName: string, scope: SelfOpenScope) => void;
};

export default function BiddersOverview({
  ownerId, onOpenBidder, onReview, renderStatus, renderActions, empty, request, data, error, onRetry, search, onClearSearch,
  show, onOpenSelf,
}: Props) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [open, setOpen] = useState(() => {
    try {
      return cardOpen(localStorage.getItem(CARD_KEY));
    } catch {
      return true;
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
  // The card: this owner's bidders vs the platform over the same period (its own request: the table never waits).
  const insights = useSWR(
    !request || (isAdmin && !ownerId)
      ? null
      : (['bid-insights', request.period, request.date ?? '', request.to ?? '', request.weeks ?? 1, ownerId] as const),
    () => api.getBidInsights({ ...request!, ownerId: ownerId || undefined }),
    { revalidateOnFocus: false },
  );
  // A day inside the shown period: the pay week's first report day (week mode), else the period's end.
  const anchor = data ? (data.payWeek?.days[0]?.day ?? data.end) : '';
  const items = data ? stripItems(data.totals) : [];
  const shown = data ? data.bidders.filter((b) => matchesBidderSearch(b, search)) : [];
  // The search narrows bidders only; it's a miss when no bidder matches and no self row is left to show either.
  const searchMiss = !!data && !!search.trim() && shown.length === 0 && show !== 'self'
    && (show === 'bidders' || !(data.selfRows ?? []).length);

  return (
    <section className="space-y-4" aria-label="Bidders">
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
      ) : data.bidders.length === 0 && !(data.selfRows ?? []).length ? (
        empty
      ) : (
        <>
          <div className="panel flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-sm" role="status">
            {items.map((i, n) => (
              <span key={i.key} className="inline-flex items-center gap-2">
                {n > 0 && <span className="text-zinc-300 dark:text-zinc-700" aria-hidden>│</span>}
                <span className={`font-medium tabular-nums ${TONE[i.tone ?? 'none']}`}>{i.text}</span>
                {i.key === 'review' && data.payWeek && (data.totals.toReview ?? 0) > 0 && (
                  <button type="button" className="btn-outline btn-sm" onClick={() => onReview(anchor)}>Review all</button>
                )}
              </span>
            ))}
          </div>

          {insights.data?.mine && insights.data.platform && (
            <BiddersBand
              insights={insights.data}
              whose={isAdmin && ownerId && ownerId !== user?.id ? 'These' : 'Your'}
              total={data.bidders.filter((b) => b.status === 'active').length}
              onOpenBidder={(id) => onOpenBidder(id, anchor)}
              open={open}
              onToggle={toggleCard}
            />
          )}

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
            <BiddersTable
              data={{ ...data, bidders: shown }}
              platformPer100={insights.data?.platform?.per100}
              showOwner={isAdmin}
              onOpenBidder={(id, day) => onOpenBidder(id, day ?? anchor, day)}
              onReview={(id) => onReview(anchor, id)}
              renderStatus={renderStatus}
              renderActions={renderActions}
              show={show}
              onOpenSelf={(id, name, day, profile) => onOpenSelf(id, name, {
                ...(day ? { day } : { week: anchor }),
                ...(profile ? { accountId: profile.accountId, profileName: profile.name } : {}),
              })}
            />
          )}
        </>
      )}
    </section>
  );
}
