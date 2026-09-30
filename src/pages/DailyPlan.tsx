import useSWR from 'swr';
import { useState, type MutableRefObject, type ReactNode } from 'react';
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

type DailyPlan = Partial<api.DailyPlanCounts & api.DailyPlanPlanCounts> & {
  _id: string;
  userId?: { _id: string; email?: string; name?: string; image?: string };
  date: string;
  year: number;
  weekNumber: number;
  planType?: api.DailyPlanType;
  today: string;
  tomorrow: string;
  todayItems?: string[];
  tomorrowItems?: string[];
  createdAt?: string;
};

type CountKey = keyof api.DailyPlanCounts | keyof api.DailyPlanPlanCounts;
type ItemsKey = 'todayItems' | 'tomorrowItems';
type TextKey = 'todayText' | 'tomorrowText';

type DaySection = {
  dayOffset: 0 | 1;
  heading: string;
  itemsKey: ItemsKey;
  textKey: TextKey;
  groups: { title: string; fields: { key: CountKey; label: string }[] }[];
  /** The Bid and Interview lines, laid out like the Slack post. */
  summary: (plan: DailyPlan) => ReactNode[];
};

function Num({ value }: { value: number | undefined }) {
  return <span className="font-semibold text-strong tabular-nums">{value ?? 0}</span>;
}

function bidSummary(handsOn: number | undefined, byBidder: number | undefined): ReactNode {
  return (
    <>
      <span className="font-medium text-strong">Bid</span> <Num value={(handsOn ?? 0) + (byBidder ?? 0)} />{' '}
      <span className="text-muted">
        (hands-on: <Num value={handsOn} /> + bidder: <Num value={byBidder} />)
      </span>
    </>
  );
}

/** A regular plan covers the plan date (what was done) and the next day (the plan). */
const DAY_SECTIONS: DaySection[] = [
  {
    dayOffset: 0,
    heading: 'Done',
    itemsKey: 'todayItems',
    textKey: 'todayText',
    summary: (plan) => [
      bidSummary(plan.bidsHandsOn, plan.bidsByBidder),
      <>
        <span className="font-medium text-strong">Interview</span>{' '}
        <span className="text-muted">Done/New Invitation :</span>{' '}
        <Num value={plan.interviewsDone} />/<Num value={plan.interviewsNew} />
      </>,
    ],
    groups: [
      {
        title: 'Bid',
        fields: [
          { key: 'bidsHandsOn', label: 'Bids (hands-on)' },
          { key: 'bidsByBidder', label: 'Bids (by bidder)' },
        ],
      },
      {
        title: 'Interview',
        fields: [
          { key: 'interviewsDone', label: 'Done today' },
          { key: 'interviewsNew', label: 'New invitations' },
        ],
      },
    ],
  },
  {
    dayOffset: 1,
    heading: 'Plan',
    itemsKey: 'tomorrowItems',
    textKey: 'tomorrowText',
    summary: (plan) => [
      bidSummary(plan.planBidsHandsOn, plan.planBidsByBidder),
      <>
        <span className="font-medium text-strong">Interview</span>{' '}
        <span className="text-muted">Scheduled :</span> <Num value={plan.planInterviewsScheduled} />
      </>,
    ],
    groups: [
      {
        title: 'Bid',
        fields: [
          { key: 'planBidsHandsOn', label: 'Bids (hands-on)' },
          { key: 'planBidsByBidder', label: 'Bids (by bidder)' },
        ],
      },
      {
        title: 'Interview',
        fields: [{ key: 'planInterviewsScheduled', label: 'Scheduled' }],
      },
    ],
  },
];

const COUNT_KEYS: CountKey[] = DAY_SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.fields.map((f) => f.key)));

type FormState = {
  date: string;
  counts: Record<CountKey, string>;
  /** One item per line; saved as the day's item list. */
  todayText: string;
  tomorrowText: string;
};

const EMPTY_COUNTS = Object.fromEntries(COUNT_KEYS.map((k) => [k, ''])) as Record<CountKey, string>;

function emptyForm(date: string): FormState {
  return { date, counts: EMPTY_COUNTS, todayText: '', tomorrowText: '' };
}

function cleanItems(items: string[]): string[] {
  return items.map((item) => item.trim()).filter(Boolean);
}

function textToItems(text: string): string[] {
  return cleanItems(text.split(/\r?\n/));
}

/** Regular plans keep their items; an older custom plan brings its free text along. */
function itemsText(plan: DailyPlan, section: DaySection): string {
  if (plan.planType === 'regular') return (plan[section.itemsKey] ?? []).join('\n');
  return (section.dayOffset === 0 ? plan.today : plan.tomorrow) || '';
}

function toCount(value: string): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function countInput(value: number | undefined): string {
  return value ? String(value) : '';
}

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
  const [form, setForm] = useState<FormState>(() => emptyForm(''));

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
    setForm(emptyForm(todayInputValue()));
    setError('');
    setOpen(true);
  };

  const openEdit = (plan: DailyPlan) => {
    setEditing(plan);
    setForm({
      date: plan.date?.slice(0, 10) || todayInputValue(),
      counts: Object.fromEntries(COUNT_KEYS.map((k) => [k, countInput(plan[k])])) as Record<CountKey, string>,
      todayText: itemsText(plan, DAY_SECTIONS[0]),
      tomorrowText: itemsText(plan, DAY_SECTIONS[1]),
    });
    setError('');
    setOpen(true);
  };

  actionsRef.current = { openAdd };

  const setCount = (key: CountKey, value: string) =>
    setForm({ ...form, counts: { ...form.counts, [key]: value } });

  const save = async () => {
    if (!form.date) {
      setError('Date is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body: api.DailyPlanBody & { date: string } = {
        date: form.date,
        planType: 'regular',
        ...(Object.fromEntries(COUNT_KEYS.map((k) => [k, toCount(form.counts[k])])) as Record<CountKey, number>),
        todayItems: textToItems(form.todayText),
        tomorrowItems: textToItems(form.tomorrowText),
      };
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
        <div role="status" className="panel p-8 text-center text-sm text-muted">
          <div className="flex items-center justify-center">
            <div className="spinner spinner-md mr-3" aria-hidden />
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
                    <h2 className="font-semibold text-strong">{formatCalendarDate(plan.date)}</h2>
                    <span className="text-xs text-faint">Week {plan.weekNumber}, {plan.year}</span>
                    {plan.planType === 'regular' && <span className="badge-info">Regular</span>}
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
                    <button type="button" className="btn-icon" onClick={() => openEdit(plan)} title="Edit" aria-label={`Edit daily plan for ${formatCalendarDate(plan.date)}`}>
                      <Pencil size={16} aria-hidden />
                    </button>
                    <button type="button" className="btn-icon" onClick={() => remove(plan)} title="Delete" aria-label={`Delete daily plan for ${formatCalendarDate(plan.date)}`}>
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </div>
                )}
              </div>
              {plan.planType === 'regular' ? (
                <RegularPlanSummary plan={plan} />
              ) : (
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
              )}
            </div>
          ))}
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted">
            Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} results
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setCurrentPage(pagination.page - 1)} disabled={!pagination.hasPrev}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50 hover:bg-zinc-50 dark:hover:bg-zinc-800/60">Previous</button>
            <button onClick={() => setCurrentPage(pagination.page + 1)} disabled={!pagination.hasNext}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50 hover:bg-zinc-50 dark:hover:bg-zinc-800/60">Next</button>
            <select aria-label="Plans per page" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }} className="select focus-ring text-sm">
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} size="lg" title={editing ? 'Edit daily plan' : 'New daily plan'}>
        <div className="flex h-full min-h-0 flex-1 flex-col gap-4">
          {error && <p id="daily-plan-error" role="alert" className="text-red-700 dark:text-red-400 text-sm">{error}</p>}
          <div>
            <label className="block text-xs text-muted mb-1" htmlFor="daily-plan-date">Date</label>
            <input
              id="daily-plan-date"
              aria-required
              aria-invalid={!!error && !form.date}
              aria-describedby={error ? 'daily-plan-error' : undefined}
              className="input text-sm"
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
            {DAY_SECTIONS.map((section) => {
              const day = planDayLabel(form.date, section.dayOffset);
              return (
                <section key={section.itemsKey} className="panel flex flex-col gap-4 p-4" aria-label={`${day} ${section.heading}`}>
                  <h3 className="card-title">
                    {day} <span className="font-normal text-muted">— {section.heading}</span>
                  </h3>
                  {section.groups.map((group) => (
                    <fieldset key={group.title}>
                      <legend className="form-label mb-2">{group.title}</legend>
                      <div className="grid grid-cols-2 gap-3">
                        {group.fields.map((f) => (
                          <div key={f.key}>
                            <label className="block text-xs text-muted mb-1" htmlFor={`daily-plan-${f.key}`}>{f.label}</label>
                            <input
                              id={`daily-plan-${f.key}`}
                              className="input w-full text-sm tabular-nums"
                              type="number"
                              min={0}
                              step={1}
                              inputMode="numeric"
                              placeholder="0"
                              value={form.counts[f.key]}
                              onChange={(e) => setCount(f.key, e.target.value)}
                            />
                          </div>
                        ))}
                      </div>
                    </fieldset>
                  ))}
                  <div>
                    <label className="form-label mb-2 block" htmlFor={`daily-plan-${section.textKey}`}>Other items</label>
                    <textarea
                      id={`daily-plan-${section.textKey}`}
                      aria-describedby={`daily-plan-${section.textKey}-hint`}
                      className="input min-h-[8rem] w-full text-sm"
                      placeholder={'Update resume\nNewsela Work'}
                      value={form[section.textKey]}
                      onChange={(e) => setForm({ ...form, [section.textKey]: e.target.value })}
                    />
                    <p id={`daily-plan-${section.textKey}-hint`} className="mt-1 text-xs text-faint">
                      One item per line, numbered after Bid and Interview.
                    </p>
                  </div>
                </section>
              );
            })}
          </div>
          <div className="flex gap-2 justify-end mt-auto">
            <button type="button" className="btn" onClick={save} disabled={saving}>
              {saving ? 'Saving...' : editing ? 'Save changes' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/** Same numbered layout as the Slack post: Bid, Interview, then the day's items. */
function RegularPlanSummary({ plan }: { plan: DailyPlan }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
      {DAY_SECTIONS.map((section) => (
        <div key={section.itemsKey}>
          <div className="text-xs font-medium text-muted mb-1">
            {planDayLabel(plan.date, section.dayOffset)} · {section.heading}
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-body marker:text-faint">
            {section.summary(plan).map((line, i) => (
              <li key={i}>{line}</li>
            ))}
            {(plan[section.itemsKey] ?? []).map((item, i) => (
              <li key={i} className="whitespace-pre-wrap">{item}</li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
