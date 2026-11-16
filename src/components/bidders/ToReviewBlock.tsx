// The To review block at the top of the Bidders tab: every pending bid of the owner's bidders, of any age (so its count
// can differ from the table's Pending column, which is the shown period's). A "to do" line in amber, not an error: it
// is a status, never an alert. Each entry opens the one review overlay through `onReview`.
import type * as api from '../../api/endpoints';
import type { ReviewScope } from '../../lib/bidsUrl';
import { dayParts } from './weekDates';

type Props = {
  backlog: api.BidBacklog;
  /** All owners (admin): each chip names the bidder's owner. */
  allOwners: boolean;
  /** Open the review overlay over `scope`, filtered to one bidder when `bidderId` is given. */
  onReview: (scope: ReviewScope, bidderId?: string) => void;
};

const dayText = (day: string) => {
  const p = dayParts(day);
  return `${p.weekday} ${p.date}`;
};

export default function ToReviewBlock({ backlog, allOwners, onReview }: Props) {
  if (backlog.total <= 0) return null;
  return (
    <section
      role="status"
      aria-label="To review"
      className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="font-medium">
          {`To review · ${backlog.total.toLocaleString('en-US')} pending (all, any age)`}
          {backlog.oldestDay ? ` · oldest ${dayText(backlog.oldestDay)}` : ''}
        </p>
        <div className="ml-auto flex flex-wrap gap-2">
          {backlog.todayCount > 0 && (
            <button type="button" className="btn-outline btn-sm" onClick={() => onReview({ kind: 'day', day: backlog.today })}>
              Review today ({backlog.todayCount.toLocaleString('en-US')})
            </button>
          )}
          <button type="button" className="btn btn-sm" onClick={() => onReview({ kind: 'all' })}>Review all</button>
        </div>
      </div>
      {backlog.bidders.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Pending by bidder">
          {backlog.bidders.map((b) => (
            <li key={b.bidderId}>
              <button
                type="button"
                className="badge-warning hover:brightness-95"
                title={`Oldest ${dayText(b.oldestDay)}`}
                onClick={() => onReview({ kind: 'all' }, b.bidderId)}
              >
                {allOwners ? `${b.name} · ${b.ownerName ?? 'Unknown owner'} ${b.pending}` : `${b.name} ${b.pending}`}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
