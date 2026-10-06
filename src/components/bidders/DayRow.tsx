import { ChevronRight } from 'lucide-react';
import * as api from '../../api/endpoints';
import { messageOf } from '../../lib/notify';
import BidRow from '../bids/BidRow';
import { isComplete } from '../bids/util';
import { FOLDER_TIP } from './TeamWeekTable';
import { dayParts, timeInZone } from './weekDates';

function Chip({ label, n, tone }: { label: string; n: number | null; tone: 'success' | 'warning' | 'danger' }) {
  if (n == null) return null;
  const cls = n ? `badge-${tone}` : 'badge-neutral opacity-60';
  return <span className={`${cls} tabular-nums`}>{label} {n}</span>;
}

/**
 * One day of the bidder's pay week: date, window and Approved / Pending / Rejected chips. Expanded, it lists the
 * day's bids (`bids` undefined while loading) with "Approve all complete" for that day.
 */
export default function DayRow({
  day,
  counts,
  timezone,
  bids,
  error,
  expanded,
  busyId,
  onToggle,
  onOpenBid,
  onDecide,
  onApproveAllComplete,
}: {
  day: api.BidWeekDay;
  counts: api.BidderWeekDay;
  timezone: string;
  bids?: api.BidReviewItem[];
  error?: unknown;
  expanded: boolean;
  busyId: string | null;
  onToggle: () => void;
  onOpenBid: (bidId: string) => void;
  onDecide: (bid: api.BidReviewItem, status: api.BidStatus, reason?: api.RejectReason, note?: string | null) => void;
  onApproveAllComplete: (bids: api.BidReviewItem[]) => void;
}) {
  const p = dayParts(day.day);
  const folder = counts.source === 'folders';
  const complete = (bids ?? []).filter(isComplete);
  const anyPending = (bids ?? []).some((b) => b.status === 'pending');
  const panelId = `day-${day.day}`;

  return (
    <li className={`${day.isToday ? 'bg-sky-50/50 dark:bg-sky-950/20' : ''}`}>
      <button
        type="button"
        className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-left hover:bg-zinc-50 focus-ring disabled:cursor-default disabled:hover:bg-transparent dark:hover:bg-zinc-900/60"
        aria-expanded={expanded}
        aria-controls={panelId}
        disabled={day.isFuture}
        onClick={onToggle}
      >
        <ChevronRight
          size={16}
          aria-hidden
          className={`shrink-0 text-muted transition-transform ${expanded ? 'rotate-90' : ''} ${day.isFuture ? 'invisible' : ''}`}
        />
        <span className="w-28 shrink-0">
          <span className="font-medium text-strong">{p.weekday} {p.date}</span>
          {day.isToday && <span className="badge-info ml-2 py-0">Today</span>}
        </span>
        <span className="hidden w-48 shrink-0 text-xs text-muted sm:inline">
          {timeInZone(day.start, timezone, true)} → {timeInZone(day.end, timezone, true)}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          {day.isFuture ? (
            <span className="text-muted">–</span>
          ) : counts.error ? (
            <span className="text-xs text-amber-700 dark:text-amber-400" title={counts.error}>⚠ Couldn&apos;t read the folder</span>
          ) : folder ? (
            <span className="text-xs text-muted" title={FOLDER_TIP}>{counts.approved} in folder · not reviewed</span>
          ) : (
            <>
              {!!counts.pending && <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden />}
              <Chip label="Approved" n={counts.approved} tone="success" />
              <Chip label="Pending" n={counts.pending} tone="warning" />
              <Chip label="Rejected" n={counts.rejected} tone="danger" />
            </>
          )}
        </span>
      </button>

      {expanded && (
        <div id={panelId} className="border-t border-zinc-100 dark:border-zinc-800">
          {error ? (
            <p role="alert" className="px-4 py-3 text-sm text-red-600">{messageOf(error, "Couldn't load bids")}</p>
          ) : !bids ? (
            <div className="space-y-2 px-4 py-3" aria-busy="true">
              {Array.from({ length: 3 }, (_, i) => <div key={i} className="skeleton h-9 w-full" />)}
            </div>
          ) : bids.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted">
              {folder ? 'No bid records this day — it was counted from the screenshot folder.' : 'No bids this day.'}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs text-muted">
                <span>{bids.length} {bids.length === 1 ? 'bid' : 'bids'} · click a bid to review it</span>
                {anyPending && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={complete.length === 0}
                    title="Pending bids with a Submit screenshot and every upload confirmed"
                    onClick={() => onApproveAllComplete(complete)}
                  >
                    Approve all complete ({complete.length})
                  </button>
                )}
              </div>
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {bids.map((b) => (
                  <BidRow key={b.id} bid={b} busy={busyId === b.id} onOpen={onOpenBid} onDecide={onDecide} />
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </li>
  );
}
