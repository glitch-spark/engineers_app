import useSWR from 'swr';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DollarSign, Hash, BarChart3, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import TransactionChart from '../components/TransactionChart';
import DashboardOverview from '../components/dashboard/DashboardOverview';
import MotivationHero from '../components/MotivationHero';
import { useAuth } from '../auth/useAuth';
import * as api from '../api/endpoints';

type Tab = 'performance' | 'transactions';

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function getYearOptions() {
  const y0 = new Date().getFullYear();
  const y2030 = 2030;
  const years: number[] = [];
  for (let year = y0; year <= y2030; year++) years.push(year);
  return years;
}

function dollar(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export default function DashboardPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab | null) || 'performance';
  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-3">Dashboard</h1>
        <MotivationHero userId={user?.id} />
      </div>

      <div className="flex items-center gap-1 border-b border-gray-200">
        <TabBtn active={tab === 'performance'} onClick={() => setTab('performance')}>
          Performance
        </TabBtn>
        <TabBtn active={tab === 'transactions'} onClick={() => setTab('transactions')}>
          Transactions
        </TabBtn>
      </div>

      {tab === 'performance' && (
        <DashboardOverview
          metrics={['rate', 'bids', 'interviews']}
          title="Job-search performance"
          storageNs="perf"
        />
      )}

      {tab === 'transactions' && <TransactionsView isAdmin={isAdmin} />}
    </div>
  );
}

function TransactionsView({ isAdmin }: { isAdmin: boolean }) {
  const [userId, setUserId] = useState<string>('');
  const [year, setYear] = useState<number>(new Date().getFullYear());

  const summaryKey = useMemo(
    () => ['summary', year, isAdmin ? userId : ''] as const,
    [isAdmin, userId, year],
  );
  const { data: summary, error, isLoading } = useSWR(summaryKey, () =>
    api.transactionSummary({ year, ...(isAdmin && userId ? { userId } : {}) }),
  );
  const { data: usersData } = useSWR(isAdmin ? ['users-list'] : null, () => api.listUsers());
  const users = (usersData?.users as Array<{ _id: string; name?: string; email?: string }>) || [];

  const monthlyData = summary?.monthly || [];
  const monthTotals = new Map<number, number>();
  monthlyData.forEach((r) => {
    const monthStr = r.period.split('-')[1];
    if (monthStr) {
      const monthIndex = parseInt(monthStr, 10) - 1;
      monthTotals.set(monthIndex, r.total);
    }
  });
  const chartData = Array.from({ length: 12 }, (_, i) => ({
    period: MONTH_LABELS[i],
    total: monthTotals.get(i) ?? 0,
  }));

  const totalAmount = summary?.stats?.totalAmount ?? 0;
  const totalCount = summary?.stats?.totalCount ?? 0;
  const avgAmount = summary?.stats?.avgAmount ?? 0;
  const sb = summary?.statusBreakdown || {};
  const pendingCount = sb.pending?.count || 0;
  const approvedCount = sb.approved?.count || 0;
  const rejectedCount = sb.rejected?.count || 0;

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Transactions</h2>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white"
          >
            {getYearOptions().map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {isAdmin && (
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white"
            >
              <option value="">All users</option>
              {users.map((u) => (
                <option key={u._id} value={u._id}>{u.name || u.email}</option>
              ))}
            </select>
          )}
        </div>
      </header>

      {error ? (
        <div className="bg-white rounded-md border border-red-100 p-4 text-sm text-red-700">
          {(error as Error).message}
        </div>
      ) : isLoading ? (
        <div className="bg-white rounded-md border border-gray-100 p-4 flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading transactions…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            <StatCard
              label="Total amount"
              value={dollar(totalAmount)}
              icon={<DollarSign className="w-4 h-4" />}
              footer={`for ${year}`}
              highlight
            />
            <StatCard
              label="Transactions"
              value={totalCount.toLocaleString()}
              icon={<Hash className="w-4 h-4" />}
              footer="approved + pending + rejected"
            />
            <StatCard
              label="Average"
              value={dollar(avgAmount)}
              icon={<BarChart3 className="w-4 h-4" />}
              footer="per transaction"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              label="Pending"
              value={pendingCount.toLocaleString()}
              icon={<Clock className="w-4 h-4 text-amber-600" />}
              footer={totalCount ? `${((pendingCount / totalCount) * 100).toFixed(1)}% of total` : '—'}
              tone="amber"
            />
            <StatCard
              label="Approved"
              value={approvedCount.toLocaleString()}
              icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />}
              footer={totalCount ? `${((approvedCount / totalCount) * 100).toFixed(1)}% of total` : '—'}
              tone="emerald"
            />
            <StatCard
              label="Rejected"
              value={rejectedCount.toLocaleString()}
              icon={<XCircle className="w-4 h-4 text-rose-600" />}
              footer={totalCount ? `${((rejectedCount / totalCount) * 100).toFixed(1)}% of total` : '—'}
              tone="rose"
            />
          </div>

          <div className="bg-white rounded-md border border-gray-100 shadow-sm p-4">
            <header className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Monthly</h3>
              <span className="text-xs text-gray-400">amounts per month, {year}</span>
            </header>
            <TransactionChart data={chartData} />
          </div>
        </>
      )}
    </section>
  );
}

function StatCard({
  label, value, icon, footer, highlight, tone,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  footer?: string;
  highlight?: boolean;
  tone?: 'amber' | 'emerald' | 'rose';
}) {
  const valueClass =
    tone === 'amber' ? 'text-amber-600'
    : tone === 'emerald' ? 'text-emerald-600'
    : tone === 'rose' ? 'text-rose-600'
    : 'text-gray-900';
  return (
    <div
      className={
        'rounded-md border p-4 bg-white shadow-sm ' +
        (highlight ? 'border-blue-200 ring-1 ring-blue-100' : 'border-gray-100')
      }
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">{label}</span>
        <span className="text-gray-400">{icon}</span>
      </div>
      <div className={`mt-1 text-2xl font-semibold ${valueClass}`}>{value}</div>
      {footer && <div className="mt-1.5 text-xs text-gray-400">{footer}</div>}
    </div>
  );
}

function TabBtn({
  active, onClick, children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ' +
        (active
          ? 'border-blue-600 text-blue-700'
          : 'border-transparent text-gray-600 hover:text-gray-900')
      }
    >
      {children}
    </button>
  );
}
