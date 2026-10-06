import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import * as api from '../../api/endpoints';
import { countryFlag } from '../../lib/countries';
import { usd } from '../../lib/money';
import { dayParts, timeInZone } from './weekDates';

export const FOLDER_TIP = 'Folder count, not reviewed';

/** One day's approved count with an amber pending badge; "–" for future days, greyed for folder counts. */
export function DayCount({ c, future }: { c: api.BidCounts & { source?: string; error?: string | null }; future: boolean }) {
  if (future) return <span className="text-muted">–</span>;
  if (c.error) return <span title={c.error} className="text-amber-700 dark:text-amber-400">⚠<span className="sr-only"> {c.error}</span></span>;
  const folder = c.source === 'folders';
  return (
    <span className="inline-flex items-center gap-1" title={folder ? FOLDER_TIP : undefined}>
      <span className={folder ? 'text-muted' : c.approved ? 'font-medium text-strong' : 'text-muted'}>{c.approved ?? '—'}</span>
      {!!c.pending && (
        <span className="badge-warning px-1.5 py-0 leading-5" title={`${c.pending} pending`}>
          {c.pending}
          <span className="sr-only"> pending</span>
        </span>
      )}
    </span>
  );
}

/**
 * Team view of a pay week: one row per bidder with the seven days, the week's approved count, pay and bids to review,
 * and a Total row. Row → bidder view; day cell → bidder view with that day open; To review → focus viewer.
 */
export default function TeamWeekTable({
  data,
  onOpenBidder,
  onReview,
  renderStatus,
  renderActions,
}: {
  data: api.BidWeek;
  onOpenBidder: (id: string, day?: string) => void;
  onReview: (bidderId?: string) => void;
  renderStatus: (row: api.BidWeekRow) => ReactNode;
  renderActions: (row: api.BidWeekRow) => ReactNode;
}) {
  const { week, bidders, totals } = data;
  const last = week.days[week.days.length - 1];
  const straddles = last && new Date(last.end) > new Date(week.end);
  const straddleTip = `This day runs past the weekly cutoff (${timeInZone(week.end, week.timezone)}): bids after it are paid next week, so this day can show more than it adds to the Week total.`;

  return (
    <div className="table-wrap">
      <table className="min-w-full text-sm">
        <thead className="table-head">
          <tr>
            <th scope="col" className="px-4 py-2.5">Name</th>
            <th scope="col" className="px-3 py-2.5">Status</th>
            <th scope="col" className="px-3 py-2.5">Profile</th>
            <th scope="col" className="px-3 py-2.5">Rate</th>
            {week.days.map((d) => {
              const p = dayParts(d.day);
              return (
                <th key={d.day} scope="col" className={`px-2 py-2.5 text-center ${d.isToday ? 'text-sky-700 dark:text-sky-300' : ''}`}>
                  <span className="inline-flex items-center gap-1">
                    {p.weekday}
                    {straddles && d === last && (
                      <span title={straddleTip} aria-label={straddleTip}><Info size={12} aria-hidden /></span>
                    )}
                  </span>
                  <span className="block text-[11px] font-normal normal-case text-muted">{p.date}</span>
                </th>
              );
            })}
            <th scope="col" className="px-3 py-2.5 text-right">Week</th>
            <th scope="col" className="px-3 py-2.5 text-right">Pay</th>
            <th scope="col" className="px-3 py-2.5 text-center">To review</th>
            <th scope="col" className="px-3 py-2.5 w-12"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {bidders.map((row) => (
            <tr
              key={row.id}
              className={`table-row cursor-pointer ${row.status === 'archived' ? 'opacity-60' : ''}`}
              onClick={() => onOpenBidder(row.id)}
            >
              <th scope="row" className="px-4 py-2.5 text-left font-medium">
                <button
                  type="button"
                  className="text-left text-strong underline-offset-2 hover:underline focus-ring"
                  onClick={(e) => { e.stopPropagation(); onOpenBidder(row.id); }}
                >
                  {row.country && <span aria-hidden className="mr-1.5">{countryFlag(row.country)}</span>}
                  {row.name}
                </button>
              </th>
              <td className="px-3 py-2.5 whitespace-nowrap text-xs">{renderStatus(row)}</td>
              <td className="px-3 py-2.5">{row.profileName || <span className="text-muted">—</span>}</td>
              <td className="px-3 py-2.5 whitespace-nowrap">{usd(row.rate)}</td>
              {row.days.map((c, i) => {
                const d = week.days[i];
                return (
                  <td key={c.day} className={`px-1 py-1.5 text-center ${d.isToday ? 'bg-sky-50/60 dark:bg-sky-950/30' : ''}`}>
                    {d.isFuture ? (
                      <DayCount c={c} future />
                    ) : (
                      <button
                        type="button"
                        className="w-full rounded-md px-1 py-1 hover:bg-zinc-100 focus-ring dark:hover:bg-zinc-800"
                        aria-label={`${row.name}, ${dayParts(c.day).weekday} ${dayParts(c.day).date}: ${c.approved ?? 'unknown'} approved${c.pending ? `, ${c.pending} pending` : ''}`}
                        onClick={(e) => { e.stopPropagation(); onOpenBidder(row.id, c.day); }}
                      >
                        <DayCount c={c} future={false} />
                      </button>
                    )}
                  </td>
                );
              })}
              <td className="px-3 py-2.5 text-right font-medium text-strong" title={row.week.source === 'folders' ? FOLDER_TIP : undefined}>
                {row.week.error ? <span title={row.week.error}>⚠</span> : row.week.approved ?? '—'}
              </td>
              <td className="px-3 py-2.5 text-right whitespace-nowrap">{row.week.pay == null ? '—' : usd(row.week.pay)}</td>
              <td className="px-3 py-2.5 text-center">
                {row.week.toReview ? (
                  <button
                    type="button"
                    className="badge-warning hover:brightness-95 focus-ring"
                    aria-label={`Review ${row.week.toReview} pending bids of ${row.name}`}
                    onClick={(e) => { e.stopPropagation(); onReview(row.id); }}
                  >
                    {row.week.toReview} →
                  </button>
                ) : (
                  <span className="text-muted">{row.week.toReview === 0 ? '0' : '—'}</span>
                )}
              </td>
              <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>{renderActions(row)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-zinc-200 bg-zinc-50/70 font-medium dark:border-zinc-800 dark:bg-zinc-900/40">
            <th scope="row" className="px-4 py-2.5 text-left" colSpan={4}>Total</th>
            {totals.days.map((c, i) => (
              <td key={c.day} className="px-1 py-2.5 text-center">
                <DayCount c={c} future={week.days[i].isFuture} />
              </td>
            ))}
            <td className="px-3 py-2.5 text-right text-strong">{totals.approved ?? '—'}</td>
            <td className="px-3 py-2.5 text-right whitespace-nowrap text-strong">{totals.pay == null ? '—' : usd(totals.pay)}</td>
            <td className="px-3 py-2.5 text-center">{totals.toReview ?? '—'}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
