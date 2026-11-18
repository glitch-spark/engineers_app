import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import * as api from '../../api/endpoints';
import { notify } from '../../lib/notify';
import { countryFlag } from '../../lib/countries';
import { rateText, statusWords } from '../../lib/bidsWords';
import type { BidderPeriodRequest, ShownWeeks } from '../../lib/bidderFilters';
import { usd } from '../../lib/money';
import ConfirmDialog from '../ConfirmDialog';
import Tabs from '../Tabs';
import RejectDialog from '../bids/RejectDialog';
import { byFirstAt, reasonLabel } from '../bids/util';
import BidderActions from './BidderActions';
import BidderPerformanceLine from './BidderPerformanceLine';
import DayPanel from './DayPanel';
import DayRow from './DayRow';
import HistoryTab from './HistoryTab';
import SummaryTiles, { type Tile } from './SummaryTiles';
import { reviewPatch } from '../../lib/bidsUrl';
import { dayParts } from './weekDates';
import WeekNav from './WeekNav';

/** POST /bids/review accepts 1..500 ids. */
const BULK_MAX = 500;

const STATUS_BADGE: Record<api.BidWeekRow['status'], string> = {
  active: 'badge-success',
  invited: 'badge-info',
  archived: 'badge-neutral',
};

type Patch = Partial<Record<'week' | 'bidder' | 'day' | 'tab' | 'mode' | 'bid' | 'review' | 'at' | 'reviewBidder', string | null>>;

/**
 * One bidder's page: a header (← Bidders; name and status; profile, resumes and rate; the actions; the pay-week nav and
 * the help) and tabs Days (the tiles and one row per day of the pay week; a day opens its bids in a side panel, a bid
 * opens the review overlay) and Past weeks (past weekly reports; the URL keeps the old `tab=history`).
 */
export default function BidderView({
  row,
  board,
  weekKey,
  bidder,
  day,
  reviewing,
  tab,
  isCurrent,
  perfRequest,
  week,
  onBack,
  onParam,
  onReview,
  onChanged,
}: {
  row: api.BidWeekRow;
  board: api.BidWeek;
  /** The ?week= value of the shown pay week. */
  weekKey: string;
  /** The full record when the viewer owns this bidder (for the ⋯ menu). */
  bidder?: api.Bidder;
  day: string | null;
  /** The review overlay is open (the day panel steps aside for it). */
  reviewing: boolean;
  tab: string | null;
  isCurrent: boolean;
  /** The period of the performance line under the header: the list's month or range, else Last month. Null (the report
   *  clock is loading or failed): the page shows without the line. */
  perfRequest: BidderPeriodRequest | null;
  /** The header's pay-week nav. The page renders this view once the board has loaded, so `shown` is never null. */
  week: { shown: ShownWeeks; label: string; isCurrent: boolean; onChange: (week: string | null) => void };
  /** ← Bidders: back to the list (the page also drops the browsed `week`, so it doesn't leak into the list). */
  onBack: () => void;
  onParam: (patch: Patch) => void;
  /** Open the review overlay at a bid of the open day, walking `ids`. */
  onReview: (bidId: string, ids: string[]) => void;
  onChanged: () => void;
}) {
  const shownDay = board.week.days.find((d) => d.day === day && !d.isFuture)?.day ?? null;
  const dayBids = useSWR(shownDay ? (['bids-day', row.id, shownDay] as const) : null, () =>
    api.listBids({ day: shownDay!, bidderId: row.id }),
  );
  // The whole pay week, for the rejection reasons and the profile's resume names.
  const weekBids = useSWR(['bids-week', row.id, weekKey] as const, () => api.listBids({ week: weekKey, bidderId: row.id }));

  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<api.BidReviewItem | null>(null);
  const [approveAll, setApproveAll] = useState<api.BidReviewItem[] | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const refresh = async () => {
    onChanged();
    await Promise.all([dayBids.mutate(), weekBids.mutate()]);
  };

  const decide = async (bid: api.BidReviewItem, status: api.BidStatus, reason?: api.RejectReason, note?: string | null) => {
    if (status === 'rejected' && !reason) {
      setRejecting(bid);
      return;
    }
    if (busyId) return;
    setBusyId(bid.id);
    try {
      await api.reviewBid(bid.id, { status, note: note ?? null, ...(reason ? { reason } : {}) });
      notify.success(status === 'approved' ? 'Bid approved' : 'Bid rejected');
      setRejecting(null);
      await refresh();
    } catch (err) {
      notify.error(err, `Failed to ${status === 'approved' ? 'approve' : 'reject'} bid`);
    } finally {
      setBusyId(null);
    }
  };

  const bulk = async (ids: string[], status: api.BidStatus, reason?: api.RejectReason) => {
    setBulkBusy(true);
    let updated = 0;
    try {
      for (let i = 0; i < ids.length; i += BULK_MAX) {
        updated += (await api.reviewBids({ ids: ids.slice(i, i + BULK_MAX), status, ...(reason ? { reason } : {}) })).updated;
      }
      notify.success(`${status === 'approved' ? 'Approved' : 'Rejected'} ${updated} ${updated === 1 ? 'bid' : 'bids'}`);
    } catch (err) {
      notify.error(err, updated > 0 ? `Updated ${updated} bids, then failed` : 'Failed to update bids');
    } finally {
      setBulkBusy(false);
      await refresh();
    }
  };

  // The server checks completeness again (onlyComplete), so a bid that changed since the list loaded is skipped.
  const runApproveAll = async () => {
    const ids = (approveAll ?? []).map((b) => b.id);
    const total = { updated: 0, skipped: 0 };
    setBulkBusy(true);
    try {
      for (let i = 0; i < ids.length; i += BULK_MAX) {
        const res = await api.reviewBids({ ids: ids.slice(i, i + BULK_MAX), status: 'approved', onlyComplete: true });
        total.updated += res.updated;
        total.skipped += res.skipped;
      }
      notify.success(total.skipped > 0 ? `Approved ${total.updated} bids (${total.skipped} skipped)` : `Approved ${total.updated} bids`);
      setApproveAll(null);
    } catch (err) {
      notify.error(err, total.updated > 0 ? `Approved ${total.updated} bids, then failed` : 'Failed to approve bids');
    } finally {
      setBulkBusy(false);
      await refresh();
    }
  };

  const topReason = useMemo(() => {
    const tally = new Map<api.RejectReason, number>();
    for (const b of weekBids.data?.bids ?? []) {
      if (b.status === 'rejected' && b.rejectReason) tally.set(b.rejectReason, (tally.get(b.rejectReason) ?? 0) + 1);
    }
    const [best] = [...tally.entries()].sort((a, b) => b[1] - a[1]);
    return best ? reasonLabel(best[0]) : null;
  }, [weekBids.data]);
  const resumeNames = weekBids.data?.bids.find((b) => b.resumeNames.length)?.resumeNames ?? [];

  const w = row.week;
  const todayIdx = board.week.days.findIndex((d) => d.isToday);
  const today = isCurrent && todayIdx >= 0 ? row.days[todayIdx] : null;
  const tiles: Tile[] = [
    { label: 'Approved', value: w.approved ?? '—', hint: w.pay == null ? undefined : `${usd(w.pay)} pay`, tone: 'success' },
    {
      label: 'Pending',
      value: w.pending ?? '—',
      hint: w.source === 'folders' ? 'folder count, not reviewed' : w.toReview ? 'oldest first' : 'nothing pending',
      tone: w.toReview ? 'warning' : 'default',
      // This pay week's pending bids of this bidder: the URL's own `bidder` filters the review.
      action: w.toReview ? { label: 'Review', onClick: () => onParam(reviewPatch({ kind: 'week', at: weekKey })) } : undefined,
    },
    { label: 'Rejected', value: w.rejected ?? '—', hint: topReason ? `mostly ${topReason}` : undefined, tone: w.rejected ? 'danger' : 'default' },
    ...(today ? [{ label: 'Today', value: today.approved ?? '—', hint: today.pending ? `${today.pending} pending` : 'approved so far' } as Tile] : []),
  ];

  const sorted = useMemo(() => [...(dayBids.data?.bids ?? [])].sort(byFirstAt), [dayBids.data]);
  // `tab=history` (the old History tab's value, kept for links) is Past weeks; anything else is Days.
  const activeTab = tab === 'history' ? 'history' : 'days';
  const status = statusWords(row.status, bidder, Date.now());
  const panelDay = shownDay ? dayParts(shownDay) : null;
  const panelCounts = shownDay ? row.days[board.week.days.findIndex((d) => d.day === shownDay)] : null;

  return (
    <div className="space-y-5">
      <section className="panel space-y-4 p-4">
        <button type="button" className="btn-outline btn-sm" onClick={onBack}>
          <ArrowLeft size={14} aria-hidden /> Bidders
        </button>
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-strong">
              {row.country && <span aria-hidden>{countryFlag(row.country)}</span>}
              {row.name}
              <span className={`${STATUS_BADGE[row.status]}${status.expired ? ' text-red-600' : ''}`}>{status.text}</span>
            </h2>
            <p className="text-sm text-muted">
              {row.profileName ? (
                <>
                  Profile{' '}
                  {row.profileId
                    ? <Link to={`/accounts/${row.profileId}`} className="text-body underline">{row.profileName}</Link>
                    : <span className="text-body">{row.profileName}</span>}
                  {resumeNames.length > 0 && <> · {resumeNames.join(', ')}</>}
                </>
              ) : 'No profile assigned'}
              {' · '}{rateText(row.rate)}
            </p>
          </div>
          {bidder && <BidderActions bidder={bidder} onChanged={onChanged} layout="page" />}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <WeekNav shown={week.shown} label={week.label} isCurrent={week.isCurrent} onChange={week.onChange} />
        </div>
        {perfRequest && <BidderPerformanceLine bidderId={row.id} ownerId={row.ownerId} request={perfRequest} />}
      </section>

      <Tabs
        tabs={[{ key: 'days', label: 'Days' }, { key: 'history', label: 'Past weeks' }]}
        value={activeTab}
        onChange={(k) => onParam({ tab: k === 'history' ? 'history' : null, day: null })}
        ariaLabel={`${row.name} views`}
      >
        {activeTab === 'history' ? (
          <HistoryTab bidderId={row.id} onOpenWeek={(wk) => onParam({ week: wk, tab: null, day: null })} />
        ) : (
          <div className="space-y-5">
            <SummaryTiles tiles={tiles} />
            <ul className="panel divide-y divide-zinc-100 overflow-hidden p-0 dark:divide-zinc-800">
              {board.week.days.map((d, i) => (
                <DayRow
                  key={d.day}
                  day={d}
                  counts={row.days[i]}
                  timezone={board.week.timezone}
                  active={shownDay === d.day}
                  onOpen={() => onParam({ day: d.day })}
                />
              ))}
            </ul>
          </div>
        )}
      </Tabs>

      <DayPanel
        open={!!shownDay && !reviewing && activeTab === 'days'}
        title={panelDay ? `${panelDay.weekday} ${panelDay.date} · ${row.name}` : ''}
        subtitle={
          panelCounts?.source === 'folders'
            ? 'Folder count, not reviewed — only bids with records are listed'
            : dayBids.data ? `${sorted.length} ${sorted.length === 1 ? 'bid' : 'bids'}` : undefined
        }
        bids={dayBids.data ? sorted : undefined}
        error={dayBids.error}
        busy={!!busyId || bulkBusy}
        onClose={() => onParam({ day: null })}
        onReview={onReview}
        onDecide={(b, status) => void decide(b, status)}
        onBulk={bulk}
        onApproveAllComplete={setApproveAll}
      />

      <RejectDialog
        bid={rejecting}
        busy={!!busyId}
        onClose={() => setRejecting(null)}
        onSubmit={(reason, note) => rejecting && void decide(rejecting, 'rejected', reason, note)}
      />

      <ConfirmDialog
        open={!!approveAll}
        title="Approve all complete"
        body={`Approve ${approveAll?.length ?? 0} complete ${approveAll?.length === 1 ? 'bid' : 'bids'}? Complete means pending, with a Submit screenshot and every upload confirmed. Rejected and incomplete bids are not touched, and any notes on these bids are cleared.`}
        confirmLabel={`Approve ${approveAll?.length ?? 0}`}
        tone="default"
        busy={bulkBusy}
        onConfirm={runApproveAll}
        onCancel={() => setApproveAll(null)}
      />
    </div>
  );
}
