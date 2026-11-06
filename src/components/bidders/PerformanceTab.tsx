import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { ArrowDown, ArrowUp, ChevronsUpDown, Info } from 'lucide-react';
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

/** Bids a weekday needs to be a 50+ day (the server's TARGET). */
const TARGET = 50;

const utcDay = (day: string) => new Date(`${day.slice(0, 10)}T00:00:00Z`);

/** A week column's dates: `Nov 1 (Sun)` for one day, `Nov 2–5`, or `Oct 27–Nov 2` across months. */
function weekLabel(w: { start: string; end: string }): string {
  if (w.start === w.end) {
    return `${dayLabel(w.start)} (${utcDay(w.start).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })})`;
  }
  const s = utcDay(w.start);
  const e = utcDay(w.end);
  return s.getUTCMonth() === e.getUTCMonth() ? `${dayLabel(w.start)}–${e.getUTCDate()}` : `${dayLabel(w.start)}–${dayLabel(w.end)}`;
}

const HELP = {
  total: 'Approved + pending bids in the period. Rejected bids don\'t count. Hover a value for the split.',
  streak: `Weekdays in a row with ${TARGET}+ approved + pending bids (a ${TARGET}+ day). Weekends are skipped and never break a streak. Today counts once it reaches ${TARGET}.`,
  hitRate: `Share of the bidder's weekdays in the period that were ${TARGET}+ days. One dot per weekday: filled = ${TARGET}+, hollow = under ${TARGET}, amber = today so far, faint = not active yet.`,
  avg: 'Total bids divided by the weekdays counted for the hit rate.',
  interviews: 'Interview rounds held in the period on interviews where this bidder applied ("Applied by" on the interview), plus untagged older interviews on the bidder\'s profile. Canceled rounds, AI interviews and home assessments don\'t count.',
  per100: 'Interviews per 100 bids, shown from 100 bids.',
};

const DOT: Record<BidPerformanceRow['days'][number]['state'], { cls: string; text: string }> = {
  hit: { cls: 'bg-emerald-500 dark:bg-emerald-400', text: `${TARGET}+ day` },
  miss: { cls: 'border border-zinc-400 dark:border-zinc-500', text: `under ${TARGET}` },
  open: { cls: 'border border-amber-500 bg-amber-200 dark:bg-amber-500/40', text: `today so far, not ${TARGET} yet` },
  none: { cls: 'bg-zinc-200 dark:bg-zinc-700', text: 'not active (not created yet or archived)' },
};

function Dot({ state }: { state: keyof typeof DOT }) {
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${DOT[state].cls}`} aria-hidden />;
}

/** One dot per weekday, grouped by week, each with its date and bids on hover. */
function DayStrip({ days }: { days: BidPerformanceRow['days'] }) {
  const weeks: BidPerformanceRow['days'][] = [];
  let monday = '';
  for (const d of days) {
    const date = utcDay(d.day);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const key = date.toISOString().slice(0, 10);
    if (key !== monday) {
      weeks.push([]);
      monday = key;
    }
    weeks[weeks.length - 1].push(d);
  }
  return (
    <div className="mt-1 flex flex-wrap justify-end gap-x-1.5 gap-y-1" aria-hidden>
      {weeks.map((w) => (
        <span key={w[0].day} className="flex gap-0.5">
          {w.map((d) => (
            <span key={d.day} title={`${utcDay(d.day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}: ${fmtCount(d.bids)} bids · ${DOT[d.state].text}`}>
              <Dot state={d.state} />
            </span>
          ))}
        </span>
      ))}
    </div>
  );
}

/** "N untagged, shared with Bo": interviews without "Applied by" on a shared profile count for every bidder on it. */
function sharedNote(r: BidPerformanceRow): { text: string; title: string } | null {
  if (!r.sharedProfile || r.untaggedInterviews === 0) return null;
  const who = [...r.sharedWith, ...(r.profileSelfBids ? ["owner's self bids"] : [])];
  const n = r.untaggedInterviews;
  return {
    text: `${n} untagged${who.length ? `, shared with ${who.join(', ')}` : ''}`,
    title: `${n} ${n === 1 ? 'interview has' : 'interviews have'} no "Applied by" yet, so ${n === 1 ? 'it counts' : 'they count'} for every bidder on ${r.profileName || 'this profile'}${who.length ? ` (also ${who.join(' and ')})` : ''}. Set "Applied by" on the interview to credit the right one.`,
  };
}

const HELP_KEY = 'bidders.performance.help';

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
  const [helpOpen, setHelpOpen] = useState(() => {
    try {
      return localStorage.getItem(HELP_KEY) !== 'closed';
    } catch {
      return true;
    }
  });
  const toggleHelp = (open: boolean) => {
    setHelpOpen(open);
    try {
      localStorage.setItem(HELP_KEY, open ? 'open' : 'closed');
    } catch {
      /* the panel just won't remember */
    }
  };
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

  /** A sortable header; `help` adds an info icon whose hover text explains the column. */
  const sortHead = (k: SortKey, label: string, title?: string, help?: string) => {
    const active = sort?.key === k;
    const Icon = active ? (sort.dir === 'desc' ? ArrowDown : ArrowUp) : ChevronsUpDown;
    return (
      <th key={k} className="px-4 py-2.5 text-right" aria-sort={active ? (sort.dir === 'desc' ? 'descending' : 'ascending') : 'none'}>
        <span className="inline-flex items-center gap-1">
          {help && (
            <span title={help} className="cursor-help text-muted hover:text-strong">
              <Info className="h-3 w-3" aria-hidden />
              <span className="sr-only">{help}</span>
            </span>
          )}
          <button type="button" title={title ?? help} onClick={() => toggleSort(k)}
            className="inline-flex items-center gap-1 whitespace-nowrap uppercase hover:text-strong">
            {label}
            <Icon className={`h-3 w-3 ${active ? '' : 'opacity-40'}`} aria-hidden />
          </button>
        </span>
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

          {data.bidders.length > 0 && (
            <details className="panel text-sm" open={helpOpen}
              onToggle={(e) => toggleHelp((e.currentTarget as HTMLDetailsElement).open)}>
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-xs text-muted">
                <span className="font-medium text-strong">How to read streaks and hit rate</span>
                <span className="inline-flex items-center gap-1.5"><Dot state="hit" /> {TARGET}+ bids</span>
                <span className="inline-flex items-center gap-1.5"><Dot state="miss" /> under {TARGET}</span>
                <span className="inline-flex items-center gap-1.5"><Dot state="open" /> today so far</span>
                <span className="inline-flex items-center gap-1.5"><Dot state="none" /> not active</span>
              </summary>
              <dl className="grid gap-x-6 gap-y-2 border-t border-zinc-100 px-4 py-3 text-xs sm:grid-cols-2 dark:border-zinc-800">
                <div>
                  <dt className="font-medium text-strong">{TARGET}+ day</dt>
                  <dd className="text-muted">A weekday (Mon–Fri) with {TARGET} or more approved + pending bids. Days run to 6:30 pm Central, as in Bid Track.</dd>
                </div>
                <div>
                  <dt className="font-medium text-strong">Streak</dt>
                  <dd className="text-muted">{TARGET}+ days in a row. "Best" is the longest run in the period, "current" the run still going. Weekends are skipped and never break it; a weekday under {TARGET} does.</dd>
                </div>
                <div>
                  <dt className="font-medium text-strong">Hit rate</dt>
                  <dd className="text-muted">{TARGET}+ days out of the bidder's weekdays in the period. Days before the bidder was added, or after it was archived, don't count. Today counts once it reaches {TARGET}.</dd>
                </div>
                <div>
                  <dt className="font-medium text-strong">Interviews</dt>
                  <dd className="text-muted">Rounds held on interviews this bidder applied for ("Applied by" on the interview). Older interviews without "Applied by" count for every bidder on their profile until someone sets it.</dd>
                </div>
              </dl>
            </details>
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
                      sortHead(`w${i}`, weekLabel(w),
                        `Bids ${dayLabel(w.start)} – ${dayLabel(w.end)}${w.partial ? ' (part of the week)' : ''}`)
                    ))}
                    {sortHead('total', 'Total', undefined, HELP.total)}
                    {sortHead('longestStreak', 'Streak', undefined, HELP.streak)}
                    {sortHead('hitRate', 'Hit rate', undefined, HELP.hitRate)}
                    {sortHead('avgPerWeekday', 'Avg / weekday', undefined, HELP.avg)}
                    {sortHead('interviews', 'Interviews', undefined, HELP.interviews)}
                    {sortHead('per100', 'Per 100 bids', undefined, HELP.per100)}
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
                          <div>{fmtCount(r.longestStreak)} {r.longestStreak === 1 ? 'day' : 'days'}</div>
                          {r.weekdays > 0 && (
                            <div className="whitespace-nowrap text-[11px] text-muted">
                              current {fmtCount(r.currentStreak)} · best {fmtCount(r.longestStreak)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div>{pct(r.hitRate)}</div>
                          {r.weekdays > 0 && (
                            <div className="whitespace-nowrap text-[11px] text-muted">
                              {r.hitDays} of {r.weekdays} weekdays at {TARGET}+
                            </div>
                          )}
                          {r.days.length > 0 && r.days.length <= 31 && <DayStrip days={r.days} />}
                        </td>
                        <td className="px-4 py-2 text-right">{fixed(r.avgPerWeekday, 1)}</td>
                        <td className="px-4 py-2 text-right">
                          <div>{fmtCount(r.interviews)}</div>
                          {(() => {
                            const note = sharedNote(r);
                            return note && (
                              <div className="ml-auto max-w-[12rem] text-[11px] text-muted" title={note.title}>{note.text}</div>
                            );
                          })()}
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
