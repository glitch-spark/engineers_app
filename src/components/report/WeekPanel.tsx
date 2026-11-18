import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import * as api from '../../api/endpoints';
import type { Counts, PlanItemIn } from '../../api/endpoints';
import { messageOf } from '../../lib/notify';
import { parseDateParam, weekLabel } from '../../lib/reportWeek';
import SidePanel from '../SidePanel';
import PlanItemsEditor, { cleanItems } from './PlanItemsEditor';
import GoalDoneFields from './GoalDoneFields';

interface WeekForm {
  goal: Counts;
  routines: PlanItemIn[];
  weeklyGoals: PlanItemIn[];
  recapNotes: string;
}

/** Set the week's targets, routines and weekly goals at the start of the week. */
export default function WeekPanel({
  weekStart,
  userId,
  readOnly,
  open,
  onClose,
  onSaved,
}: {
  weekStart: string;
  userId?: string;
  readOnly: boolean;
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

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setMessage(null);
    try {
      await api.putWeekPlan(weekStart, {
        goal: form.goal,
        routines: cleanItems(form.routines),
        weeklyGoals: cleanItems(form.weeklyGoals),
        recapNotes: form.recapNotes,
      });
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
  const footer = readOnly ? (
    <button type="button" className="btn-outline text-sm" onClick={onClose}>Close</button>
  ) : (
    <>
      <button type="button" className="btn-outline text-sm" onClick={onClose}>Cancel</button>
      <button type="button" className="btn text-sm" onClick={save} disabled={saving || !form}>
        {saving ? 'Saving…' : 'Save week'}
      </button>
    </>
  );

  return (
    <SidePanel
      open={open}
      title={`Week ${weekLabel(monday)}`}
      subtitle={readOnly ? 'View only' : 'Targets, routines and weekly goals'}
      onClose={onClose}
      footer={footer}
      dirty={dirty && !readOnly}
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
          <section className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800" aria-labelledby="week-targets-title">
            <h3 id="week-targets-title" className="card-title mb-2">Targets</h3>
            <GoalDoneFields
              goal={form.goal}
              onGoal={readOnly ? undefined : (goal) => setForm({ ...form, goal })}
              done={data.done}
              stages={data.stages}
              showInterviewGoal
              readOnly={readOnly}
            />
          </section>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <section className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800" aria-labelledby="week-routines-title">
              <h3 id="week-routines-title" className="card-title">Routines</h3>
              <p className="mb-2 text-xs text-muted">Shown every working day; count / hours targets are per day.</p>
              <PlanItemsEditor items={form.routines} scope="routine" onChange={(routines) => setForm({ ...form, routines })} readOnly={readOnly} />
            </section>

            <section className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800" aria-labelledby="week-goals-title">
              <h3 id="week-goals-title" className="card-title">Weekly goals</h3>
              <p className="mb-2 text-xs text-muted">One-off outcomes; count / hours targets are for the whole week.</p>
              <PlanItemsEditor items={form.weeklyGoals} scope="goal" onChange={(weeklyGoals) => setForm({ ...form, weeklyGoals })} readOnly={readOnly} />
            </section>
          </div>

          <section>
            <label className="form-label mb-1 block" htmlFor="week-recap">Recap notes</label>
            {readOnly ? (
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
