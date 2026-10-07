import useSWR from 'swr';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Modal from '../components/Modal';
import { Pencil, Trash2, CheckCircle, XCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import * as api from '../api/endpoints';
import { ApiError } from '../api/client';
import { messageOf, notify } from '../lib/notify';
import { calendarPeriodRange, formatCalendarPeriod, type CalendarPeriod } from '../lib/dateRangePresets';
import NameWithAvatar from '../components/NameWithAvatar';
import PageHeader from '../components/PageHeader';

type PayMethod = 'coin' | 'card';
type BillingCycle = 'one_time' | 'monthly';
type Period = CalendarPeriod | 'custom';

type Tx = {
  _id: string;
  userId?: { _id: string; email?: string; name?: string; image?: string };
  payerId?: { _id: string; email?: string; name?: string; image?: string } | string | null;
  date: string;
  amount: number;
  description?: string;
  notes?: string;
  status: 'pending' | 'approved' | 'rejected';
  ownerEmail?: string;
  ownerName?: string;
  ownerImage?: string | null;
  payerEmail?: string;
  payerName?: string;
  payerImage?: string | null;
  payMethod?: PayMethod | null;
  cardLast4?: string | null;
  cardLabel?: string | null;
  billingCycle?: BillingCycle | null;
};

function txPayerId(t: Tx): string {
  if (t.payerId && typeof t.payerId === 'object') return t.payerId._id;
  if (typeof t.payerId === 'string') return t.payerId;
  return t.userId?._id || '';
}

export default function TransactionsPage() {
  const formId = useId();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [searchParams, setSearchParams] = useSearchParams();

  const [period, setPeriod] = useState<Period>('month');
  const [periodOffset, setPeriodOffset] = useState(0);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  // Opens on the logged-in user's own transactions; "All users" stays selectable.
  const [userId, setUserId] = useState(user?.id ?? '');
  const userFilterTouched = useRef(false);
  useEffect(() => {
    if (!userFilterTouched.current && user?.id) setUserId(user.id);
  }, [user?.id]);
  const [payerFilter, setPayerFilter] = useState('');
  const [payMethodFilter, setPayMethodFilter] = useState<'' | PayMethod>('');

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const range = useMemo(
    () => (period === 'custom' ? { from: customFrom, to: customTo } : calendarPeriodRange(period, periodOffset)),
    [period, periodOffset, customFrom, customTo],
  );

  const { data, mutate, isLoading } = useSWR(
    ['transactions', range.from, range.to, userId, payerFilter, payMethodFilter, currentPage, pageSize] as const,
    () => api.listTransactions({
      page: currentPage,
      limit: pageSize,
      ...(range.from ? { from: range.from } : {}),
      ...(range.to ? { to: range.to } : {}),
      ...(userId ? { userId } : {}),
      ...(payerFilter ? { payerId: payerFilter } : {}),
      ...(payMethodFilter ? { payMethod: payMethodFilter } : {}),
    }),
    { keepPreviousData: true },
  );

  const changePeriod = (next: Period) => {
    if (next === 'custom') {
      // Start the custom range from whatever window was showing.
      setCustomFrom(range.from);
      setCustomTo(range.to);
    }
    setPeriod(next);
    setPeriodOffset(0);
    setCurrentPage(1);
  };

  const stepPeriod = (delta: number) => {
    setPeriodOffset((o) => o + delta);
    setCurrentPage(1);
  };

  const { data: lookupData } = useSWR(['users-lookup'], () => api.lookupUsers());
  const allUsers = lookupData?.users ?? [];

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tx | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  type FormField = 'date' | 'amount' | 'payMethod' | 'payerId' | 'cardLast4';
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FormField, string>>>({});

  const [form, setForm] = useState<{
    date: string;
    amount: number;
    description: string;
    notes: string;
    payMethod: '' | PayMethod;
    cardLast4: string;
    cardLabel: string;
    billingCycle: BillingCycle;
    payerId: string;
  }>({
    date: '',
    amount: 0,
    description: '',
    notes: '',
    payMethod: '',
    cardLast4: '',
    cardLabel: '',
    billingCycle: 'monthly',
    payerId: '',
  });

  const { data: hintsData } = useSWR(['tx-card-hints'], api.transactionCardHints);
  const cardHints = hintsData?.cards ?? [];

  useEffect(() => {
    if (editing) {
      setForm({
        date: editing.date?.slice(0, 10) || '',
        amount: editing.amount,
        description: editing.description || '',
        notes: editing.notes || '',
        payMethod: (editing.payMethod as '' | PayMethod) || '',
        cardLast4: editing.cardLast4 || '',
        cardLabel: editing.cardLabel || '',
        billingCycle: editing.billingCycle || 'monthly',
        payerId: txPayerId(editing),
      });
    }
  }, [editing]);

  const openAdd = () => {
    setEditing(null);
    setForm({
      date: new Date().toISOString().split('T')[0],
      amount: 0,
      description: '',
      notes: '',
      payMethod: '',
      cardLast4: '',
      cardLabel: '',
      billingCycle: 'monthly',
      payerId: user?.id || '',
    });
    setError('');
    setFieldErrors({});
    setOpen(true);
  };

  useEffect(() => {
    if (searchParams.get('renew') !== '1') return;
    setEditing(null);
    setForm({
      date: new Date().toISOString().split('T')[0],
      amount: Number(searchParams.get('amount') || 0),
      description: searchParams.get('description') || '',
      notes: '',
      payMethod: 'card',
      cardLast4: (searchParams.get('last4') || '').replace(/\D/g, '').slice(0, 4),
      cardLabel: searchParams.get('label') || '',
      billingCycle: searchParams.get('cycle') === 'one_time' ? 'one_time' : 'monthly',
      payerId: user?.id || '',
    });
    setError('');
    setFieldErrors({});
    setOpen(true);
    const next = new URLSearchParams(searchParams);
    ['renew', 'last4', 'description', 'amount', 'cycle', 'label'].forEach((k) => next.delete(k));
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, user?.id]);

  const validate = (): Partial<Record<FormField, string>> => {
    const errs: Partial<Record<FormField, string>> = {};
    if (!form.date) errs.date = 'Date is required';
    if (form.amount === 0) errs.amount = 'Amount is required';
    if (!form.payMethod) errs.payMethod = 'Pay method is required';
    if (!form.payerId) errs.payerId = 'Payer is required';
    if (form.payMethod === 'card' && !/^\d{4}$/.test(form.cardLast4)) {
      errs.cardLast4 = 'Last 4 digits of the card are required (exactly 4 digits)';
    }
    return errs;
  };

  /** aria props tying a field to its inline error message. */
  const errProps = (field: FormField) => ({
    'aria-invalid': fieldErrors[field] ? true : undefined,
    'aria-describedby': fieldErrors[field] ? `${formId}-${field}-error` : undefined,
    'aria-required': true,
  });
  const errText = (field: FormField) => (fieldErrors[field] ? (
    <p id={`${formId}-${field}-error`} className="mt-1 text-xs text-red-700 dark:text-red-400">{fieldErrors[field]}</p>
  ) : null);

  const save = async () => {
    const errs = validate();
    setFieldErrors(errs);
    const firstInvalid = (Object.keys(errs) as FormField[])[0];
    if (firstInvalid) {
      notify.error(errs[firstInvalid]!);
      const idFor: Record<FormField, string> = {
        date: 'date', amount: 'amount', payMethod: 'pay-method', payerId: 'payer', cardLast4: 'card-last4',
      };
      document.getElementById(`${formId}-${idFor[firstInvalid]}`)?.focus();
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        date: form.date,
        amount: form.amount,
        description: form.description,
        notes: form.notes,
        payMethod: form.payMethod,
        cardLast4: form.payMethod === 'card' ? form.cardLast4 : null,
        cardLabel: form.payMethod === 'card' ? form.cardLabel || null : null,
        billingCycle: form.billingCycle,
        payerId: form.payerId,
        ...(editing ? { userId: editing.userId?._id } : {}),
      };
      if (editing) {
        await api.updateTransaction(editing._id, body);
        notify.success('Transaction updated');
      } else {
        await api.createTransaction(body);
        notify.success('Transaction created');
      }
      setOpen(false);
      mutate();
    } catch (err) {
      notify.error(err instanceof ApiError ? err : 'Failed to save transaction');
      setError(err instanceof ApiError ? messageOf(err, 'Failed to save transaction') : 'Failed to save transaction');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (tx: Tx) => {
    if (!confirm('Are you sure you want to delete this transaction?')) return;
    try {
      await api.deleteTransaction(tx._id);
      notify.success('Transaction deleted');
      mutate();
    } catch (err) {
      notify.error(err, 'Failed to delete transaction');
    }
  };

  const setStatus = async (tx: Tx, status: 'approved' | 'rejected') => {
    try {
      await api.updateTransaction(tx._id, { status });
      notify.success(`Transaction ${status}`);
      mutate();
    } catch (err) {
      notify.error(err, 'Failed to update status');
    }
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  const transactions = (data?.transactions as Tx[]) || [];
  const pagination = data?.pagination;
  const totals = data?.totals;
  const periodUnit = period === 'custom' ? '' : period;

  const formatMoney = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

  const formatPayMethod = (t: Tx): string => {
    if (t.payMethod === 'card') {
      const cycle = t.billingCycle === 'one_time' ? 'one-time' : 'monthly';
      const label = t.cardLabel ? ` · ${t.cardLabel}` : '';
      return `**** ${t.cardLast4 || '----'}${label} · ${cycle}`;
    }
    if (t.payMethod === 'coin') {
      return t.billingCycle === 'one_time' ? 'Coin · one-time' : 'Coin · monthly';
    }
    return '—';
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        action={<button type="button" className="btn" onClick={openAdd}>Add</button>}
      />

      <div className="flex items-end gap-3 flex-wrap toolbar">
        <div className="w-52">
          <label htmlFor={`${formId}-filter-user`} className="block text-xs text-muted mb-1">User</label>
          <select
            id={`${formId}-filter-user`}
            className="select focus-ring w-full text-sm"
            value={userId}
            onChange={(e) => { userFilterTouched.current = true; setUserId(e.target.value); setCurrentPage(1); }}
          >
            <option value="">All users</option>
            {allUsers.map((u) => (
              <option key={u._id} value={u._id}>
                {u.name || u.email}{u._id === user?.id ? ' (you)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="w-44">
          <label htmlFor={`${formId}-filter-method`} className="block text-xs text-muted mb-1">Pay method</label>
          <select
            id={`${formId}-filter-method`}
            className="select focus-ring w-full text-sm"
            value={payMethodFilter}
            onChange={(e) => { setPayMethodFilter(e.target.value as '' | PayMethod); setCurrentPage(1); }}
          >
            <option value="">All methods</option>
            <option value="coin">Coin</option>
            <option value="card">Card</option>
          </select>
        </div>
        <div className="w-52">
          <label htmlFor={`${formId}-filter-payer`} className="block text-xs text-muted mb-1">Payer</label>
          <select
            id={`${formId}-filter-payer`}
            className="select focus-ring w-full text-sm"
            value={payerFilter}
            onChange={(e) => { setPayerFilter(e.target.value); setCurrentPage(1); }}
          >
            <option value="">All payers</option>
            {allUsers.map((u) => (
              <option key={u._id} value={u._id}>
                {u.name || u.email}{u._id === user?.id ? ' (you)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="w-36">
          <label htmlFor={`${formId}-filter-period`} className="block text-xs text-muted mb-1">Period</label>
          <select
            id={`${formId}-filter-period`}
            className="select focus-ring w-full text-sm"
            value={period}
            onChange={(e) => changePeriod(e.target.value as Period)}
          >
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="year">Year</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        {period === 'custom' ? (
          <>
            <div className="w-44">
              <label htmlFor={`${formId}-filter-from`} className="block text-xs text-muted mb-1">From</label>
              <input
                id={`${formId}-filter-from`}
                className="input w-full text-sm"
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => { setCustomFrom(e.target.value); setCurrentPage(1); }}
              />
            </div>
            <div className="w-44">
              <label htmlFor={`${formId}-filter-to`} className="block text-xs text-muted mb-1">To</label>
              <input
                id={`${formId}-filter-to`}
                className="input w-full text-sm"
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => { setCustomTo(e.target.value); setCurrentPage(1); }}
              />
            </div>
          </>
        ) : (
          <div className="flex items-center gap-1">
            <button type="button" className="btn-icon" onClick={() => stepPeriod(-1)} aria-label={`Previous ${periodUnit}`} title={`Previous ${periodUnit}`}>
              <ChevronLeft size={16} aria-hidden />
            </button>
            <span className="min-w-[11rem] text-center text-sm font-medium tabular-nums" aria-live="polite">
              {formatCalendarPeriod(period, range.from, range.to)}
            </span>
            <button type="button" className="btn-icon" onClick={() => stepPeriod(1)} aria-label={`Next ${periodUnit}`} title={`Next ${periodUnit}`}>
              <ChevronRight size={16} aria-hidden />
            </button>
          </div>
        )}
      </div>

      {data && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted">
            <span>
              Showing {pagination?.total ?? 0} transaction{pagination?.total !== 1 ? 's' : ''} total
            </span>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor={`${formId}-page-size`} className="text-sm font-medium">Show:</label>
            <select
              id={`${formId}-page-size`}
              value={pageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              className="select focus-ring text-sm"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table className="min-w-full text-sm">
          <caption className="sr-only">Transactions</caption>
          <thead className="table-head">
            <tr>
              <th scope="col" className="px-4 py-2.5">Date</th>
              <th scope="col" className="px-4 py-2.5">Amount</th>
              <th scope="col" className="px-4 py-2.5">Description</th>
              <th scope="col" className="px-4 py-2.5">Pay method</th>
              <th scope="col" className="px-4 py-2.5">Status</th>
              <th scope="col" className="px-4 py-2.5">Owner</th>
              <th scope="col" className="px-4 py-2.5">Payer</th>
              <th scope="col" className="px-4 py-2.5 w-48">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted">
                  <div role="status" className="flex items-center justify-center">
                    <div className="spinner spinner-md mr-3" aria-hidden></div>
                    Loading transactions...
                  </div>
                </td>
              </tr>
            ) : transactions.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted">No transactions found.</td>
              </tr>
            ) : (
              transactions.map((t) => {
                const isPending = t.status === 'pending';
                const amt = Number(t.amount || 0);
                const isPayer = txPayerId(t) === user?.id;
                const isOwner = t.userId?._id === user?.id;
                // The server rejects a non-admin approving their own self-paid transaction.
                const canApprove = isPending && (isAdmin || (isPayer && !isOwner));
                // Everyone sees every row; only show actions the server allows.
                const showEdit = isAdmin || isOwner || isPayer;
                const showDelete = isAdmin || isOwner;
                const txName = `${t.date ? new Date(t.date).toISOString().split('T')[0] : ''} ${t.description || formatMoney(amt)}`.trim();
                return (
                  <tr key={t._id} className="table-row">
                    <td className="px-4 py-2.5">
                      {t.date ? new Date(t.date).toISOString().split('T')[0] : '—'}
                    </td>
                    <td className={`px-4 py-2.5 tabular-nums ${
                      amt > 0
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : amt < 0
                          ? 'text-red-600 dark:text-red-400'
                          : ''
                    }`}>
                      {formatMoney(amt)}
                    </td>
                    <td className="px-4 py-2.5">{t.description || '—'}</td>
                    <td className="px-4 py-2.5">{formatPayMethod(t)}</td>
                    <td className="px-4 py-2.5 capitalize">{t.status}</td>
                    <td className="px-4 py-2.5"><NameWithAvatar name={t.ownerName || t.userId?.name} imageUrl={t.ownerImage || t.userId?.image} /></td>
                    <td className="px-4 py-2.5"><NameWithAvatar name={t.payerName || (typeof t.payerId === 'object' ? t.payerId?.name : undefined) || t.ownerName} imageUrl={t.payerImage || (typeof t.payerId === 'object' ? t.payerId?.image : undefined) || t.ownerImage} /></td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1 flex-wrap">
                        {showEdit && (
                          <button
                            type="button"
                            className="btn-icon"
                            onClick={() => { setEditing(t); setError(''); setFieldErrors({}); setOpen(true); }}
                            disabled={!isPending && !isAdmin}
                            aria-label={`Edit transaction ${txName}`}
                            title="Edit"
                          >
                            <Pencil size={16} aria-hidden />
                          </button>
                        )}
                        {showDelete && (
                          <button
                            type="button"
                            className="btn-icon"
                            onClick={() => remove(t)}
                            disabled={!isPending && !isAdmin}
                            aria-label={`Delete transaction ${txName}`}
                            title="Delete"
                          >
                            <Trash2 size={16} aria-hidden />
                          </button>
                        )}
                        {canApprove && (
                          <>
                            <button type="button" className="btn-icon" onClick={() => setStatus(t, 'approved')} aria-label={`Approve transaction ${txName}`} title="Approve">
                              <CheckCircle size={16} aria-hidden />
                            </button>
                            <button type="button" className="btn-icon" onClick={() => setStatus(t, 'rejected')} aria-label={`Reject transaction ${txName}`} title="Reject">
                              <XCircle size={16} aria-hidden />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {!isLoading && totals && totals.count > 0 && (
            <tfoot>
              <tr className="border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50/80 dark:bg-zinc-900/50 font-medium">
                <th scope="row" className="px-4 py-2.5 text-left font-medium text-sm text-zinc-700 dark:text-zinc-300">
                  Total · {totals.count} transaction{totals.count !== 1 ? 's' : ''}
                </th>
                <td className={`px-4 py-2.5 tabular-nums ${
                  totals.net >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'
                }`}>
                  {formatMoney(totals.net)}
                </td>
                <td colSpan={6} className="px-4 py-2.5 tabular-nums text-muted">
                  Income <span className="text-emerald-700 dark:text-emerald-400">{formatMoney(totals.income)}</span>
                  {' · '}
                  Outcome <span className="text-red-600 dark:text-red-400">{formatMoney(totals.outcome)}</span>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <nav aria-label="Transactions pagination" className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted">
            Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            {pagination.total} results
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage(pagination.page - 1)}
              disabled={!pagination.hasPrev}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
            >
              Previous
            </button>

            <div className="flex gap-1">
              {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                let pageNum;
                if (pagination.totalPages <= 5) pageNum = i + 1;
                else if (pagination.page <= 3) pageNum = i + 1;
                else if (pagination.page >= pagination.totalPages - 2) pageNum = pagination.totalPages - 4 + i;
                else pageNum = pagination.page - 2 + i;

                return (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => setCurrentPage(pageNum)}
                    aria-label={`Page ${pageNum}`}
                    aria-current={pageNum === pagination.page ? 'page' : undefined}
                    className={`px-3 py-1 border rounded text-sm ${
                      pageNum === pagination.page
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setCurrentPage(pagination.page + 1)}
              disabled={!pagination.hasNext}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
            >
              Next
            </button>
          </div>
        </nav>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit Transaction' : 'Add Transaction'}
      >
        <div className="space-y-4">
          {error && <p role="alert" className="text-red-700 dark:text-red-400 text-sm">{error}</p>}
          <div>
            <label htmlFor={`${formId}-date`} className="form-label mb-1 block">Date <span className="text-red-700 dark:text-red-400" aria-hidden>*</span></label>
            <input
              id={`${formId}-date`}
              className="input"
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              {...errProps('date')}
            />
            {errText('date')}
          </div>
          <div>
            <label htmlFor={`${formId}-amount`} className="form-label mb-1 block">Amount (USD) <span className="text-red-700 dark:text-red-400" aria-hidden>*</span></label>
            <input
              id={`${formId}-amount`}
              className="input"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: Number(e.target.value || 0) })}
              {...errProps('amount')}
            />
            {errText('amount')}
          </div>
          <div>
            <label htmlFor={`${formId}-description`} className="form-label mb-1 block">Description</label>
            <input
              id={`${formId}-description`}
              className="input"
              placeholder="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor={`${formId}-notes`} className="form-label mb-1 block">Notes</label>
            <textarea
              id={`${formId}-notes`}
              className="input"
              placeholder="Notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor={`${formId}-pay-method`} className="form-label mb-1 block">Pay method <span className="text-red-700 dark:text-red-400" aria-hidden>*</span></label>
            <select
              id={`${formId}-pay-method`}
              className="select focus-ring w-full"
              {...errProps('payMethod')}
              value={form.payMethod}
              onChange={(e) => {
                const v = e.target.value as '' | PayMethod;
                setForm({ ...form, payMethod: v, cardLast4: v === 'card' ? form.cardLast4 : '', cardLabel: v === 'card' ? form.cardLabel : '' });
              }}
            >
              <option value="">Select method</option>
              <option value="coin">Coin</option>
              <option value="card">Card</option>
            </select>
            {errText('payMethod')}
          </div>
          <div>
            <label htmlFor={`${formId}-payer`} className="form-label mb-1 block">Payer <span className="text-red-700 dark:text-red-400" aria-hidden>*</span></label>
            <select
              id={`${formId}-payer`}
              className="select focus-ring w-full"
              {...errProps('payerId')}
              aria-describedby={[fieldErrors.payerId ? `${formId}-payerId-error` : '', `${formId}-payer-hint`].filter(Boolean).join(' ')}
              value={form.payerId}
              onChange={(e) => setForm({ ...form, payerId: e.target.value })}
            >
              <option value="">Select payer</option>
              {allUsers.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.name || u.email}
                  {u._id === user?.id ? ' (you)' : ''}
                  {u.role === 'admin' && u._id !== user?.id ? ' (admin)' : ''}
                </option>
              ))}
            </select>
            {errText('payerId')}
            <p id={`${formId}-payer-hint`} className="hint mt-1">You can request payment from anyone, including yourself.</p>
          </div>
          <div>
            <label htmlFor={`${formId}-billing-cycle`} className="form-label mb-1 block">Billing</label>
            <select
              id={`${formId}-billing-cycle`}
              className="select focus-ring w-full"
              value={form.billingCycle}
              onChange={(e) => setForm({ ...form, billingCycle: e.target.value as BillingCycle })}
            >
              <option value="monthly">Monthly (remind before next charge)</option>
              <option value="one_time">One-time (no reminder)</option>
            </select>
          </div>
          {form.payMethod === 'card' && (
            <>
              <div>
                <label htmlFor={`${formId}-card-last4`} className="form-label mb-1 block">Last 4 digits of card <span className="text-red-700 dark:text-red-400" aria-hidden>*</span></label>
                <input
                  id={`${formId}-card-last4`}
                  className="input"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="1234"
                  list={`${formId}-card-hints`}
                  {...errProps('cardLast4')}
                  value={form.cardLast4}
                  onChange={(e) => {
                    const last4 = e.target.value.replace(/\D/g, '').slice(0, 4);
                    const hint = cardHints.find((c) => c.cardLast4 === last4);
                    setForm({
                      ...form,
                      cardLast4: last4,
                      cardLabel: hint?.cardLabel && !form.cardLabel ? hint.cardLabel : form.cardLabel,
                    });
                  }}
                />
                <datalist id={`${formId}-card-hints`}>
                  {cardHints.map((c) => (
                    <option key={c.cardLast4} value={c.cardLast4}>
                      {c.cardLabel ? `${c.cardLabel} · **** ${c.cardLast4}` : `**** ${c.cardLast4}`}
                    </option>
                  ))}
                </datalist>
                {errText('cardLast4')}
              </div>
              <div>
                <label htmlFor={`${formId}-card-label`} className="form-label mb-1 block">Card nickname</label>
                <input
                  id={`${formId}-card-label`}
                  className="input"
                  placeholder="Visa personal"
                  value={form.cardLabel}
                  onChange={(e) => setForm({ ...form, cardLabel: e.target.value })}
                />
              </div>
            </>
          )}
          <div className="flex gap-2 justify-end pt-1">
            <button
              type="button"
              className="btn"
              onClick={save}
              disabled={saving}
            >
              {saving
                ? editing ? 'Saving...' : 'Creating...'
                : editing ? 'Save changes' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
