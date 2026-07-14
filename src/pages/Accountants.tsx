import useSWR from 'swr';
import { useState } from 'react';
import { BarChart3, TrendingUp, DollarSign, FileText } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import * as api from '../api/endpoints';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';

export default function AccountantsPage() {
  const { ready } = useAuth();
  const [selectedPeriod, setSelectedPeriod] = useState('month');

  const { data: txData, isLoading: transactionsLoading } = useSWR(
    ready ? ['accountants-tx'] : null,
    () => api.listTransactions()
  );
  const { data: accData, isLoading: accountsLoading } = useSWR(
    ready ? ['accountants-acc'] : null,
    () => api.listAccounts()
  );
  const { data: summary, isLoading: summaryLoading } = useSWR(
    ready ? ['accountants-summary'] : null,
    () => api.transactionSummary()
  );

  if (!ready) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoadingSpinner text="Loading..." />
      </div>
    );
  }

  const transactions = (txData?.transactions as Array<{ _id: string; date: string; description?: string; amount: number; type?: string }>) || [];
  const accounts = (accData?.accounts as Array<{ _id: string; name: string; type?: string; balance?: number }>) || [];

  const isLoading = transactionsLoading || accountsLoading || summaryLoading;

  const totalRevenue = summary?.stats?.totalAmount || 0;
  const totalExpenses = 0;
  const netProfit = totalRevenue - totalExpenses;
  const totalCount = summary?.stats?.totalCount || transactions.length;

  void selectedPeriod;

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  return (
    <div className="page-stack">
      <PageHeader
        title="Accountant Dashboard"
        action={
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted">Period:</label>
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
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="stat-card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="stat-card-label">Total Revenue</p>
              <p className="stat-card-value text-emerald-600 dark:text-emerald-400">
                {isLoading ? '…' : formatCurrency(totalRevenue)}
              </p>
            </div>
            <div className="stat-card-icon-accent">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="stat-card-label">Total Expenses</p>
              <p className="stat-card-value text-red-600 dark:text-red-400">
                {isLoading ? '…' : formatCurrency(totalExpenses)}
              </p>
            </div>
            <div className="stat-card-icon">
              <TrendingUp className="h-5 w-5 rotate-180" />
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="stat-card-label">Net Profit</p>
              <p className="stat-card-value">
                {isLoading ? '…' : formatCurrency(netProfit)}
              </p>
            </div>
            <div className="stat-card-icon-accent">
              <DollarSign className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="stat-card-label">Total Transactions</p>
              <p className="stat-card-value">
                {isLoading ? '…' : totalCount}
              </p>
            </div>
            <div className="stat-card-icon">
              <FileText className="h-5 w-5" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="panel overflow-hidden p-0">
          <div className="border-b border-zinc-200/80 px-5 py-4 dark:border-zinc-800">
            <h3 className="section-title">Recent Transactions</h3>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-10 text-muted">
                <LoadingSpinner text="Loading transactions..." />
              </div>
            ) : transactions.length > 0 ? (
              <table className="min-w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="px-4 py-2 text-left">Date</th>
                    <th className="px-4 py-2 text-left">Description</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.slice(0, 10).map((t) => (
                    <tr key={t._id} className="table-row border-t border-zinc-200/80 dark:border-zinc-800">
                      <td className="px-4 py-2">{new Date(t.date).toLocaleDateString()}</td>
                      <td className="px-4 py-2">{t.description}</td>
                      <td className={`px-4 py-2 text-right font-medium ${
                        t.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                      }`}>
                        {t.type === 'income' ? '+' : '-'}{formatCurrency(Math.abs(t.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty-state-desc px-4 py-10">No transactions found</div>
            )}
          </div>
        </div>

        <div className="panel overflow-hidden p-0">
          <div className="border-b border-zinc-200/80 px-5 py-4 dark:border-zinc-800">
            <h3 className="section-title">Account Balances</h3>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-10 text-muted">
                <LoadingSpinner text="Loading accounts..." />
              </div>
            ) : accounts.length > 0 ? (
              <div className="space-y-2 p-4">
                {accounts.map((account) => (
                  <div key={account._id} className="flex items-center justify-between rounded-xl border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
                    <div>
                      <p className="font-medium text-zinc-900 dark:text-zinc-100">{account.name}</p>
                      <p className="text-sm text-muted">{account.type}</p>
                    </div>
                    <p className="text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                      {formatCurrency(account.balance ?? 0)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state-desc px-4 py-10">No accounts found</div>
            )}
          </div>
        </div>
      </div>

      <div className="panel p-5">
        <h3 className="section-title mb-4">Quick Actions</h3>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn-accent btn-sm">
            <BarChart3 className="h-4 w-4" />
            Generate Report
          </button>
          <button type="button" className="btn-outline btn-sm">
            <FileText className="h-4 w-4" />
            Export Data
          </button>
          <button type="button" className="btn-outline btn-sm">
            <TrendingUp className="h-4 w-4" />
            Financial Analysis
          </button>
        </div>
      </div>
    </div>
  );
}
