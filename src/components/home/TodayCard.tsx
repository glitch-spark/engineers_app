import { Fragment, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import useSWR, { useSWRConfig } from 'swr';
import * as api from '../../api/endpoints';
import { todayInputValue } from '../../lib/week';
import type { DayItem } from '../../api/endpoints';
import ItemRow, { kept } from '../report/ItemRow';

type Result = { done: boolean; value: number | null };
const DEBOUNCE_MS = 800;

const WEEKDAY = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short' });
};

export default function TodayCard() {
  const today = todayInputValue();
  const { mutate: globalMutate } = useSWRConfig();
  const { data: plan, error, isLoading, mutate } = useSWR(['home-day', today], () => api.getDayPlan(today), { revalidateOnFocus: false });
  const [local, setLocal] = useState<Record<string, Result>>({}); // optimistic, until saved
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

  if (error && !plan) {
    return (
      <section className="panel p-4">
        <h2 className="card-title mb-3">Today</h2>
        <p className="text-sm text-muted mb-3">Couldn&rsquo;t load today.</p>
        <button type="button" className="btn-outline" onClick={() => mutate()}>Retry</button>
      </section>
    );
  }
  if (isLoading || !plan) {
    return (
      <section className="panel p-4 space-y-3">
        <div className="skeleton h-5 w-48" />
        <div className="skeleton h-10 w-full" />
        <div className="skeleton h-10 w-full" />
      </section>
    );
  }

  const save = async (id: string, r: Result) => {
    delete timers.current[id];
    try {
      const next = await api.putDayProgress(today, { results: { [id]: r } });
      await mutate(next, false);
      globalMutate(['home-week', today]); // routines / goal progress below
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
    try {
      await api.putDayProgress(doneOn, { results: { [id]: { done: false } } });
      setFailedUntick(({ [id]: _, ...rest }) => rest);
      await Promise.all([mutate(), globalMutate(['home-week', today])]);
    } catch {
      setFailedUntick((f) => ({ ...f, [id]: doneOn }));
    }
  };
  const retry = (id: string) => {
    if (failedUntick[id]) return untick(id, failedUntick[id]);
    const r = failed[id];
    setLocal((l) => ({ ...l, [id]: r }));
    save(id, r);
  };

  const [y, m, d] = today.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay(); // 1 = Mon .. 5 = Fri
  const heading = new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const t = plan.targets;
  const bidsTarget = t.bidsSelf + t.bidsBidder;
  const intTarget = t.interviewsSelf + t.interviewsCaller;
  const chip = (label: string, done: number, target: number) => `${label} ${done}${target > 0 ? ` / ${target}` : ''} · auto`;
  const daysLeft = dow >= 1 && dow <= 4 ? `${6 - dow} days left · ` : dow === 5 ? 'last day · ' : '';
  const daily = plan.items.filter((i) => kept(i) && i.scope === 'routine');
  const weekly = plan.items.filter((i) => kept(i) && i.scope === 'goal');
  const disabled = !plan.weekSaved;
  const resultOf = (i: DayItem) => local[i.id] ?? { done: i.result?.done ?? false, value: i.result?.value ?? null };
  const doneEarlier = (i: DayItem) => {
    const on = plan.progress[i.id]?.doneOn;
    return i.scope === 'goal' && on && on !== today ? on : null;
  };
  const isDone = (i: DayItem) => (i.scope === 'goal' ? local[i.id]?.done ?? plan.progress[i.id]?.done ?? false : resultOf(i).done);
  const count = (list: DayItem[]) => `${list.filter(isDone).length} of ${list.length} done`;

  const row = (item: DayItem) => {
    const earlier = doneEarlier(item);
    return (
      <Fragment key={item.id}>
        <ItemRow
          item={item}
          result={earlier ? { done: true, value: item.result?.value ?? null } : resultOf(item)}
          week={item.scope === 'goal' ? plan.progress[item.id] : undefined}
          disabled={disabled || item.archived}
          valueLocked={!!earlier}
          note={earlier ? `done ${WEEKDAY(earlier)}` : undefined}
          onChange={(r) => (earlier ? untick(item.id, earlier) : change(item.id, r))}
        />
        {(failedUntick[item.id] || (failed[item.id] && !local[item.id])) && (
          <li className="text-xs text-red-600">
            Couldn't save — <button type="button" className="underline" onClick={() => retry(item.id)}>Retry</button>
          </li>
        )}
      </Fragment>
    );
  };
  const section = (label: string, list: DayItem[], prefix = '') => (
    <>
      <div className="mt-3 flex justify-between text-[11px] font-medium uppercase tracking-wider text-muted">
        <span>{label}</span><span className="normal-case tracking-normal">{prefix}{count(list)}</span>
      </div>
      <ul className="space-y-0.5">{list.map(row)}</ul>
    </>
  );

  return (
    <section className="card p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-heading">Today · {heading}</h2>
        <div className="flex gap-2 text-xs text-body">
          <span className="rounded-full border border-zinc-200 dark:border-zinc-700 px-2.5 py-0.5">{chip('Bids', plan.done.bidsSelf + plan.bidsBidderAuto, bidsTarget)}</span>
          <span className="rounded-full border border-zinc-200 dark:border-zinc-700 px-2.5 py-0.5">{chip('Interviews', plan.interviews.self + plan.interviews.caller, intTarget)}</span>
        </div>
      </header>
      {disabled && (
        <p className="mt-2 text-sm text-muted">
          No plan for this week yet — <Link to="/plans" className="underline">Set this week's plan</Link>
        </p>
      )}
      {section('Daily', daily)}
      {section('This week', weekly, daysLeft)}
    </section>
  );
}
