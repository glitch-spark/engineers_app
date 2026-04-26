'use client';
import useSWR from 'swr';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { BarChart3, TrendingUp, DollarSign, FileText } from 'lucide-react';

const fetcher = (u: string) => fetch(u).then(r => r.json());

export default function AccountantsPage() {
  const { data: session, status } = useSession();
  const [selectedPeriod, setSelectedPeriod] = useState('month');
  
  // RoleGuard handles access control, just show loading while session loads
  if (status === 'loading') return <div>Loading...</div>;

  const { data: transactions, isLoading: transactionsLoading } = useSWR('/api/transactions', fetcher);
  const { data: accounts, isLoading: accountsLoading } = useSWR('/api/accounts', fetcher);
  const { data: summary, isLoading: summaryLoading } = useSWR('/api/transactions/summary', fetcher);

  const isLoading = transactionsLoading || accountsLoading || summaryLoading;

  const getPeriodLabel = (period: string) => {
    switch (period) {
      case 'week': return 'This Week';
      case 'month': return 'This Month';
      case 'quarter': return 'This Quarter';
      case 'year': return 'This Year';
      default: return 'This Month';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Accountant Dashboard</h1>
        <div className="flex items-center space-x-2">
          <label className="text-sm text-gray-600">Period:</label>
          <select
            className="select focus-ring text-sm"
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
          >
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="quarter">Quarter</option>
            <option value="year">Year</option>
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Revenue</p>
              <p className="text-2xl font-bold text-green-600">
                {isLoading ? '...' : formatCurrency(summary?.totalRevenue || 0)}
              </p>
            </div>
            <div className="p-2 bg-green-100 rounded-lg">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Expenses</p>
              <p className="text-2xl font-bold text-red-600">
                {isLoading ? '...' : formatCurrency(summary?.totalExpenses || 0)}
              </p>
            </div>
            <div className="p-2 bg-red-100 rounded-lg">
              <TrendingUp className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Net Profit</p>
              <p className="text-2xl font-bold text-blue-600">
                {isLoading ? '...' : formatCurrency((summary?.totalRevenue || 0) - (summary?.totalExpenses || 0))}
              </p>
            </div>
            <div className="p-2 bg-blue-100 rounded-lg">
              <DollarSign className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Transactions</p>
              <p className="text-2xl font-bold text-purple-600">
                {isLoading ? '...' : transactions?.length || 0}
              </p>
            </div>
            <div className="p-2 bg-purple-100 rounded-lg">
              <FileText className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Financial Reports Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Transactions */}
        <div className="card p-0 overflow-hidden">
          <div className="p-4 border-b">
            <h3 className="text-lg font-semibold">Recent Transactions</h3>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-center text-gray-500">Loading transactions...</div>
            ) : transactions && transactions.length > 0 ? (
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left">Date</th>
                    <th className="px-4 py-2 text-left">Description</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.slice(0, 10).map((t: any) => (
                    <tr key={t._id} className="border-t">
                      <td className="px-4 py-2">
                        {new Date(t.date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2">{t.description}</td>
                      <td className={`px-4 py-2 text-right ${
                        t.type === 'income' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {t.type === 'income' ? '+' : '-'}{formatCurrency(Math.abs(t.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-4 text-center text-gray-500">No transactions found</div>
            )}
          </div>
        </div>

        {/* Account Balances */}
        <div className="card p-0 overflow-hidden">
          <div className="p-4 border-b">
            <h3 className="text-lg font-semibold">Account Balances</h3>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-center text-gray-500">Loading accounts...</div>
            ) : accounts && accounts.length > 0 ? (
              <div className="p-4 space-y-3">
                {accounts.map((account: any) => (
                  <div key={account._id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium">{account.name}</p>
                      <p className="text-sm text-gray-600">{account.type}</p>
                    </div>
                    <p className="text-lg font-semibold text-blue-600">
                      {formatCurrency(account.balance)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-gray-500">No accounts found</div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card p-4">
        <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
        <div className="flex flex-wrap gap-3">
          <button className="btn bg-blue-600 hover:bg-blue-700 text-white">
            <BarChart3 className="w-4 h-4 mr-2" />
            Generate Report
          </button>
          <button className="btn bg-green-600 hover:bg-green-700 text-white">
            <FileText className="w-4 h-4 mr-2" />
            Export Data
          </button>
          <button className="btn bg-purple-600 hover:bg-purple-700 text-white">
            <TrendingUp className="w-4 h-4 mr-2" />
            Financial Analysis
          </button>
        </div>
      </div>
    </div>
  );
}
