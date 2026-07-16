import useSWR from 'swr';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import * as api from '../api/endpoints';
import { notify } from '../lib/notify';
import NameWithAvatar from '../components/NameWithAvatar';
import PageHeader from '../components/PageHeader';

type Acc = {
  _id: string;
  name: string;
  title?: string;
  ownerName?: string;
  ownerImage?: string | null;
  showInGenerate?: boolean;
};

export default function AccountsPage() {
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [userId, setUserId] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const { data, mutate, isLoading } = useSWR(
    ['accounts', currentPage, pageSize, debouncedSearch, isAdmin ? userId : ''] as const,
    () => api.listAccounts({ page: currentPage, limit: pageSize, search: debouncedSearch, ...(isAdmin && userId ? { userId } : {}) })
  );

  const { data: usersData } = useSWR(isAdmin ? ['users-list'] : null, () => api.listUsers());
  const users = (usersData?.users as Array<{ _id: string; name?: string; email?: string }>) || [];

  const remove = async (acc: Acc) => {
    if (!confirm(`Delete profile "${acc.name}"?`)) return;
    try {
      await api.deleteAccount(acc._id);
      notify.success(`Profile "${acc.name}" deleted`);
      mutate();
    } catch (err) {
      notify.error(err, 'Failed to delete profile');
    }
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  const clearSearch = () => {
    setSearchTerm('');
    setDebouncedSearch('');
  };

  const toggleShowInGenerate = async (acc: Acc) => {
    const next = acc.showInGenerate === false;
    try {
      await api.updateAccount(acc._id, { showInGenerate: next });
      notify.success(next ? `"${acc.name}" will appear in Generate` : `"${acc.name}" hidden from Generate`);
      mutate();
    } catch (err) {
      notify.error(err, 'Failed to update profile');
    }
  };

  const accounts = (data?.accounts as Acc[]) || [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profiles"
        action={<button type="button" className="btn" onClick={() => navigate('/accounts/new')}>Add</button>}
      />

      <div className="flex items-end gap-3 flex-wrap toolbar">
        <div className="flex-1 min-w-64 max-w-md">
          <label className="block text-xs text-muted mb-1">Search</label>
          <div className="relative">
            <svg className="h-4 w-4 text-faint absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search profiles..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input w-full text-sm pl-9 pr-8"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute inset-y-0 right-2 flex items-center text-faint hover:text-muted"
                aria-label="Clear search"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {isAdmin && (
          <div className="w-56">
            <label className="block text-xs text-muted mb-1">User</label>
            <select
              className="select focus-ring w-full text-sm"
              value={userId}
              onChange={(e) => { setUserId(e.target.value); setCurrentPage(1); }}
            >
              <option value="">All users</option>
              {users.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.name || u.email}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="w-28">
          <label className="block text-xs text-muted mb-1">Show</label>
          <select
            value={pageSize}
            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
            className="select focus-ring w-full text-sm"
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </div>
      </div>

      {debouncedSearch && (
        <div className="text-sm text-muted">
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

      <div className="table-wrap">
        <table className="min-w-full text-sm">
          <thead className="table-head">
            <tr>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Owner</th>
              <th className="px-4 py-2.5 w-24 text-center" title="Include in Resume Generator profile picker">
                Generate
              </th>
              <th className="px-4 py-2.5 w-20">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
                  <div className="flex items-center justify-center">
                    <div className="spinner spinner-md mr-3"></div>
                    Loading profiles...
                  </div>
                </td>
              </tr>
            ) : accounts.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-muted">
                  {debouncedSearch ? `No profiles found matching "${debouncedSearch}"` : 'No profiles found.'}
                </td>
              </tr>
            ) : accounts.map((a) => (
              <tr
                key={a._id}
                className="table-row cursor-pointer transition-colors"
                onClick={() => navigate(`/accounts/${a._id}`)}
              >
                <td className="px-4 py-2.5">{a.name}</td>
                <td className="px-4 py-2.5"><NameWithAvatar name={a.ownerName} imageUrl={a.ownerImage} /></td>
                <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-center">
                    <input
                      type="checkbox"
                      checked={a.showInGenerate !== false}
                      onChange={() => toggleShowInGenerate(a)}
                      title="Show this profile in Resume Generator"
                      aria-label={`Show ${a.name} in Resume Generator`}
                      className="h-4 w-4"
                    />
                  </div>
                </td>
                <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="btn-icon" onClick={() => remove(a)} aria-label={`Delete profile ${a.name}`} title="Delete"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted">
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
                    onClick={() => setCurrentPage(pageNum)}
                    className={`px-3 py-1 border rounded text-sm ${
                      pageNum === pagination.page
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
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
              className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
