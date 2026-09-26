import useSWR from 'swr';
import { useEffect, useMemo, useState, type MutableRefObject } from 'react';
import Modal from '../components/Modal';
import { Pencil, Trash2, ClipboardCheck } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import * as api from '../api/endpoints';
import { ApiError } from '../api/client';
import { notify } from '../lib/notify';
import NameWithAvatar from '../components/NameWithAvatar';
import { formatWeekOptionLabel, getWeekInfo } from '../lib/week';

export type WeeklyPlanActions = {
  openAdd: () => void;
  runReport: () => void;
};

type Metric = { key: string; label: string; target: number; actual: number; unit?: 'count' | 'hours' };

const unitSuffix = (u?: string) => (u === 'hours' ? ' hrs' : '');

type InterviewBoardSnap = {
  thisWeekTotal: number;
  thisWeekCanceled: number;
  thisWeekBreakdown?: Array<{ label: string; count: number }>;
  thisWeekSummary: string;
  nextWeek: number;
};

type WeeklyPlan = {
  _id: string;
  userId?: { _id: string; email?: string; name?: string };
  weekNumber: number;
  year: number;
  startDate: string;
  endDate: string;
  content: string;
  result: string;
  metrics?: Metric[];
  status?: 'planned' | 'reviewed';
  nextInterviewTarget?: number | null;
  interviewBoard?: InterviewBoardSnap | null;
};

function formatDateRange(startDate: string, endDate: string) {
  const s = new Date(startDate), e = new Date(endDate);
  return `${s.toLocaleDateString()} - ${e.toLocaleDateString()}`;
}

function isWeekOver(endDate: string): boolean {
  const today = new Date();
  const weekEnd = new Date(endDate);
  if (today > weekEnd) return true;
  const dayOfWeek = today.getDay();
  if (dayOfWeek === 5 && today.getHours() >= 12) return true;
  return false;
}

const pct = (actual: number, target: number) => (target > 0 ? Math.round((actual / target) * 100) : 0);

// Fixed core columns for the team-progress rollup. Extra custom metrics
// still show on individual plan cards, just not in this table.
const ROLLUP_COLS = [
  { key: 'bids', label: 'Job applies' },
  { key: 'interviews', label: 'Interviews' },
  { key: 'resume', label: 'Resume' },
  { key: 'outreach', label: 'Outreach' },
];

type FormState = {
  selectedDate: string;
  weekNumber: number;
  year: number;
  startDate: string;
  endDate: string;
  content: string;
  result: string;
  status: 'planned' | 'reviewed';
};

function planOwnerId(plan: WeeklyPlan): string | undefined {
  const uid = plan.userId;
  if (!uid) return undefined;
  return typeof uid === 'string' ? uid : uid._id;
}

/** Pin the logged-in user's row/card first; preserve relative order of the rest. */
function withCurrentUserFirst<T>(
  items: readonly T[],
  currentUserId: string | undefined,
  userIdOf: (item: T) => string | undefined,
): T[] {
  if (!currentUserId || items.length <= 1) return [...items];
  const first: T[] = [];
  const rest: T[] = [];
  for (const item of items) {
    (userIdOf(item) === currentUserId ? first : rest).push(item);
  }
  return [...first, ...rest];
}

export default function WeeklyPlanPanel({
  year,
  weekNumber,
  userId,
  actionsRef,
  onReportingChange,
}: {
  year: string;
  weekNumber: string;
  userId: string;
  actionsRef: MutableRefObject<WeeklyPlanActions | null>;
  onReportingChange: (reporting: boolean) => void;
}) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canEditPlan = (plan: WeeklyPlan) =>
    isAdmin || planOwnerId(plan) === user?.id;

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filterKey, setFilterKey] = useState(`${year}|${weekNumber}|${userId}`);
  const filterNow = `${year}|${weekNumber}|${userId}`;
  if (filterKey !== filterNow) {
    setFilterKey(filterNow);
    setCurrentPage(1);
  }

  const { data, mutate, isLoading } = useSWR(
    ['weekly-plans', year, weekNumber, userId, currentPage, pageSize] as const,
    () => api.listWeeklyPlans({
      page: currentPage,
      limit: pageSize,
      ...(year ? { year: Number(year) } : {}),
      ...(weekNumber ? { weekNumber: Number(weekNumber) } : {}),
      ...(userId ? { userId } : {}),
    })
  );

  const { data: summary, mutate: mutateSummary } = useSWR(
    ['weekly-summary', year, weekNumber, userId] as const,
    () => api.getWeeklyPlanSummary({
      ...(year ? { year: Number(year) } : {}),
      ...(weekNumber ? { weekNumber: Number(weekNumber) } : {}),
      ...(userId ? { userId } : {}),
    })
  );

  const { data: rollup, mutate: mutateRollup } = useSWR(
    ['weekly-rollup', year, weekNumber, userId] as const,
    () => api.getWeeklyUserRollup({
      ...(year ? { year: Number(year) } : {}),
      ...(weekNumber ? { weekNumber: Number(weekNumber) } : {}),
      ...(userId ? { userId } : {}),
    }),
  );

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WeeklyPlan | null>(null);
  const [saving, setSaving] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState<FormState>({
    selectedDate: '', weekNumber: 0, year: 0, startDate: '', endDate: '',
    content: '', result: '', status: 'planned',
  });

  useEffect(() => {
    onReportingChange(reporting);
  }, [reporting, onReportingChange]);

  useEffect(() => {
    if (editing) {
      setForm({
        selectedDate: editing.startDate?.slice(0, 10) || '',
        weekNumber: editing.weekNumber,
        year: editing.year,
        startDate: editing.startDate,
        endDate: editing.endDate,
        content: editing.content || '',
        result: editing.result || '',
        status: editing.status || 'planned',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const openAdd = () => {
    setEditing(null);
    const today = new Date();
    const wk = getWeekInfo(today);
    setForm({
      selectedDate: today.toISOString().split('T')[0],
      weekNumber: wk.weekNumber, year: wk.year,
      startDate: wk.startDate.toISOString(), endDate: wk.endDate.toISOString(),
      content: '', result: '', status: 'planned',
    });
    setError('');
    setOpen(true);
  };

  const handleDateChange = (dateString: string) => {
    const wk = getWeekInfo(new Date(dateString));
    setForm((f) => ({
      ...f, selectedDate: dateString, weekNumber: wk.weekNumber, year: wk.year,
      startDate: wk.startDate.toISOString(), endDate: wk.endDate.toISOString(),
    }));
  };

  const runReport = async () => {
    setReporting(true);
    try {
      const res = await api.runWeeklyProgressReport({
        ...(year ? { year: Number(year) } : {}),
        ...(weekNumber ? { weekNumber: Number(weekNumber) } : {}),
        ...(userId ? { userId } : {}),
      });
      notify.success(`Progress report: ${res.processed} plan${res.processed === 1 ? '' : 's'} analyzed`);
      mutate();
      mutateSummary();
      mutateRollup();
    } catch (err) {
      notify.error(err, 'Failed to run progress report');
    } finally {
      setReporting(false);
    }
  };

  actionsRef.current = { openAdd, runReport };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const body = {
        weekNumber: form.weekNumber,
        year: form.year,
        startDate: form.startDate,
        endDate: form.endDate,
        content: form.content,
        result: form.result,
        status: form.status,
      };
      if (editing) {
        await api.updateWeeklyPlan(editing._id, body);
        notify.success(`Week ${form.weekNumber} updated`);
      } else {
        await api.createWeeklyPlan(body);
        notify.success(`Week ${form.weekNumber} created`);
      }
      setOpen(false);
      mutate();
      mutateSummary();
    } catch (err) {
      notify.error(err instanceof ApiError ? err : 'Failed to save plan');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (plan: WeeklyPlan) => {
    if (!confirm('Delete this weekly plan?')) return;
    try {
      await api.deleteWeeklyPlan(plan._id);
      notify.success('Weekly plan deleted');
      mutate();
      mutateSummary();
    } catch (err) {
      notify.error(err, 'Failed to delete weekly plan');
    }
  };

  const handlePageSizeChange = (size: number) => { setPageSize(size); setCurrentPage(1); };

  const plans = (data?.plans as WeeklyPlan[]) || [];
  const pagination = data?.pagination;

  const sortedRollupUsers = useMemo(
    () => withCurrentUserFirst(rollup?.users ?? [], user?.id, (u) => u.userId),
    [rollup?.users, user?.id],
  );

  const sortedPlans = useMemo(
    () => withCurrentUserFirst(plans, user?.id, planOwnerId),
    [plans, user?.id],
  );

  const hasMetricData = useMemo(
    () => (summary?.totals ?? []).some((t) => t.target > 0 || t.actual > 0),
    [summary],
  );

  return (
    <div className="space-y-6">
      {/* Stats cards — totals for the current filter (year + optional week) */}
      {summary && hasMetricData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {summary.totals.filter((t) => t.target > 0 || t.actual > 0).map((t) => (
            <div key={t.key} className="panel p-4">
              <div className="text-xs text-muted">{t.label}</div>
              <div className="text-2xl font-bold text-strong mt-1">
                {t.target}<span className="text-sm font-medium text-faint"> / {t.actual}</span>
              </div>
              <ProgressBar value={pct(t.actual, t.target)} />
            </div>
          ))}
        </div>
      )}

      {/* Team progress — rollup of planned vs actual per user */}
      {rollup && rollup.users.length > 0 && (
        <div className="panel overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
            <h2 className="card-title uppercase tracking-wide">Team progress</h2>
            <p className="hint">Planned vs actual per user for the current filter. Interview actuals come from the board. Run Progress Report to refresh.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-3 py-2">User</th>
                  {ROLLUP_COLS.map((c) => <th key={c.key} className="px-3 py-2 text-right">{c.label}</th>)}
                  <th className="px-3 py-2 text-right">Reviewed</th>
                </tr>
              </thead>
              <tbody>
                {sortedRollupUsers.map((u) => (
                  <tr key={u.userId} className="border-t align-middle">
                    <td className="px-3 py-2"><NameWithAvatar name={u.name || u.email} /></td>
                    {ROLLUP_COLS.map((c) => {
                      const m = u.metrics.find((x) => x.key === c.key);
                      const target = m?.target ?? 0;
                      const actual = m?.actual ?? 0;
                      const p = pct(actual, target);
                      return (
                        <td key={c.key} className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                          {target} / {actual}{unitSuffix((m as { unit?: string } | undefined)?.unit)}
                          <span className={'ml-2 ' + (target > 0 && p >= 100 ? 'text-green-600' : 'text-faint')}>
                            {target > 0 ? `${p}%` : '—'}
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right text-muted tabular-nums">{u.reviewedCount}/{u.planCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="panel p-8 text-center text-sm text-muted">
          <div className="flex items-center justify-center">
            <div className="spinner spinner-md mr-3" />
            Loading weekly plans...
          </div>
        </div>
      ) : plans.length === 0 ? (
        <div className="panel p-8 text-center text-sm text-muted">
          No weekly plans found.
        </div>
      ) : (
        <div className="space-y-3">
          {sortedPlans.map((plan) => {
            const reviewed = plan.status === 'reviewed';
            const needsReview = !reviewed && isWeekOver(plan.endDate);
            return (
              <div key={plan._id} className="panel p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-strong">Week {plan.weekNumber}, {plan.year}</span>
                      <span className="text-xs text-faint">{formatDateRange(plan.startDate, plan.endDate)}</span>
                      {reviewed ? (
                        <span className="badge-success">Reviewed</span>
                      ) : needsReview ? (
                        <span className="badge-warning">Needs follow-up</span>
                      ) : (
                        <span className="badge-neutral">Planned</span>
                      )}
                    </div>
                    <div className="mt-1"><NameWithAvatar name={plan.userId?.name || plan.userId?.email} imageUrl={(plan.userId as { image?: string } | undefined)?.image} /></div>
                  </div>
                  {canEditPlan(plan) && (
                    <div className="flex gap-1 flex-shrink-0">
                      <button type="button" className="btn-icon" onClick={() => { setEditing(plan); setError(''); setOpen(true); }} title={needsReview ? 'Add follow-up' : 'Edit'}>
                        {needsReview ? <ClipboardCheck size={16} /> : <Pencil size={16} />}
                      </button>
                      <button type="button" className="btn-icon" onClick={() => remove(plan)} title="Delete"><Trash2 size={16} /></button>
                    </div>
                  )}
                </div>

                {(() => {
                  const board = plan.interviewBoard;
                  const nextWeek = typeof board?.nextWeek === 'number'
                    ? board.nextWeek
                    : (typeof plan.nextInterviewTarget === 'number' ? plan.nextInterviewTarget : null);
                  const thisSummary = board?.thisWeekSummary
                    || (typeof board?.thisWeekTotal === 'number'
                      ? `${board.thisWeekTotal}/ Canceled-${board.thisWeekCanceled ?? 0}`
                      : null);
                  if (nextWeek === null && !thisSummary) return null;
                  return (
                    <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="flex items-center gap-3 rounded-xl border-2 border-emerald-500/70 bg-gradient-to-r from-emerald-50 via-white to-emerald-50/80 px-4 py-3 shadow-sm shadow-emerald-100/80 dark:border-emerald-400/50 dark:from-emerald-950/50 dark:via-zinc-900 dark:to-emerald-950/30 dark:shadow-none">
                        <div className="flex h-14 min-w-[3.5rem] flex-shrink-0 items-center justify-center rounded-xl bg-emerald-600 px-2 text-white shadow-md shadow-emerald-600/30 dark:bg-emerald-500">
                          <span className="text-2xl font-bold tabular-nums leading-none">
                            {board?.thisWeekTotal ?? 0}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                            This week interviews
                          </div>
                          <p className="mt-0.5 text-sm font-medium text-emerald-950/90 dark:text-emerald-100/90 break-words">
                            {thisSummary || '0/ Canceled-0'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 rounded-xl border-2 border-sky-500/70 bg-gradient-to-r from-sky-50 via-white to-sky-50/80 px-4 py-3 shadow-sm shadow-sky-100/80 dark:border-sky-400/60 dark:from-sky-950/60 dark:via-zinc-900 dark:to-sky-950/40 dark:shadow-none">
                        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white shadow-md shadow-sky-600/30 dark:bg-sky-500">
                          <span className="text-2xl font-bold tabular-nums leading-none">{nextWeek ?? 0}</span>
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">
                            Next week interviews
                          </div>
                          <p className="mt-0.5 text-sm text-sky-900/80 dark:text-sky-100/80">
                            {(nextWeek ?? 0) === 1
                              ? '1 interview round already on the board for next week'
                              : `${nextWeek ?? 0} interview rounds already on the board for next week`}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {plan.metrics && plan.metrics.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                    {plan.metrics.map((m) => (
                      <div key={m.key} className="text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-body">{m.label}</span>
                          <span className="text-muted tabular-nums">
                            {m.target} / {m.actual}{unitSuffix(m.unit)}
                            <span className={'ml-2 ' + (m.target > 0 && pct(m.actual, m.target) >= 100 ? 'text-green-600' : 'text-faint')}>
                              {m.target > 0 ? `${pct(m.actual, m.target)}%` : '—'}
                            </span>
                          </span>
                        </div>
                        <ProgressBar value={pct(m.actual, m.target)} />
                      </div>
                    ))}
                  </div>
                ) : !(plan.interviewBoard || typeof plan.nextInterviewTarget === 'number') ? (
                  <div className="text-xs text-faint italic">No metrics on this plan.</div>
                ) : null}

                {(plan.content || plan.result) && (
                  <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-800 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    {plan.content && (
                      <div>
                        <div className="text-xs font-medium text-muted mb-1">Plan</div>
                        <p className="text-body whitespace-pre-wrap">{plan.content}</p>
                      </div>
                    )}
                    {plan.result && (
                      <div>
                        <div className="text-xs font-medium text-muted mb-1">Follow-up</div>
                        <p className="text-body whitespace-pre-wrap">{plan.result}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted">
            Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} results
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setCurrentPage(pagination.page - 1)} disabled={!pagination.hasPrev}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50 hover:bg-zinc-50 dark:hover:bg-zinc-800/60">Previous</button>
            <button onClick={() => setCurrentPage(pagination.page + 1)} disabled={!pagination.hasNext}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50 hover:bg-zinc-50 dark:hover:bg-zinc-800/60">Next</button>
            <select value={pageSize} onChange={(e) => handlePageSizeChange(Number(e.target.value))} className="select focus-ring text-sm">
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} size="lg" title={editing ? `Week ${form.weekNumber} plan` : 'New weekly plan'}>
        <div className="flex h-full min-h-0 flex-1 flex-col gap-4">
          {error && <p className="text-red-600 text-sm">{error}</p>}

          {!editing && (
            <div>
              <label className="block text-xs text-muted mb-1">Pick any date in the week</label>
              <input className="input w-full text-sm" type="date" value={form.selectedDate} onChange={(e) => handleDateChange(e.target.value)} />
              <p className="hint mt-1">{formatWeekOptionLabel(form.year, form.weekNumber)}</p>
            </div>
          )}

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex min-h-0 flex-col">
              <label className="block text-xs text-muted mb-1">Plan (start of week)</label>
              <textarea className="input min-h-[28rem] w-full flex-1 text-sm" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="What's the plan? e.g. 'Apply to 50 jobs, land 5 interviews, refresh resume, reach out to 20 founders.'" />
            </div>
            <div className="flex min-h-0 flex-col">
              <label className="block text-xs text-muted mb-1">Follow-up (end of week)</label>
              <textarea className="input min-h-[28rem] w-full flex-1 text-sm" value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })} placeholder="What actually got done? e.g. 'Applied to 42, 6 interviews, updated resume, 18 outreaches.'" />
            </div>
          </div>
          <p className="hint">Write freely — include target numbers (applies, interviews, outreach). Admin reports trace them automatically.</p>

          <label className="flex items-center gap-2 text-sm text-body">
            <input type="checkbox" checked={form.status === 'reviewed'} onChange={(e) => setForm({ ...form, status: e.target.checked ? 'reviewed' : 'planned' })} />
            Mark week as reviewed
          </label>

          <div className="flex gap-2 justify-end">
            <button type="button" className="btn" onClick={save} disabled={saving}>
              {saving ? 'Saving...' : editing ? 'Save changes' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const color = value >= 100 ? 'bg-green-500' : value >= 60 ? 'bg-blue-500' : 'bg-amber-500';
  return (
    <div className="mt-1 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
      <div className={`h-full ${color}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}
