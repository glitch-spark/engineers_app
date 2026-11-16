import useSWR from 'swr';
import { useEffect, useId, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Modal from '../components/Modal';
import { Pencil, Trash2, CheckCircle, XCircle, Copy } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import * as api from '../api/endpoints';
import { ApiError } from '../api/client';
import { messageOf, notify } from '../lib/notify';
import {
  ALL_USERS,
  TX_CLEAR_KEYS,
  TX_PRESETS,
  parseTxValues,
  txCanClear,
  txListParams,
  txUrlDefaults,
  type TxKey,
} from '../lib/transactionFilters';
import { useUrlFilters } from '../lib/useUrlFilters';
import DateRangeFilter, { type DateRangeValue } from '../components/filters/DateRangeFilter';
import FilterBar, { FilterField } from '../components/filters/FilterBar';
import Pagination from '../components/Pagination';
import Select from '../components/Select';
import NameWithAvatar from '../components/NameWithAvatar';
import PageHeader from '../components/PageHeader';

type PayMethod = 'coin' | 'card';
type BillingCycle = 'one_time' | 'monthly';

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
  /** Wallet address for coin payments. */
  coinAddress?: string | null;
  billingCycle?: BillingCycle | null;
};

/** A shortened wallet address (full on hover) with a copy button. */
function CoinAddress({ address }: { address: string }) {
  const short = address.length > 14 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      notify.success('Wallet address copied');
    } catch (err) {
      notify.error(err, 'Could not copy the address');
    }
  };
  return (
    <span className="ml-1 inline-flex items-center gap-1 whitespace-nowrap">
      <span className="font-mono text-xs text-muted" title={address}>
        · {short}
      </span>
      <button type="button" className="btn-icon" onClick={() => void copy()} title="Copy wallet address" aria-label={`Copy wallet address ${address}`}>
        <Copy className="h-3.5 w-3.5" aria-hidden />
      </button>
    </span>
  );
}

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

  // Filters live in the URL (defaults left out); an unrelated key such as the `renew` prefill is never touched.
  const userId = user?.id ?? '';
  const [urlValues, patchUrl] = useUrlFilters(txUrlDefaults(userId));
  const filters = parseTxValues(urlValues, userId);
  // Local calendar day, as the page has always worked out its periods.
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const params = txListParams(filters, today);
  const rangeValue: DateRangeValue = { preset: filters.range, from: filters.from, to: filters.to };
  const canClear = txCanClear(filters, userId);

  const { data: listData, mutate, isLoading } = useSWR(
    params ? (['transactions', JSON.stringify(params)] as const) : null,
    () => api.listTransactions(params ?? undefined),
    { keepPreviousData: true },
  );
  // A partial or invalid Custom range asks for nothing: show no rows rather than the last range's.
  const data = params ? listData : undefined;

  const clearFilters = () =>
    patchUrl(Object.fromEntries(TX_CLEAR_KEYS.map((k) => [k, undefined])) as Partial<Record<TxKey, string>>);

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
    coinAddress: string;
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
    coinAddress: '',
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
        coinAddress: editing.coinAddress || '',
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
      coinAddress: '',
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
      coinAddress: '',
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
        // '' clears a stored address; card payments drop it on the server.
        coinAddress: form.payMethod === 'coin' ? form.coinAddress.trim() : '',
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

  const transactions = (data?.transactions as Tx[]) || [];
  const pagination = data?.pagination;
  const totals = data?.totals;

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

      <FilterBar canClear={canClear} onClear={clearFilters}>
        <FilterField label="User" htmlFor={`${formId}-filter-user`} width="w-52">
          <Select
            id={`${formId}-filter-user`}
            className="w-full text-sm"
            value={filters.user}
            onChange={(v) => patchUrl({ user: v })}
            options={[
              { value: ALL_USERS, label: 'All users' },
              ...allUsers.map((u) => ({ value: u._id, label: `${u.name || u.email}${u._id === user?.id ? ' (you)' : ''}` })),
            ]}
          />
        </FilterField>
        <FilterField label="Pay method" htmlFor={`${formId}-filter-method`}>
          <Select
            id={`${formId}-filter-method`}
            className="w-full text-sm"
            value={filters.method}
            onChange={(v) => patchUrl({ method: v })}
            options={[
              { value: '', label: 'All methods' },
              { value: 'coin', label: 'Coin' },
              { value: 'card', label: 'Card' },
            ]}
          />
        </FilterField>
        <FilterField label="Payer" htmlFor={`${formId}-filter-payer`} width="w-52">
          <Select
            id={`${formId}-filter-payer`}
            className="w-full text-sm"
            value={filters.payer}
            onChange={(v) => patchUrl({ payer: v })}
            options={[
              { value: '', label: 'All payers' },
              ...allUsers.map((u) => ({ value: u._id, label: `${u.name || u.email}${u._id === user?.id ? ' (you)' : ''}` })),
            ]}
          />
        </FilterField>
        <DateRangeFilter
          value={rangeValue}
          onChange={(v) => patchUrl({ range: v.preset, from: v.from, to: v.to })}
          presets={TX_PRESETS}
          allowFuture
          today={today}
        />
      </FilterBar>

      {data && (
        <div className="text-sm text-muted">
          Showing {pagination?.total ?? 0} transaction{pagination?.total !== 1 ? 's' : ''} total
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
                <td colSpan={8} className="px-3 py-6 text-center text-muted">{params ? 'No transactions found.' : 'Pick a valid date range to see transactions.'}</td>
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
                    <td className="px-4 py-2.5">
                      {formatPayMethod(t)}
                      {t.payMethod === 'coin' && t.coinAddress && <CoinAddress address={t.coinAddress} />}
                    </td>
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

      <Pagination
        info={pagination}
        onPage={(page) => patchUrl({ page: String(page) })}
        pageSize={filters.size}
        onPageSize={(size) => patchUrl({ size: String(size) })}
        label="Transactions pagination"
      />

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
                setForm({
                  ...form,
                  payMethod: v,
                  cardLast4: v === 'card' ? form.cardLast4 : '',
                  cardLabel: v === 'card' ? form.cardLabel : '',
                  coinAddress: v === 'coin' ? form.coinAddress : '',
                });
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
          {form.payMethod === 'coin' && (
            <div>
              <label htmlFor={`${formId}-coin-address`} className="form-label mb-1 block">Wallet address</label>
              <input
                id={`${formId}-coin-address`}
                className="input font-mono"
                placeholder="0x… or bc1…"
                maxLength={200}
                autoComplete="off"
                spellCheck={false}
                value={form.coinAddress}
                onChange={(e) => setForm({ ...form, coinAddress: e.target.value })}
              />
              <p className="text-xs text-muted mt-1">Optional. The wallet this was paid from or to.</p>
            </div>
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
