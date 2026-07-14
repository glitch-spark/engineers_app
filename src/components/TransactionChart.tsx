import { BarChart, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Bar } from 'recharts';
import { useChartTheme } from '../theme/useChartTheme';

interface ChartData {
  period: string;
  total: number;
}

interface TransactionChartProps {
  data: ChartData[];
}

export default function TransactionChart({ data }: TransactionChartProps) {
  const chart = useChartTheme();
  const maxValue = Math.max(...data.map(item => item.total), 0);
  const yAxisDomain = maxValue > 0 ? [0, maxValue * 1.1] : [0, 100];

  const formatTooltip = (value: number) => `$${value.toFixed(2)}`;
  const formatYAxis = (value: number) => `$${value.toFixed(0)}`;

  const hasData = data.some(item => item.total > 0);
  const totalAmount = data.reduce((sum, item) => sum + item.total, 0);
  const activeMonths = data.filter(item => item.total > 0).length;
  const averagePerMonth = activeMonths ? (totalAmount / activeMonths) : 0;
  const highestMonth = Math.max(...data.map(item => item.total));

  return (
    <div className="space-y-6">
      <div className="card">
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <defs>
              <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.8} />
                <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.7} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
            <XAxis
              dataKey="period"
              stroke={chart.axis}
              fontSize={14}
              tickLine={false}
              axisLine={false}
              tick={{ fill: chart.axis }}
            />
            <YAxis
              stroke={chart.axis}
              fontSize={14}
              tickLine={false}
              axisLine={false}
              domain={yAxisDomain}
              tickFormatter={formatYAxis}
              tick={{ fill: chart.axis }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: chart.tooltipBg,
                borderColor: chart.tooltipBorder,
                color: chart.tooltipText,
                borderRadius: 10,
              }}
              formatter={formatTooltip}
              labelStyle={{ fontWeight: 'bold', color: chart.tooltipText }}
            />
            <Bar
              dataKey="total"
              fill="url(#barGradient)"
              radius={[12, 12, 0, 0]}
              stroke="#2563eb"
              strokeWidth={2}
              isAnimationActive={true}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {hasData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-6">
          <div className="card text-center">
            <p className="card-header">Total Amount</p>
            <p className="text-2xl font-bold text-primary">${totalAmount.toFixed(2)}</p>
          </div>
          <div className="card text-center">
            <p className="card-header">Active Months</p>
            <p className="text-2xl font-bold text-primary">{activeMonths}</p>
          </div>
          <div className="card text-center">
            <p className="card-header">Average / Month</p>
            <p className="text-2xl font-bold text-primary">${averagePerMonth.toFixed(2)}</p>
          </div>
          <div className="card text-center">
            <p className="card-header">Highest Month</p>
            <p className="text-2xl font-bold text-primary">${highestMonth.toFixed(2)}</p>
          </div>
        </div>
      )}
    </div>
  );
}
