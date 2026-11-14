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
import { PERIODS, PeriodNav, Segmented, filtersError, isoDay } from '../statistics/controls';
import { readView, writeView, fmtCount, fmtPerWeek, fmtRate, fmtScore, type MetricsView } from '../../lib/profileMetrics';

/** Hues from the Interview rate charts' slots: bids in blue (bidder bids its lighter part); interviews total in
 * orange, self in green, caller in purple. */
const SERIES = {
  light: { bids: '#2a78d6', interviews: '#eb6834', self: '#1baf7a', caller: '#6250d6' },
  dark: { bids: '#3987e5', interviews: '#d95926', self: '#199e70', caller: '#9085e9' },
};
const FADED_OPACITY = 0.4;

/** The Statistics periods, plus everything since the profile was created. */
const TAB_PERIODS: { value: api.ProfileMetricPeriod; label: string }[] = [...PERIODS, { value: 'all', label: 'All time' }];

type Filters = { period: api.ProfileMetricPeriod; day: string; from: string; to: string };

function initialFilters(): Filters {
  const today = new Date();
  return { period: 'all', day: isoDay(today), from: isoDay(new Date(today.getFullYear(), today.getMonth(), 1)), to: isoDay(today) };
}

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

const ROUND_LABELS: Record<api.RoundType, string> = {
  intro: 'Intro', tech: 'Tech', hiring: 'Hiring', panel: 'Panel', final: 'Final', home_assessment: 'Home assessment',
};

/** Done / passed / rejected / pass rate per round type; home assessments below a divider. */
function RoundsCard({ rounds, range, color }: { rounds: api.RoundsSummary; range: string; color: string }) {
  const notes = [
    rounds.awaiting > 0 && `${fmtCount(rounds.awaiting)} held with no result yet`,
    rounds.scheduled > 0 && `${fmtCount(rounds.scheduled)} still scheduled`,
  ].filter(Boolean);
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <h3 className="form-label mb-2">Rounds <span className="font-normal text-muted">· {range}</span></h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th className="py-1.5 pr-4 text-left font-medium">Round</th>
              <th className="px-4 py-1.5 text-right font-medium">Done</th>
              <th className="px-4 py-1.5 text-right font-medium">Passed</th>
              <th className="px-4 py-1.5 text-right font-medium">Rejected</th>
              <th className="py-1.5 pl-4 text-left font-medium">Pass rate</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {api.ROUND_TYPES.map((t) => {
              const s = rounds.byType[t];
              const none = s.done === 0;
              return (
                <tr key={t} className={t === 'home_assessment' ? 'border-t border-zinc-200 dark:border-zinc-700' : ''}>
                  <td className="py-1.5 pr-4 whitespace-nowrap">{ROUND_LABELS[t]}</td>
                  <td className="px-4 py-1.5 text-right">{fmtCount(s.done)}</td>
                  <td className="px-4 py-1.5 text-right">{none ? '–' : fmtCount(s.passed)}</td>
                  <td className="px-4 py-1.5 text-right">{none ? '–' : fmtCount(s.rejected)}</td>
                  <td className="py-1.5 pl-4">
                    {s.passRate == null ? <span className="text-muted">—</span> : (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700" aria-hidden>
                          <div className="h-full rounded-full" style={{ width: `${s.passRate * 100}%`, background: color }} />
                        </div>
                        <span>{fmtRate(s.passRate)}</span>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {notes.length > 0 && <p className="mt-2 text-xs text-muted">{notes.join(' · ')}</p>}
    </div>
  );
}
const big = (text: string, muted = false) => (
  <div className={`text-lg font-semibold tabular-nums ${muted ? 'text-muted' : 'text-strong'}`}>{text}</div>
);

/** A profile's bids, interviews, tailored resumes and scores over a week, a month, a custom range or all time,
 * next to its owner's other profiles; then every day or week of it as a table and charts. */
export default function ProfileMetricsPanel({ accountId }: { accountId: string }) {
  const chart = useChartTheme();
  const { theme } = useTheme();
  const c = SERIES[theme === 'dark' ? 'dark' : 'light'];
  const [f, setFilters] = useState<Filters>(initialFilters);
  const [view, setView] = useState<MetricsView>(readView);
  const rangeError = filtersError({ ...f, period: f.period === 'all' ? 'month' : f.period, region: 'all' });
  const params = f.period === 'custom' ? { period: f.period, date: f.from, to: f.to }
    : f.period === 'all' ? { period: f.period } : { period: f.period, date: f.day };
  const { data, error, isLoading } = useSWR(
    rangeError ? null : (['account-metric', accountId, params.period, params.date ?? '', params.to ?? ''] as const),
    () => api.getProfileMetric(accountId, params),
  );
  const today = isoDay(new Date());

  const changeView = (v: MetricsView) => {
    setView(v);
    writeView(v);
  };

  const m = data;
  const peers = m?.peers ?? null;
  const dash = (title?: string) => <div className="text-lg text-muted" title={title}>—</div>;
  const scores = [
    { label: 'Tailor', mine: m?.tailorScore ?? null, peer: peers?.tailorScore ?? null },
    { label: 'Match', mine: m?.matchScore ?? null, peer: peers?.matchScore ?? null },
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
  const axis = { stroke: chart.axis, tick: { fill: chart.axis, fontSize: 12 } };
  const tooltip = (
    <Tooltip
      cursor={{ fill: chart.grid, opacity: 0.5 }}
      contentStyle={{ background: chart.tooltipBg, borderColor: chart.tooltipBorder, color: chart.tooltipText, fontSize: 12 }}
      labelStyle={{ color: chart.tooltipText }}
    />
  );
  const range = m ? `${m.label}${m.period === 'all' ? ` (since ${dayLabel(m.start)})` : ''}` : '';

  return (
    <section className="panel space-y-4 p-6" aria-labelledby="profile-metrics-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="profile-metrics-title" className="card-title">Metrics</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented label="Period" options={TAB_PERIODS} value={f.period} onChange={(period) => setFilters({ ...f, period })} />
          {f.period === 'custom' ? (
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" className="input !w-auto !py-1.5" aria-label="From" value={f.from} max={today}
                onChange={(e) => setFilters({ ...f, from: e.target.value })} />
              <span className="text-muted" aria-hidden>–</span>
              <input type="date" className="input !w-auto !py-1.5" aria-label="To" value={f.to} max={today}
                onChange={(e) => setFilters({ ...f, to: e.target.value })} />
              {rangeError && <span className="text-xs text-red-700 dark:text-red-400" role="alert">{rangeError}</span>}
            </div>
          ) : f.period !== 'all' && (
            <PeriodNav period={f.period} day={f.day} label={m?.label} onDay={(day) => setFilters({ ...f, day })} />
          )}
          <Segmented
            label="View"
            options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }]}
            value={view}
            onChange={changeView}
          />
        </div>
      </div>

      {rangeError ? null : error ? (
        <p role="status" className="text-sm text-muted">Couldn't load metrics</p>
      ) : isLoading || !m ? (
        <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-5" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-24 w-full" />)}
        </div>
      ) : (
        <>
          <p className="text-xs text-muted">{range}</p>
          <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-5">
            <Tile title="Bids">
              {big(fmtCount(m.bids))}
              {split(`${fmtCount(m.selfBids)} self · ${fmtCount(m.bidderBids)} bidder`)}
              <PeerLine mine={m.bids} peer={peers?.bids} fmt={fmtPerWeek} />
            </Tile>

            <Tile title="Interviews">
              <div title={`${fmtCount(m.selfInterviews)} self · ${fmtCount(m.callerInterviews)} caller`}>
                {big(fmtCount(m.interviews))}
              </div>
              {m.passRate === undefined
                ? split(`${fmtCount(m.selfInterviews)} self · ${fmtCount(m.callerInterviews)} caller`)
                : split(m.passRate == null ? 'No decided rounds' : `${fmtRate(m.passRate)} pass overall`)}
              <PeerLine mine={m.interviews} peer={peers?.interviews} fmt={fmtPerWeek} />
              <PeerLine label="Pass rate" mine={m.passRate} peer={peers?.passRate} fmt={fmtRate} />
            </Tile>

            <Tile title="Interviews / bid">
              {m.interviewsPerBid == null ? dash('No bids in this period') : (
                <>
                  {big(fmtRate(m.interviewsPerBid), m.lowVolume)}
                  {m.lowVolume && split('Fewer than 30 bids — too few to rank')}
                  <PeerLine mine={m.interviewsPerBid} peer={peers?.interviewsPerBid} fmt={fmtRate} />
                </>
              )}
            </Tile>

            <Tile title="Tailored resumes">
              {big(fmtCount(m.tailoredResumes))}
              {split('Generated for this profile, scored or not')}
              <PeerLine mine={m.tailoredResumes} peer={peers?.tailoredResumes} fmt={fmtPerWeek} />
            </Tile>

            <Tile title="Resume score">
              {!scored ? dash('No scored resumes in this period') : (
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

          {m.rounds && <RoundsCard rounds={m.rounds} range={range} color={c.self} />}

          {points.length === 0 ? (
            <p className="text-sm text-muted">No days in this range yet</p>
          ) : (
            <>
              <div>
                <h3 className="form-label mb-1">Bids per {unit}</h3>
                <div
                  className="h-[220px]"
                  role="img"
                  aria-label={`Self and bidder bids per ${unit}, ${range}. The table below lists every value.`}
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
                  aria-label={`Interview rounds per ${unit} (total, self, caller), ${range}. The table below lists every value.`}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
                      <CartesianGrid stroke={chart.grid} vertical={false} />
                      <XAxis dataKey="label" {...axis} minTickGap={12} />
                      <YAxis allowDecimals={false} {...axis} width={40} />
                      {tooltip}
                      <Legend wrapperStyle={{ fontSize: 12, color: chart.axis }} />
                      <Line dataKey="interviews" name="Total" type="linear" stroke={c.interviews} strokeWidth={2}
                        dot={view === 'week' ? { r: 3, fill: c.interviews } : false} isAnimationActive={false} />
                      <Line dataKey="selfInterviews" name="Self" type="linear" stroke={c.self} strokeWidth={1.5}
                        dot={view === 'week' ? { r: 2.5, fill: c.self } : false} isAnimationActive={false} />
                      <Line dataKey="callerInterviews" name="Caller" type="linear" stroke={c.caller} strokeWidth={1.5}
                        strokeDasharray="4 3" dot={view === 'week' ? { r: 2.5, fill: c.caller } : false} isAnimationActive={false} />
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
                      <td className="px-4 py-2 text-right">{fmtCount(m.selfBids)}</td>
                      <td className="px-4 py-2 text-right">{fmtCount(m.bidderBids)}</td>
                      <td className="px-4 py-2 text-right">{fmtCount(m.bids)}</td>
                      <td className="px-4 py-2 text-right">{fmtCount(m.selfInterviews)}</td>
                      <td className="px-4 py-2 text-right">{fmtCount(m.callerInterviews)}</td>
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
