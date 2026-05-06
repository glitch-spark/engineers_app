import useSWR from 'swr';
import { useEffect, useState } from 'react';
import Modal from '../components/Modal';
import { Pencil, Trash2, CheckCircle, XCircle, Filter } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import * as api from '../api/endpoints';
import { ApiError } from '../api/client';
import { notify } from '../lib/notify';

type Tx = {
  _id: string;
  userId?: { _id: string; email?: string; name?: string };
  date: string;
  amount: number;
  description?: string;
  notes?: string;
  status: 'pending' | 'approved' | 'rejected';
  ownerEmail?: string;
  ownerName?: string;
};

export default function TransactionsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [userId, setUserId] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data, mutate, isLoading } = useSWR(
    ['transactions', from, to, isAdmin ? userId : '', currentPage, pageSize] as const,
    () => api.listTransactions({
      page: currentPage,
      limit: pageSize,
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(isAdmin && userId ? { userId } : {}),
    })
  );

  const { data: usersData } = useSWR(isAdmin ? ['users-list'] : null, () => api.listUsers());
  const users = (usersData?.users as Array<{ _id: string; name?: string; email?: string }>) || [];

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tx | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    date: '',
    amount: 0,
    description: '',
    notes: '',
  });

  useEffect(() => {
    if (editing) {
      setForm({
        date: editing.date?.slice(0, 10) || '',
        amount: editing.amount,
        description: editing.description || '',
        notes: editing.notes || '',
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
    });
    setError('');
    setOpen(true);
  };

  const save = async () => {
    if (!form.date) {
      notify.error('Date is required');
      return;
    }
    if (form.amount === 0) {
      notify.error('Amount is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = { ...form, ...(editing ? { userId: editing.userId?._id } : {}) };
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
      await api.updateTransaction(tx._id, { ...tx, status });
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

  const applyFilters = () => {
    setCurrentPage(1);
    mutate();
  };

  const transactions = (data?.transactions as Tx[]) || [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Transactions</h1>
        <button type="button" className="btn" onClick={openAdd}>
          Add
        </button>
      </div>

      {isAdmin && (
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-xs mb-1 text-gray-600">From</label>
              <input
                className="input"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs mb-1 text-gray-600">To</label>
              <input
                className="input"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs mb-1 text-gray-600">User</label>
              <select
                className="select focus-ring"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
              >
                <option value="">All users</option>
                {users.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name || u.email}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="btn" onClick={applyFilters}>
              <Filter size={16} /> Apply
            </button>
          </div>
        </div>
      )}

      {data && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            <span>
              Showing {pagination?.total ?? 0} transaction{pagination?.total !== 1 ? 's' : ''} total
            </span>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Show:</label>
            <select
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

      <div className="bg-white rounded-md border border-gray-100 shadow-sm overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Owner</th>
              <th className="px-3 py-2 w-48">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3"></div>
                    Loading transactions...
                  </div>
                </td>
              </tr>
            ) : transactions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-500">No transactions found.</td>
              </tr>
            ) : (
              transactions.map((t) => {
                const isPending = t.status === 'pending';
                return (
                  <tr key={t._id} className="border-t">
                    <td className="px-3 py-2">
                      {t.date ? new Date(t.date).toISOString().split('T')[0] : '—'}
                    </td>
                    <td className="px-3 py-2">${Number(t.amount || 0).toFixed(2)}</td>
                    <td className="px-3 py-2">{t.description || '—'}</td>
                    <td className="px-3 py-2">{t.status}</td>
                    <td className="px-3 py-2">{t.ownerName || t.userId?.name || '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2 flex-wrap">
                        <button
                          type="button"
                          className="btn"
                          onClick={() => { setEditing(t); setError(''); setOpen(true); }}
                          disabled={!isPending && !isAdmin}
                          title="Edit"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => remove(t)}
                          disabled={!isPending && !isAdmin}
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                        {isAdmin && isPending && (
                          <>
                            <button type="button" className="btn" onClick={() => setStatus(t, 'approved')} title="Approve">
                              <CheckCircle size={16} />
                            </button>
                            <button type="button" className="btn" onClick={() => setStatus(t, 'rejected')} title="Reject">
                              <XCircle size={16} />
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
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            {pagination.total} results
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(pagination.page - 1)}
              disabled={!pagination.hasPrev}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
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
                    onClick={() => setCurrentPage(pageNum)}
                    className={`px-3 py-1 border rounded text-sm ${
                      pageNum === pagination.page
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setCurrentPage(pagination.page + 1)}
              disabled={!pagination.hasNext}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit Transaction' : 'Add Transaction'}
      >
        <div className="space-y-3">
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <input
            className="input"
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
          <input
            className="input"
            type="number"
            step="0.01"
            placeholder="Amount (USD)"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: Number(e.target.value || 0) })}
          />
          <input
            className="input"
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <textarea
            className="input"
            placeholder="Notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              className="btn"
              onClick={save}
              disabled={!form.date || !form.amount || saving}
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
