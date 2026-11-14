import { useState } from 'react';
import useSWR from 'swr';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
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
import { attentionLines } from '../../lib/profileAttention';
import {
  AttentionList, Card, CompareLine, CompareTable, ROUND_LABELS, RoundsTable, big, sub, type Bench,
} from './ProfileMetricsParts';

/** Hues from the Interview rate charts' slots: bids in blue (bidder bids its lighter part); interviews total in
 * orange, self in green, caller in purple; then one hue per round type. */
const SERIES = {
  light: {
    bids: '#2a78d6', interviews: '#eb6834', self: '#1baf7a', caller: '#6250d6',
    intro: '#2a78d6', tech: '#eb6834', hiring: '#1baf7a', panel: '#6250d6', final: '#c2417a',
  },
  dark: {
    bids: '#3987e5', interviews: '#d95926', self: '#199e70', caller: '#9085e9',
    intro: '#3987e5', tech: '#d95926', hiring: '#199e70', panel: '#9085e9', final: '#d6609a',
  },
};
const FADED_OPACITY = 0.4;
const ROUND_KEYS = ['intro', 'tech', 'hiring', 'panel', 'final'] as const;
const MIN_BIDS = 30;

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

const scoreText = (n: number) => fmtScore({ avg: n, n: 0 });

/** A profile's verdict (Needs attention), four cards, its rounds, how it compares with the owner's other profiles and
 * every owner's profiles, then its bids and interviews per day or week as charts and a table. */
export default function ProfileMetricsPanel({ accountId }: { accountId: string }) {
  const chart = useChartTheme();
  const { theme } = useTheme();
  const c = SERIES[theme === 'dark' ? 'dark' : 'light'];
  const [f, setFilters] = useState<Filters>(initialFilters);
  const [savedView, setSavedView] = useState<MetricsView>(readView);
  // All time opens on Week (a day per point is too many) until the user picks a view in this visit.
  const [pickedView, setPickedView] = useState(false);
  const view: MetricsView = f.period === 'all' && !pickedView ? 'week' : savedView;
  const rangeError = filtersError({ ...f, period: f.period === 'all' ? 'month' : f.period, region: 'all' });
  const params = f.period === 'custom' ? { period: f.period, date: f.from, to: f.to }
    : f.period === 'all' ? { period: f.period } : { period: f.period, date: f.day };
  const key = [params.period, params.date ?? '', params.to ?? ''] as const;
  const { data, error, isLoading } = useSWR(
    rangeError ? null : (['account-metric', accountId, ...key] as const),
    () => api.getProfileMetric(accountId, params),
  );
  // Every owner's profiles over the same period: its own request, so the profile's numbers never wait for it.
  const benchmark = useSWR(rangeError ? null : (['metrics-benchmark', ...key] as const), () => api.getMetricsBenchmark(params));
  const today = isoDay(new Date());

  const changeView = (v: MetricsView) => {
    setSavedView(v);
    setPickedView(true);
    writeView(v);
  };

  const m = data;
  const compare = m?.compare;
  const me = compare?.this ?? null;
  const yours = compare?.peers ?? null;
  const benchData = benchmark.data && benchmark.data.profiles > 0 ? benchmark.data : null;
  const bench: Bench = { loading: !benchmark.data && !benchmark.error && !!compare, data: benchData };
  const all = bench.data;
  const lines = m ? attentionLines(m.rounds, compare, all) : [];

  const unit = view === 'day' ? 'day' : 'week';
  const points = (view === 'day'
    ? (m?.daily ?? []).map((d) => ({ date: d.day, ...d }))
    : (m?.weekly ?? []).map((w) => ({ date: w.week, ...w }))
  ).map((p) => {
    const bids = p.selfBids + p.bidderBids;
    const interviews = p.selfInterviews + p.callerInterviews;
    return { ...p, label: dayLabel(p.date), bids, interviews, rate: bids ? interviews / bids : null };
  });
  const byType = points.length > 0 && points.every((p) => p.intro != null);
  const axis = { stroke: chart.axis, tick: { fill: chart.axis, fontSize: 12 } };
  const tooltip = (
    <Tooltip
      cursor={{ fill: chart.grid, opacity: 0.5 }}
      contentStyle={{ background: chart.tooltipBg, borderColor: chart.tooltipBorder, color: chart.tooltipText, fontSize: 12 }}
      labelStyle={{ color: chart.tooltipText }}
      formatter={(value, name) => (name === 'Interviews / bid' && typeof value === 'number' ? fmtRate(value) : value)}
    />
  );
  const range = m ? `${m.label}${m.period === 'all' ? ` (since ${dayLabel(m.start)})` : ''}` : '';
  const comparedNote = m?.comparedFrom && m.comparedFrom > m.start
    ? `Compared from ${dayLabel(m.comparedFrom)}, when self bids started being recorded per profile`
    : null;
  // Cards' rates come from the compared window so a card and its comparison measure the same days.
  const passRate = me ? me.passRate : m?.passRate;
  const perBid = me ? me.interviewsPerBid : m?.interviewsPerBid ?? null;
  const fewBids = me ? me.bids < MIN_BIDS : !!m?.lowVolume;
  const tailor = me ? me.tailorScore : m?.tailorScore ?? null;

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
        <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4" aria-hidden>
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-24 w-full" />)}
        </div>
      ) : (
        <>
          <div className="text-xs text-muted">
            <p>{range}</p>
            {comparedNote && <p>{comparedNote}</p>}
          </div>

          <AttentionList lines={lines} />

          <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4">
            <Card title="Bids">
              {big(fmtCount(m.bids))}
              {sub(`${fmtCount(m.selfBids)} self · ${fmtCount(m.bidderBids)} bidder`)}
              {me && sub(`${fmtPerWeek(me.bidsPerWeek)} / week`)}
              <CompareLine mine={me?.bidsPerWeek} yours={yours?.bidsPerWeek} all={all?.bidsPerWeek} bench={bench}
                fmt={(n) => `${fmtPerWeek(n)} /wk`} cueAgainst="yours" />
            </Card>

            <Card title="Interviews">
              {big(fmtCount(m.interviews))}
              {sub(`${fmtCount(m.selfInterviews)} self · ${fmtCount(m.callerInterviews)} caller`)}
              {passRate !== undefined && sub(passRate == null ? 'No decided rounds' : `${fmtRate(passRate)} pass`)}
              <CompareLine mine={passRate} yours={yours?.passRate} all={all?.passRate} bench={bench} fmt={fmtRate} />
            </Card>

            <Card title="Interviews / bid">
              {perBid == null ? <div className="text-lg text-muted" title="No bids in this period">—</div> : (
                <>
                  {big(fmtRate(perBid), fewBids)}
                  {fewBids && sub('Fewer than 30 bids — too few to rank')}
                </>
              )}
              <CompareLine mine={perBid} yours={yours?.interviewsPerBid} all={all?.interviewsPerBid} bench={bench} fmt={fmtRate} />
            </Card>

            <Card title="Tailor score">
              {tailor?.avg == null
                ? <div className="text-lg text-muted" title="No scored resumes in this period">—</div>
                : big(fmtScore(tailor))}
              {sub(`${fmtCount(m.tailoredResumes)} tailored`)}
              <CompareLine mine={tailor?.avg} yours={yours?.tailorScore.avg} all={all?.tailorScore.avg} bench={bench}
                fmt={scoreText} />
            </Card>
          </div>

          {m.rounds && <RoundsTable rounds={m.rounds} range={range} color={c.self} />}
          {compare && <CompareTable compare={compare} bench={bench} range={range} />}

          {points.length === 0 ? (
            <p className="text-sm text-muted">No days in this range yet</p>
          ) : (
            <>
              <div>
                <h3 className="form-label mb-1">Bids per {unit}</h3>
                <div
                  className="h-[220px]"
                  role="img"
                  aria-label={`Self and bidder bids per ${unit}${view === 'week' ? ' with interviews per bid' : ''}, ${range}. The table below lists every value.`}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
                      <CartesianGrid stroke={chart.grid} vertical={false} />
                      <XAxis dataKey="label" {...axis} minTickGap={12} />
                      <YAxis yAxisId="bids" allowDecimals={false} {...axis} width={40} />
                      {view === 'week' && (
                        <YAxis yAxisId="rate" orientation="right" {...axis} width={44}
                          tickFormatter={(v: number) => `${Math.round(v * 1000) / 10}%`} />
                      )}
                      {tooltip}
                      <Legend wrapperStyle={{ fontSize: 12, color: chart.axis }} />
                      <Bar yAxisId="bids" dataKey="selfBids" name="Self" stackId="bids" fill={c.bids} isAnimationActive={false} />
                      <Bar yAxisId="bids" dataKey="bidderBids" name="Bidder" stackId="bids" fill={c.bids}
                        fillOpacity={FADED_OPACITY} isAnimationActive={false} />
                      {view === 'week' && (
                        <Line yAxisId="rate" dataKey="rate" name="Interviews / bid" type="linear" stroke={c.interviews}
                          strokeWidth={2} dot={{ r: 3, fill: c.interviews }} connectNulls={false} isAnimationActive={false} />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div>
                <h3 className="form-label mb-1">Interviews per {unit}{byType ? ' by round type' : ''}</h3>
                <div
                  className="h-[200px]"
                  role="img"
                  aria-label={`Interview rounds per ${unit}${byType ? ' by round type' : ' (total, self, caller)'}, ${range}. The table below lists every value.`}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    {byType ? (
                      <BarChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
                        <CartesianGrid stroke={chart.grid} vertical={false} />
                        <XAxis dataKey="label" {...axis} minTickGap={12} />
                        <YAxis allowDecimals={false} {...axis} width={40} />
                        {tooltip}
                        <Legend wrapperStyle={{ fontSize: 12, color: chart.axis }} />
                        {ROUND_KEYS.map((k) => (
                          <Bar key={k} dataKey={k} name={ROUND_LABELS[k]} stackId="rounds" fill={c[k]} isAnimationActive={false} />
                        ))}
                      </BarChart>
                    ) : (
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
                    )}
                  </ResponsiveContainer>
                </div>
              </div>

              <details className="group">
                <summary className="cursor-pointer select-none text-sm font-medium text-strong">
                  {view === 'day' ? 'Day-by-day numbers' : 'Week-by-week numbers'}
                </summary>
                <div className="table-wrap mt-2 max-h-96 overflow-y-auto">
                  <table className="min-w-full text-sm">
                    <thead className="table-head sticky top-0">
                      <tr>
                        <th className="px-4 py-2.5">{view === 'day' ? 'Day' : 'Week of'}</th>
                        <th className="px-4 py-2.5 text-right">Self bids</th>
                        <th className="px-4 py-2.5 text-right">Bidder bids</th>
                        <th className="px-4 py-2.5 text-right">Total bids</th>
                        <th className="px-4 py-2.5 text-right">Self interviews</th>
                        <th className="px-4 py-2.5 text-right">Caller interviews</th>
                        <th className="px-4 py-2.5 text-right">Interviews / bid</th>
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
                          <td className="px-4 py-2 text-right">{p.rate == null ? '' : fmtRate(p.rate)}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-zinc-200 font-medium text-strong dark:border-zinc-700">
                        <td className="px-4 py-2">Total</td>
                        <td className="px-4 py-2 text-right">{fmtCount(m.selfBids)}</td>
                        <td className="px-4 py-2 text-right">{fmtCount(m.bidderBids)}</td>
                        <td className="px-4 py-2 text-right">{fmtCount(m.bids)}</td>
                        <td className="px-4 py-2 text-right">{fmtCount(m.selfInterviews)}</td>
                        <td className="px-4 py-2 text-right">{fmtCount(m.callerInterviews)}</td>
                        <td className="px-4 py-2 text-right">{m.bids ? fmtRate(m.interviews / m.bids) : ''}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          )}
        </>
      )}
    </section>
  );
}
