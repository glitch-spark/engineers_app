import useSWR from 'swr';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  type TooltipProps,
} from 'recharts';
import * as api from '../../api/endpoints';
import { todayInputValue } from '../../lib/week';
import { useChartTheme } from '../../theme/useChartTheme';

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

/** Short English month; January also carries a 2-digit year marker ("Jan 26"). */
function monthLabel(period: string): string {
  const [y, m] = period.split('-').map(Number);
  const month = new Date(y, (m || 1) - 1, 1).toLocaleDateString('en-US', { month: 'short' });
  return m === 1 ? `${month} ${String(y).slice(-2)}` : month;
}

type MonthRow = api.DashboardNetMonthly['months'][number] & { label: string };

export default function NetIncomeCard({ userId }: { userId?: string }) {
  const chart = useChartTheme();
  const today = todayInputValue();
  const { data, error, isLoading, mutate } = useSWR(
    ['dashboard-net', userId ?? 'me', today],
    () => api.getDashboardNetMonthly({ userId, today }),
  );

  if (error) {
    return (
      <section className="panel p-4">
        <h2 className="card-title mb-3">Net income · last 12 months</h2>
        <p className="text-sm text-muted mb-3">Couldn&rsquo;t load transactions.</p>
        <button type="button" className="btn-outline" onClick={() => mutate()}>
          Retry
        </button>
      </section>
    );
  }

  if (isLoading || !data) {
    return (
      <section className="panel p-4 space-y-3">
        <div className="skeleton h-5 w-64" />
        <div className="skeleton h-[260px] w-full" />
      </section>
    );
  }

  const rows: MonthRow[] = data.months.map((m) => ({ ...m, label: monthLabel(m.period) }));
  const thisMonth = rows.length ? rows[rows.length - 1].net : 0;

  return (
    <section className="panel p-4">
      <header className="mb-3">
        <h2 className="card-title">Net income · last 12 months</h2>
        <p className="mt-1 text-sm text-muted">
          12-mo total {currency.format(data.total)} · This month {currency.format(thisMonth)}
        </p>
      </header>

      <div role="img" aria-label="Bar chart of monthly net income over the last 12 months">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
            <XAxis dataKey="label" stroke={chart.axis} fontSize={12} tick={{ fill: chart.axis }} />
            <YAxis
              stroke={chart.axis}
              fontSize={12}
              tick={{ fill: chart.axis }}
              tickFormatter={(v: number) => currency.format(v)}
            />
            <ReferenceLine y={0} stroke={chart.axis} />
            <Tooltip
              cursor={{ fill: chart.grid, opacity: 0.6 }}
              content={<NetTooltip />}
            />
            <Bar dataKey="net" maxBarSize={36}>
              {rows.map((r) => (
                <Cell key={r.period} fill={r.net >= 0 ? '#10b981' : '#ef4444'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function NetTooltip({ active, payload }: TooltipProps<number, string>) {
  const chart = useChartTheme();
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as MonthRow;
  return (
    <div
      className="rounded-md border px-3 py-2 text-xs shadow-sm"
      style={{ backgroundColor: chart.tooltipBg, borderColor: chart.tooltipBorder, color: chart.tooltipText }}
    >
      <div className="font-semibold mb-1">{row.label}</div>
      <div>Income {currency.format(row.income)}</div>
      <div>Outcome {currency.format(row.outcome)}</div>
      <div className="font-medium">Net {currency.format(row.net)}</div>
    </div>
  );
}
