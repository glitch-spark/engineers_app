import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, Tooltip } from 'recharts';

/** Shared rendering helpers used by both the Leaderboard page (rank table)
 *  and the Dashboard page (personal cockpit) so the two stay visually and
 *  semantically aligned. */

export function fmtConversion(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

export function deltaPct(cur: number, prev: number): number | null {
  if (prev === 0) return cur > 0 ? 100 : null;
  return Math.round(((cur - prev) / prev) * 100);
}

export function Delta({ cur, prev, large = false }: { cur: number; prev: number; large?: boolean }) {
  const d = deltaPct(cur, prev);
  if (d === null) return <span className={large ? 'text-sm text-gray-300' : 'text-xs text-gray-300'}>—</span>;
  const Icon = d > 0 ? TrendingUp : d < 0 ? TrendingDown : Minus;
  const color = d > 0 ? 'text-emerald-600' : d < 0 ? 'text-rose-600' : 'text-gray-400';
  const sz = large ? 12 : 10;
  const cls = large ? 'text-sm' : 'text-xs';
  return (
    <span className={`inline-flex items-center gap-0.5 ${cls} ${color}`}>
      <Icon size={sz} />
      {Math.abs(d)}%
    </span>
  );
}

export function RankChip({ rank, large = false }: { rank?: number | null; large?: boolean }) {
  if (!rank) return null;
  const cls = rank === 1 ? 'bg-amber-100 text-amber-800'
    : rank === 2 ? 'bg-gray-200 text-gray-700'
    : rank === 3 ? 'bg-orange-100 text-orange-800'
    : 'bg-gray-50 text-gray-500';
  const size = large ? 'px-2 py-0.5 text-xs' : 'px-1.5 py-0.5 text-[10px]';
  return <span className={`inline-block rounded ${size} font-semibold ${cls}`}>#{rank}</span>;
}

export function TargetCell({ value, target }: { value: number; target: number }) {
  if (target <= 0) return <span className="text-gray-400">—</span>;
  const pct = Math.round((value / target) * 100);
  const color = pct >= 100 ? 'text-emerald-600' : pct >= 60 ? 'text-blue-600' : 'text-amber-600';
  return <span className={`text-xs font-medium ${color}`}>{pct}%</span>;
}

export function MiniTrend({
  data, height = 32, width,
}: {
  data: { label: string; bids: number; interviews: number }[];
  height?: number;
  width?: number | string;
}) {
  if (!data.length) return null;
  return (
    <div style={{ width: width ?? 96, height }}>
      <ResponsiveContainer>
        <LineChart data={data}>
          <Tooltip
            contentStyle={{ fontSize: 11, padding: '4px 8px' }}
            formatter={(v: number, name: string) => [`${v}`, name]}
            labelFormatter={(l) => l}
          />
          <Line type="monotone" dataKey="bids" stroke="#2563eb" strokeWidth={1.5} dot={false} />
          <Line type="monotone" dataKey="interviews" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
