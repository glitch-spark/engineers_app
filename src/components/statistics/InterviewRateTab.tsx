import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Rectangle,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import * as api from '../../api/endpoints';
import type { InterviewRateRow, InterviewRates, PerUserChart } from '../../api/endpoints';
import { useChartTheme } from '../../theme/useChartTheme';
import { useTheme } from '../../theme/ThemeProvider';
import AiUsageCard from './AiUsageCard';
import { FilterBar, REGIONS, filterParams, filtersError, type StatsFilters } from './controls';

/** Rate guide lines on the scatter (interviews ÷ bids); the ones that fit the plot are drawn. */
const GUIDE_RATES = [0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.3, 0.5];

/**
 * Series colors, validated with the dataviz palette checker on this app's surfaces (white / zinc-950): You = blue,
 * Team = orange (categorical slots 1 and 2). Other users are a neutral gray: identity there comes from each dot's
 * name label and the table, not color.
 */
function seriesColors(dark: boolean) {
  return dark
    ? { me: '#3987e5', team: '#d95926', other: '#a1a1aa', surface: '#09090b' }
    : { me: '#2a78d6', team: '#eb6834', other: '#71717a', surface: '#ffffff' };
}

/**
 * One hue per user on the bids and interviews charts: the dataviz categorical order, validated adjacent-pair on this app's surfaces.
 * A user keeps their slot's hue whatever the period or region; past the eighth they share a neutral gray.
 */
const USER_HUES = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
};
/** A bar's lighter part (bidder applies, stacked on self applies): the user's hue at this opacity. */
const FADED_OPACITY = 0.4;

function userHue(slot: number, dark: boolean): string {
  return USER_HUES[dark ? 'dark' : 'light'][slot] ?? seriesColors(dark).other;
}

function pct(rate: number | null | undefined): string {
  if (rate == null) return '—';
  const v = rate * 100;
  return `${v > 0 && v < 1 ? v.toFixed(2) : v.toFixed(1)}%`; // plan-based rates are often under 1%
}

/** Bids as "self (+bidder)" under All, where bidder applies are known; just the number in a region. */
function BidsCell({ self, bidder, split }: { self: number; bidder: number; split: boolean }) {
  return (
    <span title={split ? `${self.toLocaleString()} self + ${bidder.toLocaleString()} by bidders` : 'Self applies typed for this region'}>
      {self.toLocaleString()}
      {split && <span className="ml-1 text-muted">(+{bidder.toLocaleString()})</span>}
    </span>
  );
}

/** A round number at or above `n`, for axis tops: steps of 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8 × 10^k keep the plot tight. */
function niceCeil(n: number): number {
  const p = 10 ** Math.floor(Math.log10(Math.max(n, 1)));
  return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * p).find((v) => v >= n) ?? 10 * p;
}

/** AI usage first, then every user's interview rate in one view: the ranked table, bids and interviews per user,
 * and the scatter. AI usage keeps its own period: it goes down to the hour. */
export default function InterviewRateTab({ filters, onFilters }: { filters: StatsFilters; onFilters: (f: StatsFilters) => void }) {
  const params = filterParams(filters);
  const { data, error, isLoading } = useSWR(
    filtersError(filters) ? null : ['interview-rates', params.period, params.date, params.to, params.region],
    () => api.getInterviewRates(params),
    { keepPreviousData: true },
  );
  const region = data?.region ?? filters.region;

  return (
    <div className="space-y-4">
      <FilterBar value={filters} onChange={onFilters}>
        {isLoading && data && <span className="spinner spinner-sm" role="status" aria-label="Loading" />}
      </FilterBar>
      <AiUsageCard />

      {error ? (
        <p className="panel p-6 text-sm text-red-700 dark:text-red-400">Couldn’t load the statistics. Try again.</p>
      ) : !data ? (
        <p className="panel flex items-center gap-2 p-6 text-sm text-muted" role="status">
          <span className="spinner spinner-sm" aria-hidden /> Loading statistics…
        </p>
      ) : (
        <>
          <p className="text-xs text-muted">
            Bids are the applies Done in followed-up daily plans.{' '}
            {region === 'all'
              ? 'All counts self and bidder applies.'
              : region === 'US'
                ? 'US counts the self applies typed for US plus the bidder applies (bidders apply to US jobs only).'
                : `${REGIONS.find((r) => r.value === region)?.label} counts the self applies typed for it.`}
            {region !== 'all' && data.unassignedProfiles > 0 && (
              <>
                {' '}Interviews follow their profile’s region: {data.unassignedProfiles} profile
                {data.unassignedProfiles === 1 ? ' has' : 's have'} none.{' '}
                <Link to="/accounts" className="link">Set regions</Link>
              </>
            )}
          </p>
          <RateTable data={data} />
          <PerUserCharts data={data} />
          <RateScatter data={data} />
        </>
      )}
    </div>
  );
}

type ChartUser = PerUserChart['users'][number];
type ChartBucket = PerUserChart['buckets'][number];
/** A bar's parts, bottom to top; a faded part is drawn lighter in the user's hue. */
type Part = { key: string; label: string; faded?: boolean };

/** Each user's initial for the bar labels; users sharing one get two letters. */
function initialsFor(users: ChartUser[]): Record<string, string> {
  const first = (n: string) => n.trim().charAt(0).toUpperCase();
  return Object.fromEntries(users.map((u) => {
    const shared = users.some((o) => o.userId !== u.userId && first(o.name) === first(u.name));
    return [u.userId, shared ? u.name.trim().slice(0, 2) : first(u.name)];
  }));
}

function PerUserTip({ active, payload, chart: pc, parts }: {
  active?: boolean; payload?: { payload: ChartBucket }[]; chart: PerUserChart; parts: Part[];
}) {
  const chart = useChartTheme();
  const { theme } = useTheme();
  const b = active && payload?.[0]?.payload;
  if (!b) return null;
  return (
    <div className="rounded-md border px-3 py-2 text-xs shadow-sm"
      style={{ background: chart.tooltipBg, borderColor: chart.tooltipBorder, color: chart.tooltipText }}>
      <div className="mb-1 font-medium">{b.label}</div>
      <table className="tabular-nums">
        <tbody>
          {pc.users.map((u) => {
            const v = b.values[u.userId] ?? {};
            return (
              <tr key={u.userId}>
                <td className="pr-3">
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-sm" style={{ background: userHue(u.slot, theme === 'dark') }} aria-hidden />
                  {u.isMe ? `${u.name} (you)` : u.name}
                </td>
                <td className="text-right font-medium">{parts.reduce((n, p) => n + (v[p.key] ?? 0), 0).toLocaleString()}</td>
                {parts.length > 1 && (
                  <td className="pl-2 text-muted">{parts.map((p) => `${(v[p.key] ?? 0).toLocaleString()} ${p.label}`).join(' + ')}</td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Bids, then interviews: one bar per user each day (week) or week (month), oldest account first. */
function PerUserCharts({ data }: { data: InterviewRates }) {
  const unit = data.bidsChart.unit;
  const seen = new Map([...data.bidsChart.users, ...data.interviewsChart.users].map((u) => [u.userId, u]));
  const initials = initialsFor([...seen.values()]);
  return (
    <>
      <PerUserBars id="ir-bids" title="Bids per user" chart={data.bidsChart} initials={initials} period={data.label}
        note={`Each ${unit}, one bar per user${data.bidderSplit ? ': self applies at the bottom, bidder applies on top' : ''}.`}
        empty="No bids in this period."
        parts={data.bidderSplit
          ? [{ key: 'self', label: 'self' }, { key: 'bidder', label: 'bidder', faded: true }]
          : [{ key: 'self', label: 'self' }]} />
      <PerUserBars id="ir-interviews" title="Interviews per user" chart={data.interviewsChart} initials={initials}
        period={data.label} note={`Each ${unit}, one bar per user: interview rounds held.`}
        empty="No interviews in this period." parts={[{ key: 'interviews', label: 'interviews' }]} />
    </>
  );
}

function PerUserBars({ id, title, note, empty, chart: pc, parts, initials, period }: {
  id: string; title: string; note: string; empty: string; chart: PerUserChart; parts: Part[];
  initials: Record<string, string>; period: string;
}) {
  const chart = useChartTheme();
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const rows = pc.buckets.map((b) => {
    const row: Record<string, number | string> = { label: b.label };
    for (const u of pc.users) parts.forEach((p, i) => { row[`${i}_${u.userId}`] = b.values[u.userId]?.[p.key] ?? 0; });
    return { ...b, ...row };
  });
  const total = (b: ChartBucket | undefined, u: ChartUser) => parts.reduce((n, p) => n + (b?.values[u.userId]?.[p.key] ?? 0), 0);
  // Each bar is topped with its user's initial and total, running upward so neighbours' labels never collide. Bars
  // too thin for the text (narrow screens) leave it to the tooltip.
  const label = (u: ChartUser) =>
    (p: { x?: number | string; y?: number | string; width?: number | string; index?: number }) => {
      const n = total(pc.buckets[p.index ?? -1], u);
      if (!n || Number(p.width) < 11) return null;
      const x = Number(p.x) + Number(p.width) / 2;
      const y = Number(p.y) - 4;
      return (
        <text x={x} y={y} transform={`rotate(-90 ${x} ${y})`} dominantBaseline="central" fill={chart.tooltipText}
          fontSize={10} style={{ fontVariantNumeric: 'tabular-nums' }}>
          <tspan fontWeight={600}>{initials[u.userId]}</tspan> {n.toLocaleString()}
        </text>
      );
    };
  // The top part gets the 4px rounded end; a 2px surface gap separates it from the parts below.
  const segment = (u: ChartUser, i: number) =>
    (props: { x?: number; y?: number; width?: number; height?: number; payload?: ChartBucket }) => {
      const { x = 0, y = 0, width = 0, height = 0, payload } = props;
      const v = payload?.values[u.userId] ?? {};
      if (!height) return <g />;
      const top = parts.slice(i + 1).every((p) => !v[p.key]);
      const h = parts.slice(0, i).some((p) => v[p.key]) ? Math.max(0, height - 2) : height;
      return (
        <Rectangle x={x} y={y} width={width} height={h} radius={top ? [4, 4, 0, 0] : 0}
          fill={userHue(u.slot, dark)} fillOpacity={parts[i].faded ? FADED_OPACITY : 1} />
      );
    };

  return (
    <section className="panel p-4" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="card-title">{title}</h2>
      <p className="mb-3 text-xs text-muted">{note}</p>
      {pc.users.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">{empty}</p>
      ) : (
        <div className="h-72" role="img" aria-label={`${title} each ${pc.unit}, ${period}. Hover a ${pc.unit} for every value.`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 48, right: 16, bottom: 0, left: 4 }} barGap={2} barCategoryGap="18%">
              <CartesianGrid stroke={chart.grid} vertical={false} />
              <XAxis dataKey="label" stroke={chart.axis} tick={{ fill: chart.axis, fontSize: 12 }} />
              <YAxis allowDecimals={false} stroke={chart.axis} tick={{ fill: chart.axis, fontSize: 12 }} width={44} />
              <Tooltip cursor={{ fill: chart.grid, opacity: 0.5 }} content={<PerUserTip chart={pc} parts={parts} />} />
              {pc.users.flatMap((u) => parts.map((_, i) => (
                <Bar key={`${i}_${u.userId}`} dataKey={`${i}_${u.userId}`} stackId={u.userId} isAnimationActive={false}
                  fill={userHue(u.slot, dark)} shape={segment(u, i)}>
                  {i === parts.length - 1 && <LabelList content={label(u)} />}
                </Bar>
              )))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
        {pc.users.map((u) => (
          <li key={u.userId} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: userHue(u.slot, dark) }} aria-hidden />
            <span className="font-medium text-strong">{initials[u.userId]}</span>
            {u.isMe ? `${u.name} (you)` : u.name}
          </li>
        ))}
        {parts.some((p) => p.faded) && pc.users.length > 0 && (
          <li className="inline-flex items-center gap-1.5">
            <span className="inline-flex flex-col gap-px" aria-hidden>
              <span className="h-1.5 w-2.5 rounded-t-sm" style={{ background: chart.axis, opacity: FADED_OPACITY }} />
              <span className="h-1.5 w-2.5" style={{ background: chart.axis }} />
            </span>
            Light top = {parts.filter((p) => p.faded).map((p) => p.label).join(', ')}, solid = {parts.find((p) => !p.faded)?.label}
          </li>
        )}
      </ul>
    </section>
  );
}

function ScatterTip({ active, payload, minBids }: { active?: boolean; payload?: { payload: InterviewRateRow }[]; minBids: number }) {
  const chart = useChartTheme();
  const r = active && payload?.[0]?.payload;
  if (!r) return null;
  return (
    <div className="rounded-md border px-3 py-2 text-xs shadow-sm"
      style={{ background: chart.tooltipBg, borderColor: chart.tooltipBorder, color: chart.tooltipText }}>
      <div className="font-medium">{r.isMe ? `${r.name} (you)` : r.name}</div>
      <div className="tabular-nums">
        {r.bids.toLocaleString()} bids{r.bidderBids ? ` (${r.selfBids.toLocaleString()} self + ${r.bidderBids.toLocaleString()} bidder)` : ''} ·{' '}
        {r.interviews} interviews · {pct(r.rate)}
      </div>
      {r.lowVolume && <div className="text-muted">Under {minBids} bids: not ranked</div>}
    </div>
  );
}

function RateScatter({ data }: { data: InterviewRates }) {
  const chart = useChartTheme();
  const { theme } = useTheme();
  const c = seriesColors(theme === 'dark');
  const points = data.rows.map((r) => ({ ...r, label: r.isMe ? 'You' : r.name }));
  const xMax = niceCeil(Math.max(10, ...points.map((p) => p.bids)) * 1.1);
  const yMax = niceCeil(Math.max(5, ...points.map((p) => p.interviews)) * 1.2);
  // Where a rate's line leaves the plot: the right edge, else the top.
  const edge = (r: number) => (r * xMax <= yMax ? { x: xMax, y: r * xMax } : { x: yMax / r, y: yMax });
  const team = data.totals.rate;
  const guides = GUIDE_RATES
    .filter((r) => r * xMax >= yMax * 0.08 && yMax / r >= xMax * 0.08)
    .sort((a, b) => Math.abs(Math.log(a / (team || 0.05))) - Math.abs(Math.log(b / (team || 0.05))))
    .slice(0, 3);

  return (
    <section className="panel p-4" aria-labelledby="ir-scatter-title">
      <h2 id="ir-scatter-title" className="card-title">Bids vs interviews</h2>
      <p className="mb-3 text-xs text-muted">
        Each dot is a person. Higher than a diagonal line means a better rate than that line.
      </p>
      {points.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">No bids or interviews in this period.</p>
      ) : (
        <div className="h-80" role="img" aria-label={`Bids against interviews per person, ${data.label}. The table below has every value.`}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 48, bottom: 24, left: 4 }}>
              <CartesianGrid stroke={chart.grid} />
              <XAxis type="number" dataKey="bids" name="Bids" domain={[0, xMax]} stroke={chart.axis} tick={{ fill: chart.axis, fontSize: 12 }}
                label={{ value: 'Bids', position: 'insideBottom', offset: -12, fill: chart.axis, fontSize: 12 }} />
              <YAxis type="number" dataKey="interviews" name="Interviews" domain={[0, yMax]} allowDecimals={false} stroke={chart.axis}
                tick={{ fill: chart.axis, fontSize: 12 }} width={44}
                label={{ value: 'Interviews', angle: -90, position: 'insideLeft', offset: 12, fill: chart.axis, fontSize: 12 }} />
              {guides.map((r) => (
                <ReferenceLine key={r} segment={[{ x: 0, y: 0 }, edge(r)]} stroke={chart.tooltipBorder} strokeWidth={1}
                  ifOverflow="hidden" label={{ value: `${+(r * 100).toFixed(2)}%`, position: 'insideTopRight', fill: chart.axis, fontSize: 11 }} />
              ))}
              {team != null && team > 0 && (
                <ReferenceLine segment={[{ x: 0, y: 0 }, edge(team)]} stroke={c.team} strokeWidth={2} ifOverflow="hidden" />
              )}
              <Tooltip cursor={false} content={<ScatterTip minBids={data.minBids} />} />
              <Scatter
                data={points}
                isAnimationActive={false}
                shape={(props: { cx?: number; cy?: number; payload?: InterviewRateRow }) => {
                  const { cx = 0, cy = 0, payload } = props;
                  const color = payload?.isMe ? c.me : c.other;
                  const hollow = payload?.lowVolume;
                  return (
                    <g>
                      <circle cx={cx} cy={cy} r={12} fill="transparent" />
                      <circle cx={cx} cy={cy} r={payload?.isMe ? 6 : 5} fill={hollow ? c.surface : color}
                        stroke={hollow ? color : c.surface} strokeWidth={2} />
                    </g>
                  );
                }}
              >
                <LabelList
                  dataKey="label"
                  content={(p: { x?: number | string; y?: number | string; width?: number | string; height?: number | string; value?: unknown }) => (
                    <text x={Number(p.x) + Number(p.width) / 2 + 10} y={Number(p.y) + Number(p.height) / 2} dy="0.35em"
                      fill={chart.tooltipText} fontSize={12} style={{ whiteSpace: 'pre' }}>
                      {String(p.value ?? '')}
                    </text>
                  )}
                />
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
        <li className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c.me }} aria-hidden />You</li>
        <li className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c.other }} aria-hidden />Others</li>
        <li className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: c.other }} aria-hidden />Under {data.minBids} bids (not ranked)
        </li>
        <li className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: c.team }} aria-hidden />Team rate {pct(team)}</li>
        <li className="inline-flex items-center gap-1.5"><span className="h-px w-4" style={{ background: chart.axis }} aria-hidden />Rate guide</li>
      </ul>
    </section>
  );
}

type SortKey = 'rank' | 'name' | 'bids' | 'interviews' | 'rate';

function RateTable({ data }: { data: InterviewRates }) {
  const { theme } = useTheme();
  const c = seriesColors(theme === 'dark');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'rank', desc: false });
  // Bars scale to the best ranked rate: one lucky low-volume rate shouldn't flatten everyone else's.
  const best = Math.max(0, ...data.rows.filter((r) => !r.lowVolume).map((r) => r.rate ?? 0));
  const rows = useMemo(() => {
    const val = (r: InterviewRateRow): number | string => {
      if (sort.key === 'name') return r.name.toLowerCase();
      if (sort.key === 'rank') return r.rank ?? Number.MAX_SAFE_INTEGER;
      return (r[sort.key] as number | null) ?? -1;
    };
    return [...data.rows].sort((a, b) => {
      const x = val(a), y = val(b);
      const cmp = x < y ? -1 : x > y ? 1 : 0;
      return sort.desc ? -cmp : cmp;
    });
  }, [data.rows, sort]);

  const header = (key: SortKey, label: string, align = 'text-left') => {
    const active = sort.key === key;
    return (
      <th scope="col" className={`px-3 py-2.5 ${align}`} aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : undefined}>
        <button
          type="button"
          className="inline-flex items-center gap-1 font-medium uppercase hover:text-strong"
          // Numbers sort high-first on the first click; rank and name low-first.
          onClick={() => setSort({ key, desc: active ? !sort.desc : key !== 'rank' && key !== 'name' })}
        >
          {label}
          {active && <span aria-hidden className="text-[10px] text-muted">{sort.desc ? '▼' : '▲'}</span>}
        </button>
      </th>
    );
  };

  return (
    <section className="panel overflow-hidden" aria-labelledby="ir-table-title">
      <h2 id="ir-table-title" className="card-title px-4 pt-4">Ranking · {data.label}</h2>
      <p className="px-4 pb-3 text-xs text-muted">
        Rate = interviews ÷ bids. People with fewer than {data.minBids} bids are listed but not ranked.
      </p>
      <div className="table-wrap rounded-none border-0">
        <table className="min-w-full text-sm">
          <caption className="sr-only">Bids, interviews and interview rate per person</caption>
          <thead className="table-head">
            <tr>
              {header('rank', '#')}
              {header('name', 'User')}
              {header('bids', data.bidderSplit ? 'Bids self (+bidder)' : 'Bids (self)', 'text-right')}
              {header('interviews', 'Interviews', 'text-right')}
              {header('rate', 'Rate')}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-muted">No bids or interviews in this period.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.userId} className={r.isMe ? 'bg-sky-50 dark:bg-sky-950/30' : 'table-row'}>
                <td className="px-3 py-2.5 tabular-nums text-muted">{r.rank ?? '—'}</td>
                <td className="px-3 py-2.5 font-medium text-strong">
                  {r.name}{r.isMe && <span className="badge badge-info ml-2">You</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                  <BidsCell self={r.selfBids} bidder={r.bidderBids} split={data.bidderSplit} />
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.interviews.toLocaleString()}</td>
                <td className="px-3 py-2.5">
                  <span className="flex items-center gap-2" title={r.lowVolume ? `Under ${data.minBids} bids: not ranked` : undefined}>
                    <span className={`w-14 tabular-nums ${r.lowVolume ? 'text-faint' : 'font-medium text-strong'}`}>{pct(r.rate)}</span>
                    <span className="h-1.5 w-24 rounded-full bg-zinc-100 dark:bg-zinc-800" aria-hidden>
                      <span className="block h-1.5 rounded-full"
                        style={{
                          width: `${best ? Math.min(100, Math.round(((r.rate ?? 0) / best) * 100)) : 0}%`,
                          background: r.isMe ? c.me : c.other,
                          opacity: r.lowVolume ? 0.4 : 1,
                        }} />
                    </span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-zinc-200 font-medium dark:border-zinc-800">
                <td className="px-3 py-2.5" />
                <td className="px-3 py-2.5 text-strong">Team total</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                  <BidsCell self={data.totals.selfBids} bidder={data.totals.bidderBids} split={data.bidderSplit} />
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{data.totals.interviews.toLocaleString()}</td>
                <td className="px-3 py-2.5 tabular-nums">{pct(data.totals.rate)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}
