'use client';

import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import { useMemo, useState } from 'react';
import TransactionChart from '@/components/TransactionChart';

const fetcher = (u: string) => fetch(u).then(r => r.json());
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function getYearOptions(range = 6) {
  const y0 = new Date().getFullYear();
  const y2030 = 2030;
  const years = [];
  
  // Add years from current year up to 2030
  for (let year = y0; year <= y2030; year++) {
    years.push(year);
  }
  
  return years;
}

type SummaryData = {
  monthly: { period: string; total: number }[];
  stats: {
    totalAmount: number;
    totalCount: number;
    avgAmount: number;
    minAmount: number;
    maxAmount: number;
  };
  statusBreakdown: {
    [key: string]: { count: number; total: number };
  };
};

export default function DashboardPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === 'admin';
  const currentUserId = (session?.user as any)?.id;
  const currentUserName = (session?.user as any)?.name || (session?.user as any)?.email;

  const [userId, setUserId] = useState<string>('');
  const [year, setYear] = useState<number>(new Date().getFullYear());

  const summaryUrl = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set('year', String(year));
    if (isAdmin && userId) qs.set('userId', userId);
    return `/api/transactions/summary?${qs.toString()}`;
  }, [isAdmin, userId, year]);

  const { data: summary, error: summaryError } = useSWR<SummaryData>(summaryUrl, fetcher);
  const { data: usersData } = useSWR<{ users: any[]; pagination: any } | null>(isAdmin ? '/api/users' : null, fetcher);
  const users = usersData?.users || [];

     // Handle both old and new API response formats
   const monthlyData = summary?.monthly || (Array.isArray(summary) ? summary : []);
   
   // Create a map of month index (0-11) to total amount
   const monthTotals = new Map<number, number>();
   monthlyData.forEach((r: any) => {
     // Parse the period string (e.g., "2025-01" -> month 0, "2025-12" -> month 11)
     const monthStr = r.period.split('-')[1];
     if (monthStr) {
       const monthIndex = parseInt(monthStr, 10) - 1; // Convert 1-12 to 0-11
       monthTotals.set(monthIndex, r.total);
     }
   });
   
   const chartData = Array.from({ length: 12 }, (_, i) => {
     const total = monthTotals.get(i) ?? 0;
     return { period: MONTH_LABELS[i], total };
   });
  
  // Ensure chart data is never empty
  const finalChartData = chartData.length > 0 ? chartData : Array.from({ length: 12 }, (_, i) => ({
    period: MONTH_LABELS[i],
    total: 0
  }));
  
  // Calculate summary statistics
  const totalAmount = summary?.stats?.totalAmount || chartData.reduce((sum, item) => sum + item.total, 0);
  const totalCount = summary?.stats?.totalCount || 0;
  const avgAmount = summary?.stats?.avgAmount || 0;
  const monthlyAverage = totalAmount / 12;
  const monthsWithTransactions = chartData.filter(item => item.total > 0).length;
  const averagePerMonth = monthsWithTransactions > 0 ? totalAmount / monthsWithTransactions : 0;

  // Status breakdown
  const statusBreakdown = summary?.statusBreakdown || {};
  const pendingCount = statusBreakdown.pending?.count || 0;
  const approvedCount = statusBreakdown.approved?.count || 0;
  const rejectedCount = statusBreakdown.rejected?.count || 0;

  // Determine whose transactions are being shown
  const getDisplayUser = () => {
    if (isAdmin && userId) {
      const selectedUser = users?.find(u => u._id === userId);
      return selectedUser?.name || selectedUser?.email || 'Selected User';
    }
    return currentUserName;
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-end gap-4 lg:gap-6">
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
          <p className="text-gray-600">
            Welcome back, {currentUserName}! Here's your financial overview for {year}.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="form-group">
            <label className="form-label">Year</label>
            <select 
              className="select focus-ring" 
              value={year} 
              onChange={e => setYear(parseInt(e.target.value, 10))}
            >
              {getYearOptions(6).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {isAdmin && (
            <div className="form-group">
              <label className="form-label">User</label>
              <select 
                className="select focus-ring" 
                value={userId} 
                onChange={e => setUserId(e.target.value)}
              >
                <option value="">All users</option>
                {(users || []).map(u => (
                  <option key={u._id} value={u._id}>
                    {u.name || u.email}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Error Display */}
      {summaryError && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-full">
              <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-red-800">Error loading data</h3>
              <p className="text-sm text-red-700 mt-1">{summaryError.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card group hover:shadow-medium transition-all duration-300">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600 mb-1">Total Amount</p>
              <p className="text-3xl font-bold text-gray-900">${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="text-xs text-gray-500 mt-1">All transactions this year</p>
            </div>
            <div className="p-4 bg-blue-100 rounded-2xl group-hover:bg-blue-200 transition-colors duration-300">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
              </svg>
            </div>
          </div>
        </div>

        <div className="card group hover:shadow-medium transition-all duration-300">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600 mb-1">Total Transactions</p>
              <p className="text-3xl font-bold text-gray-900">{totalCount.toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-1">Transaction count</p>
            </div>
            <div className="p-4 bg-green-100 rounded-2xl group-hover:bg-green-200 transition-colors duration-300">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="card group hover:shadow-medium transition-all duration-300">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600 mb-1">Average Amount</p>
              <p className="text-3xl font-bold text-gray-900">${avgAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="text-xs text-gray-500 mt-1">Per transaction</p>
            </div>
            <div className="p-4 bg-yellow-100 rounded-2xl group-hover:bg-yellow-200 transition-colors duration-300">
              <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="card group hover:shadow-medium transition-all duration-300">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600 mb-1">Active Months</p>
              <p className="text-3xl font-bold text-gray-900">{monthsWithTransactions}</p>
              <p className="text-xs text-gray-500 mt-1">Out of 12 months</p>
            </div>
            <div className="p-4 bg-purple-100 rounded-2xl group-hover:bg-purple-200 transition-colors duration-300">
              <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Status Breakdown */}
      {totalCount > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="card group hover:shadow-medium transition-all duration-300">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600 mb-1">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">{pendingCount.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {totalCount > 0 ? `${((pendingCount / totalCount) * 100).toFixed(1)}%` : '0%'} of total
                </p>
              </div>
              <div className="p-4 bg-yellow-100 rounded-2xl group-hover:bg-yellow-200 transition-colors duration-300">
                <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="card group hover:shadow-medium transition-all duration-300">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600 mb-1">Approved</p>
                <p className="text-2xl font-bold text-green-600">{approvedCount.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {totalCount > 0 ? `${((approvedCount / totalCount) * 100).toFixed(1)}%` : '0%'} of total
                </p>
              </div>
              <div className="p-4 bg-green-100 rounded-2xl group-hover:bg-green-200 transition-colors duration-300">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
          </div>

          <div className="card group hover:shadow-medium transition-all duration-300">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600 mb-1">Rejected</p>
                <p className="text-2xl font-bold text-red-600">{rejectedCount.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {totalCount > 0 ? `${((rejectedCount / totalCount) * 100).toFixed(1)}%` : '0%'} of total
                </p>
              </div>
              <div className="p-4 bg-red-100 rounded-2xl group-hover:bg-red-200 transition-colors duration-300">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chart Section */}
      <div className="card group hover:shadow-medium transition-all duration-300">
        <div className="mb-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Transaction Amounts by Month</h3>
          <p className="text-gray-600">
            Monthly transaction totals for <span className="font-medium">{getDisplayUser()}</span> in <span className="font-medium">{year}</span>
          </p>
        </div>
        <TransactionChart data={finalChartData} />
      </div>

    </div>
  );
}
