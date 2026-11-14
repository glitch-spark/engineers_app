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
import { countryFlag, countryName, PROFILE_REGIONS } from '../lib/countries';
import { PROFILE_STATUS_OPTIONS, type ProfileStatus } from '../lib/profileArchive';
import {
  PROFILE_RANGES, profileRangeDates, profileRangeError, readProfileRange, writeProfileRange, fmtCount, fmtPerWeek,
  fmtRate, fmtScore, tailoredText, type ProfileRange,
} from '../lib/profileMetrics';
import { interviewsAppliedBy, rowArrow, setupText, shortDay, sinceDay, windowsMatch } from '../lib/profileList';
import ProfilesBand, { Arrow } from '../components/profiles/ProfilesBand';

type SortKey = 'lastApply' | 'bids' | 'interviews' | 'rate' | 'pass' | 'score';

const sortValue = (m: api.ProfileMetricsRow | undefined, key: SortKey): number | null => {
  if (!m || m.spanWeeks === 0) return null;
  switch (key) {
    case 'lastApply': return m.lastApply ? Date.parse(m.lastApply) : null;
    case 'bids': return m.bids;
    case 'interviews': return m.interviews;
    case 'rate': return m.interviewsPerBid;
    case 'pass': return m.rounds?.passRate ?? null;
    case 'score': return m.tailorScore?.avg ?? m.matchScore?.avg ?? null;
  }
};

/** "Nov 6, 2026" for an ISO day, read as UTC so it never shifts with the viewer's time zone. */
const fmtDay = (iso: string | null | undefined) => (iso
  ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  : '—');

/** "today", "yesterday" or "N days ago" for an ISO day, against the viewer's today. */
function daysAgo(iso: string): string {
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const n = Math.round((today - Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
  return n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`;
}

const scoreCell = (m: api.ProfileMetricsRow) => {
  const parts = [
    m.tailorScore && m.tailorScore.n > 0 ? `Tailor ${fmtScore(m.tailorScore)}` : '',
    m.matchScore && m.matchScore.n > 0 ? `Match ${fmtScore(m.matchScore)}` : '',
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
  /** Setup column: fixed resumes, and tailoring units as the Profile tab reads them (absent from an older server). */
  resumes?: unknown[] | null;
  resumePrompts?: unknown[] | null;
  setupUnits?: api.SetupUnit[];
  setupDefaultId?: string | null;
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
  const [region, setRegion] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Acc | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [range, setRange] = useState<ProfileRange>(readProfileRange);
  const allTime = range.preset === 'all';
  const rangeError = profileRangeError(range);
  const rangeDates = rangeError ? null : profileRangeDates(range);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const { data, mutate, isLoading } = useSWR(
    ['accounts', currentPage, pageSize, debouncedSearch, isAdmin ? userId : '', profileStatus, region] as const,
    () => api.listAccounts({
      page: currentPage,
      limit: pageSize,
      search: debouncedSearch,
      status: profileStatus,
      ...(region ? { region } : {}),
      ...(isAdmin && userId ? { userId } : {}),
    })
  );

  // Metrics load on their own key so the list never waits on them. Archived profiles have none: no request then.
  const { data: metricsData, error: metricsError, isLoading: metricsLoading } = useSWR(
    profileStatus === 'archived' || rangeError
      ? null
      : (['account-metrics', rangeDates?.from ?? 'all', rangeDates?.to ?? '', isAdmin ? userId : ''] as const),
    () => api.getProfileMetrics({ ...(rangeDates ?? { weeks: 'all' as const }), ...(isAdmin && userId ? { userId } : {}) }),
    { revalidateOnFocus: false }
  );
  const metricsById = useMemo(
    () => new Map((metricsData?.rows ?? []).map((r) => [r.accountId, r])),
    [metricsData]
  );

  // "All profiles" over the same days (cached on the server for 15 minutes); a failure only hides the comparison.
  const { data: bench } = useSWR(
    profileStatus === 'archived' || rangeError ? null : (['metrics-benchmark', rangeDates?.from ?? 'all', rangeDates?.to ?? ''] as const),
    () => api.getMetricsBenchmark(rangeDates ? { period: 'custom', date: rangeDates.from, to: rangeDates.to } : { period: 'all' }),
    { revalidateOnFocus: false }
  );
  const compared = !!metricsData && windowsMatch(metricsData, bench) ? bench ?? null : null;
  const comparedFrom = metricsData?.comparedFrom ?? '';

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

  // Six <td>s: Applies, Bids, Interviews, Intv/bid, Pass rate, Resume score.
  const METRIC_COLS = 6;
  const metricCells = (a: Acc): ReactNode => {
    const dashes = (title?: string) => Array.from({ length: METRIC_COLS }, (_, i) => (
      <td key={i} className="px-4 py-2.5 text-muted" title={title}>—</td>
    ));
    if (a.archived) return dashes('No metrics for archived profiles');
    if (metricsError) return dashes("Couldn't load metrics");
    if (rangeError) return dashes(rangeError);
    // An older server (frontend deployed first) ignores from / to and answers with the last 4 weeks: don't show those
    // numbers under the new labels. Newer servers send lastApply on every row (null or a day).
    if (metricsData && metricsData.rows.length > 0 && !('lastApply' in metricsData.rows[0])) {
      return dashes('These metrics need the latest server update. Reload once the backend is deployed.');
    }
    if (metricsLoading) {
      return Array.from({ length: METRIC_COLS }, (_, i) => (
        <td key={i} className="px-4 py-2.5"><div className="skeleton h-4 w-12" aria-hidden /></td>
      ));
    }
    const m = metricsById.get(a._id);
    if (!m) return dashes('Not loaded yet');
    if (m.spanWeeks === 0) return dashes('Not enough history yet');
    const split = (text: string) => <div className="text-[11px] text-muted">{text}</div>;
    // Totals over the selected range; the weekly average is in the tooltip.
    const perWeek = (n: number | null) => `${fmtPerWeek(n)} per week on average`;
    return (
      <>
        <td
          className="px-4 py-2.5 whitespace-nowrap"
          title={m.firstApply ? `First apply ${fmtDay(m.firstApply)} · last apply ${fmtDay(m.lastApply)}` : 'No bids yet'}
        >
          {m.firstApply ? (
            <>
              <div>{fmtDay(m.firstApply)}</div>
              {m.lastApply && split(`last: ${daysAgo(m.lastApply)}`)}
            </>
          ) : <span className="text-muted">—</span>}
        </td>
        <td
          className="px-4 py-2.5 whitespace-nowrap"
          title={allTime ? `${perWeek(m.bidsPerWeek)}. ${selfSinceNote}` : perWeek(m.bidsPerWeek)}
        >
          <div>{fmtCount(m.bids)}</div>
          {m.bidderBidsBy === undefined
            ? split(`${fmtCount(m.selfBids)} self · ${fmtCount(m.bidderBids)} bidder`)
            : (
              <div className="max-w-[16rem] whitespace-normal text-[11px] text-muted">
                {[`${fmtCount(m.selfBids)} self`, ...m.bidderBidsBy.map((b) => `${b.name} ${fmtCount(b.bids)}`)].join(' · ')}
              </div>
            )}
        </td>
        <td
          className="px-4 py-2.5 whitespace-nowrap"
          title={`${fmtCount(m.selfInterviews)} self-taken · ${fmtCount(m.callerInterviews)} caller-taken. ${perWeek(m.interviewsPerWeek)}`}
        >
          <div>{fmtCount(m.interviews)}</div>
          {split(interviewsAppliedBy(m))}
        </td>
        {rateTd(m)}
        {passTd(m)}
        {scoreTd(m)}
      </>
    );
  };

  // ▲ / ▼ against all profiles over the compared window, only when the benchmark measured the same days. When the
  // window starts after the range (All time, or a range from before the launch day), the cell's number covers other
  // days than the arrow: the arrow then goes on its own line with the value it judged ("▼ 0.31% since Nov 5").
  const arrowSince = sinceDay(rangeDates?.from ?? null, metricsData?.comparedFrom);
  const arrow = (kind: 'rate' | 'pass' | 'tailor', m: api.ProfileMetricsRow): ReactNode => {
    const a = compared ? rowArrow(kind, m.compare, compared, comparedFrom) : null;
    if (!a) return null;
    if (!arrowSince) return <Arrow dir={a.dir} title={a.title} />;
    return (
      <div className="text-[11px] text-muted whitespace-nowrap">
        <Arrow dir={a.dir} title={a.title} /> {a.value} since {shortDay(arrowSince)}
      </div>
    );
  };

  // Rounds passed ÷ rounds decided in the range (home assessments left out, as on the Metrics tab).
  const passTd = (m: api.ProfileMetricsRow): ReactNode => {
    const r = m.rounds;
    if (!r || r.passRate == null) {
      return <td className="px-4 py-2.5 text-muted" title={r ? 'No rounds decided in this range' : undefined}>—</td>;
    }
    return (
      <td className="px-4 py-2.5 whitespace-nowrap" title={`${fmtCount(r.passed)} passed of ${fmtCount(r.decided)} decided rounds`}>
        <div>{Math.round(r.passRate * 100)}%{arrow('pass', m)}</div>
        <div className="text-[11px] text-muted">{fmtCount(r.passed)} of {fmtCount(r.decided)} decided</div>
      </td>
    );
  };

  const setupTd = (a: Acc): ReactNode => {
    const s = setupText(a);
    return (
      <td className="px-4 py-2.5 whitespace-nowrap" title={s.warnings.length ? s.warnings.join('\n') : undefined}>
        <span className={s.text === '—' ? 'text-muted' : ''}>{s.text}</span>
        {s.warnings.length > 0 && (
          <span className="ml-1 text-amber-600 dark:text-amber-400" role="img" aria-label={`Setup warnings: ${s.warnings.join('; ')}`}>⚠</span>
        )}
      </td>
    );
  };

  // Every interview ÷ every bid in the range (self and bidder together).
  const rateTd = (m: api.ProfileMetricsRow): ReactNode => {
    if (m.interviewsPerBid == null) {
      return <td className="px-4 py-2.5 text-muted" title="No bids in this range">—</td>;
    }
    return (
      <td
        className={`px-4 py-2.5 whitespace-nowrap ${m.lowVolume ? 'text-muted' : ''}`}
        title={`${fmtCount(m.interviews)} interviews ÷ ${fmtCount(m.bids)} bids`
          + (m.lowVolume ? ' · fewer than 30 bids, too few to rank' : '')}
      >
        {fmtRate(m.interviewsPerBid)}{arrow('rate', m)}
      </td>
    );
  };

  // Resume score: the same in every range.
  const scoreTd = (m: api.ProfileMetricsRow): ReactNode => (
    <td
      className="px-4 py-2.5 whitespace-nowrap"
      title={
        scoreCell(m) === '—'
          ? 'No scored resumes yet'
          : `Tailor: average of ${m.tailorScore?.n ?? 0} scored tailored resumes · `
            + `Match: average of ${m.matchScore?.n ?? 0} applies with an uploaded resume`
      }
    >
      <div>{scoreCell(m)}{arrow('tailor', m)}</div>
      {tailoredText(m.tailoredResumes) && (
        <div className="text-[11px] text-muted">{tailoredText(m.tailoredResumes)}</div>
      )}
    </td>
  );

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

  const changeRange = (patch: Partial<ProfileRange>) => {
    const next = { ...range, ...patch };
    setRange(next);
    writeProfileRange(next);
  };
  const selfSince = metricsData?.selfBidsSince;
  const selfSinceNote = `Self bids are counted from ${
    selfSince ? new Date(`${selfSince}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
      : 'the day they started being typed per profile'
  }`;

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

  // The band: one owner's profiles (every non-admin; an admin with a user picked) vs all profiles. An older server
  // sends no `mine`: no band.
  let band: ReactNode = null;
  if ((!isAdmin || userId) && profileStatus !== 'archived' && !rangeError && metricsData && 'mine' in metricsData) {
    const whose = isAdmin && userId !== user?.id ? 'These' : 'Your';
    if (!metricsData.comparedFrom) {
      band = <p role="status" className="text-xs text-muted">Nothing to compare with all profiles in this range.</p>;
    } else if (!metricsData.mine) {
      band = <p role="status" className="text-xs text-muted">{whose} profiles have no bids in this range yet.</p>;
    } else if (compared) {
      const rangeLabel = range.preset === 'custom'
        ? `${fmtDay(range.from)} – ${fmtDay(range.to)}`
        : PROFILE_RANGES.find((o) => o.value === range.preset)?.label ?? '';
      const since = arrowSince;
      band = (
        <ProfilesBand
          whose={whose}
          mine={metricsData.mine}
          all={compared}
          rangeLabel={rangeLabel}
          since={since}
          rows={metricsData.rows}
        />
      );
    }
  }

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

        <div className="w-32">
          <label className="block text-xs text-muted mb-1" htmlFor="accounts-region">Region</label>
          <select
            id="accounts-region"
            className="select focus-ring w-full text-sm"
            value={region}
            onChange={(e) => { setRegion(e.target.value); setCurrentPage(1); }}
          >
            <option value="">All regions</option>
            {PROFILE_REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            <option value="none">No region</option>
          </select>
        </div>

        <div className="w-40">
          <label className="block text-xs text-muted mb-1" htmlFor="accounts-range">Date range</label>
          <select
            id="accounts-range"
            className="select focus-ring w-full text-sm"
            value={range.preset}
            onChange={(e) => changeRange({ preset: e.target.value as ProfileRange['preset'] })}
          >
            {PROFILE_RANGES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {range.preset === 'custom' && (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-xs text-muted mb-1" htmlFor="accounts-from">From</label>
              <input id="accounts-from" type="date" className="input !w-auto !py-1.5 text-sm" value={range.from}
                onChange={(e) => changeRange({ from: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1" htmlFor="accounts-to">To</label>
              <input id="accounts-to" type="date" className="input !w-auto !py-1.5 text-sm" value={range.to}
                onChange={(e) => changeRange({ to: e.target.value })} />
            </div>
            {rangeError && <span className="pb-2 text-xs text-red-700 dark:text-red-400" role="alert">{rangeError}</span>}
          </div>
        )}

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

      {band}

      <div className="table-wrap">
        <table className="min-w-full text-sm">
          <thead className="table-head">
            <tr>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Region</th>
              {([
                ['lastApply', 'Applies'],
                ['bids', 'Bids'],
                ['interviews', 'Interviews'],
                ['rate', 'Intv/bid'],
                ['pass', 'Pass rate'],
                ['score', 'Resume score'],
              ] as const).map(([key, label]) => (
                <th
                  key={key}
                  className="px-4 py-2.5 whitespace-nowrap"
                  aria-sort={sort?.key === key ? (sort.dir === 'desc' ? 'descending' : 'ascending') : undefined}
                  title={allTime && key === 'bids' ? selfSinceNote : undefined}
                >
                  <button type="button" className="uppercase tracking-wide hover:underline" onClick={() => toggleSort(key)}>
                    {label}
                    {sort?.key === key && <span aria-hidden> {sort.dir === 'desc' ? '↓' : '↑'}</span>}
                  </button>
                </th>
              ))}
              <th className="px-4 py-2.5" title="Fixed resumes and tailoring units; ⚠ when a unit can't be used well">Setup</th>
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
                <td colSpan={12} className="px-4 py-8 text-center text-muted">
                  <div role="status" className="flex items-center justify-center">
                    <div className="spinner spinner-md mr-3" aria-hidden></div>
                    Loading profiles...
                  </div>
                </td>
              </tr>
            ) : accounts.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-3 py-6 text-center text-muted">
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
                      {a.country && <span role="img" aria-label={countryName(a.country)} title={countryName(a.country)}>{countryFlag(a.country)}</span>}
                      <span className="text-muted">{a.region || '—'}</span>
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                {metricCells(a)}
                {setupTd(a)}
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
