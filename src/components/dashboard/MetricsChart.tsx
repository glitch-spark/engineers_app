import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { DashboardMetrics } from '../../api/endpoints';

type SeriesKey = 'income' | 'bids' | 'interviews' | 'rate';

const ALL_SERIES: { key: SeriesKey; label: string; color: string; axis: 'left' | 'right' }[] = [
  { key: 'income', label: 'Income ($)', color: '#2563eb', axis: 'left' },
  { key: 'bids', label: 'Bids', color: '#16a34a', axis: 'left' },
  { key: 'interviews', label: 'Interviews', color: '#d97706', axis: 'left' },
  { key: 'rate', label: 'Conversion %', color: '#7c3aed', axis: 'right' },
];

function formatBucketLabel(iso: string, bucket: string): string {
  const d = new Date(iso);
  if (bucket === 'month') return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  if (bucket === 'week') return `Wk of ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function MetricsChart({
  data,
  metrics,
}: {
  data: DashboardMetrics;
  metrics?: SeriesKey[];
}) {
  const SERIES = metrics ? ALL_SERIES.filter((s) => metrics.includes(s.key)) : ALL_SERIES;
  const initialActive = (key: SeriesKey) => (metrics ? metrics.includes(key) : key !== 'rate');
  const [active, setActive] = useState<Record<SeriesKey, boolean>>({
    income: initialActive('income'),
    bids: initialActive('bids'),
    interviews: initialActive('interviews'),
    rate: initialActive('rate'),
  });

  const chartData = useMemo(
    () =>
      data.series.map((p) => ({
        label: formatBucketLabel(p.bucketStart, data.bucket),
        income: p.income,
        bids: p.bids,
        interviews: p.interviews,
        rate: +(p.rate * 100).toFixed(1),
      })),
    [data.series, data.bucket],
  );

  const visible = SERIES.filter((s) => active[s.key]);

  return (
    <section className="bg-white rounded-md border border-gray-100 shadow-sm p-4">
      <header className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Trend</h2>
        <div className="flex items-center gap-1.5">
          {SERIES.map((s) => (
            <label
              key={s.key}
              className="inline-flex items-center gap-1.5 text-xs text-gray-600 px-2 py-1 rounded border border-gray-200 cursor-pointer hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={active[s.key]}
                onChange={(e) => setActive({ ...active, [s.key]: e.target.checked })}
              />
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
            </label>
          ))}
        </div>
      </header>

      {chartData.length === 0 ? (
        <div className="text-sm text-gray-400 p-6 text-center">No data in this window.</div>
      ) : (
        <div style={{ width: '100%', height: 320 }}>
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 6 }}
                formatter={(v: number, name: string) => {
                  if (name === 'Income ($)') return [`$${v.toLocaleString()}`, name];
                  if (name === 'Conversion %') return [`${v}%`, name];
                  return [v, name];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {visible.map((s) => (
                <Line
                  key={s.key}
                  yAxisId={s.axis}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
