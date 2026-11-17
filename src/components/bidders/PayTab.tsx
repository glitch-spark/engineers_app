// The Pay tab: for each pay week of the shown period (newest first, as the server sends them), what each bidder is
// paid: approved bids × the rate. Summary only: there is nothing to mark paid here. A closed week is the figures the
// weekly report stored (what Slack got), so a later rate edit never changes it. A bidder's pending bids are not paid
// until reviewed: a warning under the line, with a Review button that opens the review over that bidder and pay week.
// "Copy pay summary" copies the week as text (lib/payCopy.ts).
import type * as api from '../../api/endpoints';
import { PAY_EMPTY, PAY_STATE, PAY_UNREADABLE, payPendingWarning, payWeekTitle } from '../../lib/bidsWords';
import { usd } from '../../lib/money';
import { notify } from '../../lib/notify';
import { ownerGroups, payCopyText } from '../../lib/payCopy';
import BidsHelp from './BidsHelp';
import { timeInZone } from './weekDates';

function heading(week: api.PayWeekBlock, timezone: string): string {
  const state = week.state === 'open' ? PAY_STATE.open : week.source === 'report' ? PAY_STATE.closedReport : PAY_STATE.closedLive;
  return `${payWeekTitle(week.label)}, ${timeInZone(week.end, timezone)} · ${state}`;
}

function BidderRow({ b, onReview }: { b: api.PayBidderRow; onReview: () => void }) {
  const pending = b.error ? 0 : b.pending ?? 0;
  return (
    <li className="space-y-1 px-4 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <span className="font-medium text-strong">{b.name}</span>
        {b.error ? (
          <span className="text-red-600 dark:text-red-400">{PAY_UNREADABLE}</span>
        ) : (
          <span className="tabular-nums">
            {`${b.approved ?? 0} ${b.pending === null ? 'bids' : 'approved'} × ${usd(b.rate ?? 0)} = ${usd(b.pay ?? 0)}`}
          </span>
        )}
      </div>
      {pending > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
          <span>{payPendingWarning(pending)}</span>
          <button
            type="button"
            className="btn-outline btn-sm"
            aria-label={`Review ${pending} pending bids of ${b.name}`}
            onClick={onReview}
          >
            Review
          </button>
        </div>
      )}
    </li>
  );
}

function WeekBlock({ week, timezone, allOwners, onReview }: {
  week: api.PayWeekBlock;
  timezone: string;
  allOwners: boolean;
  onReview: (weekEnd: string, bidderId: string) => void;
}) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(payCopyText(week, { groupByOwner: allOwners }));
      notify.success('Pay summary copied');
    } catch (err) {
      notify.error(err, "Couldn't copy the pay summary");
    }
  };
  const row = (b: api.PayBidderRow) => <BidderRow key={b.bidderId} b={b} onReview={() => onReview(week.weekEnd, b.bidderId)} />;

  return (
    <section className="panel space-y-3 p-4" aria-label={payWeekTitle(week.label)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-strong">{heading(week, timezone)}</h3>
        <button type="button" className="btn-outline btn-sm" onClick={() => void copy()}>Copy pay summary</button>
      </div>
      {week.bidders.length === 0 ? (
        <p className="text-sm text-muted">{PAY_EMPTY}</p>
      ) : allOwners ? (
        ownerGroups(week.bidders).map((g) => (
          <div key={g.ownerId} className="space-y-1">
            <h4 className="text-sm font-medium text-muted">{g.ownerName ?? 'Unknown owner'}</h4>
            <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">{g.bidders.map(row)}</ul>
          </div>
        ))
      ) : (
        <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">{week.bidders.map(row)}</ul>
      )}
      <div className="flex items-baseline justify-between border-t border-zinc-200 px-4 pt-2 text-sm font-medium text-strong dark:border-zinc-700">
        <span>Total</span>
        <span className="tabular-nums" data-total>{usd(week.totals.pay)}</span>
      </div>
      {week.totals.errors > 0 && (
        <p className="px-4 text-xs text-muted">
          {week.totals.errors === 1 ? "1 bidder's count couldn't be read" : `${week.totals.errors} bidders' counts couldn't be read`}
          , so the total leaves them out.
        </p>
      )}
    </section>
  );
}

export default function PayTab({ data, allOwners, onReview }: {
  data: api.BidPay;
  /** All owners (admin): rows are grouped under the owners' names. */
  allOwners: boolean;
  /** The review overlay over one bidder's pending bids of that pay week (`weekEnd` is a day inside it). */
  onReview: (weekEnd: string, bidderId: string) => void;
}) {
  return (
    <section className="space-y-4" aria-label="Pay">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Pay = approved bids × the bidder&apos;s rate, per pay week.</p>
        <BidsHelp />
      </div>
      {data.weeks.map((w) => (
        <WeekBlock key={w.weekEnd} week={w} timezone={data.timezone} allOwners={allOwners} onReview={onReview} />
      ))}
    </section>
  );
}
