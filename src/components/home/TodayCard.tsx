import { Fragment, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import useSWR, { useSWRConfig } from 'swr';
import * as api from '../../api/endpoints';
import { todayInputValue } from '../../lib/week';
import type { DayItem, NeedsInputItem } from '../../api/endpoints';
import { useAuth } from '../../auth/useAuth';
import { stageLabel } from '../../lib/stageBadge';
import { useInterviewTimezone } from '../../lib/useInterviewTimezone';
import { daysWithoutResult, needsInputKey, shortDay, useNeedsInputActions } from '../interview/useNeedsInputActions';
import ItemRow, { kept } from '../report/ItemRow';

type Result = { done: boolean; value: number | null };
const DEBOUNCE_MS = 800;

const parseDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export default function TodayCard() {
  const today = todayInputValue();
  const { mutate: globalMutate } = useSWRConfig();
  const { data: plan, error, isLoading, mutate } = useSWR(['home-day', today], () => api.getDayPlan(today), { revalidateOnFocus: false });
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
    setUnticking((u) => ({ ...u, [id]: true }));
    try {
      await api.putDayProgress(doneOn, { results: { [id]: { done: false } } });
      setFailedUntick(({ [id]: _, ...rest }) => rest);
      await Promise.all([mutate(), globalMutate(['home-week', today])]);
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

  const todayDate = parseDay(today);
  const dow = todayDate.getDay(); // 1 = Mon .. 5 = Fri
  const heading = todayDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const t = plan.targets;
  const bidsTarget = t.bidsSelf + t.bidsBidder;
  const intTarget = t.interviewsSelf + t.interviewsCaller;
  const chip = (label: string, done: number, target: number) => `${label} ${done}${target > 0 ? ` / ${target}` : ''} · auto`;
  const daysLeft = dow >= 1 && dow <= 4 ? `${6 - dow} days left · ` : dow === 5 ? 'last day · ' : '';
  const daily = plan.items.filter((i) => kept(i) && i.scope === 'routine');
  const weekly = plan.items.filter((i) => kept(i) && i.scope === 'goal');
  const disabled = !plan.weekSaved;
  // A goal done only by its week total has no done day: it can't be un-ticked from Home.
  const weekMet = (i: DayItem) => i.scope === 'goal' && !!plan.progress[i.id]?.done && !plan.progress[i.id]?.doneOn;
  const doneEarlier = (i: DayItem) => {
    const on = plan.progress[i.id]?.doneOn;
    return i.scope === 'goal' && on && on !== today ? on : null;
  };
  const resultOf = (i: DayItem) => {
    const saved = { done: i.result?.done ?? false, value: i.result?.value ?? null };
    const r = local[i.id] ?? (i.scope === 'goal' ? { ...saved, done: plan.progress[i.id]?.done ?? saved.done } : saved);
    return weekMet(i) ? { ...r, done: true } : r;
  };
  const isDone = (i: DayItem) => (unticking[i.id] ? false : resultOf(i).done);
  const count = (list: DayItem[]) => `${list.filter(isDone).length} of ${list.length} done`;

  const row = (item: DayItem) => {
    const earlier = doneEarlier(item);
    const met = weekMet(item);
    const busy = !!unticking[item.id];
    return (
      <Fragment key={item.id}>
        <ItemRow
          item={item}
          result={busy ? { done: false, value: item.result?.value ?? null } : earlier ? { done: true, value: item.result?.value ?? null } : resultOf(item)}
          week={item.scope === 'goal' ? plan.progress[item.id] : undefined}
          disabled={disabled || item.archived || busy}
          valueLocked={!!earlier}
          doneLocked={met}
          note={busy ? undefined : earlier ? `done ${parseDay(earlier).toLocaleDateString('en-US', { weekday: 'short' })}` : met ? 'week target met' : undefined}
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
      <WaitingInterviews onSaved={() => mutate()} />
    </section>
  );
}

const WAITING_ROWS = 5;

/**
 * The signed-in person's rounds that wait on them. Follow-ups and their answers are handled here; rounds that need
 * their outcome or a reason are only counted, with a link to the Interviews page. Hidden when nothing waits.
 * `onSaved` refetches the day (its standup line counts the follow-ups).
 */
function WaitingInterviews({ onSaved }: { onSaved: () => unknown }) {
  const { user } = useAuth();
  const { tz } = useInterviewTimezone();
  // Same key as the Interviews page's own list, so a save on either refreshes both.
  const { data, mutate } = useSWR(['interviews-needs-input', ''], () => api.getNeedsInput());
  const { dialog, isSaving, followUp, resultButtons } = useNeedsInputActions(() => Promise.all([mutate(), onSaved()]));
  // Asked without a user, an admin gets the whole team's rounds: keep only their own.
  const items = (data?.items ?? []).filter((row) => user?.role !== 'admin' || row.ownerId === user.id);
  if (!items.length) return dialog;

  const count = (need: NeedsInputItem['need']) => items.filter((row) => row.need === need).length;
  const outcomes = count('outcome');
  const reasons = count('reason');
  const others = [
    outcomes > 0 && `${outcomes} ${outcomes === 1 ? 'round needs' : 'rounds need'} "How did it go?"`,
    reasons > 0 && `${reasons} ${reasons === 1 ? 'needs' : 'need'} a reason`,
  ].filter(Boolean).join(' · ');
  const rows = items
    .filter((row) => row.need === 'follow_up' || row.need === 'heard_back')
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)); // oldest first
  const more = rows.length - WAITING_ROWS;
  const line = 'flex flex-wrap items-center gap-x-2 gap-y-1.5 px-1 py-1.5 text-sm text-body';

  return (
    <div role="group" aria-labelledby="waiting-interviews-title">
      {dialog}
      <div id="waiting-interviews-title" className="mt-3 text-[11px] font-medium uppercase tracking-wider text-muted">
        Interviews waiting on you ({items.length})
      </div>
      <ul className="space-y-0.5">
        {rows.slice(0, WAITING_ROWS).map((row) => {
          const company = row.companyName || 'the company';
          const round = [stageLabel(row.stage), shortDay(row.scheduledAt, tz)].filter(Boolean).join(', ');
          const days = daysWithoutResult(row);
          const followedUp = shortDay(row.followedUpAt, tz);
          const waiting = row.need === 'follow_up'
            ? (days === null ? 'no result yet' : `no result for ${days} days`)
            : `followed up${followedUp ? ` ${followedUp}` : ''}`;
          return (
            <li key={needsInputKey(row)} className={line}>
              {row.need === 'follow_up' ? (
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0"
                  aria-label={`I followed up with ${company}`}
                  // Stays ticked while it saves; a saved row leaves the list, a failed one comes back unticked.
                  checked={isSaving(row)}
                  disabled={isSaving(row)}
                  onChange={() => followUp(row)}
                />
              ) : <span className="w-4 shrink-0" />}
              <span className="min-w-0 flex-1 basis-52">
                <span className="font-medium text-strong">
                  {row.need === 'follow_up' ? `Follow up with ${company}` : `Did you hear back? ${row.companyName || ''}`.trim()}
                </span>
                <span className="text-xs text-muted"> · {round} · {waiting}</span>
              </span>
              <div className="flex flex-wrap gap-2">{resultButtons(row)}</div>
            </li>
          );
        })}
        {more > 0 && (
          <li className={line}>
            <span className="w-4 shrink-0" />
            <Link to="/interviews" className="text-xs underline">…and {more} more → Interviews</Link>
          </li>
        )}
        {others && (
          <li className={line}>
            <span className="w-4 shrink-0" />
            <span className="min-w-0 flex-1 text-xs text-muted">{others}</span>
            <Link to="/interviews" className="text-xs underline">Interviews →</Link>
          </li>
        )}
      </ul>
    </div>
  );
}
