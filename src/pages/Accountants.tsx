import useSWR from 'swr';
import { useMemo, useState } from 'react';
import { TrendingUp, DollarSign, FileText, Download, Loader2 } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import * as api from '../api/endpoints';
import type { TransactionPayerTotal } from '../api/endpoints';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import NameWithAvatar from '../components/NameWithAvatar';
import { mondayOfWeek, toDateInputValue } from '../lib/dateRangePresets';
import { notify } from '../lib/notify';

type Period = 'week' | 'month' | 'quarter' | 'year';

const PERIOD_LABEL: Record<Period, string> = {
  week: 'this week',
  month: 'this month',
  quarter: 'this quarter',
  year: 'this year',
};

type Tx = {
  _id: string;
  date: string;
  amount: number;
  description?: string;
  notes?: string;
  status?: string;
  ownerName?: string;
  ownerEmail?: string;
  payerName?: string;
  payerEmail?: string;
  payMethod?: string | null;
  cardLast4?: string | null;
  billingCycle?: string | null;
};

/** Period-to-date window: from the start of the current week/month/quarter/year through today. */
function periodRange(period: Period, now = new Date()): { from: string; to: string } {
  let start: Date;
  if (period === 'week') start = mondayOfWeek(now);
  else if (period === 'month') start = new Date(now.getFullYear(), now.getMonth(), 1);
  else if (period === 'quarter') start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  else start = new Date(now.getFullYear(), 0, 1);
  return { from: toDateInputValue(start), to: toDateInputValue(now) };
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(rows: Tx[], filename: string) {
  const header = ['Date', 'Description', 'Amount', 'Status', 'Owner', 'Payer', 'Pay method', 'Card last 4', 'Billing cycle', 'Notes'];
  const lines = rows.map((t) => [
    t.date ? toDateInputValue(new Date(t.date)) : '',
    t.description,
    t.amount,
    t.status,
    t.ownerName || t.ownerEmail,
    t.payerName || t.payerEmail,
    t.payMethod,
    t.cardLast4,
    t.billingCycle,
    t.notes,
  ].map(csvCell).join(','));
  const blob = new Blob([[header.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function AccountantsPage() {
  const { ready } = useAuth();
  const [period, setPeriod] = useState<Period>('month');
  const [exporting, setExporting] = useState(false);
  const range = useMemo(() => periodRange(period), [period]);

  const { data, isLoading } = useSWR(
    ready ? ['accountants-tx', range.from, range.to] : null,
    () => api.listTransactions({ from: range.from, to: range.to, limit: 10 }),
    { keepPreviousData: true },
  );

  if (!ready) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoadingSpinner text="Loading..." />
      </div>
    );
  }

  const transactions = (data?.transactions as Tx[] | undefined) ?? [];
  const payerTotals: TransactionPayerTotal[] = data?.payerTotals ?? [];
  const totalCount = data?.pagination?.total ?? 0;
  // Amount sign carries the direction: positive = income, negative = spend (same as the API totals).
  const income = payerTotals.reduce((sum, p) => sum + p.income, 0);
  const expenses = payerTotals.reduce((sum, p) => sum + p.outcome, 0);
  const net = income - expenses;
  const showLoading = isLoading && !data;

  async function exportCsv() {
    if (totalCount === 0) {
      notify.info(`No transactions ${PERIOD_LABEL[period]} to export.`);
      return;
    }
    setExporting(true);
    try {
      const all = await api.listTransactions({ from: range.from, to: range.to, limit: totalCount });
      downloadCsv(all.transactions as Tx[], `transactions_${range.from}_to_${range.to}.csv`);
      notify.success(`Exported ${all.transactions.length} transactions.`);
    } catch (err) {
      notify.error(err, 'Failed to export transactions');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Accountant Dashboard"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-muted" htmlFor="accountants-period">Period:</label>
            <select
              id="accountants-period"
              className="select focus-ring text-sm"
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
            >
              <option value="week">This week</option>
              <option value="month">This month</option>
              <option value="quarter">This quarter</option>
              <option value="year">This year</option>
            </select>
            <button type="button" className="btn-outline btn-sm" onClick={exportCsv} disabled={exporting || showLoading}>
              {exporting
                ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                : <Download className="h-4 w-4" aria-hidden />}
              {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
          </div>
        }
      />

      <p className="text-sm text-muted" role="status">
        {showLoading
          ? 'Loading…'
          : `Showing ${totalCount} ${totalCount === 1 ? 'transaction' : 'transactions'} from ${range.from} to ${range.to}.`}
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Income" icon={<TrendingUp className="h-5 w-5" aria-hidden />} accent loading={showLoading}
          value={formatCurrency(income)} valueClass="text-emerald-700 dark:text-emerald-400" />
        <StatCard label="Expenses" icon={<TrendingUp className="h-5 w-5 rotate-180" aria-hidden />} loading={showLoading}
          value={formatCurrency(expenses)} valueClass="text-red-700 dark:text-red-400" />
        <StatCard label="Net" icon={<DollarSign className="h-5 w-5" aria-hidden />} accent loading={showLoading}
          value={formatCurrency(net)} />
        <StatCard label="Transactions" icon={<FileText className="h-5 w-5" aria-hidden />} loading={showLoading}
          value={String(totalCount)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="panel overflow-hidden p-0">
          <div className="border-b border-zinc-200/80 px-5 py-4 dark:border-zinc-800">
            <h2 className="section-title">Recent Transactions</h2>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {showLoading ? (
              <div className="flex items-center justify-center py-10 text-muted">
                <LoadingSpinner text="Loading transactions..." />
              </div>
            ) : transactions.length > 0 ? (
              <table className="min-w-full text-sm">
                <caption className="sr-only">10 most recent transactions {PERIOD_LABEL[period]}</caption>
                <thead className="table-head">
                  <tr>
                    <th scope="col" className="px-4 py-2 text-left">Date</th>
                    <th scope="col" className="px-4 py-2 text-left">Description</th>
                    <th scope="col" className="px-4 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => (
                    <tr key={t._id} className="table-row border-t border-zinc-200/80 dark:border-zinc-800">
                      <td className="px-4 py-2">{new Date(t.date).toLocaleDateString()}</td>
                      <td className="px-4 py-2">{t.description || '—'}</td>
                      <td className={`px-4 py-2 text-right font-medium tabular-nums ${
                        t.amount >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'
                      }`}>
                        {t.amount >= 0 ? '+' : '−'}{formatCurrency(Math.abs(t.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty-state-desc px-4 py-10">No transactions {PERIOD_LABEL[period]}</div>
            )}
          </div>
        </div>

        <div className="panel overflow-hidden p-0">
          <div className="border-b border-zinc-200/80 px-5 py-4 dark:border-zinc-800">
            <h2 className="section-title">By Payer</h2>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {showLoading ? (
              <div className="flex items-center justify-center py-10 text-muted">
                <LoadingSpinner text="Loading payers..." />
              </div>
            ) : payerTotals.length > 0 ? (
              <ul className="space-y-2 p-4">
                {payerTotals.map((p) => (
                  <li key={p.payerId} className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
                    <div className="min-w-0">
                      <NameWithAvatar name={p.name || p.email} imageUrl={p.image} className="font-medium text-zinc-900 dark:text-zinc-100" />
                      <p className="mt-0.5 text-sm text-muted">
                        {p.count} {p.count === 1 ? 'transaction' : 'transactions'}
                      </p>
                    </div>
                    <p className="text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                      {formatCurrency(p.outcome)}
                      <span className="sr-only"> spent</span>
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty-state-desc px-4 py-10">No payers {PERIOD_LABEL[period]}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label, value, icon, accent = false, loading, valueClass = '',
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: boolean;
  loading: boolean;
  valueClass?: string;
}) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="stat-card-label">{label}</p>
          <p className={`stat-card-value ${valueClass}`}>
            {loading ? <LoadingValue /> : value}
          </p>
        </div>
        <div className={accent ? 'stat-card-icon-accent' : 'stat-card-icon'}>{icon}</div>
      </div>
    </div>
  );
}

/** Placeholder shown in a stat card while data loads; announced as "Loading". */
function LoadingValue() {
  return (
    <>
      <span aria-hidden>…</span>
      <span className="sr-only">Loading</span>
    </>
  );
}
