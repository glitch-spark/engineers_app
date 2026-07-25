import useSWR from 'swr';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Pencil, Trash2 } from 'lucide-react';
import Modal from '../components/Modal';
import Select from '../components/Select';
import InterviewTabs from '../components/InterviewTabs';
import PageHeader from '../components/PageHeader';
import {
  InterviewSidePanel,
  blankInterviewForm,
  buildSaveBody,
  defaultInterviewFormOptions,
  interviewToForm,
  type Interview,
  type InterviewFormState,
} from '../components/InterviewEditPanel';
import { useAuth } from '../auth/useAuth';
import * as api from '../api/endpoints';
import { notify } from '../lib/notify';
import {
  getInterviewMovementEntries,
  normalizeInterviewStage,
  stageLabel,
} from '../lib/stageBadge';
import {
  DATE_RANGE_PRESET_OPTIONS,
  formatDateRangeText,
  rangeForDatePreset,
  type DateRangePreset,
} from '../lib/dateRangePresets';
import { countryName, formatProfileLabel } from '../lib/countries';

type AccountRef = { _id: string; name?: string; email?: string; country?: string | null; region?: string | null };
type CreatorRef = { _id: string; name?: string; email?: string };

/** Live matrix columns — sync with List stage badges (no Offer, no Rejected). */
const LIVE_COLUMNS = [
  { key: 'intro', label: 'Intro' },
  { key: 'home_assessment', label: 'Home assess.' },
  { key: 'live_coding', label: 'Live coding' },
  { key: 'tech_round_1', label: 'Tech 1' },
  { key: 'tech_round_2', label: 'Tech 2' },
  { key: 'cultural', label: 'Hiring mgr' },
  { key: 'panel', label: 'Panel' },
  { key: 'final', label: 'Final' },
] as const;

type LiveColKey = (typeof LIVE_COLUMNS)[number]['key'];
const LIVE_COL_SET = new Set<string>(LIVE_COLUMNS.map((c) => c.key));

function toLiveCol(stage?: string | null): LiveColKey | null {
  const s = normalizeInterviewStage(stage);
  // System design sits with Live coding on this matrix (no dedicated column).
  if (s === 'system_design') return 'live_coding';
  if (!s || !LIVE_COL_SET.has(s)) return null;
  return s as LiveColKey;
}

function dateKey(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  if (isNaN(d.getTime())) return undefined;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatCellDate(iso?: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const month = new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'short' });
  return `${month} ${d}`;
}

function isCanceledInterview(iv: Interview): boolean {
  const stage = normalizeInterviewStage(iv.stage);
  const status = (iv.status || '').toLowerCase();
  if (status === 'canceled') return true;
  // Same convention as List: scheduled + rejected = canceled (never sat interview).
  return status === 'scheduled' && stage === 'rejected';
}

function isRejectedFail(iv: Interview): boolean {
  return normalizeInterviewStage(iv.stage) === 'rejected' && !isCanceledInterview(iv);
}

/** Open process (not canceled). Includes rejected fails. */
function isOpenInterview(iv: Interview): boolean {
  return !isCanceledInterview(iv);
}

/** Active pipeline — open and not a rejected fail. */
function isActiveLiveInterview(iv: Interview): boolean {
  return isOpenInterview(iv) && !isRejectedFail(iv);
}

type StatusFilter = 'all' | 'rejected' | 'live';
type RegionFilter = 'all' | 'Latam' | 'EU' | 'Canada' | 'US';

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'live', label: 'Live' },
];

const REGION_FILTER_OPTIONS: { value: RegionFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'Latam', label: 'Latam' },
  { value: 'EU', label: 'EU' },
  { value: 'Canada', label: 'Canada' },
  { value: 'US', label: 'USA' },
];

function accountRegion(iv: Interview): string | null {
  const acc = typeof iv.accountId === 'object' ? iv.accountId : null;
  const region = (acc?.region || '').trim();
  return region || null;
}

type LiveProgress = {
  completedCol: LiveColKey | null;
  completedDate?: string;
  scheduledCol: LiveColKey | null;
  scheduledDate?: string;
};

/** At most one completed (last) + one scheduled (upcoming) cell. */
function liveProgress(iv: Interview): LiveProgress {
  const trail = getInterviewMovementEntries(iv);
  const status = (iv.status || '').toLowerCase();
  const tip = trail[trail.length - 1];
  const tipDate = tip?.scheduledAt || dateKey(iv.scheduledAt);
  const prev = trail.length >= 2 ? trail[trail.length - 2] : undefined;

  // Rejected fail — highlight last real stage (where they failed); no scheduled next.
  if (isRejectedFail(iv)) {
    const failStage = prev ? toLiveCol(prev.stage) : null;
    return {
      completedCol: failStage,
      completedDate: prev?.scheduledAt || tipDate,
      scheduledCol: null,
    };
  }

  const currentCol = toLiveCol(iv.stage);

  if (status === 'completed') {
    return {
      completedCol: currentCol || toLiveCol(tip?.stage),
      completedDate: tipDate,
      scheduledCol: null,
    };
  }

  // Scheduled / rescheduled / unset → current is upcoming; prior trail tip is last completed.
  const scheduledCol = currentCol || toLiveCol(tip?.stage);
  const completedCol = prev ? toLiveCol(prev.stage) : null;
  return {
    completedCol: completedCol && completedCol !== scheduledCol ? completedCol : null,
    completedDate: prev?.scheduledAt,
    scheduledCol,
    scheduledDate: tipDate,
  };
}

function dateInSelectedRange(dateKeyVal: string | undefined, fromDate?: string, toDate?: string): boolean {
  if (!dateKeyVal) return false;
  if (fromDate && dateKeyVal < fromDate) return false;
  if (toDate && dateKeyVal > toDate) return false;
  return true;
}

/**
 * Live matrix should only paint cells whose dates fall in the selected range.
 * Without this, an interview touched this week still shows last week's completed cell.
 */
function liveProgressInRange(iv: Interview, fromDate?: string, toDate?: string): LiveProgress | null {
  const full = liveProgress(iv);
  const completedInRange = dateInSelectedRange(full.completedDate, fromDate, toDate);
  const scheduledInRange = dateInSelectedRange(full.scheduledDate, fromDate, toDate);
  if (!completedInRange && !scheduledInRange) return null;
  return {
    completedCol: completedInRange ? full.completedCol : null,
    completedDate: completedInRange ? full.completedDate : undefined,
    scheduledCol: scheduledInRange ? full.scheduledCol : null,
    scheduledDate: scheduledInRange ? full.scheduledDate : undefined,
  };
}

function refName(ref: AccountRef | CreatorRef | string | undefined, fallback = '—'): string {
  if (!ref) return fallback;
  if (typeof ref === 'string') return fallback;
  return ref.name || ref.email || fallback;
}

function profileLabel(ref: AccountRef | string | undefined, fallback = 'Untitled profile'): string {
  if (!ref || typeof ref === 'string') return fallback;
  const name = (ref.name || ref.email || '').trim() || fallback;
  const country = countryName(ref.country);
  return country ? `${name} (${country})` : name;
}

export default function InterviewsLivePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const meId = user?.id || '';

  const [creatorId, setCreatorId] = useState('');
  const [userFilterReady, setUserFilterReady] = useState(false);
  const [accountId, setAccountId] = useState('');
  const [datePreset, setDatePreset] = useState<DateRangePreset>('this_month');
  const [from, setFrom] = useState(() => rangeForDatePreset('this_month').from);
  const [to, setTo] = useState(() => rangeForDatePreset('this_month').to);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [regionFilter, setRegionFilter] = useState<RegionFilter>('all');

  const [panelInterview, setPanelInterview] = useState<Interview | null>(null);
  const [panelForm, setPanelForm] = useState<InterviewFormState>(blankInterviewForm);
  const [panelSaving, setPanelSaving] = useState(false);
  const [panelError, setPanelError] = useState('');

  useEffect(() => {
    if (!userFilterReady && meId) {
      setCreatorId(meId);
      setUserFilterReady(true);
    }
  }, [meId, userFilterReady]);

  const applyDatePreset = (preset: DateRangePreset) => {
    setDatePreset(preset);
    if (preset === 'custom') return;
    const range = rangeForDatePreset(preset);
    setFrom(range.from);
    setTo(range.to);
  };

  const { data, mutate, isLoading, error: loadError } = useSWR(
    userFilterReady
      ? (['interviews-live', creatorId, accountId, from, to] as const)
      : null,
    () => api.listInterviews({
      page: 1,
      limit: 500,
      sort: 'desc',
      ...(creatorId ? { creatorId } : {}),
      ...(accountId ? { accountId } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    }),
    { revalidateOnFocus: false },
  );

  const { data: accountsLookup } = useSWR(['accounts-lookup'], () => api.lookupAccounts());
  const accounts = accountsLookup?.accounts ?? [];

  const { data: ownAccountsData } = useSWR(['accounts-own'], () => api.listAccounts({ limit: 1000 }));
  const ownAccounts = (ownAccountsData?.accounts as Array<{ _id: string; name?: string; title?: string }>) || [];

  const { data: usersData } = useSWR(['users-lookup', 'staff-only'], () => api.lookupUsers({ excludeRole: 'admin' }));
  const users = (usersData?.users as Array<{ _id: string; name?: string | null; email?: string | null }>) || [];

  const interviews = useMemo(() => {
    const raw = (data?.interviews as Interview[]) || [];
    return raw.filter((iv) => {
      if (isCanceledInterview(iv)) return false;
      if (statusFilter === 'rejected' && !isRejectedFail(iv)) return false;
      if (statusFilter === 'live' && !isActiveLiveInterview(iv)) return false;
      if (regionFilter !== 'all' && accountRegion(iv) !== regionFilter) return false;
      return true;
    });
  }, [data, statusFilter, regionFilter]);

  const rows = useMemo(() => {
    const fromDate = from || undefined;
    const toDate = to || undefined;
    return interviews
      .map((iv) => {
        const progress = liveProgressInRange(iv, fromDate, toDate);
        return progress ? { iv, progress } : null;
      })
      .filter((row): row is { iv: Interview; progress: LiveProgress } => row !== null)
      .sort((a, b) => {
        // Soonest scheduled first, then most recently completed.
        const aSched = a.progress.scheduledDate || '';
        const bSched = b.progress.scheduledDate || '';
        if (aSched && bSched && aSched !== bSched) return aSched.localeCompare(bSched);
        if (aSched && !bSched) return -1;
        if (!aSched && bSched) return 1;
        const aDone = a.progress.completedDate || '';
        const bDone = b.progress.completedDate || '';
        return bDone.localeCompare(aDone);
      });
  }, [interviews, from, to]);

  const userOptions = useMemo(() => [
    { value: '', label: 'All users' },
    ...users.map((u) => ({ value: u._id, label: u.name || u.email || u._id })),
  ], [users]);

  const accountOptions = useMemo(() => {
    const filtered = creatorId
      ? accounts.filter((a) => a.createdBy === creatorId)
      : accounts;
    return [
      { value: '', label: 'All profiles' },
      ...filtered.map((a) => ({
        value: a._id,
        label: formatProfileLabel(a.name, a.country, a._id, a.region),
      })),
    ];
  }, [accounts, creatorId]);

  const accountSelectOptions = useMemo(
    () => ownAccounts.map((a) => ({
      value: a._id,
      label: formatProfileLabel(a.name, a.country, a._id, a.region),
    })),
    [ownAccounts],
  );

  const { stageFormOptions, techSubStageOptions, statusFormOptions } = useMemo(
    () => defaultInterviewFormOptions(),
    [],
  );

  const canEdit = (iv: Interview): boolean => {
    if (isAdmin) return true;
    const createdById = typeof iv.createdBy === 'string' ? iv.createdBy : iv.createdBy?._id;
    return createdById === meId;
  };

  const openPanel = (iv: Interview) => {
    setPanelInterview(iv);
    setPanelForm(interviewToForm(iv));
    setPanelError('');
  };

  const closePanel = () => {
    setPanelInterview(null);
    setPanelError('');
  };

  const [deleteTarget, setDeleteTarget] = useState<Interview | null>(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (!canEdit(deleteTarget)) {
      notify.error('You cannot delete this interview');
      return;
    }
    setDeleting(true);
    try {
      await api.deleteInterview(deleteTarget._id);
      notify.success('Interview deleted');
      if (panelInterview?._id === deleteTarget._id) closePanel();
      setDeleteTarget(null);
      mutate();
    } catch (err) {
      notify.error(err, 'Failed to delete interview');
    } finally {
      setDeleting(false);
    }
  };

  const savePanel = async () => {
    if (!panelInterview) return;
    if (!panelForm.date) {
      notify.error('Select a scheduled date');
      return;
    }
    if (panelForm.stage === 'tech' && !panelForm.techSubStage) {
      notify.error('Select a Tech sub-stage');
      return;
    }
    if (!canEdit(panelInterview)) {
      notify.error('You cannot edit this interview');
      return;
    }
    setPanelSaving(true);
    setPanelError('');
    try {
      const updated = await api.updateInterview(panelInterview._id, buildSaveBody(panelForm));
      notify.success('Interview updated');
      setPanelInterview(updated as unknown as Interview);
      setPanelForm(interviewToForm(updated as unknown as Interview));
      mutate();
    } catch (err) {
      notify.error(err, 'Failed to save interview');
    } finally {
      setPanelSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Interviews" />
      <InterviewTabs />

      <div className="flex items-end gap-3 flex-wrap panel px-4 py-3">
        <div className="w-44">
          <label className="block text-xs text-muted mb-1">User</label>
          <Select
            value={creatorId}
            onChange={(v) => {
              setCreatorId(v);
              setAccountId('');
            }}
            options={userOptions}
          />
        </div>
        <div className="w-44">
          <label className="block text-xs text-muted mb-1">Profile</label>
          <Select value={accountId} onChange={setAccountId} options={accountOptions} />
        </div>
        <div className="w-44">
          <label className="block text-xs text-muted mb-1">Date range</label>
          <Select
            value={datePreset}
            onChange={(v) => applyDatePreset(v as DateRangePreset)}
            options={DATE_RANGE_PRESET_OPTIONS}
          />
        </div>
        {datePreset === 'custom' ? (
          <>
            <div className="w-40">
              <label className="block text-xs text-muted mb-1">From</label>
              <input className="input w-full text-sm" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="w-40">
              <label className="block text-xs text-muted mb-1">To</label>
              <input className="input w-full text-sm" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </>
        ) : (
          from && to && (
            <div className="flex items-end pb-2 min-w-0">
              <span className="text-sm text-muted tabular-nums whitespace-nowrap" title={`${from} → ${to}`}>
                {formatDateRangeText(from, to)}
              </span>
            </div>
          )
        )}

        <div className="flex flex-col gap-1 pb-0.5">
          <span className="text-xs font-medium text-sky-700 dark:text-sky-400">Status</span>
          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 dark:border-sky-800 dark:bg-sky-950/40"
            role="radiogroup"
            aria-label="Status filter"
          >
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="inline-flex items-center gap-1.5 text-sm text-sky-900 dark:text-sky-200 cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-sky-600"
                  checked={statusFilter === opt.value}
                  onChange={() => setStatusFilter(opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1 pb-0.5">
          <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Region</span>
          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 dark:border-amber-800 dark:bg-amber-950/40"
            role="radiogroup"
            aria-label="Region filter"
          >
            {REGION_FILTER_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="inline-flex items-center gap-1.5 text-sm text-amber-900 dark:text-amber-200 cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-amber-600"
                  checked={regionFilter === opt.value}
                  onChange={() => setRegionFilter(opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading live interviews…
        </div>
      )}
      {loadError && (
        <div className="text-sm text-red-600">Failed to load interviews. Try refreshing.</div>
      )}

      {!isLoading && !loadError && (
        <div className="panel overflow-hidden">
          {rows.length > 0 && (
            <div className="px-4 py-2 border-b border-zinc-100 dark:border-zinc-800 flex flex-wrap gap-4 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3.5 w-5 rounded-sm bg-emerald-500 border border-emerald-600" />
                Last completed
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3.5 w-5 rounded-sm bg-emerald-50 border border-dashed border-emerald-500 dark:bg-emerald-950/40" />
                Scheduled next
              </span>
              <span className="ml-auto tabular-nums">{rows.length}</span>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border-collapse">
              <thead className="table-head">
                <tr>
                  <th className="px-3 py-2 text-left sticky left-0 z-10 bg-zinc-50 dark:bg-zinc-900 min-w-[160px] border-r border-zinc-200 dark:border-zinc-700">
                    Company
                  </th>
                  <th className="px-3 py-2 text-left sticky left-[160px] z-10 bg-zinc-50 dark:bg-zinc-900 min-w-[140px] border-r border-zinc-200 dark:border-zinc-700">
                    Profile
                  </th>
                  {LIVE_COLUMNS.map((c) => (
                    <th
                      key={c.key}
                      className="px-2 py-2 text-center whitespace-nowrap min-w-[88px] border-r border-zinc-200 dark:border-zinc-700"
                    >
                      {c.label}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-center whitespace-nowrap min-w-[88px]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={3 + LIVE_COLUMNS.length} className="px-4 py-10 text-center text-muted">
                      No live interviews. Processes still in play will show here.
                    </td>
                  </tr>
                ) : (
                  rows.map(({ iv, progress }) => {
                    const profileName = profileLabel(
                      typeof iv.accountId === 'object' ? iv.accountId : undefined,
                      'Untitled profile',
                    );
                    const companyName = iv.companyName || 'Untitled company';
                    const editable = canEdit(iv);
                    const rejected = isRejectedFail(iv);
                    return (
                      <tr
                        key={iv._id}
                        className="border-t border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40"
                      >
                        <td
                          className="px-3 py-2 sticky left-0 z-[1] bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-700 min-w-[160px]"
                          title={companyName}
                        >
                          <div className="text-base font-bold text-sky-800 dark:text-sky-300 truncate">
                            {companyName}
                          </div>
                        </td>
                        <td
                          className="px-3 py-2 sticky left-[160px] z-[1] bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-700 min-w-[140px]"
                          title={profileName}
                        >
                          <div className="text-sm text-muted truncate">{profileName}</div>
                        </td>
                        {LIVE_COLUMNS.map((c) => {
                          const isCompleted = progress.completedCol === c.key;
                          const isScheduled = progress.scheduledCol === c.key;
                          const showRejectMark = rejected && isCompleted;
                          let tdClass = 'px-1.5 py-1.5 text-center align-middle border-r border-zinc-200 dark:border-zinc-700 relative overflow-hidden';
                          let date = '';
                          if (isCompleted) {
                            tdClass += ' bg-emerald-500 text-white';
                            date = formatCellDate(progress.completedDate);
                          } else if (isScheduled) {
                            tdClass += ' bg-emerald-50 text-emerald-800 border-dashed border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-400';
                            date = formatCellDate(progress.scheduledDate);
                          }
                          return (
                            <td
                              key={c.key}
                              className={tdClass}
                              title={
                                showRejectMark
                                  ? `Rejected at ${stageLabel(c.key)}${date ? ` · ${date}` : ''}`
                                  : isCompleted
                                    ? `Completed ${stageLabel(c.key)}${date ? ` · ${date}` : ''}`
                                    : isScheduled
                                      ? `Scheduled ${stageLabel(c.key)}${date ? ` · ${date}` : ''}`
                                      : undefined
                              }
                            >
                              {date ? (
                                <span className={`text-[11px] font-semibold tabular-nums leading-tight ${isCompleted ? 'text-white' : ''}`}>
                                  {date}
                                </span>
                              ) : (
                                <span className="text-[10px] text-transparent select-none">·</span>
                              )}
                              {showRejectMark && (
                                <span
                                  className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 border-b-[28px] border-l-[28px] border-b-red-300 border-l-transparent dark:border-b-red-700/80"
                                  aria-hidden
                                />
                              )}
                            </td>
                          );
                        })}
                        <td className="px-2 py-1.5 text-center align-middle">
                          <div className="inline-flex items-center justify-center gap-0.5">
                            <button
                              type="button"
                              className="btn-icon"
                              title={editable ? 'Edit' : 'View'}
                              aria-label={editable ? 'Edit interview' : 'View interview'}
                              onClick={() => openPanel(iv)}
                            >
                              <Pencil size={14} />
                            </button>
                            {editable && (
                              <button
                                type="button"
                                className="btn-icon text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                                title="Delete"
                                aria-label="Delete interview"
                                onClick={() => setDeleteTarget(iv)}
                              >
                                <Trash2 size={14} />
                              </button>
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
        </div>
      )}

      <Modal
        open={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        title="Delete interview"
      >
        {deleteTarget && (
          <div className="space-y-4">
            <p className="text-sm text-body">
              Delete{' '}
              <span className="font-medium text-strong">
                {deleteTarget.companyName
                  || refName(typeof deleteTarget.accountId === 'object' ? deleteTarget.accountId : undefined, 'this interview')}
              </span>
              ? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn-outline"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn bg-red-600 hover:bg-red-700 border-red-600"
                onClick={confirmDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {panelInterview && (
        <>
          <div
            className="fixed inset-0 top-16 bg-black/25 z-40"
            onClick={closePanel}
            aria-hidden
          />
          <InterviewSidePanel
            interview={panelInterview}
            form={panelForm}
            setForm={setPanelForm}
            error={panelError}
            saving={panelSaving}
            editable={canEdit(panelInterview)}
            accountSelectOptions={accountSelectOptions}
            stageFormOptions={stageFormOptions}
            techSubStageOptions={techSubStageOptions}
            statusFormOptions={statusFormOptions}
            onClose={closePanel}
            onSave={savePanel}
            onOpenTranscript={() => navigate(`/interviews/${panelInterview._id}`)}
          />
        </>
      )}
    </div>
  );
}
