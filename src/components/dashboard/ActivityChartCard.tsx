import { useState } from 'react';
import useSWR from 'swr';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import * as api from '../../api/endpoints';
import { useChartTheme } from '../../theme/useChartTheme';
import { type PeriodKind, periodRange, stepAnchor, isFuturePeriod } from '../../lib/dashboardPeriod';

const KINDS: { value: PeriodKind; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
  { value: 'custom', label: 'Custom' },
];

export default function ActivityChartCard({ userId }: { userId?: string }) {
  const chart = useChartTheme();
  const [kind, setKind] = useState<PeriodKind>('week');
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [custom, setCustom] = useState<{ from: string; to: string }>(() => {
    const r = periodRange('week', new Date());
    return { from: r.from, to: r.to };
  });

  const range = kind === 'custom' ? custom : periodRange(kind, anchor);
  const invalidRange = kind === 'custom' && custom.from > custom.to;
  const nextDisabled = kind !== 'custom' && isFuturePeriod(kind, stepAnchor(kind, anchor, 1));

  const { data, error, isLoading, mutate } = useSWR(
    invalidRange ? null : ['dashboard-activity', userId ?? 'me', range.from, range.to],
    () => api.getDashboardActivity({ from: range.from, to: range.to, userId }),
  );

  return (
    <section className="panel p-4">
      <header className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h2 className="card-title">Bids &amp; interviews</h2>
        <div className="segmented" role="group" aria-label="Period">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              aria-pressed={kind === k.value}
              onClick={() => setKind(k.value)}
              className={'segmented-btn ' + (kind === k.value ? 'segmented-btn-active' : '')}
            >
              {k.label}
            </button>
          ))}
        </div>
      </header>

      {kind === 'custom' ? (
        <div className="flex items-center gap-2 mb-3">
          <input
            type="date"
            className="input"
            aria-label="From"
            value={custom.from}
            onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
          />
          <span className="text-muted">–</span>
          <input
            type="date"
            className="input"
            aria-label="To"
            value={custom.to}
            onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
          />
        </div>
      ) : (
        <div className="flex items-center justify-center gap-3 mb-3">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setAnchor(stepAnchor(kind, anchor, -1))}
            aria-label="Previous period"
          >
            <ChevronLeft size={16} aria-hidden />
          </button>
          <span className="text-sm font-medium text-strong">{periodRange(kind, anchor).label}</span>
          <button
            type="button"
            className="icon-btn"
            disabled={nextDisabled}
            onClick={() => setAnchor(stepAnchor(kind, anchor, 1))}
            aria-label="Next period"
          >
            <ChevronRight size={16} aria-hidden />
          </button>
        </div>
      )}

      {invalidRange ? (
        <p className="text-sm text-muted">From must be on or before To.</p>
      ) : error ? (
        <>
          <p className="text-sm text-muted mb-3">Couldn&rsquo;t load activity.</p>
          <button type="button" className="btn-outline" onClick={() => mutate()}>
            Retry
          </button>
        </>
      ) : isLoading || !data ? (
        <div className="skeleton h-[280px] w-full" />
      ) : (
        <>
          <div
            role="img"
            aria-label="Stacked bar and line chart of self bids, bidder bids, and interviews over the selected period"
          >
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={data.series} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                <XAxis dataKey="label" stroke={chart.axis} fontSize={12} tick={{ fill: chart.axis }} />
                <YAxis
                  yAxisId="bids"
                  allowDecimals={false}
                  stroke={chart.axis}
                  fontSize={12}
                  tick={{ fill: chart.axis }}
                />
                <YAxis
                  yAxisId="iv"
                  orientation="right"
                  allowDecimals={false}
                  stroke={chart.axis}
                  fontSize={12}
                  tick={{ fill: chart.axis }}
                />
                <Tooltip
                  cursor={{ fill: chart.grid, opacity: 0.6 }}
                  contentStyle={{
                    backgroundColor: chart.tooltipBg,
                    borderColor: chart.tooltipBorder,
                    color: chart.tooltipText,
                  }}
                />
                <Legend wrapperStyle={{ color: chart.axis, fontSize: 12 }} />
                <Bar dataKey="self" name="Self" stackId="b" yAxisId="bids" fill="#0ea5e9" />
                <Bar dataKey="bidder" name="Bidder" stackId="b" yAxisId="bids" fill="#6366f1" />
                <Line dataKey="interviews" name="Interviews" yAxisId="iv" stroke="#10b981" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-xs text-muted">
            Total: {data.totals.bids} bids ({data.totals.self} self · {data.totals.bidder} bidder) ·{' '}
            {data.totals.interviews} interviews
          </p>
        </>
      )}
    </section>
  );
}
