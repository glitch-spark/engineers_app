import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CartesianGrid, LabelList, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import type { InterviewRateRow, InterviewRates } from '../../api/endpoints';
import { useChartTheme } from '../../theme/useChartTheme';
import { useTheme } from '../../theme/ThemeProvider';
import { REGIONS, type StatsFilters } from './controls';
import { PerUserBars, RecordsNote, StatTiles, StatsBody, initialsFor, niceCeil, pct, seriesColors } from './rateShared';

/** Rate guide lines on the scatter (interviews ÷ bids); the ones that fit the plot are drawn. */
const GUIDE_RATES = [0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.3, 0.5];

/** Statistics → Interviews: rounds held per user, split by who took them (the user or a caller), how bids turn into
 * interviews, and the ranking by rate. */
export default function InterviewsTab({ filters, onFilters }: { filters: StatsFilters; onFilters: (f: StatsFilters) => void }) {
  return (
    <StatsBody filters={filters} onFilters={onFilters}>
      {(data) => (
        <>
          <p className="text-xs text-muted">
            Interviews are the rounds held (canceled rounds, AI interviews and home assessments don’t count): self = the
            user took it, caller = a caller took it.{' '}
            {data.region !== 'all' && (
              <>
                {REGIONS.find((r) => r.value === data.region)?.label} counts the interviews on its profiles.
                {data.unassignedProfiles > 0 && (
                  <>
                    {' '}{data.unassignedProfiles} profile{data.unassignedProfiles === 1 ? ' has' : 's have'} no region.{' '}
                    <Link to="/accounts" className="link">Set regions</Link>
                  </>
                )}
              </>
            )}
          </p>
          <RecordsNote data={data} rates />
          <StatTiles tiles={[
            { label: 'Interviews', value: data.totals.interviews.toLocaleString() },
            { label: 'Self-taken', value: data.totals.selfInterviews.toLocaleString() },
            { label: 'Caller-taken', value: data.totals.callerInterviews.toLocaleString() },
            { label: 'Interviews per bid', value: pct(data.totals.rate) },
          ]} />
          <PerUserBars id="iv-per-user" title="Interviews per user" chart={data.interviewsChart}
            initials={initialsFor(data.interviewsChart.users)} period={data.label}
            note={`Each ${data.interviewsChart.unit}, one bar per user: rounds the user took at the bottom, caller rounds on top.`}
            empty="No interviews in this period."
            parts={[{ key: 'self', label: 'self' }, { key: 'caller', label: 'caller', faded: true }]} />
          <RateScatter data={data} />
          <RateTable data={data} />
        </>
      )}
    </StatsBody>
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

type SortKey = 'rank' | 'name' | 'bids' | 'interviews' | 'selfInterviews' | 'callerInterviews' | 'rate';

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
          <caption className="sr-only">Bids, interviews (self and caller) and interview rate per person</caption>
          <thead className="table-head">
            <tr>
              {header('rank', '#')}
              {header('name', 'User')}
              {header('bids', 'Bids', 'text-right')}
              {header('interviews', 'Interviews', 'text-right')}
              {header('selfInterviews', 'Self', 'text-right')}
              {header('callerInterviews', 'Caller', 'text-right')}
              {header('rate', 'Rate')}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted">No bids or interviews in this period.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.userId} className={r.isMe ? 'bg-sky-50 dark:bg-sky-950/30' : 'table-row'}>
                <td className="px-3 py-2.5 tabular-nums text-muted">{r.rank ?? '—'}</td>
                <td className="px-3 py-2.5 font-medium text-strong">
                  {r.name}{r.isMe && <span className="badge badge-info ml-2">You</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums"
                  title={`${r.selfBids.toLocaleString()} self + ${r.bidderBids.toLocaleString()} bidder`}>
                  {r.bids.toLocaleString()}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.interviews.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.selfInterviews.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.callerInterviews.toLocaleString()}</td>
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
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{data.totals.bids.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{data.totals.interviews.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{data.totals.selfInterviews.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{data.totals.callerInterviews.toLocaleString()}</td>
                <td className="px-3 py-2.5 tabular-nums">{pct(data.totals.rate)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}
