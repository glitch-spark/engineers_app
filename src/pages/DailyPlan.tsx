import useSWR from 'swr';
import { useState, type MutableRefObject } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import Modal from '../components/Modal';
import NameWithAvatar from '../components/NameWithAvatar';
import { useAuth } from '../auth/useAuth';
import * as api from '../api/endpoints';
import { ApiError } from '../api/client';
import { notify } from '../lib/notify';
import { formatCalendarDate, todayInputValue } from '../lib/week';

export type DailyPlanActions = {
  openAdd: () => void;
};

type DailyPlan = {
  _id: string;
  userId?: { _id: string; email?: string; name?: string; image?: string };
  date: string;
  year: number;
  weekNumber: number;
  today: string;
  tomorrow: string;
  createdAt?: string;
};

type FormState = {
  date: string;
  today: string;
  tomorrow: string;
};

function planOwnerId(plan: DailyPlan): string | undefined {
  const uid = plan.userId;
  if (!uid) return undefined;
  return typeof uid === 'string' ? uid : uid._id;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** `9/25(Fri)` for the plan date, or the next day when `dayOffset` is 1. */
function planDayLabel(isoDate: string, dayOffset = 0): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return dayOffset === 0 ? 'Today' : 'Tomorrow';
  const date = new Date(year, month - 1, day + dayOffset);
  return `${date.getMonth() + 1}/${date.getDate()}(${WEEKDAYS[date.getDay()]})`;
}

export default function DailyPlanPanel({
  year,
  weekNumber,
  userId,
  actionsRef,
}: {
  year: string;
  weekNumber: string;
  userId: string;
  actionsRef: MutableRefObject<DailyPlanActions | null>;
}) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filterKey, setFilterKey] = useState(`${year}|${weekNumber}|${userId}`);
  const filterNow = `${year}|${weekNumber}|${userId}`;
  if (filterKey !== filterNow) {
    setFilterKey(filterNow);
    setCurrentPage(1);
  }
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DailyPlan | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<FormState>({ date: '', today: '', tomorrow: '' });

  const { data, mutate, isLoading } = useSWR(
    ['daily-plans', year, weekNumber, userId, currentPage, pageSize, user?.role] as const,
    () => api.listDailyPlans({
      page: currentPage,
      limit: pageSize,
      ...(year ? { year: Number(year) } : {}),
      ...(weekNumber ? { weekNumber: Number(weekNumber) } : {}),
      ...(userId ? { userId } : {}),
    }),
  );

  const openAdd = () => {
    setEditing(null);
    setForm({ date: todayInputValue(), today: '', tomorrow: '' });
    setError('');
    setOpen(true);
  };

  const openEdit = (plan: DailyPlan) => {
    setEditing(plan);
    setForm({
      date: plan.date?.slice(0, 10) || todayInputValue(),
      today: plan.today || '',
      tomorrow: plan.tomorrow || '',
    });
    setError('');
    setOpen(true);
  };

  actionsRef.current = { openAdd };

  const save = async () => {
    if (!form.date) {
      setError('Date is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = { date: form.date, today: form.today, tomorrow: form.tomorrow };
      if (editing) {
        await api.updateDailyPlan(editing._id, body);
        notify.success('Daily plan updated');
      } else {
        await api.createDailyPlan(body);
        notify.success('Daily plan created');
      }
      setOpen(false);
      mutate();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to save daily plan';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (plan: DailyPlan) => {
    if (!confirm('Delete this daily plan?')) return;
    try {
      await api.deleteDailyPlan(plan._id);
      notify.success('Daily plan deleted');
      mutate();
    } catch (err) {
      notify.error(err, 'Failed to delete daily plan');
    }
  };

  const plans = (data?.plans as DailyPlan[]) || [];
  const pagination = data?.pagination;
  const canEditPlan = (plan: DailyPlan) => !isAdmin && planOwnerId(plan) === user?.id;

  return (
    <div className="space-y-6">
      {isLoading ? (
        <div className="panel p-8 text-center text-sm text-muted">
          <div className="flex items-center justify-center">
            <div className="spinner spinner-md mr-3" />
            Loading daily plans...
          </div>
        </div>
      ) : plans.length === 0 ? (
        <div className="panel p-8 text-center text-sm text-muted">
          No daily plans found.
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => (
            <div key={plan._id} className="panel p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-strong">{formatCalendarDate(plan.date)}</span>
                    <span className="text-xs text-faint">Week {plan.weekNumber}, {plan.year}</span>
                  </div>
                  <div className="mt-1">
                    <NameWithAvatar
                      name={plan.userId?.name || plan.userId?.email}
                      imageUrl={plan.userId?.image}
                    />
                  </div>
                </div>
                {canEditPlan(plan) && (
                  <div className="flex gap-1 flex-shrink-0">
                    <button type="button" className="btn-icon" onClick={() => openEdit(plan)} title="Edit">
                      <Pencil size={16} />
                    </button>
                    <button type="button" className="btn-icon" onClick={() => remove(plan)} title="Delete">
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs font-medium text-muted mb-1">{planDayLabel(plan.date)}</div>
                  <p className={plan.today ? 'text-body whitespace-pre-wrap' : 'text-faint'}>{plan.today || '—'}</p>
                </div>
                <div>
                  <div className="text-xs font-medium text-muted mb-1">{planDayLabel(plan.date, 1)}</div>
                  <p className={plan.tomorrow ? 'text-body whitespace-pre-wrap' : 'text-faint'}>{plan.tomorrow || '—'}</p>
                </div>
              </div>
            </div>
          ))}
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
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }} className="select focus-ring text-sm">
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} size="lg" title={editing ? 'Edit daily plan' : 'New daily plan'}>
        <div className="flex h-full min-h-0 flex-1 flex-col gap-4">
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div>
            <label className="block text-xs text-muted mb-1" htmlFor="daily-plan-date">Date</label>
            <input
              id="daily-plan-date"
              className="input w-full text-sm"
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex min-h-0 flex-col">
              <label className="block text-xs text-muted mb-1" htmlFor="daily-plan-today">{planDayLabel(form.date)}</label>
              <textarea
                id="daily-plan-today"
                className="input min-h-[28rem] w-full flex-1 text-sm"
                value={form.today}
                onChange={(e) => setForm({ ...form, today: e.target.value })}
              />
            </div>
            <div className="flex min-h-0 flex-col">
              <label className="block text-xs text-muted mb-1" htmlFor="daily-plan-tomorrow">{planDayLabel(form.date, 1)}</label>
              <textarea
                id="daily-plan-tomorrow"
                className="input min-h-[28rem] w-full flex-1 text-sm"
                value={form.tomorrow}
                onChange={(e) => setForm({ ...form, tomorrow: e.target.value })}
              />
            </div>
          </div>
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
