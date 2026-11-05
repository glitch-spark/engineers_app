import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import * as api from '../../api/endpoints';
import type { BidPerformanceRow } from '../../api/endpoints';
import { useAuth } from '../../auth/useAuth';
import { PERIODS, PeriodNav, Segmented, filtersError, isoDay } from '../statistics/controls';
import { fmtCount } from '../../lib/profileMetrics';

type Filters = { period: api.StatsPeriod; day: string; from: string; to: string };

function initialFilters(): Filters {
  const today = new Date();
  return {
    period: 'month',
    day: isoDay(today),
    from: isoDay(new Date(today.getFullYear(), today.getMonth(), 1)),
    to: isoDay(today),
  };
}

/** An ISO day as `Oct 27`, read as UTC so it never shifts with the viewer's timezone. */
function dayLabel(day: string, year = false): string {
  const d = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' });
}

/** Start of the previous weekday (Monday looks back to Friday); a last bid before it is stale. */
function staleBefore(now: Date): number {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  do {
    d.setDate(d.getDate() - 1);
  } while (d.getDay() === 0 || d.getDay() === 6);
  return d.getTime();
}

function relativeTime(iso: string, now: number): string {
  const mins = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const pct = (n: number | null) => (n == null ? '—' : `${Math.round(n * 100)}%`);
const fixed = (n: number | null, digits: number) => (n == null ? '—' : n.toFixed(digits));

type SortKey = 'total' | 'longestStreak' | 'hitRate' | 'avgPerWeekday' | 'interviews' | 'per100' | 'lastBidAt' | `w${number}`;
type Sort = { key: SortKey; dir: 'desc' | 'asc' } | null;

function sortValue(r: BidPerformanceRow, key: SortKey): number | null {
  if (key.startsWith('w') && key !== 'total') {
    const v = r.weekly[Number(key.slice(1))];
    return v ?? null;
  }
  if (key === 'lastBidAt') return r.lastBidAt ? new Date(r.lastBidAt).getTime() : null;
  return r[key as 'total'] as number | null;
}

function Change({ value }: { value: number | null }) {
  if (value == null) return null;
  const n = Math.round(Math.abs(value) * 100);
  if (value > 0 && n > 0) return <div className="text-[11px] text-emerald-700 dark:text-emerald-300">↑ {n}%</div>;
  if (value < 0 && n > 0) return <div className="text-[11px] text-red-700 dark:text-red-300">↓ {n}%</div>;
  return <div className="text-[11px] text-muted">0%</div>;
}

/** Bidders' bids, streaks, hit rate and interviews over a week, a month or a custom range: the top performers
 * and one row per bidder with a column per week. */
export default function PerformanceTab({ ownerId, includeArchived, onOpenBidder }: {
  ownerId: string;
  includeArchived: boolean;
  onOpenBidder: (id: string, week: string) => void;
}) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [f, setFilters] = useState<Filters>(initialFilters);
  const [sort, setSort] = useState<Sort>(null);
  const rangeError = filtersError({ ...f, region: 'all' });
  const params = f.period === 'custom' ? { period: f.period, date: f.from, to: f.to } : { period: f.period, date: f.day };
  const { data, error, isLoading, mutate } = useSWR(
    rangeError ? null : (['bid-performance', params.period, params.date, params.to ?? '', includeArchived, ownerId] as const),
    () => api.getBidPerformance({ ...params, includeArchived, ownerId: ownerId || undefined }),
  );
  const today = isoDay(new Date());

  const rows = useMemo(() => {
    const list = data?.bidders ?? [];
    if (!sort) return list;
    const { key, dir } = sort;
    return [...list].sort((a, b) => {
      const x = sortValue(a, key);
      const y = sortValue(b, key);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return dir === 'desc' ? y - x : x - y;
    });
  }, [data, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s && s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }));

  const now = Date.now();
  const stale = staleBefore(new Date(now));
  const weeks = data?.weeks ?? [];
  const byId = new Map((data?.bidders ?? []).map((b) => [b.id, b]));

  const open = (id: string) => data && onOpenBidder(id, data.end);

  const cards: { label: string; ids: string[]; value: (r: BidPerformanceRow) => string }[] = data ? [
    { label: 'Most bids', ids: data.top.bids, value: (r) => fmtCount(r.total) },
    { label: 'Longest streak', ids: data.top.streak, value: (r) => `${fmtCount(r.longestStreak)} ${r.longestStreak === 1 ? 'day' : 'days'}` },
    { label: 'Most interviews', ids: data.top.interviews, value: (r) => fmtCount(r.interviews) },
    { label: 'Best conversion', ids: data.top.conversion, value: (r) => `${fixed(r.per100, 2)} / 100` },
  ] : [];

  const sortHead = (k: SortKey, label: string, title?: string) => {
    const active = sort?.key === k;
    const Icon = active ? (sort.dir === 'desc' ? ArrowDown : ArrowUp) : ChevronsUpDown;
    return (
      <th key={k} className="px-4 py-2.5 text-right" aria-sort={active ? (sort.dir === 'desc' ? 'descending' : 'ascending') : 'none'}>
        <button type="button" title={title} onClick={() => toggleSort(k)}
          className="inline-flex items-center gap-1 whitespace-nowrap uppercase hover:text-strong">
          {label}
          <Icon className={`h-3 w-3 ${active ? '' : 'opacity-40'}`} aria-hidden />
        </button>
      </th>
    );
  };

  return (
    <section className="space-y-4" aria-label="Bidder performance">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="Period" options={PERIODS} value={f.period} onChange={(period) => setFilters({ ...f, period })} />
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
          <PeriodNav period={f.period} day={f.day} label={data?.label} onDay={(day) => setFilters({ ...f, day })} />
        )}
      </div>

      {rangeError ? null : error ? (
        <div className="empty-state" role="status">
          <p className="empty-state-title">Couldn't load performance</p>
          <button type="button" className="btn-outline mt-3 text-xs" onClick={() => void mutate()}>Retry</button>
        </div>
      ) : isLoading || !data ? (
        <div className="space-y-3" aria-hidden>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-28 w-full" />)}
          </div>
          <div className="skeleton h-64 w-full" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {cards.map((c) => (
              <div key={c.label} className="stat-card flex flex-col p-4">
                <p className="stat-card-label">{c.label}</p>
                {c.ids.length === 0 ? (
                  <p className="stat-card-value mt-1 text-muted">—</p>
                ) : (
                  <ol className="mt-2 space-y-1">
                    {c.ids.slice(0, 3).map((id, i) => {
                      const r = byId.get(id);
                      if (!r) return null;
                      return (
                        <li key={id} className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="flex min-w-0 items-baseline gap-1.5">
                            <span className="text-xs text-muted tabular-nums">{i + 1}.</span>
                            <button type="button" className="truncate text-left font-medium text-strong hover:underline"
                              onClick={() => open(id)}>{r.name}</button>
                          </span>
                          <span className="shrink-0 tabular-nums text-muted">{c.value(r)}</span>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            ))}
          </div>

          {data.recordsStart && data.recordsStart.slice(0, 10) > data.start.slice(0, 10) && (
            <p className="text-xs text-muted">
              Bids before {dayLabel(data.recordsStart, true)} were counted from screenshot folders and aren't included.
            </p>
          )}

          {data.bidders.length === 0 ? (
            <div className="empty-state"><p className="empty-state-title">No bidders in this period</p></div>
          ) : (
            <div className="table-wrap overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Bidder</th>
                    {weeks.map((w, i) => (
                      sortHead(`w${i}`, `${dayLabel(w.start)}${w.partial ? '*' : ''}`,
                        `${dayLabel(w.start)} – ${dayLabel(w.end)}${w.partial ? ' (partial week)' : ''}`)
                    ))}
                    {sortHead("total", "Total", "Approved + pending bids; hover a value for the split")}
                    {sortHead("longestStreak", "Streak", "Longest run of weekdays with 50+ bids")}
                    {sortHead("hitRate", "Hit rate", "Weekdays with 50+ bids out of weekdays counted")}
                    {sortHead("avgPerWeekday", "Avg / weekday", "Total bids per weekday counted")}
                    {sortHead("interviews", "Interviews", "Interview rounds held on the bidder's profile")}
                    {sortHead("per100", "Per 100 bids", "Interviews per 100 bids")}
                    {sortHead("lastBidAt", "Last bid")}
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {rows.map((r) => {
                    const isStale = r.lastBidAt != null && new Date(r.lastBidAt).getTime() < stale;
                    return (
                      <tr key={r.id} className="table-row cursor-pointer border-t border-zinc-100 dark:border-zinc-800"
                        onClick={() => open(r.id)}>
                        <td className="px-4 py-2 text-left">
                          <button type="button" className="font-medium text-strong hover:underline"
                            onClick={(e) => { e.stopPropagation(); open(r.id); }}>{r.name}</button>
                          {(r.profileName || (isAdmin && r.ownerName)) && (
                            <div className="text-[11px] text-muted">
                              {[r.profileName, isAdmin ? r.ownerName : null].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </td>
                        {weeks.map((w, i) => (
                          <td key={w.start} className="px-4 py-2 text-right">{fmtCount(r.weekly[i] ?? 0)}</td>
                        ))}
                        <td className="px-4 py-2 text-right"
                          title={`${fmtCount(r.approved)} approved · ${fmtCount(r.pending)} pending · ${fmtCount(r.rejected)} rejected`}>
                          <div className="font-medium text-strong">{fmtCount(r.total)}</div>
                          <Change value={r.change} />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div>{fmtCount(r.longestStreak)}</div>
                          {r.currentStreak > 0 && <div className="text-[11px] text-muted">now {fmtCount(r.currentStreak)}</div>}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div>{pct(r.hitRate)}</div>
                          {r.weekdays > 0 && (
                            <div className="text-[11px] text-muted">{r.hitDays} of {r.weekdays} weekdays</div>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">{fixed(r.avgPerWeekday, 1)}</td>
                        <td className="px-4 py-2 text-right">
                          <div>{fmtCount(r.interviews)}</div>
                          {r.sharedProfile && (
                            <div className="text-[11px] text-muted"
                              title="Other bidders or self bids use this profile too, so its interviews come from their bids as well">
                              shared profile
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {r.per100 == null ? (
                            <span className="text-muted" title="Fewer than 100 bids">—</span>
                          ) : r.per100.toFixed(2)}
                        </td>
                        <td className={`px-4 py-2 text-right whitespace-nowrap ${isStale ? 'text-amber-700 dark:text-amber-300' : ''}`}
                          title={r.lastBidAt ? new Date(r.lastBidAt).toLocaleString() : undefined}>
                          {r.lastBidAt ? relativeTime(r.lastBidAt, now) : <span className="text-muted">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t border-zinc-200 font-medium text-strong dark:border-zinc-700">
                    <td className="px-4 py-2 text-left">Total</td>
                    {weeks.map((w, i) => (
                      <td key={w.start} className="px-4 py-2 text-right">
                        {fmtCount(data.bidders.reduce((s, r) => s + (r.weekly[i] ?? 0), 0))}
                      </td>
                    ))}
                    <td className="px-4 py-2 text-right">{fmtCount(data.totals.total)}</td>
                    <td className="px-4 py-2" />
                    <td className="px-4 py-2 text-right">{pct(data.totals.hitRate)}</td>
                    <td className="px-4 py-2 text-right">{fixed(data.totals.avgPerWeekday, 1)}</td>
                    <td className="px-4 py-2 text-right">{fmtCount(data.totals.interviews)}</td>
                    <td className="px-4 py-2 text-right">{fixed(data.totals.per100, 2)}</td>
                    <td className="px-4 py-2" />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
