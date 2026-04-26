'use client';

import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import { useEffect, useMemo, useState } from 'react';
import Modal from '@/components/Modal';
import { Pencil, Trash2, CheckCircle, XCircle, Filter } from 'lucide-react';

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

type PaginationData = {
  transactions: Tx[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
};

const fetcher = (u: string) => fetch(u).then(r => r.json());

export default function TransactionsPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as 'admin' | 'staff' | undefined;
  const isAdmin = role === 'admin';

  // Filters
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [userId, setUserId] = useState('');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const txUrl = useMemo(() => {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    if (isAdmin && userId) qs.set('userId', userId);
    qs.set('page', currentPage.toString());
    qs.set('limit', pageSize.toString());
    const q = qs.toString();
    return `/api/transactions?${q}`;
  }, [from, to, isAdmin, userId, currentPage, pageSize]);

  const { data, mutate, isLoading } = useSWR<PaginationData>(txUrl, fetcher);
  const { data: usersData } = useSWR<{ users: any[]; pagination: any } | null>(isAdmin ? '/api/users' : null, fetcher);
  const users = usersData?.users || [];

  // Modal state
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tx | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form state (no accountId)
  const [form, setForm] = useState({
    date: '',
    amount: 0,
    description: '',
    notes: '',
  });

  // Preload form on edit
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
    if (!form.date || form.amount === 0) {
      setError('Date and amount are required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const url = editing ? `/api/transactions/${editing._id}` : '/api/transactions';
      const method = editing ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          userId: editing ? editing.userId?._id : undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }

      setOpen(false);
      mutate();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (tx: Tx) => {
    if (!confirm('Are you sure you want to delete this transaction?')) return;
    
    try {
      await fetch(`/api/transactions/${tx._id}`, { method: 'DELETE' });
      mutate();
    } catch (err) {
      console.error('Failed to delete transaction:', err);
    }
  };

  const setStatus = async (tx: Tx, status: 'approved' | 'rejected') => {
    try {
      await fetch(`/api/transactions/${tx._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...tx, status }),
      });
      mutate();
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  const applyFilters = () => {
    setCurrentPage(1);
    mutate();
  };

  const transactions = data?.transactions || [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-4">
      {/* Header + Title */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Transactions</h1>
        <button type="button" className="btn" onClick={openAdd}>
          Add
        </button>
      </div>

      {/* Filters - Admin Only */}
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
                {(users || []).map((u: any) => (
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

      {/* Results Summary */}
      {data && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            <span>
              Showing {data.pagination.total} transaction{data.pagination.total !== 1 ? 's' : ''} total
            </span>
          </div>
          
          {/* Page Size Selector */}
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

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 text-left">
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
                <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : transactions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                  No transactions found.
                </td>
              </tr>
            ) : (
              transactions.map((t) => {
                const isPending = t.status === 'pending';
                return (
                  <tr key={t._id} className="border-t">
                    <td className="px-3 py-2">
                      {t.date ? new Date(t.date).toISOString().split('T')[0] : '—'}
                    </td>
                    <td className="px-3 py-2">
                      ${Number(t.amount || 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2">{t.description || '—'}</td>
                    <td className="px-3 py-2">{t.status}</td>
                    <td className="px-3 py-2">
                      {t.ownerName || t.userId?.name || '—'}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2 flex-wrap">
                        {/* Edit */}
                        <button
                          type="button"
                          className="btn"
                          onClick={() => {
                            setEditing(t);
                            setError('');
                            setOpen(true);
                          }}
                          disabled={!isPending && !isAdmin}
                          title="Edit"
                        >
                          <Pencil size={16} />
                        </button>
                        {/* Delete */}
                        <button
                          type="button"
                          className="btn"
                          onClick={() => remove(t)}
                          disabled={!isPending && !isAdmin}
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                        {/* Admin approve/reject when pending */}
                        {isAdmin && isPending && (
                          <>
                            <button
                              type="button"
                              className="btn"
                              onClick={() => setStatus(t, 'approved')}
                              title="Approve"
                            >
                              <CheckCircle size={16} />
                            </button>
                            <button
                              type="button"
                              className="btn"
                              onClick={() => setStatus(t, 'rejected')}
                              title="Reject"
                            >
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

      {/* Pagination Controls */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            {pagination.total} results
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={!pagination.hasPrev}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Previous
            </button>
            
            {/* Page Numbers */}
            <div className="flex gap-1">
              {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                let pageNum;
                if (pagination.totalPages <= 5) {
                  pageNum = i + 1;
                } else if (pagination.page <= 3) {
                  pageNum = i + 1;
                } else if (pagination.page >= pagination.totalPages - 2) {
                  pageNum = pagination.totalPages - 4 + i;
                } else {
                  pageNum = pagination.page - 2 + i;
                }
                
                return (
                  <button
                    key={pageNum}
                    onClick={() => handlePageChange(pageNum)}
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
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={!pagination.hasNext}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Modal */}
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
            onChange={(e) =>
              setForm({ ...form, amount: Number(e.target.value || 0) })
            }
          />
          <input
            className="input"
            placeholder="Description"
            value={form.description}
            onChange={(e) =>
              setForm({ ...form, description: e.target.value })
            }
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
                ? editing
                  ? 'Saving...'
                  : 'Creating...'
                : editing
                ? 'Save changes'
                : 'Create'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
