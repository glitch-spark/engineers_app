// The Bidders table's Week view (the default; spec 2026-11-16-bidders-page-redesign-design.md, "Bidders tab table"):
// one row per bidder with the period's time columns (a pay week's report days, or the pay weeks of a month / range),
// Approved, Pending and, for whole pay weeks only, Pay. The words are the glossary's (lib/bidsWords.ts); the click
// help is BidsHelp beside the View switch, so no header carries a hover tip.
import { useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import type { BidPerformance, BidPerformanceRow } from '../../api/endpoints';
import { countryFlag } from '../../lib/countries';
import { usd } from '../../lib/money';
import { fmtCount } from '../../lib/profileMetrics';
import { rowMoney, timeColumns, weekCell } from '../../lib/bidderPage';
import { PayReadNote } from './PayReadNote';
import { DayCount } from './TeamWeekTable';

export type SortState<K extends string> = { key: K; dir: 'asc' | 'desc' } | null;

/** Rows sorted by `value` (unknowns last, whichever the direction); unsorted when `sort` is null. */
export function sortRows<K extends string>(
  rows: BidPerformanceRow[], sort: SortState<K>, value: (r: BidPerformanceRow, key: K) => number | null,
): BidPerformanceRow[] {
  if (!sort) return rows;
  return [...rows].sort((a, b) => {
    const x = value(a, sort.key);
    const y = value(b, sort.key);
    if (x == null || y == null) return x == null && y == null ? 0 : x == null ? 1 : -1;
    return sort.dir === 'desc' ? y - x : x - y;
  });
}

export function sortByName(rows: BidPerformanceRow[], dir: 'asc' | 'desc'): BidPerformanceRow[] {
  const byName = [...rows].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  return dir === 'desc' ? byName.reverse() : byName;
}

/** A sortable column header: the whole label is the button. */
export function SortHead<K extends string>({
  k, sort, onSort, children, className = 'text-right',
}: { k: K; sort: SortState<K>; onSort: (k: K) => void; children: ReactNode; className?: string }) {
  const active = sort?.key === k;
  const Icon = active ? (sort!.dir === 'desc' ? ArrowDown : ArrowUp) : ChevronsUpDown;
  return (
    <th scope="col" className={`px-3 py-2.5 ${className}`}
      aria-sort={active ? (sort!.dir === 'desc' ? 'descending' : 'ascending') : 'none'}>
      <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1 whitespace-nowrap uppercase hover:text-strong">
        {children}<Icon className={`h-3 w-3 ${active ? '' : 'opacity-40'}`} aria-hidden />
      </button>
    </th>
  );
}

/** The sticky Bidder column on narrow screens (it scrolls with the rest from `md` up), on an opaque background. */
export const STICKY_NAME = 'sticky left-0 z-10 bg-white dark:bg-zinc-950 md:static md:z-auto md:bg-transparent md:dark:bg-transparent';
export const STICKY_EDGE = 'sticky left-0 z-10 bg-zinc-50 dark:bg-zinc-900 md:static md:z-auto';

/** The name cell shared by both views: name (flag), profile and rate, status. */
export function BidderName({ r, onOpen, status }: { r: BidPerformanceRow; onOpen: () => void; status: ReactNode }) {
  return (
    <th scope="row" className={`px-4 py-2 text-left font-normal ${STICKY_NAME}`}>
      <button type="button" className="font-medium text-strong hover:underline"
        onClick={(e) => { e.stopPropagation(); onOpen(); }}>
        {r.country && <span aria-hidden className="mr-1.5">{countryFlag(r.country)}</span>}{r.name}
      </button>
      <div className="text-[11px] text-muted whitespace-nowrap">
        {[r.profileName, r.rate != null ? `${usd(r.rate)}/bid` : null].filter(Boolean).join(' · ')}
      </div>
      <div className="text-[11px]">{status}</div>
    </th>
  );
}

type SortKey = 'name' | 'approved' | 'pending' | 'pay' | `t${number}`;

type Props = {
  /** The whole period: the Total row. */
  data: BidPerformance;
  /** The rows to list (the search narrows them; the Total row stays the period's). */
  rows: BidPerformanceRow[];
  /** All owners: an Owner column after Bidder. */
  showOwner: boolean;
  /** Only for whole pay weeks (isWholePayWeeks): a month or custom range would show a second pay total. */
  showPay: boolean;
  onOpenBidder: (id: string, day?: string) => void;
  /** Open the review overlay on this bidder's pending bids of the shown period. */
  onReview: (id: string) => void;
  renderStatus: (row: BidPerformanceRow) => ReactNode;
  renderActions: (row: BidPerformanceRow) => ReactNode;
};

export default function BiddersWeekTable({
  data, rows, showOwner, showPay, onOpenBidder, onReview, renderStatus, renderActions,
}: Props) {
  const [sort, setSort] = useState<SortState<SortKey>>(null);
  const weekMode = !!data.payWeek;
  const cols = timeColumns(data);
  const value = (r: BidPerformanceRow, key: SortKey): number | null => {
    if (key === 'name') return null;
    if (key.startsWith('t')) return weekCell(r, Number(key.slice(1)), weekMode).approved;
    const m = rowMoney(r);
    if (key === 'approved') return m.approved;
    if (key === 'pending') return m.toReview;
    return m.pay;
  };
  const shown = sort?.key === 'name' ? sortByName(rows, sort.dir) : sortRows(rows, sort, value);
  const onSort = (key: SortKey) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));
  const t = data.totals;
  // The Total row's time cells: the server's day totals in week mode, else each column summed over every bidder.
  const totalCell = (i: number) => {
    if (weekMode) return t.days?.[i] ?? { approved: null, pending: null, rejected: null };
    const cells = data.bidders.map((r) => weekCell(r, i, false));
    const sum = (k: 'approved' | 'pending') => (cells.some((c) => c[k] == null) ? null : cells.reduce((s, c) => s + (c[k] ?? 0), 0));
    return { approved: sum('approved'), pending: sum('pending'), rejected: null };
  };
  const totalPending = t.pending ?? t.toReview ?? null;

  return (
    <div className="table-wrap overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="table-head">
          <tr>
            <SortHead k="name" sort={sort} onSort={onSort} className={`px-4 text-left ${STICKY_EDGE}`}>Bidder</SortHead>
            {showOwner && <th scope="col" className="px-3 py-2.5 text-left">Owner</th>}
            {cols.map((c, i) => (
              <SortHead key={c.key} k={`t${i}`} sort={sort} onSort={onSort} className="text-center">
                <span className="flex flex-col items-center leading-tight">
                  <span className={c.isToday ? 'text-sky-700 dark:text-sky-300' : ''}>{c.label}</span>
                  {c.sub && <span className="text-[10px] font-normal normal-case text-muted">{c.sub}</span>}
                </span>
              </SortHead>
            ))}
            <SortHead k="approved" sort={sort} onSort={onSort}>Approved</SortHead>
            <SortHead k="pending" sort={sort} onSort={onSort} className="text-center">Pending</SortHead>
            {showPay && <SortHead k="pay" sort={sort} onSort={onSort}>Pay</SortHead>}
            <th scope="col" className="w-10 px-2 py-2.5"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {shown.map((r) => {
            const m = rowMoney(r);
            return (
              <tr key={r.id} className={`table-row cursor-pointer border-t border-zinc-100 dark:border-zinc-800 ${r.bidderStatus === 'archived' || r.status === 'archived' ? 'opacity-60' : ''}`}
                onClick={() => onOpenBidder(r.id)}>
                <BidderName r={r} onOpen={() => onOpenBidder(r.id)} status={renderStatus(r)} />
                {showOwner && <td className="px-3 py-2 text-left whitespace-nowrap">{r.ownerName ?? '—'}</td>}
                {cols.map((c, i) => {
                  const cell = weekCell(r, i, weekMode);
                  return (
                    <td key={c.key} className={`px-1 py-1.5 text-center ${c.isToday ? 'bg-sky-50/60 dark:bg-sky-950/30' : ''}`}>
                      {weekMode && c.day && !c.isFuture ? (
                        <button type="button" className="w-full rounded-md px-1 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          aria-label={`${r.name}, ${c.label} ${c.sub}: ${cell.approved ?? 'unknown'} approved${cell.pending ? `, ${cell.pending} pending` : ''}`}
                          onClick={(e) => { e.stopPropagation(); onOpenBidder(r.id, c.day); }}>
                          <DayCount c={cell} future={false} />
                        </button>
                      ) : <DayCount c={cell} future={!!c.isFuture} />}
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-right font-medium text-strong">{m.approved == null ? '—' : fmtCount(m.approved)}</td>
                <td className="px-3 py-2 text-center">
                  {m.toReview ? (
                    <button type="button" className="badge-warning hover:brightness-95"
                      aria-label={`Review ${m.toReview} pending bids of ${r.name}`}
                      onClick={(e) => { e.stopPropagation(); onReview(r.id); }}>{fmtCount(m.toReview)} →</button>
                  ) : <span className="text-muted">{m.toReview === 0 ? '0' : '—'}</span>}
                </td>
                {showPay && (
                  <td className="px-3 py-2 text-right whitespace-nowrap">{m.pay == null ? '—' : usd(m.pay)}<PayReadNote error={r.week?.error} /></td>
                )}
                <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>{renderActions(r)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="tabular-nums">
          <tr className="border-t border-zinc-200 bg-zinc-50/70 font-medium text-strong dark:border-zinc-700 dark:bg-zinc-900/40">
            <th scope="row" className={`px-4 py-2 text-left ${STICKY_EDGE}`}>Total</th>
            {showOwner && <td />}
            {cols.map((c, i) => (
              <td key={c.key} className="px-1 py-2 text-center"><DayCount c={totalCell(i)} future={!!c.isFuture} /></td>
            ))}
            <td className="px-3 py-2 text-right">{t.approved == null ? '—' : fmtCount(t.approved)}</td>
            <td className="px-3 py-2 text-center">{totalPending == null ? '—' : fmtCount(totalPending)}</td>
            {showPay && <td className="px-3 py-2 text-right whitespace-nowrap">{t.pay == null ? '—' : usd(t.pay)}<PayReadNote error={t.error} /></td>}
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
