import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import * as api from '../../api/endpoints';
import type { Counts, PlanItemIn, SatGoal } from '../../api/endpoints';
import { satSplit } from '../../lib/teamGrid';
import { messageOf } from '../../lib/notify';
import { parseDateParam, weekLabel } from '../../lib/reportWeek';
import SidePanel from '../SidePanel';
import PlanItemsEditor, { cleanItems, hasOptionsError } from './PlanItemsEditor';
import GoalDoneFields from './GoalDoneFields';

interface WeekForm {
  goal: Counts;
  routines: PlanItemIn[];
  weeklyGoals: PlanItemIn[];
  recapNotes: string;
  satGoal: SatGoal | null;
}

const SAT_FIELDS: { key: keyof SatGoal; label: string }[] = [
  { key: 'bidsSelf', label: 'Self bids' },
  { key: 'bidsBidder', label: 'Bidder bids' },
];
/** null when neither field is set (an even split). */
const cleanSat = (s: SatGoal | null): SatGoal | null => (s && (s.bidsSelf != null || s.bidsBidder != null) ? s : null);

/** Set the week's targets, routines and weekly goals at the start of the week. */
export default function WeekPanel({
  weekStart,
  userId,
  mode,
  open,
  onClose,
  onSaved,
}: {
  weekStart: string;
  userId?: string;
  mode: 'own' | 'admin' | 'view';
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data, error, isLoading, mutate } = useSWR(
    open ? ['week-plan', weekStart, userId ?? 'me'] : null,
    () => api.getWeekPlan(weekStart, userId),
    { revalidateOnFocus: false },
  );
  const [form, setForm] = useState<WeekForm | null>(null);
  const [initial, setInitial] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const next: WeekForm = {
      goal: data.goal,
      routines: data.routines,
      weeklyGoals: data.weeklyGoals,
      recapNotes: data.recapNotes,
      satGoal: data.satGoal ?? null,
    };
    setForm(next);
    setInitial(JSON.stringify(next));
  }, [data]);

  useEffect(() => {
    if (!open) {
      setForm(null);
      setMessage(null);
    }
  }, [open]);

  const dirty = useMemo(() => !!form && JSON.stringify(form) !== initial, [form, initial]);

  // Planned by the admin: the person sees the plan, edits only their own items and the recap, once the week is saved.
  const adminPlans = mode === 'own' && data?.plansOwnWeek === false;
  const planEditable = mode === 'admin' || (mode === 'own' && !adminPlans);
  const ownItems = adminPlans && !!data?.exists; // the planned person edits only their own items, once the week is saved
  const recapEditable = mode === 'own' && (!adminPlans || !!data?.exists);
  const canSave = planEditable || ownItems || recapEditable;

  const save = async () => {
    if (!form || !data) return;
    setSaving(true);
    setMessage(null);
    try {
      const routines = cleanItems(form.routines);
      const weeklyGoals = cleanItems(form.weeklyGoals);
      if (mode === 'admin') {
        const removedIds = [...form.routines, ...form.weeklyGoals].flatMap((i) => (i.addedBy === 'self' && i.archived && i.id ? [i.id] : []));
        const { bidsSelf, bidsBidder, interviewsSelf } = form.goal;
        const res = await api.putTeamWeek(weekStart, [
          { userId: userId!, plansOwnWeek: data.plansOwnWeek, goal: { bidsSelf, bidsBidder, interviewsSelf }, routines, weeklyGoals, exists: data.exists, removedIds, satGoal: cleanSat(form.satGoal) },
        ]);
        const failed = res.results.find((r) => !r.ok);
        if (failed) {
          setMessage(failed.error || 'Could not save the week.');
          return;
        }
      } else {
        await api.putWeekPlan(weekStart, { goal: form.goal, routines, weeklyGoals, recapNotes: form.recapNotes, ...(planEditable ? { satGoal: cleanSat(form.satGoal) } : {}) });
      }
      await mutate();
      onSaved();
      onClose();
    } catch (e) {
      setMessage(messageOf(e, 'Could not save the week.'));
    } finally {
      setSaving(false);
    }
  };

  const monday = parseDateParam(weekStart) ?? new Date();
  const footer = !canSave ? (
    <button type="button" className="btn-outline text-sm" onClick={onClose}>Close</button>
  ) : (
    <>
      <button type="button" className="btn-outline text-sm" onClick={onClose}>Cancel</button>
      <button type="button" className="btn text-sm" onClick={save} disabled={saving || !form || hasOptionsError([...form.routines, ...form.weeklyGoals])} title={form && hasOptionsError([...form.routines, ...form.weeklyGoals]) ? 'Fix the choice options first' : undefined}>
        {saving ? 'Saving…' : 'Save week'}
      </button>
    </>
  );

  return (
    <SidePanel
      open={open}
      title={`Week ${weekLabel(monday)}`}
      subtitle={!canSave ? 'View only' : 'Targets, daily and weekly to-dos'}
      onClose={onClose}
      footer={footer}
      dirty={dirty && canSave}
      wide
    >
      {error && (
        <div className="mb-3 text-sm text-red-600 dark:text-red-400" role="alert">
          Couldn&apos;t load this week.{' '}
          <button type="button" className="underline" onClick={() => mutate()}>Retry</button>
        </div>
      )}
      {message && <p className="mb-3 text-sm text-red-600 dark:text-red-400" role="alert">{message}</p>}
      {(isLoading || !form) && !error ? (
        <div className="space-y-2" aria-busy="true">
          <div className="skeleton h-6 w-1/2" />
          <div className="skeleton h-40 w-full" />
        </div>
      ) : form && data ? (
        <div className="space-y-5">
          {data.draft && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200" role="status">
              Copied from last week — save to keep
            </p>
          )}
          {adminPlans && (
            <p className="rounded-md bg-zinc-100 px-3 py-2 text-sm text-body dark:bg-zinc-800" role="status">Planned by your admin</p>
          )}
          <section className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800" aria-labelledby="week-targets-title">
            <h3 id="week-targets-title" className="card-title mb-2">Targets</h3>
            <GoalDoneFields
              goal={form.goal}
              onGoal={!planEditable ? undefined : (goal) => setForm({ ...form, goal })}
              done={data.done}
              stages={data.stages}
              showInterviewGoal
              readOnly={!planEditable}
              adminEdit={mode === 'admin'}
            />
            {(planEditable || form.satGoal) && (
              <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                <p className="form-label mb-1">Saturday</p>
                <div className="flex flex-wrap gap-4">
                  {SAT_FIELDS.map((f) => {
                    const sat = form.satGoal?.[f.key] ?? null;
                    const total = form.goal[f.key];
                    const split = satSplit(total, sat);
                    return (
                      <label key={f.key} className="flex flex-col gap-1 text-xs text-muted">
                        {f.label} on Saturday
                        {planEditable ? (
                          <input type="number" min={0} className="input w-28" placeholder="even split" value={sat ?? ''}
                            onChange={(e) => {
                              const n = e.target.value === '' ? null : Math.max(0, Math.floor(Number(e.target.value)));
                              setForm({ ...form, satGoal: { bidsSelf: null, bidsBidder: null, ...form.satGoal, [f.key]: n } });
                            }} />
                        ) : (
                          <span className="text-sm text-body">{sat ?? 'even split'}</span>
                        )}
                        <span>
                          {sat != null && sat > total ? <span className="text-red-600 dark:text-red-400" role="alert">More than the week&apos;s {total}</span>
                            : split ? `Mon–Fri ${split.weekday} a day · Sat ${split.sat}` : total > 0 ? `${Math.ceil(total / 6)} a day, Mon–Sat` : ''}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <section className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800" aria-labelledby="week-routines-title">
              <h3 id="week-routines-title" className="card-title">Daily to-dos</h3>
              <p className="mb-2 text-xs text-muted">Shown every working day; count / hours targets are per day.</p>
              <PlanItemsEditor items={form.routines} scope="routine" onChange={(routines) => setForm({ ...form, routines })} readOnly={!planEditable && !ownItems} lockedFor={ownItems ? (i) => i.addedBy !== 'self' : undefined} />
            </section>

            <section className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800" aria-labelledby="week-goals-title">
              <h3 id="week-goals-title" className="card-title">Weekly to-dos</h3>
              <p className="mb-2 text-xs text-muted">One-off outcomes; count / hours targets are for the whole week.</p>
              <PlanItemsEditor items={form.weeklyGoals} scope="goal" onChange={(weeklyGoals) => setForm({ ...form, weeklyGoals })} readOnly={!planEditable && !ownItems} lockedFor={ownItems ? (i) => i.addedBy !== 'self' : undefined} />
            </section>
          </div>

          <section>
            <label className="form-label mb-1 block" htmlFor="week-recap">Recap notes</label>
            {!recapEditable ? (
              <p className="whitespace-pre-wrap text-sm text-body">{form.recapNotes || '—'}</p>
            ) : (
              <textarea
                id="week-recap"
                className="input min-h-[5rem] w-full"
                maxLength={4000}
                value={form.recapNotes}
                onChange={(e) => setForm({ ...form, recapNotes: e.target.value })}
              />
            )}
          </section>
        </div>
      ) : null}
    </SidePanel>
  );
}
