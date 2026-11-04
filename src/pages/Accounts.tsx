import useSWR from 'swr';
import { useState, useEffect, useMemo, type ReactNode } from 'react';
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
import { WEEK_OPTIONS, readWeeks, writeWeeks, fmtPerWeek, fmtRate, fmtScore } from '../lib/profileMetrics';

type SortKey = 'bids' | 'interviews' | 'rate' | 'score';

const sortValue = (m: api.ProfileMetricsRow | undefined, key: SortKey): number | null => {
  if (!m || m.spanWeeks === 0) return null;
  switch (key) {
    case 'bids': return m.bidsPerWeek;
    case 'interviews': return m.interviewsPerWeek;
    case 'rate': return m.interviewsPerBid;
    case 'score': return m.tailorScore?.avg ?? m.matchScore?.avg ?? null;
  }
};

const scoreCell = (m: api.ProfileMetricsRow) => {
  const parts = [
    m.tailorScore && m.tailorScore.n > 0 ? `T ${fmtScore(m.tailorScore)}` : '',
    m.matchScore && m.matchScore.n > 0 ? `M ${fmtScore(m.matchScore)}` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : '—';
};

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
  const [weeks, setWeeks] = useState(readWeeks);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);

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

  // Metrics load on their own key so the list never waits on them.
  const { data: metricsData, error: metricsError, isLoading: metricsLoading } = useSWR(
    ['account-metrics', weeks, isAdmin ? userId : ''] as const,
    () => api.getProfileMetrics({ weeks, ...(isAdmin && userId ? { userId } : {}) })
  );
  const metricsById = useMemo(
    () => new Map((metricsData?.rows ?? []).map((r) => [r.accountId, r])),
    [metricsData]
  );

  // The lookup lists every user; /users is paginated (10 by default), which cut the filter short.
  const { data: usersData } = useSWR(isAdmin ? ['users-lookup'] : null, () => api.lookupUsers());
  const users = usersData?.users ?? [];

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

  // The creator or an admin can archive or delete a profile (the API returns 404 for anyone else).
  const rowActions = (a: Acc) => {
    const edit = { label: 'Edit', onSelect: () => navigate(`/accounts/${a._id}`) };
    const ownerId = typeof a.createdBy === 'object' ? a.createdBy?._id : a.createdBy;
    if (!isAdmin && (!user?.id || ownerId !== user.id)) return [edit];
    return [
      edit,
      a.archived
        ? { label: 'Unarchive', onSelect: () => setArchived(a, false) }
        : { label: 'Archive', onSelect: () => setArchived(a, true) },
      { label: 'Delete', danger: true, onSelect: () => setPendingDelete(a) },
    ];
  };

  // Four <td>s: Bids/wk, Interviews/wk, Intv/bid, Score.
  const metricCells = (a: Acc): ReactNode => {
    const dashes = (title?: string) => [0, 1, 2, 3].map((i) => (
      <td key={i} className="px-4 py-2.5 text-muted" title={title}>—</td>
    ));
    if (a.archived || metricsError) return dashes();
    if (metricsLoading) {
      return [0, 1, 2, 3].map((i) => (
        <td key={i} className="px-4 py-2.5"><div className="skeleton h-4 w-12" aria-hidden /></td>
      ));
    }
    const m = metricsById.get(a._id);
    if (!m) return dashes();
    if (m.spanWeeks === 0) return dashes('Not enough history yet');
    const split = (text: string) => <div className="text-[11px] text-muted">{text}</div>;
    return (
      <>
        <td className="px-4 py-2.5 whitespace-nowrap">
          <div>{fmtPerWeek(m.bidsPerWeek)}</div>
          {split(`${fmtPerWeek(m.selfBidsPerWeek)} self · ${fmtPerWeek(m.bidderBidsPerWeek)} bidder`)}
        </td>
        <td className="px-4 py-2.5 whitespace-nowrap">
          <div>{fmtPerWeek(m.interviewsPerWeek)}</div>
          {split(`${fmtPerWeek(m.selfInterviewsPerWeek)} self · ${fmtPerWeek(m.callerInterviewsPerWeek)} caller`)}
        </td>
        <td
          className={`px-4 py-2.5 whitespace-nowrap ${m.lowVolume ? 'text-muted' : ''}`}
          title={m.lowVolume ? 'Fewer than 30 bids — too few to rank' : undefined}
        >
          {fmtRate(m.interviewsPerBid)}
        </td>
        <td
          className="px-4 py-2.5 whitespace-nowrap"
          title={`Tailor score n=${m.tailorScore?.n ?? 0} · Job-match score n=${m.matchScore?.n ?? 0}`}
        >
          {scoreCell(m)}
        </td>
      </>
    );
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

  const changeWeeks = (n: number) => {
    setWeeks(n);
    writeWeeks(n);
  };

  // First click sorts descending, the next ascending; rows without a value always go last.
  const toggleSort = (key: SortKey) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }));

  const rawAccounts = (data?.accounts as Acc[]) || [];
  const accounts = useMemo(() => {
    if (!sort) return rawAccounts;
    const val = (a: Acc) => (a.archived ? null : sortValue(metricsById.get(a._id), sort.key));
    const sign = sort.dir === 'desc' ? -1 : 1;
    return [...rawAccounts].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (x == null || y == null) return x == null && y == null ? 0 : x == null ? 1 : -1;
      return (x - y) * sign;
    });
  }, [rawAccounts, sort, metricsById]);
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

        <div className="w-36">
          <label className="block text-xs text-muted mb-1" htmlFor="accounts-period">Period</label>
          <select
            id="accounts-period"
            className="select focus-ring w-full text-sm"
            value={weeks}
            onChange={(e) => changeWeeks(Number(e.target.value))}
          >
            {WEEK_OPTIONS.map((w) => <option key={w} value={w}>Last {w} weeks</option>)}
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

      {metricsError && <p role="status" className="text-xs text-muted">Couldn't load metrics</p>}

      <div className="table-wrap">
        <table className="min-w-full text-sm">
          <thead className="table-head">
            <tr>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Region</th>
              {([
                ['bids', 'Bids/wk'],
                ['interviews', 'Interviews/wk'],
                ['rate', 'Intv/bid'],
                ['score', 'Score'],
              ] as const).map(([key, label]) => (
                <th
                  key={key}
                  className="px-4 py-2.5 whitespace-nowrap"
                  aria-sort={sort?.key === key ? (sort.dir === 'desc' ? 'descending' : 'ascending') : undefined}
                >
                  <button type="button" className="uppercase tracking-wide hover:underline" onClick={() => toggleSort(key)}>
                    {label}
                    {sort?.key === key && <span aria-hidden> {sort.dir === 'desc' ? '↓' : '↑'}</span>}
                  </button>
                </th>
              ))}
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
                <td colSpan={9} className="px-4 py-8 text-center text-muted">
                  <div role="status" className="flex items-center justify-center">
                    <div className="spinner spinner-md mr-3" aria-hidden></div>
                    Loading profiles...
                  </div>
                </td>
              </tr>
            ) : accounts.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-muted">
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
                <td className="px-4 py-2.5">
                  {a.country || a.region ? (
                    <span className="inline-flex items-center gap-1.5">
                      {a.country && <span aria-hidden title={countryName(a.country)}>{countryFlag(a.country)}</span>}
                      <span className="text-muted">{a.region || '—'}</span>
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                {metricCells(a)}
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
