import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import * as api from '../../api/endpoints';
import type { ChecklistItem, Counts } from '../../api/endpoints';
import { messageOf } from '../../lib/notify';
import { parseDateParam, weekLabel } from '../../lib/reportWeek';
import SidePanel from '../SidePanel';
import ChecklistEditor, { cleanItems } from './ChecklistEditor';
import GoalDoneFields from './GoalDoneFields';

interface WeekForm {
  goal: Counts;
  goalItems: ChecklistItem[];
  recapNotes: string;
}

/** Set the week's goals; Done is added up from the days and the Interviews page. */
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
    const next: WeekForm = { goal: data.goal, goalItems: data.goalItems, recapNotes: data.recapNotes };
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

  const applyLastWeek = async () => {
    if (!form) return;
    try {
      const prev = await api.getPreviousWeekGoals(weekStart);
      if (!prev.goal && !prev.goalItems.length) {
        setMessage('No goals were set last week.');
        return;
      }
      setForm({
        ...form,
        goal: prev.goal ?? form.goal,
        goalItems: [...cleanItems(form.goalItems), ...prev.goalItems].slice(0, 20),
      });
      setMessage(null);
    } catch (e) {
      setMessage(messageOf(e, "Could not load last week's goals."));
    }
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setMessage(null);
    try {
      await api.putWeekPlan(weekStart, { ...form, goalItems: cleanItems(form.goalItems) });
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
      <button type="button" className="btn-outline mr-auto text-sm" onClick={applyLastWeek} disabled={!form}>
        Use last week&apos;s goals
      </button>
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
      subtitle={readOnly ? 'View only' : 'Week goals · Done adds up from the days'}
      onClose={onClose}
      footer={footer}
      dirty={dirty && !readOnly}
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
          <GoalDoneFields
            goal={form.goal}
            onGoal={readOnly ? undefined : (goal) => setForm({ ...form, goal })}
            done={data.done}
            stages={data.stages}
            showInterviewGoal
            readOnly={readOnly}
          />
          <section>
            <h3 className="form-label mb-1">Goals</h3>
            <ChecklistEditor
              items={form.goalItems}
              onChange={(goalItems) => setForm({ ...form, goalItems })}
              readOnly={readOnly}
            />
          </section>
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
