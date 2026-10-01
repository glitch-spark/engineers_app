import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import * as api from '../../api/endpoints';
import type { ChecklistItem, Counts } from '../../api/endpoints';
import { messageOf } from '../../lib/notify';
import { dateParam, dayLabel, isToday, parseDateParam } from '../../lib/reportWeek';
import SidePanel from '../SidePanel';
import ChecklistEditor, { cleanItems } from './ChecklistEditor';
import GoalDoneFields from './GoalDoneFields';

interface FollowUp {
  done: Counts;
  goalItems: ChecklistItem[];
  notes: string;
}

/** Follow up a day: bids done, ticks on the daily goal lines, notes.
 *  The goal comes from the weekly plan and isn't edited here. */
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
  const canFollowUp = date <= dateParam(new Date());
  const editable = !readOnly && canFollowUp;

  const { data, error, isLoading, mutate } = useSWR(
    open ? ['day-plan', date, userId ?? 'me'] : null,
    () => api.getDayPlan(date, userId),
    { revalidateOnFocus: false },
  );

  const [form, setForm] = useState<FollowUp | null>(null);
  const [initial, setInitial] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const next: FollowUp = { done: data.done, goalItems: data.goalItems, notes: data.notes };
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

  const save = async () => {
    if (!form) return;
    const nothingDone = !form.done.bidsSelf && !form.done.bidsBidder && !form.notes.trim()
      && !form.goalItems.some((i) => i.done);
    if (nothingDone
      && !window.confirm('Post the follow-up with no bids, ticks or notes? It goes to the team Slack channel.')) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api.putDayPlan(date, {
        goalItems: cleanItems(form.goalItems),
        done: { bidsSelf: form.done.bidsSelf, bidsBidder: form.done.bidsBidder },
        notes: form.notes,
      });
      await mutate();
      onSaved();
      onClose();
    } catch (e) {
      setSaveError(messageOf(e, 'Could not save the follow-up.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete the follow-up for ${dayLabel(day)}?`)) return;
    setSaving(true);
    try {
      await api.deleteDayPlan(date);
      onSaved();
      onClose();
    } catch (e) {
      setSaveError(messageOf(e, 'Could not delete the follow-up.'));
    } finally {
      setSaving(false);
    }
  };

  const footer = !editable ? (
    <button type="button" className="btn-outline text-sm" onClick={onClose}>Close</button>
  ) : (
    <>
      {data?.loggedAt && (
        <button type="button" className="btn-outline mr-auto text-sm text-red-600 dark:text-red-400" onClick={remove} disabled={saving}>
          Delete
        </button>
      )}
      <button type="button" className="btn-outline text-sm" onClick={onClose}>Cancel</button>
      <button type="button" className="btn text-sm" onClick={save} disabled={saving || !form}>
        {saving ? 'Saving…' : 'Save follow-up'}
      </button>
    </>
  );

  const hasGoal = !!data && (data.goal.bidsSelf + data.goal.bidsBidder > 0 || data.goalItems.length > 0);

  return (
    <SidePanel
      open={open}
      title={`${dayLabel(day)}${isToday(day) ? ' · today' : ''}`}
      subtitle={readOnly ? 'View only' : canFollowUp ? 'Follow up what was done' : 'Upcoming — follow up on the day'}
      onClose={onClose}
      footer={footer}
      dirty={dirty && editable}
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
          {!hasGoal && (
            <p className="text-sm text-muted">
              No daily goal for this week yet — set it in the week&apos;s goals.
            </p>
          )}
          <GoalDoneFields
            goal={data.goal}
            done={{ ...form.done, interviewsSelf: data.interviews.self, interviewsCaller: data.interviews.caller }}
            onDone={editable ? (done) => setForm({ ...form, done }) : undefined}
            stages={data.interviews.stages}
            showDone={canFollowUp}
            readOnly={!editable}
          />

          {form.goalItems.length > 0 && (
            <section>
              <h3 className="form-label mb-1">Daily goal lines</h3>
              {editable ? (
                <ul className="space-y-1.5">
                  {form.goalItems.map((item, i) => (
                    <li key={i}>
                      <label className="flex items-center gap-2 text-sm text-body">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={item.done}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              goalItems: form.goalItems.map((g, j) => (j === i ? { ...g, done: e.target.checked } : g)),
                            })
                          }
                        />
                        {item.text}
                      </label>
                    </li>
                  ))}
                </ul>
              ) : (
                <ChecklistEditor items={form.goalItems} readOnly />
              )}
            </section>
          )}

          {canFollowUp && (
            <section>
              <label className="form-label mb-1 block" htmlFor="day-notes">Follow-up notes</label>
              {editable ? (
                <textarea
                  id="day-notes"
                  className="input min-h-[5rem] w-full"
                  maxLength={2000}
                  placeholder="What actually happened today?"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              ) : (
                <p className="whitespace-pre-wrap text-sm text-body">{form.notes || '—'}</p>
              )}
            </section>
          )}
        </div>
      ) : null}
    </SidePanel>
  );
}
