// The single Bidders page table (spec 2026-11-14-bidders-single-page-design.md): one row per bidder with the period's
// time columns (a pay week's days, or a month's pay weeks), money and review counts, and the performance measures.
// Replaces the Pay week table on the list and the Performance table.
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, Info } from 'lucide-react';
import type { BidPerformance, BidPerformanceRow } from '../../api/endpoints';
import { countryFlag } from '../../lib/countries';
import { usd } from '../../lib/money';
import { fmtCount } from '../../lib/profileMetrics';
import { rowPer100Verdict } from '../../lib/bidderInsights';
import { rowMoney, shownRows, timeColumns, type RowFilter } from '../../lib/bidderPage';
import { Arrow } from '../insights/compareParts';
import { DayCount } from './TeamWeekTable';

const TARGET = 50;
const pct = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n * 100)}%`);
const dollars = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const utcDay = (day: string) => new Date(`${day.slice(0, 10)}T00:00:00Z`);

const HELP = {
  bids: 'Approved + pending bids. In a pay week: the pay-week window (Sat 4 pm – Sat 4 pm), as the weekly report pays. Hover a value for the split.',
  pay: 'Approved bids × the bidder\'s rate.',
  review: 'Pending bids waiting for your review.',
  hit: `Weekdays with ${TARGET}+ approved + pending bids, out of the bidder's weekdays in the period. Dots: filled = ${TARGET}+, hollow = under ${TARGET}, amber = today so far, faint = not active. Streak = ${TARGET}+ days in a row (weekends skipped).`,
  interviews: 'Interview rounds held on interviews this bidder applied for ("Applied by"), plus untagged older ones on their profile. Per 100 bids from 100 bids, with ▲/▼ against the platform average.',
  approval: 'Approved out of reviewed (approved + rejected) bids.',
  cost: 'Pay for approved bids divided by interviews.',
};

const DOT: Record<BidPerformanceRow['days'][number]['state'], { cls: string; text: string }> = {
  hit: { cls: 'bg-emerald-500 dark:bg-emerald-400', text: `${TARGET}+ day` },
  miss: { cls: 'border border-zinc-400 dark:border-zinc-500', text: `under ${TARGET}` },
  open: { cls: 'border border-amber-500 bg-amber-200 dark:bg-amber-500/40', text: `today so far, not ${TARGET} yet` },
  none: { cls: 'bg-zinc-200 dark:bg-zinc-700', text: 'not active (not created yet or archived)' },
};

function DayStrip({ days }: { days: BidPerformanceRow['days'] }) {
  return (
    <div className="mt-1 flex flex-wrap justify-end gap-0.5" aria-hidden>
      {days.map((d) => (
        <span key={d.day} title={`${utcDay(d.day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}: ${fmtCount(d.bids)} bids · ${DOT[d.state].text}`}>
          <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${DOT[d.state].cls}`} />
        </span>
      ))}
    </div>
  );
}

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

type SortKey = 'bids' | 'pay' | 'toReview' | 'hitRate' | 'interviews' | 'approvalRate' | 'costPerInterview' | 'lastBidAt' | `t${number}`;

function sortValue(r: BidPerformanceRow, key: SortKey): number | null {
  if (key.startsWith('t')) {
    const i = Number(key.slice(1));
    return r.dayCells ? (r.dayCells[i]?.approved ?? null) : (r.weekly[i] ?? null);
  }
  const m = rowMoney(r);
  if (key === 'bids') return m.bids;
  if (key === 'pay') return m.pay;
  if (key === 'toReview') return m.toReview;
  if (key === 'lastBidAt') return r.lastBidAt ? new Date(r.lastBidAt).getTime() : null;
  return (r[key as 'hitRate'] ?? null) as number | null;
}

type Props = {
  data: BidPerformance;
  platformPer100: number | null | undefined;
  showOwner: boolean;
  onOpenBidder: (id: string, day?: string) => void;
  /** Open the review overlay on this bidder's pending bids of the pay week (week mode). */
  onReview: (id: string) => void;
  renderStatus: (row: BidPerformanceRow) => ReactNode;
  renderActions: (row: BidPerformanceRow) => ReactNode;
  /** All / Bidders / Self (the owner's own applies). */
  show: RowFilter;
  /** Open an owner's self bids: a day (a day cell) or the period's pay week. */
  onOpenSelf: (ownerId: string, ownerName: string, day?: string) => void;
};

export default function BiddersTable({
  data, platformPer100, showOwner, onOpenBidder, onReview, renderStatus, renderActions, show, onOpenSelf,
}: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);
  const weekMode = !!data.payWeek;
  const cols = timeColumns(data);
  const visible = shownRows(data, show);
  const rows = useMemo(() => {
    const list = show === 'self' ? [] : data.bidders;
    if (!sort) return list;
    return [...list].sort((a, b) => {
      const x = sortValue(a, sort.key);
      const y = sortValue(b, sort.key);
      if (x == null || y == null) return x == null && y == null ? 0 : x == null ? 1 : -1;
      return sort.dir === 'desc' ? y - x : x - y;
    });
  }, [data, sort, show]);
  const toggle = (key: SortKey) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: key === 'costPerInterview' ? 'asc' : 'desc' }));
  const now = Date.now();
  const stale = staleBefore(new Date(now));
  const t = data.totals;

  const head = (k: SortKey, label: ReactNode, help?: string, cls = 'text-right') => {
    const active = sort?.key === k;
    const Icon = active ? (sort!.dir === 'desc' ? ArrowDown : ArrowUp) : ChevronsUpDown;
    return (
      <th key={k} scope="col" className={`px-3 py-2.5 ${cls}`} aria-sort={active ? (sort!.dir === 'desc' ? 'descending' : 'ascending') : 'none'}>
        <span className="inline-flex items-center gap-1">
          {help && (
            <span title={help} className="cursor-help text-muted hover:text-strong">
              <Info className="h-3 w-3" aria-hidden /><span className="sr-only">{help}</span>
            </span>
          )}
          <button type="button" onClick={() => toggle(k)} className="inline-flex items-center gap-1 whitespace-nowrap uppercase hover:text-strong">
            {label}<Icon className={`h-3 w-3 ${active ? '' : 'opacity-40'}`} aria-hidden />
          </button>
        </span>
      </th>
    );
  };

  return (
    <div className="table-wrap overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="table-head">
          <tr>
            <th scope="col" className="px-4 py-2.5 text-left">Bidder</th>
            {cols.map((c, i) => head(`t${i}`, (
              <span className="flex flex-col items-center leading-tight">
                <span className={c.isToday ? 'text-sky-700 dark:text-sky-300' : ''}>{c.label}</span>
                {c.sub && <span className="text-[10px] font-normal normal-case text-muted">{c.sub}</span>}
              </span>
            ), undefined, 'text-center'))}
            {head('bids', 'Bids', HELP.bids)}
            {head('pay', 'Pay', HELP.pay)}
            {head('toReview', 'Review', HELP.review, 'text-center')}
            {head('hitRate', '50+ days', HELP.hit)}
            {head('interviews', 'Interviews', HELP.interviews)}
            {head('approvalRate', 'Approval', HELP.approval)}
            {head('costPerInterview', 'Cost / int.', HELP.cost)}
            {head('lastBidAt', 'Last bid')}
            <th scope="col" className="w-10 px-2 py-2.5"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((r) => {
            const m = rowMoney(r);
            const dir = rowPer100Verdict(r, platformPer100);
            const isStale = r.lastBidAt != null && new Date(r.lastBidAt).getTime() < stale;
            return (
              <tr key={r.id} className={`table-row cursor-pointer border-t border-zinc-100 dark:border-zinc-800 ${r.bidderStatus === 'archived' || r.status === 'archived' ? 'opacity-60' : ''}`}
                onClick={() => onOpenBidder(r.id)}>
                <th scope="row" className="px-4 py-2 text-left font-normal">
                  <button type="button" className="font-medium text-strong hover:underline"
                    onClick={(e) => { e.stopPropagation(); onOpenBidder(r.id); }}>
                    {r.country && <span aria-hidden className="mr-1.5">{countryFlag(r.country)}</span>}{r.name}
                  </button>
                  <div className="text-[11px] text-muted whitespace-nowrap">
                    {[r.profileName, showOwner ? r.ownerName : null, r.rate != null ? `${usd(r.rate)}/bid` : null].filter(Boolean).join(' · ')}
                  </div>
                  <div className="text-[11px]">{renderStatus(r)}</div>
                </th>
                {cols.map((c, i) => (
                  <td key={c.key} className={`px-1 py-1.5 text-center ${c.isToday ? 'bg-sky-50/60 dark:bg-sky-950/30' : ''}`}>
                    {weekMode && r.dayCells?.[i] ? (
                      c.isFuture ? <DayCount c={r.dayCells[i]} future /> : (
                        <button type="button" className="w-full rounded-md px-1 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          aria-label={`${r.name}, ${c.label} ${c.sub}: ${r.dayCells[i].approved ?? 'unknown'} approved`}
                          onClick={(e) => { e.stopPropagation(); onOpenBidder(r.id, c.day); }}>
                          <DayCount c={r.dayCells[i]} future={false} />
                        </button>
                      )
                    ) : weekMode ? <span className="text-muted">–</span> : fmtCount(r.weekly[i] ?? 0)}
                  </td>
                ))}
                <td className="px-3 py-2 text-right"
                  title={`${fmtCount(m.approved ?? 0)} approved${m.folder ? ' (folder count)' : ` · ${fmtCount(r.week?.pending ?? r.pending)} pending · ${fmtCount(r.week?.rejected ?? r.rejected)} rejected`}`}>
                  <div className="font-medium text-strong">{fmtCount(m.bids)}</div>
                  <Change value={r.change} />
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{m.pay == null ? '—' : usd(m.pay)}</td>
                <td className="px-3 py-2 text-center">
                  {m.toReview ? (
                    weekMode ? (
                      <button type="button" className="badge-warning hover:brightness-95"
                        aria-label={`Review ${m.toReview} pending bids of ${r.name}`}
                        onClick={(e) => { e.stopPropagation(); onReview(r.id); }}>{m.toReview} →</button>
                    ) : <span className="badge-warning">{m.toReview}</span>
                  ) : <span className="text-muted">{m.toReview === 0 ? '0' : '—'}</span>}
                </td>
                <td className="px-3 py-2 text-right" title={r.avgPerWeekday == null ? undefined : `${r.avgPerWeekday.toFixed(1)} bids per weekday on average`}>
                  <div>{pct(r.hitRate)}</div>
                  {r.weekdays > 0 && (
                    <div className="whitespace-nowrap text-[11px] text-muted">
                      {r.hitDays} of {r.weekdays} · streak {fmtCount(r.currentStreak)} · best {fmtCount(r.longestStreak)}
                    </div>
                  )}
                  {r.days.length > 0 && r.days.length <= 31 && <DayStrip days={r.days} />}
                </td>
                <td className="px-3 py-2 text-right">
                  <div>{r.interviews == null ? '—' : fmtCount(r.interviews)}</div>
                  {r.per100 != null && (
                    <div className="whitespace-nowrap text-[11px] text-muted">
                      {r.per100.toFixed(2)} / 100
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
                  {r.costPerInterview == null ? <span className="text-muted">—</span> : (
                    <>
                      <div>{dollars(r.costPerInterview)}</div>
                      <div className="whitespace-nowrap text-[11px] text-muted">{dollars(r.pay ?? 0)} paid</div>
                    </>
                  )}
                </td>
                <td className={`px-3 py-2 text-right whitespace-nowrap ${isStale ? 'text-amber-700 dark:text-amber-300' : ''}`}
                  title={r.lastBidAt ? new Date(r.lastBidAt).toLocaleString() : undefined}>
                  {r.lastBidAt ? relativeTime(r.lastBidAt, now) : <span className="text-muted">—</span>}
                </td>
                <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>{renderActions(r)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="tabular-nums">
          <tr className={`border-t border-zinc-200 bg-zinc-50/70 font-medium text-strong dark:border-zinc-700 dark:bg-zinc-900/40 ${visible.total ? '' : 'hidden'}`}>
            <th scope="row" className="px-4 py-2 text-left">Total</th>
            {cols.map((c, i) => (
              <td key={c.key} className="px-1 py-2 text-center">
                {weekMode && t.days?.[i] ? <DayCount c={t.days[i]} future={!!c.isFuture} />
                  : weekMode ? '–' : fmtCount(data.bidders.reduce((s, r) => s + (r.weekly[i] ?? 0), 0))}
              </td>
            ))}
            <td className="px-3 py-2 text-right">{fmtCount(weekMode ? (t.approved ?? 0) + (t.pending ?? 0) : t.total)}</td>
            <td className="px-3 py-2 text-right whitespace-nowrap">{t.pay == null ? '—' : usd(t.pay)}</td>
            <td className="px-3 py-2 text-center">{t.toReview ?? '—'}</td>
            <td className="px-3 py-2 text-right">{pct(t.hitRate)}</td>
            <td className="px-3 py-2 text-right">{fmtCount(t.interviews)}</td>
            <td className="px-3 py-2 text-right">{pct(t.approvalRate)}</td>
            <td className="px-3 py-2 text-right">{t.costPerInterview == null ? '—' : dollars(t.costPerInterview)}</td>
            <td colSpan={2} />
          </tr>
          {(data.selfRows ?? []).filter((s) => visible.self.includes(s.ownerId)).map((s) => (
            <tr key={`self-${s.ownerId}`} className="table-row cursor-pointer border-t border-zinc-100 font-normal text-body dark:border-zinc-800"
              onClick={() => onOpenSelf(s.ownerId, s.ownerName)}>
              <th scope="row" className="px-4 py-2 text-left font-normal">
                <button type="button" className="font-medium text-strong hover:underline"
                  onClick={(e) => { e.stopPropagation(); onOpenSelf(s.ownerId, s.ownerName); }}>Self</button>
                {showOwner && s.ownerName && <span className="text-muted"> · {s.ownerName}</span>}
                <div className="text-[11px] text-muted">Own applies from the extension · not in the totals</div>
              </th>
              {cols.map((c, i) => (
                <td key={c.key} className="px-1 py-1.5 text-center">
                  {c.isFuture ? <span className="text-muted">–</span> : c.day && (s.weekly[i] ?? 0) > 0 ? (
                    <button type="button" className="w-full rounded-md px-1 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      aria-label={`Self, ${c.label} ${c.sub}: ${s.weekly[i]} applies`}
                      onClick={(e) => { e.stopPropagation(); onOpenSelf(s.ownerId, s.ownerName, c.day); }}>
                      {fmtCount(s.weekly[i] ?? 0)}
                    </button>
                  ) : fmtCount(s.weekly[i] ?? 0)}
                </td>
              ))}
              <td className="px-3 py-2 text-right font-medium text-strong">{fmtCount(s.total)}</td>
              <td className="px-3 py-2 text-right text-muted">—</td>
              <td className="px-3 py-2 text-center text-muted">—</td>
              <td className="px-3 py-2 text-right text-muted">—</td>
              <td className="px-3 py-2 text-right">{fmtCount(s.interviews)}</td>
              <td className="px-3 py-2 text-right text-muted">—</td>
              <td className="px-3 py-2 text-right text-muted">—</td>
              <td className="px-3 py-2 text-right whitespace-nowrap">{s.lastBidAt ? relativeTime(s.lastBidAt, now) : <span className="text-muted">—</span>}</td>
              <td />
            </tr>
          ))}
        </tfoot>
      </table>
    </div>
  );
}
