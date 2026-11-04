import { useState, type ReactNode } from 'react';
import useSWR from 'swr';
import { TrendingDown, TrendingUp } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import * as api from '../../api/endpoints';
import { useChartTheme } from '../../theme/useChartTheme';
import { useTheme } from '../../theme/ThemeProvider';
import {
  WEEK_OPTIONS, readView, readWeeks, writeView, writeWeeks, fmtPerWeek, fmtRate, fmtScore, type MetricsView,
} from '../../lib/profileMetrics';

/** Hues from the Interview rate charts' slots: bids in blue (bidder bids its lighter part); interviews total in
 * orange, self in green, caller in purple. */
const SERIES = {
  light: { bids: '#2a78d6', interviews: '#eb6834', self: '#1baf7a', caller: '#6250d6' },
  dark: { bids: '#3987e5', interviews: '#d95926', self: '#199e70', caller: '#9085e9' },
};
const FADED_OPACITY = 0.4;

/** A day or a week's Monday (`2026-10-06`) as `Oct 6`; read as UTC so the date never shifts with the viewer's
 * timezone. */
function dayLabel(day: string): string {
  const d = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** "vs. your other profiles: X" with an up / down cue; hidden unless both values exist. */
function PeerLine({ mine, peer, fmt, label }: {
  mine: number | null | undefined;
  peer: number | null | undefined;
  fmt: (n: number) => string;
  label?: string;
}) {
  if (mine == null || peer == null) return null;
  const Icon = mine > peer ? TrendingUp : mine < peer ? TrendingDown : null;
  return (
    <div className="mt-1 flex items-center gap-1 text-[11px] text-muted">
      {Icon && <Icon className="h-3 w-3 shrink-0" aria-hidden />}
      <span>{label ? `${label}: ` : ''}vs. your other profiles: {fmt(peer)}</span>
    </div>
  );
}

function Tile({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="mb-1 text-xs font-medium text-muted">{title}</div>
      {children}
    </div>
  );
}

const split = (text: string) => <div className="text-[11px] text-muted">{text}</div>;

/** A profile's bids, interviews and scores over the chosen period, next to its owner's other profiles. */
export default function ProfileMetricsPanel({ accountId }: { accountId: string }) {
  const chart = useChartTheme();
  const { theme } = useTheme();
  const c = SERIES[theme === 'dark' ? 'dark' : 'light'];
  const [weeks, setWeeks] = useState(readWeeks);
  const [view, setView] = useState<MetricsView>(readView);
  const { data, error, isLoading } = useSWR(
    ['account-metric', accountId, weeks] as const,
    () => api.getProfileMetric(accountId, { weeks }),
  );

  const changeWeeks = (n: number) => {
    setWeeks(n);
    writeWeeks(n);
  };
  const changeView = (v: MetricsView) => {
    setView(v);
    writeView(v);
  };

  const m = data;
  const peers = m?.peers ?? null;
  const noHistory = m?.spanWeeks === 0;
  const dash = (title?: string) => <div className="text-lg text-muted" title={title}>—</div>;
  const history = 'Not enough history yet';
  const scores = [
    { label: 'Tailor', mine: m?.tailorScore ?? null, peer: peers?.tailorScore ?? null },
    { label: 'Job match', mine: m?.matchScore ?? null, peer: peers?.matchScore ?? null },
  ];
  const scored = scores.some((s) => s.mine && s.mine.n > 0);
  const unit = view === 'day' ? 'day' : 'week';
  const points = (view === 'day'
    ? (m?.daily ?? []).map((d) => ({ date: d.day, ...d }))
    : (m?.weekly ?? []).map((w) => ({ date: w.week, ...w }))
  ).map((p) => ({
    ...p,
    label: dayLabel(p.date),
    bids: p.selfBids + p.bidderBids,
    interviews: p.selfInterviews + p.callerInterviews,
  }));
  const totals = points.reduce(
    (t, p) => ({
      selfBids: t.selfBids + p.selfBids, bidderBids: t.bidderBids + p.bidderBids,
      selfInterviews: t.selfInterviews + p.selfInterviews, callerInterviews: t.callerInterviews + p.callerInterviews,
    }),
    { selfBids: 0, bidderBids: 0, selfInterviews: 0, callerInterviews: 0 },
  );
  const axis = { stroke: chart.axis, tick: { fill: chart.axis, fontSize: 12 } };
  const tooltip = (
    <Tooltip
      cursor={{ fill: chart.grid, opacity: 0.5 }}
      contentStyle={{ background: chart.tooltipBg, borderColor: chart.tooltipBorder, color: chart.tooltipText, fontSize: 12 }}
      labelStyle={{ color: chart.tooltipText }}
    />
  );

  return (
    <section className="panel space-y-4 p-6" aria-labelledby="profile-metrics-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="profile-metrics-title" className="card-title">Metrics</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div role="group" aria-label="View" className="flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-700">
            {([['day', 'Day'], ['week', 'Week']] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={view === key}
                onClick={() => changeView(key)}
                className={`focus-ring rounded-md px-2.5 py-1 text-xs font-medium ${
                  view === key ? 'bg-zinc-100 text-strong dark:bg-zinc-800' : 'text-muted hover:text-body'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="w-36">
            <label className="mb-1 block text-xs text-muted" htmlFor="profile-metrics-period">Period</label>
            <select
              id="profile-metrics-period"
              className="select focus-ring w-full text-sm"
              value={weeks}
              onChange={(e) => changeWeeks(Number(e.target.value))}
            >
              {WEEK_OPTIONS.map((w) => <option key={w} value={w}>Last {w} weeks</option>)}
            </select>
          </div>
        </div>
      </div>

      {error ? (
        <p role="status" className="text-sm text-muted">Couldn't load metrics</p>
      ) : isLoading || !m ? (
        <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4" aria-hidden>
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-24 w-full" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4">
            <Tile title="Bids / wk">
              {noHistory || m.bidsPerWeek == null ? dash(history) : (
                <>
                  <div className="text-lg font-semibold tabular-nums text-strong">{fmtPerWeek(m.bidsPerWeek)}</div>
                  {split(`${fmtPerWeek(m.selfBidsPerWeek)} self · ${fmtPerWeek(m.bidderBidsPerWeek)} bidder`)}
                  <PeerLine mine={m.bidsPerWeek} peer={peers?.bidsPerWeek} fmt={fmtPerWeek} />
                </>
              )}
            </Tile>

            <Tile title="Interviews / wk">
              {noHistory || m.interviewsPerWeek == null ? dash(history) : (
                <>
                  <div className="text-lg font-semibold tabular-nums text-strong">{fmtPerWeek(m.interviewsPerWeek)}</div>
                  {split(`${fmtPerWeek(m.selfInterviewsPerWeek)} self · ${fmtPerWeek(m.callerInterviewsPerWeek)} caller`)}
                  <PeerLine mine={m.interviewsPerWeek} peer={peers?.interviewsPerWeek} fmt={fmtPerWeek} />
                </>
              )}
            </Tile>

            <Tile title="Interviews / bid">
              {noHistory ? dash(history) : m.interviewsPerBid == null ? dash('No bids in this period') : (
                <>
                  <div className={`text-lg font-semibold tabular-nums ${m.lowVolume ? 'text-muted' : 'text-strong'}`}>
                    {fmtRate(m.interviewsPerBid)}
                  </div>
                  {m.lowVolume && split('Fewer than 30 bids — too few to rank')}
                  <PeerLine mine={m.interviewsPerBid} peer={peers?.interviewsPerBid} fmt={fmtRate} />
                </>
              )}
            </Tile>

            <Tile title="Avg scores">
              {noHistory ? dash(history) : !scored ? dash('No scored applications yet') : (
                <>
                  {scores.map((s) => (
                    <div key={s.label} className="flex items-baseline justify-between gap-2">
                      <span className="text-xs text-muted">{s.label} <span className="text-faint">n={s.mine?.n ?? 0}</span></span>
                      <span className="text-lg font-semibold tabular-nums text-strong">{fmtScore(s.mine)}</span>
                    </div>
                  ))}
                  {scores.map((s) => (
                    <PeerLine key={s.label} label={s.label} mine={s.mine?.avg} peer={s.peer?.avg} fmt={(n) => fmtScore({ avg: n, n: 0 })} />
                  ))}
                </>
              )}
            </Tile>
          </div>

          {noHistory || points.length === 0 ? (
            <p className="text-sm text-muted">Not enough history yet</p>
          ) : (
            <>
              <div>
                <h3 className="form-label mb-1">Bids per {unit}</h3>
                <div
                  className="h-[220px]"
                  role="img"
                  aria-label={`Self and bidder bids per ${unit}, last ${weeks} weeks. The table below lists every value.`}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
                      <CartesianGrid stroke={chart.grid} vertical={false} />
                      <XAxis dataKey="label" {...axis} minTickGap={12} />
                      <YAxis allowDecimals={false} {...axis} width={40} />
                      {tooltip}
                      <Legend wrapperStyle={{ fontSize: 12, color: chart.axis }} />
                      <Bar dataKey="selfBids" name="Self" stackId="bids" fill={c.bids} isAnimationActive={false} />
                      <Bar dataKey="bidderBids" name="Bidder" stackId="bids" fill={c.bids} fillOpacity={FADED_OPACITY}
                        isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div>
                <h3 className="form-label mb-1">Interviews per {unit}</h3>
                <div
                  className="h-[200px]"
                  role="img"
                  aria-label={`Interview rounds per ${unit} (total, self, caller), last ${weeks} weeks. The table below lists every value.`}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
                      <CartesianGrid stroke={chart.grid} vertical={false} />
                      <XAxis dataKey="label" {...axis} minTickGap={12} />
                      <YAxis allowDecimals={false} {...axis} width={40} />
                      {tooltip}
                      <Legend wrapperStyle={{ fontSize: 12, color: chart.axis }} />
                      <Line dataKey="interviews" name="Total" type="monotone" stroke={c.interviews} strokeWidth={2}
                        dot={view === 'week' ? { r: 3, fill: c.interviews } : false} isAnimationActive={false} />
                      <Line dataKey="selfInterviews" name="Self" type="monotone" stroke={c.self} strokeWidth={1.5}
                        dot={false} isAnimationActive={false} />
                      <Line dataKey="callerInterviews" name="Caller" type="monotone" stroke={c.caller} strokeWidth={1.5}
                        strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="table-wrap max-h-96 overflow-y-auto">
                <table className="min-w-full text-sm">
                  <thead className="table-head sticky top-0">
                    <tr>
                      <th className="px-4 py-2.5">{view === 'day' ? 'Day' : 'Week of'}</th>
                      <th className="px-4 py-2.5 text-right">Self bids</th>
                      <th className="px-4 py-2.5 text-right">Bidder bids</th>
                      <th className="px-4 py-2.5 text-right">Total bids</th>
                      <th className="px-4 py-2.5 text-right">Self interviews</th>
                      <th className="px-4 py-2.5 text-right">Caller interviews</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {[...points].reverse().map((p) => (
                      <tr key={p.date} className="border-t border-zinc-100 dark:border-zinc-800">
                        <td className="px-4 py-2 whitespace-nowrap">{p.label}</td>
                        <td className="px-4 py-2 text-right">{p.selfBids}</td>
                        <td className="px-4 py-2 text-right">{p.bidderBids}</td>
                        <td className="px-4 py-2 text-right font-medium text-strong">{p.bids}</td>
                        <td className="px-4 py-2 text-right">{p.selfInterviews}</td>
                        <td className="px-4 py-2 text-right">{p.callerInterviews}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-zinc-200 font-medium text-strong dark:border-zinc-700">
                      <td className="px-4 py-2">Total</td>
                      <td className="px-4 py-2 text-right">{totals.selfBids}</td>
                      <td className="px-4 py-2 text-right">{totals.bidderBids}</td>
                      <td className="px-4 py-2 text-right">{totals.selfBids + totals.bidderBids}</td>
                      <td className="px-4 py-2 text-right">{totals.selfInterviews}</td>
                      <td className="px-4 py-2 text-right">{totals.callerInterviews}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
