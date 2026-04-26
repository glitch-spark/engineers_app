'use client';

import { BarChart, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Bar } from 'recharts';

interface ChartData {
  period: string;
  total: number;
}

interface TransactionChartProps {
  data: ChartData[];
}

export default function TransactionChart({ data }: TransactionChartProps) {
  // Debug logging
  // console.log('TransactionChart received data:', data);

  // Calculate max value for better Y-axis scaling
  const maxValue = Math.max(...data.map(item => item.total), 0);
  const yAxisDomain = maxValue > 0 ? [0, maxValue * 1.1] : [0, 100];

  const formatTooltip = (value: number) => {
    return `$${value.toFixed(2)}`;
  };

  const formatYAxis = (value: number) => {
    return `$${value.toFixed(0)}`;
  };

  // Check if we have any non-zero data
  const hasData = data.some(item => item.total > 0);
  const totalAmount = data.reduce((sum, item) => sum + item.total, 0);
  const activeMonths = data.filter(item => item.total > 0).length;
  const averagePerMonth = activeMonths ? (totalAmount / activeMonths) : 0;
  const highestMonth = Math.max(...data.map(item => item.total));

  return (
    <div className="space-y-6">
      {/* Chart */}
      <div className="card">
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <defs>
              <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.8} />
                <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.7} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis 
              dataKey="period" 
              stroke="#2563eb"
              fontSize={14}
              tickLine={false}
              axisLine={false}
            />
            <YAxis 
              stroke="#2563eb"
              fontSize={14}
              tickLine={false}
              axisLine={false}
              domain={yAxisDomain}
              tickFormatter={formatYAxis}
            />
            <Tooltip 
              contentStyle={{
                background: 'linear-gradient(135deg, #e0e7ff 0%, #f3f4f6 100%)',
                border: '1px solid #a5b4fc',
                borderRadius: '10px',
                boxShadow: '0 6px 12px -2px rgba(59, 130, 246, 0.15)'
              }}
              formatter={formatTooltip}
              labelStyle={{ fontWeight: 'bold', color: '#2563eb' }}
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

      {/* Summary Stats Below Chart */}
      {hasData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-6">
          <div className="card text-center">
            <p className="card-header">Total Amount</p>
            <p className="text-2xl font-bold text-primary">${totalAmount.toFixed(2)}</p>
          </div>
          <div className="card text-center">
            <p className="card-header">Active Months</p>
            <p className="text-2xl font-bold text-green-600">{activeMonths}</p>
          </div>
          <div className="card text-center">
            <p className="card-header">Average/Month</p>
            <p className="text-2xl font-bold text-yellow-600">${averagePerMonth.toFixed(2)}</p>
          </div>
          <div className="card text-center">
            <p className="card-header">Highest Month</p>
            <p className="text-2xl font-bold text-purple-600">${highestMonth.toFixed(2)}</p>
          </div>
        </div>
      )}

      {/* No Data Message */}
      {!hasData && (
        <div className="card text-center py-12 text-gray-500">
          <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Transaction Data</h3>
          <p className="text-gray-600">
            No transactions found for the selected period. Try selecting a different year or check if transactions exist.
          </p>
        </div>
      )}
    </div>
  );
}
