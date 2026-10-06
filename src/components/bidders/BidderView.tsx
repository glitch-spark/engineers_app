import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { ArrowLeft } from 'lucide-react';
import * as api from '../../api/endpoints';
import { notify } from '../../lib/notify';
import { countryFlag } from '../../lib/countries';
import { usd } from '../../lib/money';
import ConfirmDialog from '../ConfirmDialog';
import Tabs from '../Tabs';
import BidPanel from '../bids/BidPanel';
import RejectDialog from '../bids/RejectDialog';
import { byFirstAt, reasonLabel } from '../bids/util';
import BidderActions from './BidderActions';
import DayRow from './DayRow';
import HistoryTab from './HistoryTab';
import SummaryTiles, { type Tile } from './SummaryTiles';

/** POST /bids/review accepts 1..500 ids. */
const BULK_MAX = 500;

const STATUS_BADGE: Record<api.BidWeekRow['status'], string> = {
  active: 'badge-success',
  invited: 'badge-info',
  archived: 'badge-neutral',
};

type Patch = Partial<Record<'week' | 'bidder' | 'day' | 'tab' | 'mode' | 'bid', string | null>>;

/**
 * One bidder's pay week: header, tiles, and tabs This week (one row per day; a day expands to its bids, a bid opens
 * in a side panel) and History (past weekly reports).
 */
export default function BidderView({
  row,
  board,
  weekKey,
  bidder,
  day,
  bid,
  tab,
  isCurrent,
  onParam,
  onChanged,
}: {
  row: api.BidWeekRow;
  board: api.BidWeek;
  /** The ?week= value of the shown pay week. */
  weekKey: string;
  /** The full record when the viewer owns this bidder (for the ⋯ menu). */
  bidder?: api.Bidder;
  day: string | null;
  /** The bid open in the side panel (a bid of `day`). */
  bid: string | null;
  tab: string | null;
  isCurrent: boolean;
  onParam: (patch: Patch) => void;
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
      label: 'To review',
      value: w.toReview ?? '—',
      hint: w.source === 'folders' ? 'folder count, not reviewed' : w.toReview ? 'oldest first' : 'nothing pending',
      tone: w.toReview ? 'warning' : 'default',
      action: w.toReview ? { label: 'Review pending', onClick: () => onParam({ mode: 'focus', bid: null }) } : undefined,
    },
    { label: 'Rejected', value: w.rejected ?? '—', hint: topReason ? `mostly ${topReason}` : undefined, tone: w.rejected ? 'danger' : 'default' },
    ...(today ? [{ label: 'Today', value: today.approved ?? '—', hint: today.pending ? `${today.pending} pending` : 'approved so far' } as Tile] : []),
  ];

  const sorted = useMemo(() => [...(dayBids.data?.bids ?? [])].sort(byFirstAt), [dayBids.data]);
  const activeTab = tab === 'history' ? 'history' : 'week';

  return (
    <div className="space-y-5">
      <section className="panel flex flex-wrap items-start gap-x-6 gap-y-3 p-4">
        <button
          type="button"
          className="btn-outline btn-sm"
          onClick={() => onParam({ bidder: null, day: null, tab: null })}
        >
          <ArrowLeft size={14} aria-hidden /> Team
        </button>
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-strong">
            {row.country && <span aria-hidden>{countryFlag(row.country)}</span>}
            {row.name}
            <span className={STATUS_BADGE[row.status]}>{row.status}</span>
          </h2>
          <p className="text-sm text-muted">
            {row.profileName ? (
              <>Profile <span className="text-body">{row.profileName}</span>{resumeNames.length > 0 && <> · {resumeNames.join(', ')}</>}</>
            ) : 'No profile assigned'}
            {' · '}{usd(row.rate)} per approved bid
          </p>
        </div>
        {bidder && <BidderActions bidder={bidder} onChanged={onChanged} />}
      </section>

      <SummaryTiles tiles={tiles} />

      <Tabs
        tabs={[{ key: 'week', label: 'This week' }, { key: 'history', label: 'History' }]}
        value={activeTab}
        onChange={(k) => onParam({ tab: k === 'history' ? 'history' : null, day: null })}
        ariaLabel={`${row.name} views`}
      >
        {activeTab === 'history' ? (
          <HistoryTab bidderId={row.id} onOpenWeek={(wk) => onParam({ week: wk, tab: null, day: null })} />
        ) : (
          <ul className="panel divide-y divide-zinc-100 overflow-hidden p-0 dark:divide-zinc-800">
            {board.week.days.map((d, i) => (
              <DayRow
                key={d.day}
                day={d}
                counts={row.days[i]}
                timezone={board.week.timezone}
                bids={shownDay === d.day ? (dayBids.data ? sorted : undefined) : undefined}
                error={shownDay === d.day ? dayBids.error : undefined}
                expanded={shownDay === d.day}
                busyId={busyId}
                onToggle={() => onParam({ day: shownDay === d.day ? null : d.day, bid: null })}
                onOpenBid={(id) => onParam({ bid: id, day: d.day })}
                onDecide={decide}
                onApproveAllComplete={setApproveAll}
              />
            ))}
          </ul>
        )}
      </Tabs>

      <BidPanel
        bids={sorted}
        bidId={shownDay ? bid : null}
        busy={!!busyId}
        onClose={() => onParam({ bid: null })}
        onSelect={(id) => onParam({ bid: id })}
        onDecide={decide}
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
