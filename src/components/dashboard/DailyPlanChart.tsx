import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Link } from 'react-router-dom';
import { ArrowRight, Loader2 } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  type TooltipProps,
} from 'recharts';
import * as api from '../../api/endpoints';
import { useAuth } from '../../auth/useAuth';
import { useChartTheme } from '../../theme/useChartTheme';
import { useTheme } from '../../theme/ThemeProvider';
import { todayInputValue } from '../../lib/week';

type Bucket = api.DailyPlanStats['bucket'];

const BUCKETS: { label: string; value: Bucket; window: string }[] = [
  { label: 'Daily', value: 'day', window: 'last 14 days' },
  { label: 'Weekly', value: 'week', window: 'last 12 weeks' },
  { label: 'Monthly', value: 'month', window: 'last 12 months' },
];

const VIEWS = [
  { label: 'Chart', value: 'chart' },
  { label: 'Table', value: 'table' },
] as const;

type Series = { key: keyof api.DailyPlanCounts; label: string; stack: 'bids' | 'interviews' };

// Bottom segment first: each stack is hands-on under bidder, done under new.
const SERIES: Series[] = [
  { key: 'bidsHandsOn', label: 'Bids · hands-on', stack: 'bids' },
  { key: 'bidsByBidder', label: 'Bids · by bidder', stack: 'bids' },
  { key: 'interviewsDone', label: 'Interviews · done', stack: 'interviews' },
  { key: 'interviewsNew', label: 'Interviews · new invitations', stack: 'interviews' },
];

// Checked with the dataviz palette validator for each surface; the lighter
// steps sit under 3:1 on white, so the legend and table view carry identity.
const COLORS: Record<'light' | 'dark', Record<Series['key'], string>> = {
  light: { bidsHandsOn: '#1d4ed8', bidsByBidder: '#60a5fa', interviewsDone: '#b45309', interviewsNew: '#f59e0b' },
  dark: { bidsHandsOn: '#2556e0', bidsByBidder: '#5a8ef0', interviewsDone: '#9c4c08', interviewsNew: '#c9820c' },
};

function localDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function bucketLabel(row: api.DailyPlanStatsRow, bucket: Bucket): string {
  const d = localDate(row.bucketStart);
  if (bucket === 'month') return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function bucketTitle(row: api.DailyPlanStatsRow, bucket: Bucket): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const start = localDate(row.bucketStart);
  if (bucket === 'day') return start.toLocaleDateString(undefined, { weekday: 'short', ...opts });
  if (bucket === 'month') return start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const end = localDate(row.bucketEnd);
  return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`;
}

/** Bids per new interview invitation, e.g. `12.5 : 1`. */
function fmtRatio(bids: number, interviews: number): string {
  if (interviews <= 0) return '—';
  const r = bids / interviews;
  return `${Number.isInteger(r) ? r : r.toFixed(1)} : 1`;
}

type ChartRow = api.DailyPlanStatsRow & { label: string; title: string };

export default function DailyPlanChart() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const chart = useChartTheme();
  const { theme } = useTheme();
  const colors = COLORS[theme === 'dark' ? 'dark' : 'light'];

  const [bucket, setBucket] = useState<Bucket>('day');
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [userFilter, setUserFilter] = useState<string | null>(null);
  // Staff start on their own numbers; admins start on the team total.
  const userId = userFilter === null ? (isAdmin ? '' : (user?.id ?? '')) : userFilter;

  const { data: usersData } = useSWR(['users-lookup'], () => api.lookupUsers());
  const users = (usersData?.users as Array<{ _id: string; name?: string; email?: string }>) || [];

  const today = todayInputValue();
  const { data, error, isLoading } = useSWR(
    ['daily-plan-stats', bucket, userId, today],
    () => api.getDailyPlanStats({ bucket, to: today, ...(userId ? { userId } : {}) }),
    { revalidateOnFocus: false },
  );

  const rows: ChartRow[] = useMemo(
    () => (data?.series ?? []).map((r) => ({ ...r, label: bucketLabel(r, bucket), title: bucketTitle(r, bucket) })),
    [data, bucket],
  );
  const totals = data?.totals;
  const windowLabel = BUCKETS.find((b) => b.value === bucket)?.window ?? '';
  const bids = totals ? totals.bidsHandsOn + totals.bidsByBidder : 0;

  return (
    <section className="panel p-4">
      <header className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h2 className="card-title uppercase tracking-wide">Daily plan — bids &amp; interviews</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            aria-label="User"
            className="select focus-ring text-xs"
            value={userId}
            onChange={(e) => setUserFilter(e.target.value)}
          >
            {isAdmin && <option value="">All users</option>}
            {users.map((u) => (<option key={u._id} value={u._id}>{u.name || u.email}</option>))}
          </select>
          <div className="segmented" role="group" aria-label="Group by">
            {BUCKETS.map((b) => (
              <button
                key={b.value}
                type="button"
                aria-pressed={bucket === b.value}
                onClick={() => setBucket(b.value)}
                className={'segmented-btn ' + (bucket === b.value ? 'segmented-btn-active-neutral' : '')}
              >
                {b.label}
              </button>
            ))}
          </div>
          <div className="segmented" role="group" aria-label="View">
            {VIEWS.map((v) => (
              <button
                key={v.value}
                type="button"
                aria-pressed={view === v.value}
                onClick={() => setView(v.value)}
                className={'segmented-btn ' + (view === v.value ? 'segmented-btn-active' : '')}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {error ? (
        <div className="alert-error">Failed to load daily plan numbers.</div>
      ) : isLoading || !data || !totals ? (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <SummaryTile
              label={`Bids — ${windowLabel}`}
              value={bids.toLocaleString()}
              detail={`By bidder ${totals.bidsByBidder} · Hands-on ${totals.bidsHandsOn}`}
            />
            <SummaryTile
              label={`Interviews — ${windowLabel}`}
              value={(totals.interviewsNew + totals.interviewsDone).toLocaleString()}
              detail={`New invitations ${totals.interviewsNew} · Done ${totals.interviewsDone}`}
            />
            <SummaryTile
              label="Bid : Interview"
              value={fmtRatio(bids, totals.interviewsNew)}
              detail="Bids per new invitation"
            />
          </div>

          {totals.planCount === 0 ? (
            <div className="text-sm text-faint italic">
              No regular daily plans in the {windowLabel} yet.{' '}
              <Link to="/report" className="link-inline not-italic">
                Add one in Report <ArrowRight size={12} aria-hidden />
              </Link>
            </div>
          ) : view === 'chart' ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }} barGap={2} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                <XAxis dataKey="label" stroke={chart.axis} fontSize={12} tick={{ fill: chart.axis }} />
                <YAxis stroke={chart.axis} fontSize={12} allowDecimals={false} tick={{ fill: chart.axis }} />
                <Tooltip
                  cursor={{ fill: chart.grid, opacity: 0.6 }}
                  content={<StatsTooltip />}
                />
                <Legend wrapperStyle={{ color: chart.axis, fontSize: 12 }} />
                {SERIES.map((s, i) => {
                  const isTop = i % 2 === 1;
                  return (
                    <Bar
                      key={s.key}
                      dataKey={s.key}
                      name={s.label}
                      stackId={s.stack}
                      fill={colors[s.key]}
                      stroke={chart.tooltipBg}
                      strokeWidth={1}
                      maxBarSize={28}
                      radius={isTop ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                    />
                  );
                })}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <StatsTable rows={rows} />
          )}
        </>
      )}
    </section>
  );
}

function SummaryTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-zinc-200/70 dark:border-zinc-800/80 p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold text-strong tabular-nums">{value}</div>
      <div className="mt-0.5 text-xs text-muted tabular-nums">{detail}</div>
    </div>
  );
}

function StatsTooltip({ active, payload }: TooltipProps<number, string>) {
  const chart = useChartTheme();
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as ChartRow;
  const bids = row.bidsHandsOn + row.bidsByBidder;
  const lines: { label: string; value: string | number; sub?: boolean; gap?: boolean }[] = [
    { label: 'Bids', value: bids },
    { label: 'by bidder', value: row.bidsByBidder, sub: true },
    { label: 'hands-on', value: row.bidsHandsOn, sub: true },
    { label: 'Interviews · new', value: row.interviewsNew },
    { label: 'Interviews · done', value: row.interviewsDone },
    { label: 'Bid : Interview', value: fmtRatio(bids, row.interviewsNew) },
    { label: 'Planned bids', value: row.planBidsHandsOn + row.planBidsByBidder, gap: true },
    { label: 'by bidder', value: row.planBidsByBidder, sub: true },
    { label: 'hands-on', value: row.planBidsHandsOn, sub: true },
    { label: 'Scheduled interviews', value: row.planInterviewsScheduled },
  ];
  return (
    <div
      className="rounded-md border px-3 py-2 text-xs shadow-sm"
      style={{ backgroundColor: chart.tooltipBg, borderColor: chart.tooltipBorder, color: chart.tooltipText }}
    >
      <div className="font-semibold mb-1">{row.title}</div>
      <table>
        <tbody>
          {lines.map((line, i) => (
            <tr key={i} className={line.gap ? 'border-t' : ''} style={line.gap ? { borderColor: chart.tooltipBorder } : undefined}>
              <td className={'pr-4 ' + (line.sub ? 'pl-3 text-muted' : '') + (line.gap ? ' pt-1' : '')}>{line.label}</td>
              <td className={'text-right tabular-nums font-medium' + (line.gap ? ' pt-1' : '')}>{line.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatsTable({ rows }: { rows: ChartRow[] }) {
  return (
    <div className="table-wrap">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="table-head">
            <tr>
              <th className="px-3 py-2 text-left">Period</th>
              <th className="px-3 py-2 text-right">By bidder</th>
              <th className="px-3 py-2 text-right">Hands-on</th>
              <th className="px-3 py-2 text-right">Bids</th>
              <th className="px-3 py-2 text-right">New invitations</th>
              <th className="px-3 py-2 text-right">Done</th>
              <th className="px-3 py-2 text-right">Bid : Interview</th>
              <th className="px-3 py-2 text-right">Planned bids</th>
              <th className="px-3 py-2 text-right">Scheduled</th>
            </tr>
          </thead>
          <tbody>
            {[...rows].reverse().map((r) => {
              const bids = r.bidsHandsOn + r.bidsByBidder;
              return (
                <tr key={r.key} className={'table-row ' + (r.planCount === 0 ? 'text-faint' : 'text-body')}>
                  <td className="px-3 py-2 whitespace-nowrap">{r.title}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.bidsByBidder}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.bidsHandsOn}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{bids}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.interviewsNew}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.interviewsDone}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtRatio(bids, r.interviewsNew)}</td>
                  <td
                    className="px-3 py-2 text-right tabular-nums"
                    title={`By bidder ${r.planBidsByBidder} · Hands-on ${r.planBidsHandsOn}`}
                  >
                    {r.planBidsHandsOn + r.planBidsByBidder}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.planInterviewsScheduled}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
