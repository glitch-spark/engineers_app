import useSWR from 'swr';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import * as api from '../api/endpoints';
import { notify } from '../lib/notify';
import NameWithAvatar from '../components/NameWithAvatar';

type Acc = {
  _id: string;
  name: string;
  title?: string;
  ownerName?: string;
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

  const accounts = (data?.accounts as Acc[]) || [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <h1 className="text-2xl font-bold">Profiles</h1>
        <button className="btn ml-auto" onClick={() => navigate('/accounts/new')}>Add</button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search profiles..."
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

        {isAdmin && (
          <div className="flex items-center gap-2">
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
        )}

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

      <div className="bg-white rounded-md border border-gray-100 shadow-sm overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Owner</th>
              <th className="px-3 py-2 w-20">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3"></div>
                    Loading profiles...
                  </div>
                </td>
              </tr>
            ) : accounts.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-gray-500">
                  {debouncedSearch ? `No profiles found matching "${debouncedSearch}"` : 'No profiles found.'}
                </td>
              </tr>
            ) : accounts.map((a) => (
              <tr
                key={a._id}
                className="border-t hover:bg-gray-50 cursor-pointer"
                onClick={() => navigate(`/accounts/${a._id}`)}
              >
                <td className="px-3 py-2">{a.name}</td>
                <td className="px-3 py-2"><NameWithAvatar name={a.ownerName} /></td>
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <button className="btn-icon" onClick={() => remove(a)} title="Delete"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
    </div>
  );
}
