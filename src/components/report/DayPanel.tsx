import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import * as api from '../../api/endpoints';
import type { ChecklistItem, Counts, DayPlan, DoneOverrides } from '../../api/endpoints';
import { messageOf } from '../../lib/notify';
import { dateParam, dayLabel, emptyCounts, isToday, nextWorkingDay, parseDateParam } from '../../lib/reportWeek';
import SidePanel from '../SidePanel';
import ChecklistEditor, { cleanItems } from './ChecklistEditor';
import CountsEditor, { type CountsField, type OverrideValue } from './CountsEditor';

interface DayForm {
  goal: Counts;
  goalItems: ChecklistItem[];
  done: Counts;
  doneOverrides: DoneOverrides;
  notes: string;
}

interface TomorrowForm {
  goal: Counts;
  goalItems: ChecklistItem[];
}

const AUTO_FIELDS: CountsField[] = ['interviewsSelf', 'interviewsCaller', 'profiles'];

function formOf(day: DayPlan): DayForm {
  return {
    goal: day.goal,
    goalItems: day.goalItems,
    done: day.done,
    doneOverrides: day.doneOverrides,
    notes: day.notes,
  };
}

/** Log a day's Goal vs Done (and set tomorrow's goal) in a side panel. */
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
  const todayParam = dateParam(new Date());
  const canLog = date <= todayParam;
  const tomorrowDate = dateParam(nextWorkingDay(day));
  const showTomorrow = !readOnly && canLog;

  const { data, error, isLoading, mutate } = useSWR(
    open ? ['day-plan', date, userId ?? 'me'] : null,
    () => api.getDayPlan(date, userId),
    { revalidateOnFocus: false },
  );
  const { data: tomorrowData } = useSWR(
    open && showTomorrow ? ['day-plan', tomorrowDate, 'me'] : null,
    () => api.getDayPlan(tomorrowDate),
    { revalidateOnFocus: false },
  );

  const [form, setForm] = useState<DayForm | null>(null);
  const [initial, setInitial] = useState('');
  const [tomorrow, setTomorrow] = useState<TomorrowForm | null>(null);
  const [tomorrowTouched, setTomorrowTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const next = formOf(data);
    setForm(next);
    setInitial(JSON.stringify(next));
  }, [data]);

  useEffect(() => {
    if (tomorrowData) setTomorrow({ goal: tomorrowData.goal, goalItems: tomorrowData.goalItems });
    setTomorrowTouched(false);
  }, [tomorrowData]);

  useEffect(() => {
    if (!open) {
      setForm(null);
      setSaveError(null);
    }
  }, [open]);

  const dirty = useMemo(
    () => !!form && (JSON.stringify(form) !== initial || tomorrowTouched),
    [form, initial, tomorrowTouched],
  );

  const overrides: Partial<Record<CountsField, OverrideValue>> = form
    ? {
        interviewsSelf: form.doneOverrides.interviewsSelf,
        interviewsCaller: form.doneOverrides.interviewsCaller,
        profiles: form.doneOverrides.profiles,
      }
    : {};

  const setOverride = (field: CountsField, value: OverrideValue) =>
    setForm((f) => (f ? { ...f, doneOverrides: { ...f.doneOverrides, [field]: value } } : f));

  const updateTomorrow = (patch: Partial<TomorrowForm>) => {
    setTomorrow((t) => ({ goal: t?.goal ?? emptyCounts(), goalItems: t?.goalItems ?? [], ...patch }));
    setTomorrowTouched(true);
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api.putDayPlan(date, {
        goal: form.goal,
        goalItems: cleanItems(form.goalItems),
        done: canLog
          ? { bidsSelf: form.done.bidsSelf, bidsBidder: form.done.bidsBidder, linkedin: form.done.linkedin }
          : undefined,
        doneOverrides: form.doneOverrides,
        notes: form.notes,
        tomorrow: tomorrowTouched && tomorrow
          ? { goal: tomorrow.goal, goalItems: cleanItems(tomorrow.goalItems) }
          : undefined,
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

  const title = `${dayLabel(day)}${isToday(day) ? ' · today' : ''}`;
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
      <button type="button" className="btn text-sm" onClick={save} disabled={saving || !form}>
        {saving ? 'Saving…' : canLog ? 'Save day' : 'Save goal'}
      </button>
    </>
  );

  return (
    <SidePanel
      open={open}
      title={title}
      subtitle={readOnly ? 'View only' : canLog ? 'Goal vs Done' : 'Goal for this day'}
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
          <CountsEditor
            goal={form.goal}
            onGoal={readOnly ? undefined : (goal) => setForm({ ...form, goal })}
            done={form.done}
            onDone={readOnly ? undefined : (done) => setForm({ ...form, done })}
            auto={{
              interviewsSelf: data.auto.interviewsSelf,
              interviewsCaller: data.auto.interviewsCaller,
              profiles: data.auto.profiles,
            }}
            overrides={overrides}
            autoFields={AUTO_FIELDS}
            onOverride={readOnly ? undefined : setOverride}
            stages={data.auto.stages}
            readOnly={readOnly}
            showDone={canLog}
          />

          <section>
            <h3 className="form-label mb-1">Goals</h3>
            <ChecklistEditor
              items={form.goalItems}
              onChange={(goalItems) => setForm({ ...form, goalItems })}
              readOnly={readOnly}
              allowTick={canLog}
            />
          </section>

          <section>
            <label className="form-label mb-1 block" htmlFor="day-notes">Notes</label>
            {readOnly ? (
              <p className="whitespace-pre-wrap text-sm text-body">{form.notes || '—'}</p>
            ) : (
              <textarea
                id="day-notes"
                className="input min-h-[5rem] w-full"
                maxLength={2000}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            )}
          </section>

          {showTomorrow && (
            <section className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="card-title">Goal for {dayLabel(nextWorkingDay(day))}</h3>
                <div className="flex flex-wrap gap-1">
                  <button type="button" className="btn-outline text-xs" onClick={() => updateTomorrow({ goal: form.goal })}>
                    Copy today&apos;s goal
                  </button>
                  <button
                    type="button"
                    className="btn-outline text-xs"
                    onClick={() =>
                      updateTomorrow({
                        goalItems: [
                          ...(tomorrow?.goalItems ?? []),
                          ...cleanItems(form.goalItems).filter((i) => !i.done).map((i) => ({ text: i.text, done: false })),
                        ].slice(0, 20),
                      })
                    }
                  >
                    Roll over unticked items
                  </button>
                </div>
              </div>
              <CountsEditor
                goal={tomorrow?.goal ?? emptyCounts()}
                onGoal={(goal) => updateTomorrow({ goal })}
                showDone={false}
              />
              <div className="mt-2">
                <ChecklistEditor
                  items={tomorrow?.goalItems ?? []}
                  onChange={(goalItems) => updateTomorrow({ goalItems })}
                  allowTick={false}
                  label="Tomorrow"
                />
              </div>
            </section>
          )}
        </div>
      ) : null}
    </SidePanel>
  );
}

