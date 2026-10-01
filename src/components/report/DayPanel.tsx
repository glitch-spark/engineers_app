import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import * as api from '../../api/endpoints';
import type { ChecklistItem, Counts } from '../../api/endpoints';
import { messageOf } from '../../lib/notify';
import { dateParam, dayLabel, isToday, parseDateParam } from '../../lib/reportWeek';
import SidePanel from '../SidePanel';
import ChecklistEditor, { cleanItems } from './ChecklistEditor';
import GoalDoneFields from './GoalDoneFields';

interface DayForm {
  goal: Counts;
  goalItems: ChecklistItem[];
  done: Counts;
  notes: string;
}

/** A day: set its goal (bids + goal lines), then follow up with what was done. */
export default function DayPanel({
  date,
  userId,
  readOnly,
  open,
  onClose,
  onSaved,
}: {
  date: string;
  userId?: string;
  readOnly: boolean;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const day = parseDateParam(date) ?? new Date();
  const today = dateParam(new Date());
  const canFollowUp = date <= today;

  const { data, error, isLoading, mutate } = useSWR(
    open ? ['day-plan', date, userId ?? 'me'] : null,
    () => api.getDayPlan(date, userId),
    { revalidateOnFocus: false },
  );

  const [form, setForm] = useState<DayForm | null>(null);
  const [initial, setInitial] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const next: DayForm = { goal: data.goal, goalItems: data.goalItems, done: data.done, notes: data.notes };
    setForm(next);
    setInitial(JSON.stringify(next));
  }, [data]);

  useEffect(() => {
    if (!open) {
      setForm(null);
      setSaveError(null);
    }
  }, [open]);

  const dirty = useMemo(() => !!form && JSON.stringify(form) !== initial, [form, initial]);
  const logged = !!data?.loggedAt;
  // Results entered (bids done, ticks or notes) since the panel opened.
  const resultsEntered = useMemo(() => {
    if (!form || !initial) return false;
    const start = JSON.parse(initial) as DayForm;
    return (
      form.done.bidsSelf !== start.done.bidsSelf ||
      form.done.bidsBidder !== start.done.bidsBidder ||
      form.notes !== start.notes ||
      JSON.stringify(form.goalItems.map((i) => i.done)) !== JSON.stringify(start.goalItems.map((i) => i.done))
    );
  }, [form, initial]);

  const save = async (followUp: boolean) => {
    if (!form) return;
    const nothingDone = !form.done.bidsSelf && !form.done.bidsBidder && !form.notes.trim()
      && !form.goalItems.some((i) => i.done);
    if (followUp && nothingDone
      && !window.confirm('Post the follow-up with no bids, ticks or notes? It goes to the team Slack channel.')) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api.putDayPlan(date, {
        goal: { bidsSelf: form.goal.bidsSelf, bidsBidder: form.goal.bidsBidder },
        goalItems: cleanItems(form.goalItems),
        done: followUp ? { bidsSelf: form.done.bidsSelf, bidsBidder: form.done.bidsBidder } : undefined,
        notes: form.notes,
      });
      await mutate();
      onSaved();
      onClose();
    } catch (e) {
      setSaveError(messageOf(e, 'Could not save the day.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete the plan for ${dayLabel(day)}?`)) return;
    setSaving(true);
    try {
      await api.deleteDayPlan(date);
      onSaved();
      onClose();
    } catch (e) {
      setSaveError(messageOf(e, 'Could not delete the day.'));
    } finally {
      setSaving(false);
    }
  };

  // Future days only take a goal; today offers both until it's followed up.
  // "Save goal" leads until results are entered, then "Save follow-up" does
  // (and "Save goal" is disabled so entered results can't be dropped).
  const showGoalButton = !canFollowUp || (date === today && !logged);
  const followUpLeads = !showGoalButton || resultsEntered;
  const footer = readOnly ? (
    <button type="button" className="btn-outline text-sm" onClick={onClose}>Close</button>
  ) : (
    <>
      {data?.exists && (
        <button type="button" className="btn-outline mr-auto text-sm text-red-600 dark:text-red-400" onClick={remove} disabled={saving}>
          Delete
        </button>
      )}
      <button type="button" className="btn-outline text-sm" onClick={onClose}>Cancel</button>
      {showGoalButton && (
        <button
          type="button"
          className={followUpLeads ? 'btn-outline text-sm' : 'btn text-sm'}
          onClick={() => save(false)}
          disabled={saving || !form || (canFollowUp && resultsEntered)}
          title={canFollowUp && resultsEntered ? 'You entered results — use Save follow-up' : undefined}
        >
          {saving ? 'Saving…' : 'Save goal'}
        </button>
      )}
      {canFollowUp && (
        <button type="button" className={followUpLeads ? 'btn text-sm' : 'btn-outline text-sm'} onClick={() => save(true)} disabled={saving || !form}>
          {saving ? 'Saving…' : 'Save follow-up'}
        </button>
      )}
    </>
  );

  return (
    <SidePanel
      open={open}
      title={`${dayLabel(day)}${isToday(day) ? ' · today' : ''}`}
      subtitle={readOnly ? 'View only' : canFollowUp ? 'Goal and follow-up' : 'Goal for this day'}
      onClose={onClose}
      footer={footer}
      dirty={dirty && !readOnly}
    >
      {error && (
        <div className="mb-3 text-sm text-red-600 dark:text-red-400" role="alert">
          Couldn&apos;t load this day.{' '}
          <button type="button" className="underline" onClick={() => mutate()}>Retry</button>
        </div>
      )}
      {saveError && <p className="mb-3 text-sm text-red-600 dark:text-red-400" role="alert">{saveError}</p>}
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
            done={{ ...form.done, interviewsSelf: data.interviews.self, interviewsCaller: data.interviews.caller }}
            onDone={readOnly ? undefined : (done) => setForm({ ...form, done })}
            stages={data.interviews.stages}
            showDone={canFollowUp}
            readOnly={readOnly}
          />

          <section>
            <h3 className="form-label mb-1">Goals</h3>
            <ChecklistEditor
              items={form.goalItems}
              onChange={(goalItems) => setForm({ ...form, goalItems })}
              readOnly={readOnly}
              allowTick={canFollowUp}
            />
          </section>

          {canFollowUp && (
            <section>
              <label className="form-label mb-1 block" htmlFor="day-notes">Follow-up notes</label>
              {readOnly ? (
                <p className="whitespace-pre-wrap text-sm text-body">{form.notes || '—'}</p>
              ) : (
                <textarea
                  id="day-notes"
                  className="input min-h-[5rem] w-full"
                  maxLength={2000}
                  placeholder="What actually happened today?"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              )}
            </section>
          )}
        </div>
      ) : null}
    </SidePanel>
  );
}
