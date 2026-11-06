import type { ReactNode } from 'react';
import useSWR from 'swr';
import { Bar, BarChart, CartesianGrid, LabelList, Rectangle, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import * as api from '../../api/endpoints';
import type { InterviewRates, PerUserChart } from '../../api/endpoints';
import { useChartTheme } from '../../theme/useChartTheme';
import { useTheme } from '../../theme/ThemeProvider';
import { FilterBar, filterParams, filtersError, type StatsFilters } from './controls';

/** What the Bids and Interviews tabs share: the report (one SWR key, so switching tabs doesn't refetch), the filter
 * bar with its loading and error states, the per-user bar chart and its colors. */

/** GET /metrics/interview-rates for the filters; null key while the filters are invalid. */
export function useInterviewRates(filters: StatsFilters) {
  const params = filterParams(filters);
  return useSWR(
    filtersError(filters) ? null : ['interview-rates', params.period, params.date, params.to, params.region],
    () => api.getInterviewRates(params),
    { keepPreviousData: true },
  );
}

/** A period that starts before Bid Track's first record has no bidder bids for those days: say so. `rates` adds
 * what that does to interviews per bid and the ranking (the Interviews tab). */
export function RecordsNote({ data, rates }: { data: InterviewRates; rates?: boolean }) {
  if (!data.bidsRecordsStart || data.start >= data.bidsRecordsStart) return null;
  const first = new Date(`${data.bidsRecordsStart}T00:00:00Z`)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  return (
    <p className="text-xs text-amber-700 dark:text-amber-300" role="note">
      Bidder bids are counted from Bid Track, which starts {first}.
      {rates && ' Before that, bids are self bids only, so interviews per bid and the ranking run high for this period.'}
    </p>
  );
}

/** A row of headline numbers. */
export function StatTiles({ tiles }: { tiles: { label: string; value: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="stat-card p-4">
          <p className="stat-card-label">{t.label}</p>
          <p className="stat-card-value mt-1 tabular-nums">{t.value}</p>
        </div>
      ))}
    </div>
  );
}

/** The filter bar, then the tab's content once the report is loaded (loading and error states otherwise). */
export function StatsBody({ filters, onFilters, children }: {
  filters: StatsFilters; onFilters: (f: StatsFilters) => void; children: (data: InterviewRates) => ReactNode;
}) {
  const { data, error, isLoading } = useInterviewRates(filters);
  return (
    <div className="space-y-4">
      <FilterBar value={filters} onChange={onFilters}>
        {isLoading && data && <span className="spinner spinner-sm" role="status" aria-label="Loading" />}
      </FilterBar>
      {error ? (
        <p className="panel p-6 text-sm text-red-700 dark:text-red-400">Couldn’t load the statistics. Try again.</p>
      ) : !data ? (
        <p className="panel flex items-center gap-2 p-6 text-sm text-muted" role="status">
          <span className="spinner spinner-sm" aria-hidden /> Loading statistics…
        </p>
      ) : children(data)}
    </div>
  );
}

/**
 * Series colors, validated with the dataviz palette checker on this app's surfaces (white / zinc-950): You = blue,
 * Team = orange (categorical slots 1 and 2). Other users are a neutral gray: identity there comes from each dot's
 * name label and the table, not color.
 */
export function seriesColors(dark: boolean) {
  return dark
    ? { me: '#3987e5', team: '#d95926', other: '#a1a1aa', surface: '#09090b' }
    : { me: '#2a78d6', team: '#eb6834', other: '#71717a', surface: '#ffffff' };
}

/**
 * One hue per user on the bids and interviews charts: the dataviz categorical order, validated adjacent-pair on this app's surfaces.
 * A user keeps their slot's hue whatever the period or region; past the eighth they share a neutral gray.
 */
export const USER_HUES = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
};
/** A bar's lighter part (bidder applies, stacked on self applies): the user's hue at this opacity. */
export const FADED_OPACITY = 0.4;

export function userHue(slot: number, dark: boolean): string {
  return USER_HUES[dark ? 'dark' : 'light'][slot] ?? seriesColors(dark).other;
}

export function pct(rate: number | null | undefined): string {
  if (rate == null) return '—';
  const v = rate * 100;
  return `${v > 0 && v < 1 ? v.toFixed(2) : v.toFixed(1)}%`; // plan-based rates are often under 1%
}

/** A round number at or above `n`, for axis tops: steps of 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8 × 10^k keep the plot tight. */
export function niceCeil(n: number): number {
  const p = 10 ** Math.floor(Math.log10(Math.max(n, 1)));
  return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * p).find((v) => v >= n) ?? 10 * p;
}

type ChartUser = PerUserChart['users'][number];
type ChartBucket = PerUserChart['buckets'][number];
/** A bar's parts, bottom to top; a faded part is drawn lighter in the user's hue. */
export type Part = { key: string; label: string; faded?: boolean };

/** Each user's initial for the bar labels; users sharing one get two letters. */
export function initialsFor(users: ChartUser[]): Record<string, string> {
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

export function PerUserBars({ id, title, note, empty, chart: pc, parts, initials, period }: {
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
