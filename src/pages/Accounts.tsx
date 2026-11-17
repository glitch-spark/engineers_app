import useSWR from 'swr';
import { useState, useEffect, useMemo, useRef, useId, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import * as api from '../api/endpoints';
import { notify } from '../lib/notify';
import ActionMenu from '../components/ActionMenu';
import ConfirmDialog from '../components/ConfirmDialog';
import NameWithAvatar from '../components/NameWithAvatar';
import PageHeader from '../components/PageHeader';
import { countryFlag, countryName } from '../lib/countries';
import { PROFILE_STATUS_OPTIONS } from '../lib/profileArchive';
import { fmtCount, fmtPerWeek, fmtRate, fmtScore, tailoredText } from '../lib/profileMetrics';
import {
  PROFILE_ALL_USERS, PROFILE_CLEAR_KEYS, PROFILE_PRESETS, PROFILE_REGION_OPTIONS, PROFILE_URL_DEFAULTS, dropLegacyRange, legacyRangePatch,
  parseProfileValues, readLegacyRange, profileBenchmarkParams, profileCanClear, profileDays, profileListParams, profileMetricsParams,
  profileRangeError, type ProfileKey,
} from '../lib/profileFilters';
import { isoDay } from '../lib/dateRange';
import { useUrlFilters } from '../lib/useUrlFilters';
import { useFirstTeamMember } from '../lib/useFirstTeamMember';
import DateRangeFilter, { type DateRangeValue } from '../components/filters/DateRangeFilter';
import FilterBar, { FilterField } from '../components/filters/FilterBar';
import SearchFilter from '../components/filters/SearchFilter';
import Pagination from '../components/Pagination';
import Select from '../components/Select';
import { bidsBreakdown, interviewsAppliedBy, interviewsBreakdown, keptAlerts, passDetail, rateDetail, rowArrow, setupText, shortDay, sinceDay, windowsMatch } from '../lib/profileList';
import ProfilesBand, { Arrow } from '../components/profiles/ProfilesBand';
import ProfileAlerts from '../components/profiles/ProfileAlerts';

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
  const filterId = useId();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [pendingDelete, setPendingDelete] = useState<Acc | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pendingArchive, setPendingArchive] = useState<{ id: string; name: string } | null>(null);
  const [archiving, setArchiving] = useState(false);

  // Filters live in the URL (defaults left out), so a reload or a shared link keeps them.
  // Admins open on the first team member (A–Z); All users and any other pick are written to the URL and win.
  const [urlValues, patchUrl] = useUrlFilters(PROFILE_URL_DEFAULTS);
  const firstMember = useFirstTeamMember(isAdmin);
  const defaultUser = isAdmin ? firstMember.id ?? '' : '';
  // Nothing is asked for while the default is unknown, so another user's profiles never flash first.
  const userPending = isAdmin && !urlValues.user && firstMember.loading;
  const filters = parseProfileValues(urlValues, defaultUser);
  const profileStatus = filters.status;
  /** The picked owner, or '' for every owner. */
  const userId = filters.user === PROFILE_ALL_USERS ? '' : filters.user;
  const [searchParams] = useSearchParams();
  const urlHasRange = searchParams.has('range');
  // Local calendar day, as the page has always worked out its periods.
  const today = isoDay(new Date());
  const allTime = filters.range === 'all_time';
  const rangeError = profileRangeError(filters);
  const rangeDates = profileDays(filters, today);
  const rangeValue: DateRangeValue = { preset: filters.range, from: filters.from, to: filters.to };
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);

  // The range this page used to keep in localStorage moves to the URL once (when the URL has none), then the old key
  // is dropped. Nothing is requested until that is done, so the list doesn't load All time first.
  const [legacyDone, setLegacyDone] = useState(() => readLegacyRange() === null);
  const liveRef = useRef({ urlHasRange, patchUrl });
  liveRef.current = { urlHasRange, patchUrl };
  useEffect(() => {
    const stored = readLegacyRange();
    if (stored !== null) {
      const patch = legacyRangePatch(liveRef.current.urlHasRange, stored);
      if (patch) liveRef.current.patchUrl(patch);
      dropLegacyRange();
    }
    setLegacyDone(true);
  }, []);

  const listParams = profileListParams(filters, isAdmin);
  const { data, mutate, isLoading: listLoading } = useSWR(
    legacyDone && !userPending ? (['accounts', JSON.stringify(listParams)] as const) : null,
    () => api.listAccounts(listParams)
  );
  const isLoading = listLoading || !legacyDone || userPending;

  // Metrics load on their own key so the list never waits on them. Archived profiles have none: no request then.
  // A partial or invalid Custom range asks for nothing (the bar says why).
  const metricsParams = profileMetricsParams(filters, today, isAdmin);
  const { data: metricsData, error: metricsError, isLoading: metricsLoading, mutate: mutateMetrics } = useSWR(
    profileStatus === 'archived' || !metricsParams || !legacyDone || userPending
      ? null
      : (['account-metrics', rangeDates?.from ?? 'all', rangeDates?.to ?? '', isAdmin ? userId : ''] as const),
    () => api.getProfileMetrics(metricsParams ?? {}),
    { revalidateOnFocus: false }
  );
  const metricsById = useMemo(
    () => new Map((metricsData?.rows ?? []).map((r) => [r.accountId, r])),
    [metricsData]
  );
  // The banners (one owner's list, whatever the date filter): not on the Archived filter or when metrics failed.
  // Kept while the same owner's next date range loads, so the banners don't vanish and the toolbar doesn't jump.
  const lastAlerts = useRef<ReturnType<typeof keptAlerts>>(null);
  lastAlerts.current = keptAlerts(lastAlerts.current, isAdmin ? userId : '',
    metricsData ? metricsData.alerts ?? null : undefined);
  const alerts = profileStatus !== 'archived' && !metricsError && !rangeError ? lastAlerts.current?.alerts ?? null : null;
  const noInterviewIds = useMemo(() => new Set((alerts?.noInterviews ?? []).map((a) => a.accountId)), [alerts]);

  // "All profiles" over the same days (cached on the server for 15 minutes); a failure only hides the comparison.
  const benchParams = profileBenchmarkParams(filters, today);
  const { data: bench } = useSWR(
    profileStatus === 'archived' || !benchParams || !legacyDone
      ? null
      : (['metrics-benchmark', rangeDates?.from ?? 'all', rangeDates?.to ?? ''] as const),
    () => api.getMetricsBenchmark(benchParams ?? { period: 'all' }),
    { revalidateOnFocus: false }
  );
  const compared = !!metricsData && windowsMatch(metricsData, bench) ? bench ?? null : null;
  const comparedFrom = metricsData?.comparedFrom ?? '';

  // The lookup lists every user; /users is paginated (10 by default), which cut the filter short.
  const { data: usersData } = useSWR(isAdmin ? ['users-lookup'] : null, () => api.lookupUsers());
  const users = usersData?.users ?? [];

  const clearFilters = () =>
    patchUrl(Object.fromEntries(PROFILE_CLEAR_KEYS.map((k) => [k, undefined])) as Partial<Record<ProfileKey, string>>);

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

  // The grey banner's Archive (the profile may not be on this page of the table).
  const archiveSuggested = async () => {
    const p = pendingArchive;
    if (!p) return;
    setArchiving(true);
    try {
      await api.updateAccount(p.id, { archived: true });
      notify.success(`"${p.name}" archived`);
      setPendingArchive(null);
      mutate();
      mutateMetrics();
    } catch (err) {
      notify.error(err, 'Failed to archive profile');
    } finally {
      setArchiving(false);
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

  // Six <td>s: Applies, Bids, Interviews, Interview rate, Rounds passed, Resume score.
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
          {bidsBreakdown(m) && (
            <div className="max-w-[16rem] whitespace-normal text-[11px] text-muted">{bidsBreakdown(m)}</div>
          )}
        </td>
        <td
          className="px-4 py-2.5 whitespace-nowrap"
          title={`Who took the interviews: self or each caller. ${
            interviewsAppliedBy(m) ? `Who applied for the jobs: ${interviewsAppliedBy(m)}. ` : ''}${perWeek(m.interviewsPerWeek)}`}
        >
          <div>
            {fmtCount(m.interviews)}
            {noInterviewIds.has(a._id) && (
              <span className="ml-1 rounded bg-red-100 px-1 text-[10px] text-red-700 dark:bg-red-900/50 dark:text-red-200">
                No interviews in 14 days
              </span>
            )}
          </div>
          {interviewsBreakdown(m) && (
            <div className="max-w-[16rem] whitespace-normal text-[11px] text-muted">{interviewsBreakdown(m)}</div>
          )}
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
    const detail = passDetail(r, m.interviews);
    if (!r || r.passRate == null) {
      return (
        <td className="px-4 py-2.5 whitespace-nowrap text-muted" title={detail ? 'No interview round has a result yet in this range' : undefined}>
          <div>—</div>
          {detail && <div className="text-[11px]">{detail}</div>}
        </td>
      );
    }
    return (
      <td className="px-4 py-2.5 whitespace-nowrap" title={`${fmtCount(r.passed)} of ${fmtCount(r.decided)} interview rounds with a result were passed`}>
        <div>{Math.round(r.passRate * 100)}%{arrow('pass', m)}</div>
        <div className="text-[11px] text-muted">{detail}</div>
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
        <div>{fmtRate(m.interviewsPerBid)}{arrow('rate', m)}</div>
        <div className="text-[11px] text-muted">{rateDetail(m.interviews, m.bids)}</div>
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
      band = <p role="status" className="text-xs text-muted">Nothing to compare with other users in this range.</p>;
    } else if (!metricsData.mine) {
      band = <p role="status" className="text-xs text-muted">{whose} profiles have no bids in this range yet.</p>;
    } else if (compared) {
      const rangeLabel = filters.range === 'custom'
        ? `${fmtDay(filters.from)} – ${fmtDay(filters.to)}`
        : PROFILE_PRESETS.find((o) => o.value === filters.range)?.label ?? '';
      band = (
        <ProfilesBand
          whose={whose}
          mine={metricsData.mine}
          all={compared}
          rangeLabel={rangeLabel}
          total={metricsData.rows.length}
          from={metricsData.comparedFrom}
          to={metricsData.comparedTo ?? metricsData.comparedFrom}
          regionTops={metricsData.regionTops}
          benchTops={compared.regionTops}
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

      {alerts && (
        <ProfileAlerts
          alerts={alerts}
          warningsFor={(id) => {
            const acc = rawAccounts.find((x) => x._id === id);
            return acc ? setupText(acc).warnings : [];
          }}
          onArchive={(id, name) => setPendingArchive({ id, name })}
        />
      )}

      <FilterBar canClear={profileCanClear(filters, isAdmin, defaultUser)} onClear={clearFilters}>
        {isAdmin && (
          <FilterField label="User" htmlFor={`${filterId}-user`} width="w-52">
            <Select
              id={`${filterId}-user`}
              className="w-full text-sm"
              value={filters.user}
              onChange={(v) => patchUrl({ user: v })}
              options={[
                { value: PROFILE_ALL_USERS, label: 'All users' },
                ...users.map((u) => ({ value: u._id, label: u.name || u.email || u._id })),
              ]}
            />
          </FilterField>
        )}
        <FilterField label="Status" htmlFor={`${filterId}-status`} width="w-36">
          <Select
            id={`${filterId}-status`}
            className="w-full text-sm"
            value={filters.status}
            onChange={(v) => patchUrl({ status: v })}
            options={PROFILE_STATUS_OPTIONS}
          />
        </FilterField>
        <FilterField label="Region" htmlFor={`${filterId}-region`} width="w-36">
          <Select
            id={`${filterId}-region`}
            className="w-full text-sm"
            value={filters.region}
            onChange={(v) => patchUrl({ region: v })}
            options={PROFILE_REGION_OPTIONS}
          />
        </FilterField>
        <SearchFilter value={filters.q} onChange={(q) => patchUrl({ q })} placeholder="Search profiles…" />
        <DateRangeFilter
          value={rangeValue}
          onChange={(v) => patchUrl({ range: v.preset, from: v.from, to: v.to })}
          presets={PROFILE_PRESETS}
          allowFuture={false}
          today={today}
        />
      </FilterBar>

      {filters.q && (
        <div role="status" className="text-sm text-muted">
          {pagination ? (
            <>
              Found {pagination.total} result{pagination.total !== 1 ? 's' : ''} for "{filters.q}"
              {pagination.total > 0 && (
                <span className="ml-2">
                  (Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
                  {Math.min(pagination.page * pagination.limit, pagination.total)})
                </span>
              )}
            </>
          ) : (
            `Searching for "${filters.q}"...`
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
                ['rate', 'Interview rate'],
                ['pass', 'Rounds passed'],
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
                  {filters.q
                    ? `No profiles found matching "${filters.q}"`
                    : profileStatus === 'archived' ? 'No archived profiles.' : 'No profiles found.'}
                </td>
              </tr>
            ) : accounts.map((a) => (
              <tr
                key={a._id}
                className={`table-row cursor-pointer transition-colors ${a.archived ? 'text-muted' : ''} ${
                  noInterviewIds.has(a._id) ? 'bg-red-50 dark:bg-red-950/30' : ''}`}
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

      <Pagination
        info={pagination}
        onPage={(page) => patchUrl({ page: String(page) })}
        pageSize={filters.size}
        onPageSize={(size) => patchUrl({ size: String(size) })}
        label="Profiles pagination"
      />

      <ConfirmDialog
        open={!!pendingArchive}
        title="Archive profile?"
        body={<p>Archive "{pendingArchive?.name}"? It leaves the active list and Generate; you can unarchive it any time.</p>}
        confirmLabel="Archive"
        tone="default"
        busy={archiving}
        onConfirm={archiveSuggested}
        onCancel={() => setPendingArchive(null)}
      />

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
