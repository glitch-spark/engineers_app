import useSWR from 'swr';
import { useEffect, useMemo, useState } from 'react';
import Modal from '../components/Modal';
import { Pencil, Trash2, Calendar, ClipboardCheck, Sparkles } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import * as api from '../api/endpoints';
import { ApiError } from '../api/client';
import { notify } from '../lib/notify';
import PageHeader from '../components/PageHeader';
import NameWithAvatar from '../components/NameWithAvatar';

type Metric = { key: string; label: string; target: number; actual: number; unit?: 'count' | 'hours' };

const unitSuffix = (u?: string) => (u === 'hours' ? ' hrs' : '');

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
};

// ---------- week math ----------
function getWeekInfo(date: Date) {
  const year = date.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const days = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  const dayOfWeek = date.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const startDate = new Date(date);
  startDate.setDate(date.getDate() + mondayOffset);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);
  endDate.setHours(23, 59, 59, 999);
  return { weekNumber, year, startDate, endDate };
}

function formatDateRange(startDate: string, endDate: string) {
  const s = new Date(startDate), e = new Date(endDate);
  return `${s.toLocaleDateString()} - ${e.toLocaleDateString()}`;
}

function getWeekDateRange(year: number, weekNumber: number) {
  const jan1 = new Date(year, 0, 1);
  const jan1Day = jan1.getDay();
  const mondayOffset = jan1Day === 0 ? -6 : 1 - jan1Day;
  const firstMonday = new Date(year, 0, 1 + mondayOffset);
  const start = new Date(firstMonday);
  start.setDate(firstMonday.getDate() + (weekNumber - 1) * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

function formatWeekOptionLabel(year: number, weekNumber: number) {
  const { start, end } = getWeekDateRange(year, weekNumber);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `Week ${weekNumber} (${start.toLocaleDateString(undefined, opts)} - ${end.toLocaleDateString(undefined, opts)})`;
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

export default function WeeklyPlanPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canEditPlan = (plan: WeeklyPlan) =>
    isAdmin || planOwnerId(plan) === user?.id;

  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [weekNumber, setWeekNumber] = useState(getWeekInfo(new Date()).weekNumber.toString());
  const [userId, setUserId] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

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

  const { data: usersData } = useSWR(['users-lookup'], () => api.lookupUsers());
  const users = (usersData?.users as Array<{ _id: string; name?: string; email?: string }>) || [];

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

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  const weekOptions = Array.from({ length: 52 }, (_, i) => i + 1);

  // Only show the stats cards once real numbers exist (after a progress
  // report populates metrics).
  const hasMetricData = useMemo(
    () => (summary?.totals ?? []).some((t) => t.target > 0 || t.actual > 0),
    [summary],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Weekly Plans"
        action={
          <div className="flex items-center gap-2">
            <button type="button" className="btn-outline" onClick={runReport} disabled={reporting} title="AI-analyze plans in the current filter into progress metrics">
              <Sparkles size={16} className="mr-2" /> {reporting ? 'Analyzing...' : 'Run Progress Report'}
            </button>
            <button type="button" className="btn" onClick={openAdd}>
              <Calendar size={16} className="mr-2" /> Add Plan
            </button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex items-end gap-3 flex-wrap toolbar">
        <div className="w-32">
          <label className="block text-xs text-muted mb-1">Year</label>
          <select className="select focus-ring w-full text-sm" value={year} onChange={(e) => { setYear(e.target.value); setCurrentPage(1); }}>
            {yearOptions.map((y) => (<option key={y} value={y}>{y}</option>))}
          </select>
        </div>
        <div className="w-56">
          <label className="block text-xs text-muted mb-1">Week</label>
          <select className="select focus-ring w-full text-sm" value={weekNumber} onChange={(e) => { setWeekNumber(e.target.value); setCurrentPage(1); }}>
            <option value="">All weeks</option>
            {weekOptions.map((w) => (<option key={w} value={w}>{formatWeekOptionLabel(Number(year), w)}</option>))}
          </select>
        </div>
        <div className="w-56">
          <label className="block text-xs text-gray-500 mb-1">User</label>
          <select className="select focus-ring w-full text-sm" value={userId} onChange={(e) => { setUserId(e.target.value); setCurrentPage(1); }}>
            <option value="">All users</option>
            {users.map((u) => (<option key={u._id} value={u._id}>{u.name || u.email}</option>))}
          </select>
        </div>
      </div>

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
        <div className="bg-white rounded-[12px] border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="card-title uppercase tracking-wide">Team progress</h2>
            <p className="hint">Planned vs actual per user for the current filter. Run Progress Report to refresh.</p>
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
          <div className="spinner spinner-md mx-auto mb-2" />
          Loading weekly plans...
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
                ) : (
                  <div className="text-xs text-faint italic">No metrics on this plan.</div>
                )}

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

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? `Week ${form.weekNumber} plan` : 'New weekly plan'}>
        <div className="space-y-4">
          {error && <p className="text-red-600 text-sm">{error}</p>}

          {!editing && (
            <div>
              <label className="block text-xs text-muted mb-1">Pick any date in the week</label>
              <input className="input w-full text-sm" type="date" value={form.selectedDate} onChange={(e) => handleDateChange(e.target.value)} />
              <p className="hint mt-1">{formatWeekOptionLabel(form.year, form.weekNumber)}</p>
            </div>
          )}

          <div>
            <label className="block text-xs text-muted mb-1">Plan (start of week)</label>
            <textarea className="input w-full text-sm" rows={5} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="What's the plan? e.g. 'Apply to 50 jobs, land 5 interviews, refresh resume, reach out to 20 founders.'" />
            <p className="hint mt-1">Write freely — include target numbers (applies, interviews, outreach). Admin reports trace them automatically.</p>
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Follow-up (end of week)</label>
            <textarea className="input w-full text-sm" rows={5} value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })} placeholder="What actually got done? e.g. 'Applied to 42, 6 interviews, updated resume, 18 outreaches.'" />
          </div>

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
