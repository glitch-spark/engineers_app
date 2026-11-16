// The single Bidders page body (spec 2026-11-14-bidders-single-page-design.md): the period control (pay week by
// default, month, custom), the one-line totals strip, the comparison card (collapsible) and one table — replacing
// the Pay week and Performance tabs.
import { useState, type ReactNode } from 'react';
import useSWR from 'swr';
import * as api from '../../api/endpoints';
import type { BidPerformanceRow } from '../../api/endpoints';
import { useAuth } from '../../auth/useAuth';
import { PeriodNav, Segmented, filtersError, isoDay } from '../statistics/controls';
import { cardOpen, stripItems, type PagePeriod, type RowFilter, type StripItem } from '../../lib/bidderPage';
import BiddersBand from './BiddersBand';
import BiddersTable from './BiddersTable';
import { neighbourWeekKeys } from './weekDates';

type Filters = PagePeriod;

const PERIOD_OPTIONS = [
  { value: 'week', label: 'Pay week' },
  { value: 'month', label: 'Month' },
  { value: 'custom', label: 'Custom' },
] as { value: api.StatsPeriod; label: string }[];

const CARD_KEY = 'bidders.card.open';

const TONE: Record<NonNullable<StripItem['tone']> | 'none', string> = {
  good: 'text-emerald-700 dark:text-emerald-300',
  warn: 'text-amber-700 dark:text-amber-300',
  bad: 'text-red-700 dark:text-red-300',
  none: 'text-muted',
};

type Props = {
  ownerId: string;
  includeArchived: boolean;
  /** Open a bidder at a day of `week` (a report day inside the pay week or period end). */
  onOpenBidder: (id: string, week: string, day?: string) => void;
  /** The review overlay over a pay week's pending bids (one bidder's, or everyone's). */
  onReview: (week: string, bidderId?: string) => void;
  renderStatus: (row: BidPerformanceRow) => ReactNode;
  renderActions: (row: BidPerformanceRow) => ReactNode;
  empty: ReactNode;
  /** The period, kept in the URL by the page (so returning from a bidder keeps it). An empty pay-week day means the
   *  pay week holding now (the server decides, past the weekly cutoff too). */
  filters: Filters;
  onFilters: (f: Filters) => void;
  /** Open an owner's self bids for a day, or for the shown pay week. */
  onOpenSelf: (ownerId: string, ownerName: string, scope: { day?: string; week?: string }) => void;
};

export default function BiddersOverview({
  ownerId, includeArchived, onOpenBidder, onReview, renderStatus, renderActions, empty, filters: f, onFilters: setFilters,
  onOpenSelf,
}: Props) {
  const [show, setShow] = useState<RowFilter>('all');
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
  const rangeError = f.period === 'custom' ? filtersError({ ...f, region: 'all' }) : null;
  const params = f.period === 'custom' ? { period: f.period, date: f.from, to: f.to } : { period: f.period, date: f.day || undefined };
  const perf = useSWR(
    rangeError ? null : (['bid-performance', params.period, params.date ?? '', params.to ?? '', includeArchived, ownerId] as const),
    () => api.getBidPerformance({ ...params, includeArchived, ownerId: ownerId || undefined }),
  );
  // The card: this owner's bidders vs the platform over the same period (its own request: the table never waits).
  const insights = useSWR(
    rangeError || (isAdmin && !ownerId) ? null : (['bid-insights', params.period, params.date ?? '', params.to ?? '', ownerId] as const),
    () => api.getBidInsights({ ...params, ownerId: ownerId || undefined }),
    { revalidateOnFocus: false },
  );
  const data = perf.data;
  const today = isoDay(new Date());
  // A day inside the shown period: the pay week's first report day (week mode), else the period's end.
  const anchor = data ? (data.payWeek?.days[0]?.day ?? data.end) : '';
  const items = data ? stripItems(data.totals) : [];
  // A pay week has 7 or 8 report days: step from its own first / last day, not a fixed 7 days.
  const near = f.period === 'week' && data?.payWeek ? neighbourWeekKeys(data.payWeek.days) : null;

  return (
    <section className="space-y-4" aria-label="Bidders">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="Period" options={PERIOD_OPTIONS} value={f.period}
          onChange={(period) => setFilters({ ...f, period: period as Filters['period'], day: period === 'week' ? '' : f.day || today })} />
        <Segmented label="Show" options={[
          { value: 'all', label: 'All' }, { value: 'bidders', label: 'Bidders' }, { value: 'self', label: 'Self' },
        ] as { value: RowFilter; label: string }[]} value={show} onChange={setShow} />
        {f.period === 'custom' ? (
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" className="input !w-auto !py-1.5" aria-label="From" value={f.from} max={today}
              onChange={(e) => setFilters({ ...f, from: e.target.value })} />
            <span className="text-muted" aria-hidden>–</span>
            <input type="date" className="input !w-auto !py-1.5" aria-label="To" value={f.to} max={today}
              onChange={(e) => setFilters({ ...f, to: e.target.value })} />
            {rangeError && <span className="text-xs text-red-700 dark:text-red-400" role="alert">{rangeError}</span>}
          </div>
        ) : (
          <PeriodNav period={f.period} day={f.day || anchor || today} label={data?.label}
            prevDay={near?.prev} nextDay={near?.next}
            onDay={(day) => setFilters({ ...f, day })} />
        )}
      </div>

      {rangeError ? null : perf.error ? (
        <div className="panel p-4 text-sm text-red-600 dark:text-red-400" role="alert">
          Couldn&apos;t load bidders.{' '}
          <button type="button" className="underline" onClick={() => void perf.mutate()}>Retry</button>
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

          <BiddersTable
            data={data}
            platformPer100={insights.data?.platform?.per100}
            showOwner={isAdmin}
            onOpenBidder={(id, day) => onOpenBidder(id, day ?? anchor, day)}
            onReview={(id) => onReview(anchor, id)}
            renderStatus={renderStatus}
            renderActions={renderActions}
            show={show}
            onOpenSelf={(id, name, day) => onOpenSelf(id, name, day ? { day } : { week: anchor })}
          />
        </>
      )}
    </section>
  );
}
