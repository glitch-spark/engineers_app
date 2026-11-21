import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { useSWRConfig, type KeyedMutator } from 'swr';
import * as api from '../../api/endpoints';
import type { DayItem, DayPlan } from '../../api/endpoints';
import { weekdayShort } from './BidsDays';
import ItemRow from '../report/ItemRow';

type Result = { done: boolean; value: number | null };
const DEBOUNCE_MS = 800;

/**
 * The owner's editable rows for today's plan (daily to-dos and weekly goals) and how they save: a tick or a number
 * is shown at once and saved as a draft after a pause, a failed save comes back with a Retry, a goal done on an
 * earlier day is un-ticked on that day, and a goal met by its week total is locked. `plan` is today's plan and
 * `mutate` its SWR mutate; `onSaved` refetches what else shows the day's progress (the week). Leaving the page
 * sends a pending edit at once.
 */
export function useDayItems({ today, plan, mutate, onSaved }: { today: string; plan: DayPlan | undefined; mutate: KeyedMutator<DayPlan>; onSaved: () => unknown }) {
  const { mutate: globalMutate } = useSWRConfig();
  const [local, setLocal] = useState<Record<string, Result>>({}); // optimistic, until saved
  const [unticking, setUnticking] = useState<Record<string, true>>({}); // goal ids being un-ticked on an earlier day
  const [failedUntick, setFailedUntick] = useState<Record<string, string>>({}); // goal id -> day it was done on
  const [failed, setFailed] = useState<Record<string, Result>>({}); // last attempt per failed item, for Retry
  const timers = useRef<Record<string, { t: ReturnType<typeof setTimeout>; r: Result }>>({});
  // Leaving the page (e.g. to the Daily plan) must not lose a pending edit: send it now,
  // then refresh the Daily plan's cache so it never opens (and re-posts) stale data.
  useEffect(() => () => {
    for (const [id, { t, r }] of Object.entries(timers.current)) {
      clearTimeout(t);
      api.putDayProgress(today, { results: { [id]: r } })
        .then((next) => globalMutate(['day-plan', today, 'me'], next, false))
        .catch((e) => console.error('Today: flush on leave failed', e));
    }
    timers.current = {};
  }, [today, globalMutate]);

  const save = async (id: string, r: Result) => {
    delete timers.current[id];
    try {
      const next = await api.putDayProgress(today, { results: { [id]: r } });
      await mutate(next, false);
      onSaved(); // routines / goal progress in the week
      setFailed(({ [id]: _, ...rest }) => rest);
      if (!timers.current[id]) setLocal(({ [id]: _, ...rest }) => rest); // keep newer typing
    } catch {
      setFailed((f) => ({ ...f, [id]: r }));
      if (!timers.current[id]) setLocal(({ [id]: _, ...rest }) => rest); // back to the last saved result
    }
  };
  const change = (id: string, r: Result) => {
    setLocal((l) => ({ ...l, [id]: r }));
    clearTimeout(timers.current[id]?.t);
    timers.current[id] = { t: setTimeout(() => save(id, r), DEBOUNCE_MS), r };
  };
  const untick = async (id: string, doneOn: string) => {
    setUnticking((u) => ({ ...u, [id]: true }));
    try {
      await api.putDayProgress(doneOn, { results: { [id]: { done: false } } });
      setFailedUntick(({ [id]: _, ...rest }) => rest);
      await Promise.all([mutate(), onSaved()]);
    } catch {
      setFailedUntick((f) => ({ ...f, [id]: doneOn }));
    } finally {
      setUnticking(({ [id]: _, ...rest }) => rest);
    }
  };
  const retry = (id: string) => {
    if (failedUntick[id]) return untick(id, failedUntick[id]);
    const r = failed[id];
    setLocal((l) => ({ ...l, [id]: r }));
    save(id, r);
  };

  const progress = plan?.progress ?? {};
  /** Without a saved weekly plan nothing can be ticked. */
  const disabled = !plan?.weekSaved;
  // A goal done only by its week total has no done day: it can't be un-ticked from Home.
  const weekMet = (i: DayItem) => i.scope === 'goal' && !!progress[i.id]?.done && !progress[i.id]?.doneOn;
  const doneEarlier = (i: DayItem) => {
    const on = progress[i.id]?.doneOn;
    return i.scope === 'goal' && on && on !== today ? on : null;
  };
  const resultOf = (i: DayItem) => {
    const saved = { done: i.result?.done ?? false, value: i.result?.value ?? null };
    const r = local[i.id] ?? (i.scope === 'goal' ? { ...saved, done: progress[i.id]?.done ?? saved.done } : saved);
    return weekMet(i) ? { ...r, done: true } : r;
  };
  /** Done as the row shows it right now, an unsaved tick included. */
  const isDone = (i: DayItem) => (unticking[i.id] ? false : resultOf(i).done);

  const row = (item: DayItem): ReactNode => {
    const earlier = doneEarlier(item);
    const met = weekMet(item);
    const busy = !!unticking[item.id];
    return (
      <Fragment key={item.id}>
        <ItemRow
          item={item}
          result={busy ? { done: false, value: item.result?.value ?? null } : earlier ? { done: true, value: item.result?.value ?? null } : resultOf(item)}
          week={item.scope === 'goal' ? progress[item.id] : undefined}
          disabled={disabled || item.archived || busy}
          compact
          valueLocked={!!earlier}
          doneLocked={met}
          note={busy ? undefined : earlier ? `done ${weekdayShort(earlier)}` : met ? 'week target met' : undefined}
          onChange={(r) => (earlier ? untick(item.id, earlier) : change(item.id, met ? { done: item.result?.done ?? false, value: r.value } : r))}
        />
        {(failedUntick[item.id] || (failed[item.id] && !local[item.id])) && (
          <li className="text-xs text-red-600">
            Couldn't save — <button type="button" className="underline" onClick={() => retry(item.id)}>Retry</button>
          </li>
        )}
      </Fragment>
    );
  };
  return { row, isDone, disabled };
}
