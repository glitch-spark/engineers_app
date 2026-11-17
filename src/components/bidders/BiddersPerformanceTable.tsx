// The Bidders table's Performance view (`lens=performance`; spec 2026-11-16-bidders-page-redesign-design.md, "Bidders
// tab table"): how each bidder is doing over the period. Bids (approved + pending) with the change from the period
// before, Days at 50+, Interviews per 100 bids, Approval, Cost per interview, Last bid. Money other than cost per
// interview lives in the Week view's Pay column, so there is no "paid" line here.
import { useState, type ReactNode } from 'react';
import type { BidPerformance, BidPerformanceRow } from '../../api/endpoints';
import { fmtCount } from '../../lib/profileMetrics';
import { rowPer100Verdict } from '../../lib/bidderInsights';
import { rowMoney } from '../../lib/bidderPage';
import { Arrow } from '../insights/compareParts';
import { BidderName, SortHead, STICKY_EDGE, sortByName, sortRows, type SortState } from './BiddersWeekTable';

const pct = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n * 100)}%`);
const dollars = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

function Change({ value }: { value: number | null }) {
  if (value == null) return null;
  const n = Math.round(Math.abs(value) * 100);
  if (value > 0 && n > 0) return <div className="text-[11px] text-emerald-700 dark:text-emerald-300">↑ {n}%</div>;
  if (value < 0 && n > 0) return <div className="text-[11px] text-red-700 dark:text-red-300">↓ {n}%</div>;
  return null;
}

/** Start of the previous weekday (Monday looks back to Friday); a last bid before it is stale. */
function staleBefore(now: Date): number {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  do d.setDate(d.getDate() - 1); while (d.getDay() === 0 || d.getDay() === 6);
  return d.getTime();
}

function relativeTime(iso: string, now: number): string {
  const mins = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

type SortKey = 'name' | 'bids' | 'hitRate' | 'interviews' | 'approvalRate' | 'costPerInterview' | 'lastBidAt';

function sortValue(r: BidPerformanceRow, key: SortKey): number | null {
  if (key === 'bids') return rowMoney(r).bids;
  if (key === 'lastBidAt') return r.lastBidAt ? new Date(r.lastBidAt).getTime() : null;
  if (key === 'name') return null;
  return (r[key] ?? null) as number | null;
}

type Props = {
  /** The whole period: the Total row. */
  data: BidPerformance;
  /** The rows to list (the search narrows them; the Total row stays the period's). */
  rows: BidPerformanceRow[];
  platformPer100: number | null | undefined;
  /** All owners: an Owner column after Bidder. */
  showOwner: boolean;
  onOpenBidder: (id: string) => void;
  renderStatus: (row: BidPerformanceRow) => ReactNode;
  renderActions: (row: BidPerformanceRow) => ReactNode;
};

export default function BiddersPerformanceTable({
  data, rows, platformPer100, showOwner, onOpenBidder, renderStatus, renderActions,
}: Props) {
  const [sort, setSort] = useState<SortState<SortKey>>(null);
  const shown = sort?.key === 'name' ? sortByName(rows, sort.dir) : sortRows(rows, sort, sortValue);
  // A lower cost is better and names read A→Z: those start ascending.
  const onSort = (key: SortKey) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' }
      : { key, dir: key === 'costPerInterview' || key === 'name' ? 'asc' : 'desc' }));
  const now = Date.now();
  const stale = staleBefore(new Date(now));
  const t = data.totals;
  // The server sent board money (a pay week, or two: `pending` is in the totals, and each row has its `week` block):
  // the Total row's Bids is then that money too, so it adds up to the rows (rowMoney). A month has report-day sums only.
  const boardMoney = t.pending !== undefined || data.bidders.some((r) => r.week);

  return (
    <div className="table-wrap overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="table-head">
          <tr>
            <SortHead k="name" sort={sort} onSort={onSort} className={`px-4 text-left ${STICKY_EDGE}`}>Bidder</SortHead>
            {showOwner && <th scope="col" className="px-3 py-2.5 text-left">Owner</th>}
            <SortHead k="bids" sort={sort} onSort={onSort}>Bids</SortHead>
            <SortHead k="hitRate" sort={sort} onSort={onSort}>Days at 50+</SortHead>
            <SortHead k="interviews" sort={sort} onSort={onSort}>Interviews</SortHead>
            <SortHead k="approvalRate" sort={sort} onSort={onSort}>Approval</SortHead>
            <SortHead k="costPerInterview" sort={sort} onSort={onSort}>Cost per interview</SortHead>
            <SortHead k="lastBidAt" sort={sort} onSort={onSort}>Last bid</SortHead>
            <th scope="col" className="w-10 px-2 py-2.5"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {shown.map((r) => {
            const dir = rowPer100Verdict(r, platformPer100);
            const isStale = r.lastBidAt != null && new Date(r.lastBidAt).getTime() < stale;
            return (
              <tr key={r.id} className={`table-row cursor-pointer border-t border-zinc-100 dark:border-zinc-800 ${r.bidderStatus === 'archived' || r.status === 'archived' ? 'opacity-60' : ''}`}
                onClick={() => onOpenBidder(r.id)}>
                <BidderName r={r} onOpen={() => onOpenBidder(r.id)} status={renderStatus(r)} />
                {showOwner && <td className="px-3 py-2 text-left whitespace-nowrap">{r.ownerName ?? '—'}</td>}
                <td className="px-3 py-2 text-right">
                  <div className="font-medium text-strong">{fmtCount(rowMoney(r).bids)}</div>
                  <Change value={r.change} />
                </td>
                <td className="px-3 py-2 text-right">
                  <div>{pct(r.hitRate)}</div>
                  {r.weekdays > 0 && <div className="whitespace-nowrap text-[11px] text-muted">{r.hitDays} of {r.weekdays}</div>}
                </td>
                <td className="px-3 py-2 text-right">
                  <div>{r.interviews == null ? '—' : fmtCount(r.interviews)}</div>
                  {r.per100 != null && (
                    <div className="whitespace-nowrap text-[11px] text-muted">
                      {r.per100.toFixed(2)} per 100
                      {dir && platformPer100 != null && (
                        <Arrow dir={dir} title={`${r.per100.toFixed(2)} per 100 bids · platform average ${platformPer100.toFixed(2)}`} />
                      )}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {r.approvalRate == null ? <span className="text-muted">—</span> : (
                    <>
                      <div>{pct(r.approvalRate)}</div>
                      <div className="whitespace-nowrap text-[11px] text-muted">{fmtCount(r.approved)} of {fmtCount(r.reviewed ?? 0)}</div>
                    </>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {r.costPerInterview == null ? <span className="text-muted">—</span> : dollars(r.costPerInterview)}
                </td>
                <td className={`px-3 py-2 text-right whitespace-nowrap ${isStale ? 'text-amber-700 dark:text-amber-300' : ''}`}>
                  {r.lastBidAt ? relativeTime(r.lastBidAt, now) : <span className="text-muted">—</span>}
                </td>
                <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>{renderActions(r)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="tabular-nums">
          <tr className="border-t border-zinc-200 bg-zinc-50/70 font-medium text-strong dark:border-zinc-700 dark:bg-zinc-900/40">
            <th scope="row" className={`px-4 py-2 text-left ${STICKY_EDGE}`}>Total</th>
            {showOwner && <td />}
            <td className="px-3 py-2 text-right">{fmtCount(boardMoney ? (t.approved ?? 0) + (t.pending ?? 0) : t.total)}</td>
            <td className="px-3 py-2 text-right">{pct(t.hitRate)}</td>
            <td className="px-3 py-2 text-right">
              <div>{fmtCount(t.interviews)}</div>
              {t.per100 != null && <div className="whitespace-nowrap text-[11px] font-normal text-muted">{t.per100.toFixed(2)} per 100</div>}
            </td>
            <td className="px-3 py-2 text-right">{pct(t.approvalRate)}</td>
            <td className="px-3 py-2 text-right">{t.costPerInterview == null ? '—' : dollars(t.costPerInterview)}</td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
