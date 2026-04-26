'use client';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import Modal from '@/components/Modal';
import { Pencil, Trash2, CheckCircle, XCircle, Filter } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then(r => r.json());
type Acc = { _id: string; name: string; email: string; phone?: string; address?: string };
type PaginationData = {
  accounts: Acc[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
};

export default function AccountsPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as 'admin' | 'staff' | undefined;
  const isAdmin = role === 'admin';
  const [userId, setUserId] = useState('');


  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1); // Reset to first page when searching
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);
  
  const { data, mutate, isLoading } = useSWR<PaginationData>(
    `/api/accounts?page=${currentPage}&limit=${pageSize}&search=${encodeURIComponent(debouncedSearch)}${isAdmin?`&userId=${userId}`:''}`, 
    fetcher
  );
  
  const { data: usersData } = useSWR<{ users: any[]; pagination: any } | null>(isAdmin ? '/api/users' : null, fetcher);
  const users = usersData?.users || [];

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Acc | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '' });

  const openAdd = () => { setEditing(null); setForm({ name: '', email: '', phone: '', address: '' }); setOpen(true); };
  const openEdit = (acc: Acc) => { setEditing(acc); setForm({ name: acc.name, email: acc.email, phone: acc.phone || '', address: acc.address || '' }); setOpen(true); };

  const save = async () => {
    const method = editing ? 'PUT' : 'POST';
    const url = editing ? `/api/accounts/${editing._id}` : '/api/accounts';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    if (res.ok) { await mutate(); setOpen(false); }
  };
  const remove = async (acc: Acc) => {
    if (!confirm('Delete this account?')) return;
    const res = await fetch(`/api/accounts/${acc._id}`, { method: 'DELETE' });
    if (res.ok) mutate();
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1); // Reset to first page when changing page size
  };

  const clearSearch = () => {
    setSearchTerm('');
    setDebouncedSearch('');
  };

  const accounts = data?.accounts || [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <h1 className="text-2xl font-bold">Accounts</h1>
        <button className="btn ml-auto" onClick={openAdd}>Add</button>
      </div>
      
      {/* Search Bar */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search accounts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          {searchTerm && (
            <button
              onClick={clearSearch}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
            >
              <svg className="h-5 w-5 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        
        { isAdmin? 
          (
            <div className="flex items-center gap-2">
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
          ):''
        }
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
      
      {/* Search Results Info */}
      {debouncedSearch && (
        <div className="text-sm text-gray-600">
          {pagination ? (
            <>
              Found {pagination.total} result{pagination.total !== 1 ? 's' : ''} for "{debouncedSearch}"
              {pagination.total > 0 && (
                <span className="ml-2">
                  (Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
                  {Math.min(pagination.page * pagination.limit, pagination.total)})
                </span>
              )}
            </>
          ) : (
            `Searching for "${debouncedSearch}"...`
          )}
        </div>
      )}
      
      <div className="card p-0 overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 text-left">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">Address</th>
              <th className="px-3 py-2">Owner</th>
              <th className="px-3 py-2 w-40">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500">Loading...</td></tr>
            ) : accounts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                  {debouncedSearch ? `No accounts found matching "${debouncedSearch}"` : 'No accounts found.'}
                </td>
              </tr>
            ) : accounts.map((a) => (
              <tr key={a._id} className="border-t">
                <td className="px-3 py-2">{a.name}</td>
                <td className="px-3 py-2">{a.email}</td>
                <td className="px-3 py-2">{a.phone}</td>
                <td className="px-3 py-2">{a.address}</td>
                <td className="px-3 py-2">{(a as any).ownerName || "—"}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <button className="btn" onClick={() => openEdit(a)} title="Edit"><Pencil size={16} /></button>
                    <button className="btn" onClick={() => remove(a)} title="Delete"><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {!debouncedSearch && (
              <>
                Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
                {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                {pagination.total} results
              </>
            )}
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

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Account' : 'Add Account'}>
        <div className="space-y-3">
          <input className="input" placeholder="Name" value={form.name} onChange={e=>setForm({ ...form, name: e.target.value })} />
          <input className="input" placeholder="Email" value={form.email} onChange={e=>setForm({ ...form, email: e.target.value })} />
          <input className="input" placeholder="Phone" value={form.phone} onChange={e=>setForm({ ...form, phone: e.target.value })} />
          <input className="input" placeholder="Address" value={form.address} onChange={e=>setForm({ ...form, address: e.target.value })} />
          <div className="flex gap-2 justify-end"><button className="btn" onClick={save}>{editing ? 'Save changes' : 'Create'}</button></div>
        </div>
      </Modal>
    </div>
  );
}
