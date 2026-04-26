import useSWR from 'swr';
import { useEffect, useState } from 'react';
import Modal from '../components/Modal';
import { Pencil, Trash2, Filter } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import * as api from '../api/endpoints';
import { ApiError } from '../api/client';

type Cl = {
  _id: string;
  userId?: { _id: string; email?: string; name?: string };
  email: string;
  cardNumber: string;
  site: string;
  from: string;
  to: string;
  ownerName?: string;
  ownerEmail?: string;
  status: 'billing' | 'canceled';
};

export default function CardLinksPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [userId, setUserId] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data, mutate, isLoading } = useSWR(
    ['cardlinks', from, to, isAdmin ? userId : '', currentPage, pageSize] as const,
    () => api.listCardlinks({
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
  const [editing, setEditing] = useState<Cl | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState<{ status: 'billing' | 'canceled'; email: string; cardNumber: string; site: string; from: string; to: string }>({
    status: 'billing',
    email: '',
    cardNumber: '',
    site: '',
    from: '',
    to: '',
  });

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
    if (!form.email || !form.cardNumber || !form.from || !form.to) {
      setError('Fill in all required fields');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = { ...form, ...(editing ? { userId: editing.userId?._id } : {}) };
      if (editing) await api.updateCardlink(editing._id, body);
      else await api.createCardlink(body);
      setOpen(false);
      mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save Card Link');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (cl: Cl) => {
    if (!confirm('Are you sure you want to delete this Card Link?')) return;
    try {
      await api.deleteCardlink(cl._id);
      mutate();
    } catch (err) {
      console.error('Failed to delete Card Link:', err);
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

  const cardlinks = (data?.cardlinks as Cl[]) || [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Card Link</h1>
        <button type="button" className="btn" onClick={openAdd}>Add</button>
      </div>

      {isAdmin && (
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-xs mb-1 text-gray-600">From</label>
              <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs mb-1 text-gray-600">To</label>
              <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs mb-1 text-gray-600">User</label>
              <select className="select focus-ring" value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">All users</option>
                {users.map((u) => (
                  <option key={u._id} value={u._id}>{u.name || u.email}</option>
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
              Showing {pagination?.total ?? 0} card-link{pagination?.total !== 1 ? 's' : ''} total
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
              <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-500">Loading...</td></tr>
            ) : cardlinks.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-500">No Card Links found.</td></tr>
            ) : (
              cardlinks.map((t) => {
                const isCanceled = t.status === 'canceled';
                return (
                  <tr key={t._id} className="border-t">
                    <td className="px-3 py-2">{t.email || t.userId?.email || '—'}</td>
                    <td className="px-3 py-2">{t.site}</td>
                    <td className="px-3 py-2">{t.cardNumber}</td>
                    <td className="px-3 py-2">{t.from ? new Date(t.from).toISOString().split('T')[0] : '—'}</td>
                    <td className="px-3 py-2">{t.to ? new Date(t.to).toISOString().split('T')[0] : '—'}</td>
                    <td className="px-3 py-2">{t.status}</td>
                    <td className="px-3 py-2">{t.ownerName || t.userId?.name || '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2 flex-wrap">
                        <button
                          type="button"
                          className="btn"
                          onClick={() => { setEditing(t); setError(''); setOpen(true); }}
                          disabled={isCanceled && !isAdmin}
                          title="Edit"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => remove(t)}
                          disabled={isCanceled && !isAdmin}
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
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

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Card Link' : 'Add Card Link'}>
        <div className="space-y-3">
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <input className="input" type="email" placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          <input className="input" placeholder="Card Number(...-xxxx)" value={form.cardNumber} onChange={e => setForm({ ...form, cardNumber: e.target.value })} />
          <input className="input" placeholder="Site" value={form.site} onChange={e => setForm({ ...form, site: e.target.value })} />
          <input className="input" type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
          <input className="input" type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
          {editing && (
            <select
              className="select focus-ring"
              value={form.status}
              onChange={e => setForm({ ...form, status: e.target.value as 'billing' | 'canceled' })}
            >
              <option value="billing">Billing</option>
              <option value="canceled">Canceled</option>
            </select>
          )}
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn" onClick={save}>
              {saving ? (editing ? 'Saving...' : 'Creating...') : editing ? 'Save changes' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
