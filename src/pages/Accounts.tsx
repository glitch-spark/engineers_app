import useSWR from 'swr';
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import * as api from '../api/endpoints';
import { notify } from '../lib/notify';
import ActionMenu from '../components/ActionMenu';
import ConfirmDialog from '../components/ConfirmDialog';
import NameWithAvatar from '../components/NameWithAvatar';
import PageHeader from '../components/PageHeader';
import { countryFlag, countryName } from '../lib/countries';
import { PROFILE_STATUS_OPTIONS, type ProfileStatus } from '../lib/profileArchive';

type Acc = {
  _id: string;
  name: string;
  country?: string | null;
  region?: string | null;
  title?: string;
  ownerName?: string;
  ownerImage?: string | null;
  showInGenerate?: boolean;
  archived?: boolean;
  /** Populated owner, or the raw id when the user no longer exists. */
  createdBy?: string | { _id: string };
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
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>('active');
  const [pendingDelete, setPendingDelete] = useState<Acc | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const { data, mutate, isLoading } = useSWR(
    ['accounts', currentPage, pageSize, debouncedSearch, isAdmin ? userId : '', profileStatus] as const,
    () => api.listAccounts({
      page: currentPage,
      limit: pageSize,
      search: debouncedSearch,
      status: profileStatus,
      ...(isAdmin && userId ? { userId } : {}),
    })
  );

  const { data: usersData } = useSWR(isAdmin ? ['users-list'] : null, () => api.listUsers());
  const users = (usersData?.users as Array<{ _id: string; name?: string; email?: string }>) || [];

  const remove = async () => {
    const acc = pendingDelete;
    if (!acc) return;
    setDeleting(true);
    try {
      await api.deleteAccount(acc._id);
      notify.success(`Profile "${acc.name}" deleted`);
      setPendingDelete(null);
      mutate();
    } catch (err) {
      notify.error(err, 'Failed to delete profile');
    } finally {
      setDeleting(false);
    }
  };

  const setArchived = async (acc: Acc, archived: boolean) => {
    try {
      await api.updateAccount(acc._id, { archived });
      notify.success(archived ? `"${acc.name}" archived` : `"${acc.name}" restored`);
      mutate();
    } catch (err) {
      notify.error(err, archived ? 'Failed to archive profile' : 'Failed to unarchive profile');
    }
  };

  // Only the creator can change a profile (the API returns 404 for anyone else).
  const rowActions = (a: Acc) => {
    const edit = { label: 'Edit', onSelect: () => navigate(`/accounts/${a._id}`) };
    const ownerId = typeof a.createdBy === 'object' ? a.createdBy?._id : a.createdBy;
    if (!user?.id || ownerId !== user.id) return [edit];
    return [
      edit,
      a.archived
        ? { label: 'Unarchive', onSelect: () => setArchived(a, false) }
        : { label: 'Archive', onSelect: () => setArchived(a, true) },
      { label: 'Delete', danger: true, onSelect: () => setPendingDelete(a) },
    ];
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
        <div className="w-full min-w-0 sm:w-auto sm:flex-1 sm:min-w-64 sm:max-w-md">
          <label className="block text-xs text-muted mb-1" htmlFor="accounts-search">Search</label>
          <div className="relative">
            <svg aria-hidden className="h-4 w-4 text-faint absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              id="accounts-search"
              type="text"
              placeholder="Search profiles..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input w-full text-sm !pl-9 !pr-8"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute inset-y-0 right-2 flex items-center text-faint hover:text-muted"
                aria-label="Clear search"
              >
                <svg aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {isAdmin && (
          <div className="w-56">
            <label className="block text-xs text-muted mb-1" htmlFor="accounts-user">User</label>
            <select
              id="accounts-user"
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

        <div className="w-32">
          <label className="block text-xs text-muted mb-1" htmlFor="accounts-status">Status</label>
          <select
            id="accounts-status"
            className="select focus-ring w-full text-sm"
            value={profileStatus}
            onChange={(e) => { setProfileStatus(e.target.value as ProfileStatus); setCurrentPage(1); }}
          >
            {PROFILE_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="w-28">
          <label className="block text-xs text-muted mb-1" htmlFor="accounts-page-size">Show</label>
          <select
            id="accounts-page-size"
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
        <div role="status" className="text-sm text-muted">
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
              <th className="px-4 py-2.5">Region</th>
              <th className="px-4 py-2.5">Country</th>
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
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  <div role="status" className="flex items-center justify-center">
                    <div className="spinner spinner-md mr-3" aria-hidden></div>
                    Loading profiles...
                  </div>
                </td>
              </tr>
            ) : accounts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted">
                  {debouncedSearch
                    ? `No profiles found matching "${debouncedSearch}"`
                    : profileStatus === 'archived' ? 'No archived profiles.' : 'No profiles found.'}
                </td>
              </tr>
            ) : accounts.map((a) => (
              <tr
                key={a._id}
                className={`table-row cursor-pointer transition-colors ${a.archived ? 'text-muted' : ''}`}
                onClick={() => navigate(`/accounts/${a._id}`)}
              >
                <td className="px-4 py-2.5">
                  <Link
                    to={`/accounts/${a._id}`}
                    className="rounded hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {a.name}
                  </Link>
                  {a.archived && profileStatus !== 'archived' && (
                    <span className="badge badge-neutral ml-2">Archived</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-muted">{a.region || '—'}</td>
                <td className="px-4 py-2.5">
                  {a.country ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden>{countryFlag(a.country)}</span>
                      <span>{countryName(a.country)}</span>
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
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
                  <ActionMenu label={`Actions for ${a.name}`} items={rowActions(a)} />
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

          <nav className="flex items-center gap-2" aria-label="Pagination">
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
              onClick={() => setCurrentPage(pagination.page + 1)}
              disabled={!pagination.hasNext}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
            >
              Next
            </button>
          </nav>
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete profile?"
        body={
          <>
            <p>"{pendingDelete?.name}" will be permanently deleted. This can't be undone.</p>
            {!pendingDelete?.archived && <p className="mt-2 text-muted">To hide it but keep its history, archive it instead.</p>}
          </>
        }
        confirmLabel="Delete"
        tone="danger"
        busy={deleting}
        onConfirm={remove}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
