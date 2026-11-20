import { Fragment, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import useSWR, { useSWRConfig } from 'swr';
import * as api from '../../api/endpoints';
import { todayInputValue } from '../../lib/week';
import type { DayItem, NeedsInputItem, TodayInterview } from '../../api/endpoints';
import { useAuth } from '../../auth/useAuth';
import { formatInZone, parseServerTime } from '../../lib/interviewTimezone';
import { stageLabel } from '../../lib/stageBadge';
import { useInterviewTimezone } from '../../lib/useInterviewTimezone';
import { daysWithoutResult, needsInputKey, shortDay, useNeedsInputActions } from '../interview/useNeedsInputActions';
import ItemRow, { kept } from '../report/ItemRow';

type Result = { done: boolean; value: number | null };
const DEBOUNCE_MS = 800;

const MINUTE_MS = 60000;
const num = (n: number) => n.toLocaleString('en-US');
const roundKey = (r: { interviewId: string; roundId: string }) => `${r.interviewId}:${r.roundId}`;

/** The current time, refreshed once a minute, so "In 2 hours" does not go stale between fetches. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setTimeout(() => setNow(Date.now()), MINUTE_MS);
    return () => clearTimeout(t);
  }, [now]);
  return now;
}

/**
 * Where a round of today stands right now. A round nobody marked moves from upcoming to happening to ended with
 * the clock, so those three are read from its times; an answered round keeps the state the server gave.
 */
function roundState(iv: TodayInterview, now: number): TodayInterview['state'] {
  if (iv.state !== 'upcoming' && iv.state !== 'now' && iv.state !== 'unmarked') return iv.state;
  const start = parseServerTime(iv.scheduledAt).getTime();
  const end = iv.endsAt ? parseServerTime(iv.endsAt).getTime() : NaN;
  if (isNaN(start) || isNaN(end)) return iv.state;
  return now < start ? 'upcoming' : now < end ? 'now' : 'unmarked';
}

const parseDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export default function TodayCard() {
  const today = todayInputValue();
  const now = useNow();
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
  const bidsDone = plan.done.bidsSelf + plan.bidsBidderAuto;
  const intTarget = t.interviewsSelf + t.interviewsCaller;
  const rounds = plan.todayInterviews ?? [];
  const marked = plan.interviewsMarked; // missing from an older server: the row then shows the plain count
  const toCome = rounds.some((r) => ['upcoming', 'now'].includes(roundState(r, now)));
  // The auto rows that have a box (they tick themselves), with whether it is ticked.
  const auto = [
    ...(bidsTarget > 0 ? [bidsDone >= bidsTarget] : []),
    ...(marked && marked.total > 0 ? [marked.marked >= marked.total && !toCome] : []),
  ];
  // After anything done to a round: the day, plus the week and month cards and the waiting list.
  const refresh = () => Promise.all([
    mutate(),
    globalMutate((key) => Array.isArray(key) && ['home-week', 'home-month-interviews', 'interviews-needs-input'].includes(key[0])),
  ]);
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
          compact
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
  const label = (text: string, right?: string) => (
    <div className="mt-3 flex justify-between gap-2 text-[11px] font-medium uppercase tracking-wider text-muted">
      <span>{text}</span>{right && <span className="normal-case tracking-normal">{right}</span>}
    </div>
  );
  const autoLine = 'flex flex-wrap items-center gap-2 px-1 py-1.5 text-sm text-body';
  const autoBox = (name: string, checked: boolean) => (
    <input
      type="checkbox"
      disabled
      checked={checked}
      readOnly
      aria-label={`${name} — ticks itself`}
      className={checked ? 'h-4 w-4 shrink-0' : 'h-4 w-4 shrink-0 appearance-none rounded border border-dashed border-zinc-400 dark:border-zinc-500'}
    />
  );
  const autoTag = <span className="rounded-full border border-zinc-200 px-2 py-0.5 text-[11px] text-muted dark:border-zinc-700">ticks itself</span>;
  const bidsLeft = bidsTarget - bidsDone;
  const interviewsDone = plan.interviews.self + plan.interviews.caller;

  return (
    <section className="card p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-heading">Today · {heading}</h2>
        {daily.length + auto.length > 0 && (
          <span className="text-xs text-muted">{daily.filter(isDone).length + auto.filter(Boolean).length} of {daily.length + auto.length} done</span>
        )}
      </header>
      {disabled && (
        <p className="mt-2 text-sm text-muted">
          No plan for this week yet — <Link to="/plans" className="underline">Set this week's plan</Link>
        </p>
      )}
      {label('Daily')}
      <ul aria-label="Daily" className="space-y-0.5">
        <li className={autoLine}>
          {bidsTarget > 0 ? autoBox('Bids target reached', bidsDone >= bidsTarget) : <span className="w-4 shrink-0" />}
          <div className="min-w-0 flex-1 basis-52">
            <span className="font-medium text-strong">Bids</span>
            <span className="text-xs text-muted">
              {' · '}{num(bidsDone)}{bidsTarget > 0 && ` of ${num(bidsTarget)}`}{bidsTarget > 0 && bidsLeft > 0 && ` · ${num(bidsLeft)} to go`}
            </span>
            {bidsTarget > 0 && (
              <div
                role="progressbar"
                aria-label="Bids today"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.min(100, Math.round((bidsDone / bidsTarget) * 100))}
                className="mt-1 h-2 max-w-md overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800"
              >
                <div className="h-full bg-accent-500" style={{ width: `${Math.min(100, (bidsDone / bidsTarget) * 100)}%` }} />
              </div>
            )}
          </div>
          {bidsTarget > 0 && autoTag}
        </li>
        <li className={autoLine}>
          {marked && marked.total > 0
            ? autoBox("Today's interviews all marked", marked.marked >= marked.total && !toCome)
            : <span className="w-4 shrink-0" />}
          <div className="min-w-0 flex-1 basis-52">
            <span className="font-medium text-strong">Interviews</span>
            <span className="text-xs text-muted">
              {' · '}
              {!marked
                ? `${interviewsDone}${intTarget > 0 ? ` of ${intTarget}` : ''}`
                : marked.total > 0 ? `${marked.marked} of ${marked.total} marked` : 'none today'}
            </span>
          </div>
          {marked && marked.total > 0 && autoTag}
        </li>
        {rounds.length > 0 && <li><TodayInterviews rounds={rounds} now={now} onSaved={refresh} /></li>}
        {daily.map(row)}
      </ul>
      {label('This week', `${daysLeft}${count(weekly)}`)}
      <ul className="space-y-0.5">{weekly.map(row)}</ul>
      <WaitingInterviews today={rounds} onSaved={refresh} />
    </section>
  );
}

const STEP_ENDED: Record<string, string> = { passed: ' ✓ passed', rejected: ' ✗ rejected', canceled: ' canceled', held: '' };

/** Today's rounds under the Interviews row: who takes each, the steps so far, and where it stands right now. */
function TodayInterviews({ rounds, now, onSaved }: { rounds: TodayInterview[]; now: number; onSaved: () => unknown }) {
  const { tz } = useInterviewTimezone();
  const { dialog, outcomeButtons } = useNeedsInputActions(onSaved);
  const clock = (iso: string) => formatInZone(parseServerTime(iso), tz, { hour: 'numeric', minute: '2-digit' });
  const ok = 'font-semibold text-emerald-600 dark:text-emerald-400';

  const status = (iv: TodayInterview, state: TodayInterview['state']) => {
    switch (state) {
      case 'upcoming': {
        const minutes = Math.max(1, Math.ceil((parseServerTime(iv.scheduledAt).getTime() - now) / MINUTE_MS));
        const hours = Math.round(minutes / 60);
        const left = minutes < 60 ? `${minutes} minute${minutes === 1 ? '' : 's'}` : `${hours} hour${hours === 1 ? '' : 's'}`;
        return <span className="text-muted">In {left}</span>;
      }
      case 'now': return <span className="font-semibold text-accent-700 dark:text-accent-300">Happening now</span>;
      case 'unmarked':
        return <span className="font-semibold text-amber-700 dark:text-amber-400">Ended {iv.endsAt ? `${clock(iv.endsAt)} ` : ''}· not marked</span>;
      case 'completed': return <span className={ok}>Completed ✓</span>;
      case 'passed': return <span className={ok}>Passed ✓</span>;
      case 'rejected': return <span className="font-semibold text-red-600 dark:text-red-400">Rejected</span>;
      case 'canceled': return <span className="text-muted">Canceled</span>;
      default: {
        const day = shortDay(iv.rescheduledTo, tz);
        return <span className="text-muted">Rescheduled{day ? ` to ${day}` : ''}</span>;
      }
    }
  };

  return (
    <>
      {dialog}
      <ul aria-label="Today's interviews" className="mb-1 ml-6 border-l-2 border-zinc-200 dark:border-zinc-700">
        {rounds.map((iv) => {
          const state = roundState(iv, now);
          const who = iv.who.kind === 'self'
            ? 'Self'
            : !iv.who.assigned ? 'Caller: not assigned yet' : `Caller: ${iv.who.name || 'assigned'}${iv.who.confirmed ? ' ✓ confirmed' : ''}`;
          return (
            <li key={roundKey(iv)} className="py-2 pl-3 text-sm">
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
                <span className="min-w-0">
                  <span className="font-medium text-strong">{clock(iv.scheduledAt)} · {iv.companyName || 'Untitled company'}</span>
                  <span className="text-xs text-muted">{iv.profileName ? ` · ${iv.profileName}` : ''} · {who}</span>
                </span>
                <span className="text-xs">{status(iv, state)}</span>
              </div>
              <div className="mt-0.5 text-xs text-muted">
                {iv.steps.map((step, i) => (
                  <Fragment key={i}>
                    {i > 0 && ' → '}
                    {step.state === 'today'
                      ? <span className="rounded bg-sky-50 px-1 font-semibold text-sky-700 dark:bg-sky-950 dark:text-sky-400">{stageLabel(step.stage)} · today</span>
                      : `${stageLabel(step.stage)}${STEP_ENDED[step.state] ?? ''}`}
                  </Fragment>
                ))}
              </div>
              {/* an old round with no id of its own can't be answered from here: the Interviews page handles it */}
              {state === 'unmarked' && !!iv.roundId && (
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {outcomeButtons({
                    interviewId: iv.interviewId, roundId: iv.roundId, companyName: iv.companyName, profileName: iv.profileName,
                    ownerId: '', ownerName: null, stage: iv.stage, status: iv.status, scheduledAt: iv.scheduledAt, endsAt: iv.endsAt,
                    need: 'outcome',
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

const WAITING_ROWS = 5;

/**
 * The signed-in person's follow-ups: rounds held a week ago with no result (tick once followed up) and follow-ups
 * that got no answer. Older rounds that need their outcome or a reason are only counted, with a link to the
 * Interviews page; `today`'s rounds are answered in the list above, so they are not counted again. Hidden when
 * nothing waits. `onSaved` refetches the day, the other cards and this list.
 */
function WaitingInterviews({ today, onSaved }: { today: TodayInterview[]; onSaved: () => unknown }) {
  const { user } = useAuth();
  const { tz } = useInterviewTimezone();
  // An admin asks for their own rounds by id (without it the server returns the whole team's). Same key shape as
  // the Interviews page's list, so a save on either refreshes both.
  const own = user?.role === 'admin' ? user.id : undefined;
  const { data } = useSWR(['interviews-needs-input', own ?? ''], () => api.getNeedsInput(own));
  const { dialog, isSaving, followUp, resultButtons } = useNeedsInputActions(onSaved);
  // Guard: never show an admin someone else's round here, whatever the server returned.
  const items = (data?.items ?? []).filter((row) => user?.role !== 'admin' || row.ownerId === user.id);
  const todayKeys = new Set(today.map(roundKey));
  const count = (need: NeedsInputItem['need']) => items.filter((row) => row.need === need && !todayKeys.has(roundKey(row))).length;
  const outcomes = count('outcome');
  const reasons = count('reason');
  const older = (n: number) => `${n} older ${n === 1 ? 'round needs' : 'rounds need'}`;
  const others = [
    outcomes > 0 && `${older(outcomes)} "How did it go?"`,
    reasons > 0 && (outcomes > 0 ? `${reasons} ${reasons === 1 ? 'needs' : 'need'} a reason` : `${older(reasons)} a reason`),
  ].filter(Boolean).join(' · ');
  const rows = items
    .filter((row) => row.need === 'follow_up' || row.need === 'heard_back')
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)); // oldest first
  const more = rows.length - WAITING_ROWS;
  if (!rows.length && !others) return dialog;
  const line = 'flex flex-wrap items-center gap-x-2 gap-y-1.5 px-1 py-1.5 text-sm text-body';

  return (
    <div role="group" aria-labelledby="waiting-interviews-title">
      {dialog}
      <div className="mt-3 flex flex-wrap justify-between gap-x-2 text-[11px] font-medium uppercase tracking-wider text-muted">
        <span id="waiting-interviews-title">Follow-ups ({rows.length})</span>
        <span className="normal-case tracking-normal">tick when you've followed up with the company</span>
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
                  {row.need === 'follow_up' ? (row.companyName || 'Untitled company') : `Did you hear back? ${row.companyName || ''}`.trim()}
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
