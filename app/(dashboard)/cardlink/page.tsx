'use client';

import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import { useEffect, useMemo, useState } from 'react';
import Modal from '@/components/Modal';
import { Pencil, Trash2, CheckCircle, XCircle, Filter } from 'lucide-react';

type Cl = {
  _id: string;
  userId?: { _id: string; email?: string; name?: string };
  email: string;
  cardNumber: string;
  site: string;
  from: string;
  to: string;
  ownerName: string;
  ownerEmail: string;
  status: 'billing' | 'canceled';
};

type PaginationData = {
  cardlinks: Cl[];
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

export default function CardLinksPage() {
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

  const clUrl = useMemo(() => {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    if (isAdmin && userId) qs.set('userId', userId);
    qs.set('page', currentPage.toString());
    qs.set('limit', pageSize.toString());
    const q = qs.toString();
    return `/api/cardlinks?${q}`;
  }, [from, to, isAdmin, userId, currentPage, pageSize]);

  const { data, mutate, isLoading } = useSWR<PaginationData>(clUrl, fetcher);
  const { data: usersData } = useSWR<{ users: any[]; pagination: any } | null>(isAdmin ? '/api/users' : null, fetcher);
  const users = usersData?.users || [];

  // Modal state
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Cl | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form state (no accountId)
  const [form, setForm] = useState({
    status: 'billing',
    email: '',
    cardNumber: '',
    site: '',
    from: '',
    to: '',
  });

  // Preload form on edit
  useEffect(() => {
    if (editing) {
      setForm({
        status: editing.status || 'billing',
        email: editing.email || '',
        cardNumber: editing.cardNumber || '',
        site: editing.site || '',
        from: editing.from?.slice(0, 10) || '',
        to: editing.to?.slice(0, 10) || '',
      });
    }
  }, [editing]);

  const openAdd = () => {
    setEditing(null);
    setForm({
      from: new Date().toISOString().split('T')[0],
      to: new Date().toISOString().split('T')[0],
      site: '',
      email: '',
      cardNumber: '',
      status: 'billing',
    });
    setError('');
    setOpen(true);
  };

  const save = async () => {
    console.log('Saving', form);
    if (!form.email || !form.cardNumber || !form.from || !form.to) {
      setError('Fill in all required fields');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const url = editing ? `/api/cardlinks/${editing._id}` : '/api/cardlinks';
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
      setError(err.message.error || 'Failed to save Card Link');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (cl: Cl) => {
    if (!confirm('Are you sure you want to delete this Card Link?')) return;
    
    try {
      await fetch(`/api/cardlinks/${cl._id}`, { method: 'DELETE' });
      mutate();
    } catch (err) {
      console.error('Failed to delete Card Link:', err);
    }
  };

  const setStatus = async (cl: Cl, status: 'approved' | 'rejected') => {
    try {
      await fetch(`/api/cardlinks/${cl._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...cl, status }),
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

  const cardlinks = data?.cardlinks || [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-4">
      {/* Header + Title */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Card Link</h1>
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
              Showing {data.pagination.total} card-link{data.pagination.total !== 1 ? 's' : ''} total
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
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Site</th>
              <th className="px-3 py-2">Card Number</th>
              <th className="px-3 py-2">From</th>
              <th className="px-3 py-2">To</th>
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
            ) : cardlinks.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                  No Card Links found.
                </td>
              </tr>
            ) : (
              cardlinks.map((t) => {
                const isCaceled = t.status === 'canceled';
                return (
                  <tr key={t._id} className="border-t">
                    <td className="px-3 py-2">
                      {t.email || t.userId?.email || '—'}
                    </td>
                    <td className="px-3 py-2">
                      {t.site}
                    </td>
                    <td className="px-3 py-2">
                      {t.cardNumber}
                    </td>
                    <td className="px-3 py-2">
                      {t.from ? new Date(t.from).toISOString().split('T')[0] : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {t.to ? new Date(t.to).toISOString().split('T')[0] : '—'}
                    </td>
                    <td className="px-3 py-2">{t.status}</td>
                    <td className="px-3 py-2">{t.ownerName || t.userId?.name || '—'}</td>
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
                          disabled={ isCaceled && !isAdmin}
                          title="Edit"
                        >
                          <Pencil size={16} />
                        </button>
                        {/* Delete */}
                        <button
                          type="button"
                          className="btn"
                          onClick={() => remove(t)}
                          disabled={ isCaceled && !isAdmin}
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                        {/* Admin approve/reject when pending */}
                        {/* {isAdmin && isCaceled && (
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
                        )} */}
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
        title={editing ? 'Edit Card Link' : 'Add Card Link'}
      >
        <div className="space-y-3">
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <input className="input" type='email' placeholder="Email" value={form.email} onChange={e=>setForm({ ...form, email: e.target.value })} />
          <input className="input" placeholder="Card Number(...-xxxx)" value={form.cardNumber} onChange={e=>setForm({ ...form, cardNumber: e.target.value })} />
          <input className="input" placeholder="Site" value={form.site} onChange={e=>setForm({ ...form, site: e.target.value })} />
          <input className="input" type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
          <input className="input" type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
          {
            editing &&  (
            <select className="select focus-ring" value={form.status} onChange={e=>setForm({ ...form, status: e.target.value as 'billing' | 'canceled' })}>
              <option value="billing">Billing</option>
              <option value="canceled">Canceled</option>
            </select>

            )
          }
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              className="btn"
              onClick={save}
              // disabled={!form.email || !form.cardNumber || !form.from || !form.to || saving}
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
