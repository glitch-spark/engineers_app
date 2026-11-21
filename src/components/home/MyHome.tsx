import { Fragment, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import useSWR, { useSWRConfig } from 'swr';
import * as api from '../../api/endpoints';
import type { DayItem } from '../../api/endpoints';
import { stageLabel } from '../../lib/stageBadge';
import { useInterviewTimezone } from '../../lib/useInterviewTimezone';
import { addDays, dayDate, dayLabel, mondayOf, monthDay, todayInputValue } from '../../lib/week';
import { daysWithoutResult, needsInputKey, useNeedsInputActions } from '../interview/useNeedsInputActions';
import ItemRow, { kept } from '../report/ItemRow';
import PendingItems, { usePending } from './PendingItems';
import PipelineTable, { PIPELINE_GROUPS } from './PipelineTable';
import TodayRound, { asNeedsInput, roundKey, roundState, useNow } from './TodayRound';
import WeekTable from './WeekTable';

type Result = { done: boolean; value: number | null };
const DEBOUNCE_MS = 800;

const num = (n: number) => n.toLocaleString('en-US');
const UNDER = 'font-semibold text-amber-600 dark:text-amber-400';
const REACHED = 'font-semibold text-emerald-600 dark:text-emerald-400';
const LINE = 'flex flex-wrap items-center gap-2 px-1 py-2 text-sm text-body';
const NAME = 'w-24 shrink-0 font-semibold text-strong';
const AMOUNT = 'min-w-0 flex-1 basis-52 tabular-nums';
const WEEK = 'whitespace-nowrap text-xs text-muted';

/**
 * A person's own Home (user, 2026-11-21): what waits on them (folded), today's to-do list (every row has a box;
 * all ticked = good to go), then the week as a read-only table with the weekly goals under it. Fed by the day read,
 * the week read and the pending read; after any save the page reads them again.
 *
 * With `userId` it is the admin's view of that person (`name`): the same page, read for them, with Pending items
 * open. Their to-dos, goals and follow-ups are theirs to tick, so those boxes are disabled. `day` (admin only;
 * default today) is the day the first block shows and whose week the table shows: a past day lists what was done,
 * with no follow-ups and no result buttons (those are about now, and stay in Pending items).
 */
export default function MyHome({ userId, name, day: picked }: { userId?: string; name?: string; day?: string }) {
  const who = userId ? [userId] : []; // own Home keeps its keys, so nothing it shares a cache with changes
  const today = todayInputValue();
  const day = picked ?? today;
  const isToday = day === today;
  const thisWeek = mondayOf(day) === mondayOf(today);
  const mode = userId ? 'admin' : 'owner';
  const now = useNow();
  const { tz } = useInterviewTimezone();
  const { mutate: globalMutate } = useSWRConfig();
  const { data: plan, error, isLoading, mutate } = useSWR(['home-day', day, ...who], () => api.getDayPlan(day, userId), { revalidateOnFocus: false });
  const week = useSWR(
    ['home-week', today, ...who, ...(thisWeek ? [] : [mondayOf(day)])],
    () => api.getDashboardWeek({ today, ...(userId ? { userId } : {}), ...(thisWeek ? {} : { weekOf: day }) }),
  );
  const pipeline = useSWR(['person-pipeline', userId ?? ''], () => api.getInterviewPipeline(userId));
  const [pipelineOpen, setPipelineOpen] = useState(false); // reference, not a to-do: one line until opened
  const rounds = plan?.todayInterviews ?? [];
  const nowRounds = isToday ? rounds : []; // what the day block answers for Pending items: only today's
  const { followUps } = usePending(mode, userId, nowRounds, isToday);
  // What the page shows besides the day: the week and the pending items (follow-ups included).
  const refreshRest = () => globalMutate((key) => Array.isArray(key) && ['home-week', 'home-pending', 'interviews-needs-input', 'person-pipeline'].includes(key[0]));
  const refresh = () => Promise.all([mutate(), refreshRest()]);
  const { dialog, outcomeButtons, followUp, isSaving } = useNeedsInputActions(refresh);
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
      refreshRest();
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
      await refresh();
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

  const dow = thisWeek ? dayDate(today).getDay() : 0; // 1 = Mon .. 5 = Fri; a past week has no days left
  const t = plan.targets;
  const bids = plan.bidsTotals ?? { // an older server: the same numbers from the day's own fields
    self: plan.done.bidsSelf, selfTarget: t.bidsSelf || null, bidder: plan.bidsBidderAuto, bidderTarget: t.bidsBidder || null,
    total: plan.done.bidsSelf + plan.bidsBidderAuto, target: t.bidsSelf + t.bidsBidder || null,
  };
  const bidsOk = !bids.target || bids.total >= bids.target; // no target counts as ticked
  const intTarget = t.interviewsSelf + t.interviewsCaller;
  const marked = plan.interviewsMarked; // missing from an older server: the row then shows the plain count, with no box
  const toCome = rounds.some((r) => ['upcoming', 'now'].includes(roundState(r, now)));
  const interviewsOk = !!marked && marked.marked >= marked.total && !toCome; // no round today counts as ticked
  const w = week.data;
  const weekBids = w && (w.bids.week ?? w.bids);
  const monday = w?.week.start.slice(0, 10) ?? mondayOf(today);
  const daysLeft = dow >= 1 && dow <= 4 ? `${6 - dow} days left` : dow === 5 ? 'last day' : '';
  const daily = plan.items.filter((i) => kept(i) && i.scope === 'routine');
  const weekly = plan.items.filter((i) => kept(i) && i.scope === 'goal');
  const disabled = !plan.weekSaved || !!userId;
  // A goal done only by its week total has no done day: it can't be un-ticked from Home.
  const weekMet = (i: DayItem) => i.scope === 'goal' && !!plan.progress[i.id]?.done && !plan.progress[i.id]?.doneOn;
  const doneEarlier = (i: DayItem) => {
    const on = plan.progress[i.id]?.doneOn;
    return i.scope === 'goal' && on && on !== day ? on : null;
  };
  const resultOf = (i: DayItem) => {
    const saved = { done: i.result?.done ?? false, value: i.result?.value ?? null };
    const r = local[i.id] ?? (i.scope === 'goal' ? { ...saved, done: plan.progress[i.id]?.done ?? saved.done } : saved);
    return weekMet(i) ? { ...r, done: true } : r;
  };
  const isDone = (i: DayItem) => (unticking[i.id] ? false : resultOf(i).done);
  const count = (list: DayItem[]) => `${list.filter(isDone).length} of ${list.length} done`;
  // Every row of Today with a box, and whether it is ticked (a follow-up leaves the list once it is done).
  const boxes = [bidsOk, ...(marked ? [interviewsOk] : []), ...followUps.map(() => false), ...daily.map(isDone)];
  const toGo = boxes.filter((b) => !b).length;
  const open = pipeline.data?.items ?? [];
  const pipelineLine = PIPELINE_GROUPS.map(([key, , short]) => [open.filter((p) => p.status === key).length, short] as const)
    .filter(([n]) => n > 0).map(([n, short]) => `${n} ${short}`).join(' · ');

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
          note={busy ? undefined : earlier ? `done ${dayDate(earlier).toLocaleDateString('en-US', { weekday: 'short' })}` : met ? 'week target met' : undefined}
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
  // A self-ticking box: the real (disabled) checkbox is kept for screen readers, the drawn one shows green once
  // ticked and dashed until then, as in the prototype (a disabled native box is always grey).
  const autoBox = (name: string, checked: boolean) => (
    <span className="relative inline-flex h-4 w-4 shrink-0" title="Ticks itself">
      <input type="checkbox" disabled checked={checked} readOnly aria-label={`${name} — ticks itself`} className="sr-only" />
      <span
        aria-hidden
        className={`flex h-4 w-4 items-center justify-center rounded text-[11px] font-bold leading-none text-white ${checked ? 'bg-success-500' : 'border border-dashed border-zinc-400 dark:border-zinc-500'}`}
      >
        {checked && '✓'}
      </span>
    </span>
  );

  return (
    <>
      {dialog}
      <PendingItems mode={mode} userId={userId} name={name} today={nowRounds} apart={isToday} onSaved={refresh} />
      <section className="panel p-4">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-heading">{isToday ? `Today · ${dayLabel(day)}` : dayLabel(day)}</h2>
          <span className="text-xs text-muted">
            <b className="font-semibold text-body">{boxes.length - toGo} of {boxes.length} done</b>{toGo > 0 && ` · ${toGo} to go`}
          </span>
        </header>
        {!plan.weekSaved && !userId && (
          <p className="mt-2 text-sm text-muted">
            No plan for this week yet — <Link to="/plans" className="underline">Set this week's plan</Link>
          </p>
        )}
        <ul aria-label="Daily" className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
          <li className={LINE}>
            {autoBox('Bids target reached', bidsOk)}
            <span className={NAME}>Bids</span>
            <div className={AMOUNT}>
              <b className={bids.target ? (bidsOk ? REACHED : UNDER) : 'font-semibold text-strong'}>{num(bids.total)}</b>
              {bids.target ? ` of ${num(bids.target)}` : ''}
              <span className="text-xs text-muted">
                {' · '}self <b className="text-body">{num(bids.self)}</b>{bids.selfTarget ? ` / ${num(bids.selfTarget)}` : ''}
                {' · '}bidder <b className="text-body">{num(bids.bidder)}</b>{bids.bidderTarget ? ` / ${num(bids.bidderTarget)}` : ''}
              </span>
              {!!bids.target && (
                <div
                  role="progressbar"
                  aria-label="Bids today"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.min(100, Math.round((bids.total / bids.target) * 100))}
                  className="mt-1 h-1.5 max-w-xs overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800"
                >
                  <div className={`h-full ${bidsOk ? 'bg-success-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, (bids.total / bids.target) * 100)}%` }} />
                </div>
              )}
            </div>
            {weekBids && <span className={WEEK}>{thisWeek ? 'this week' : 'that week'} {num(weekBids.total)}{weekBids.target ? ` of ${num(weekBids.target)}` : ''}</span>}
          </li>
          {!!plan.bidsByRegion?.length && (
            <li className="border-t-0 pb-2 pl-7"><div className="border-l-2 border-zinc-200 pl-3 dark:border-zinc-700">
              <table aria-label="Bids by location" className="w-full max-w-md text-xs tabular-nums text-body">
                <thead>
                  <tr>
                    {['Location', 'Self', 'Bidder', 'Total'].map((h) => (
                      <th key={h} scope="col" className="px-2 py-0.5 text-right font-medium text-muted first:pl-0 first:text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {plan.bidsByRegion.map((r) => (
                    <tr key={r.region}>
                      <th scope="row" className="py-0.5 text-left font-normal">{r.region}</th>
                      <td className={`px-2 text-right ${r.selfTarget && r.self < r.selfTarget ? UNDER : ''}`}>
                        {num(r.self)}{r.selfTarget ? ` / ${num(r.selfTarget)}` : ''}
                      </td>
                      <td className="px-2 text-right">{num(r.bidder)}</td>
                      <td className="px-2 text-right">{num(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div></li>
          )}
          <li className={LINE}>
            {marked ? autoBox("Today's interviews all marked", interviewsOk) : <span className="w-4 shrink-0" />}
            <span className={NAME}>Interviews</span>
            <div className={AMOUNT}>
              {!marked ? `${plan.interviews.self + plan.interviews.caller}${intTarget > 0 ? ` of ${intTarget}` : ''}` : (
                <>
                  {!marked.total ? <span className="text-muted">none today</span>
                    : <><b className={interviewsOk ? REACHED : UNDER}>{marked.marked} of {marked.total}</b> marked</>}
                  <span className="text-xs text-muted">
                    {' · '}self <b className="text-body">{rounds.filter((r) => r.who.kind === 'self').length}</b>
                    {' · '}caller <b className="text-body">{rounds.filter((r) => r.who.kind !== 'self').length}</b>
                  </span>
                </>
              )}
            </div>
            {w && <span className={WEEK}>{thisWeek ? 'this week' : 'that week'} {w.interviews.done}{w.interviews.target ? ` of ${w.interviews.target} planned` : ''}</span>}
          </li>
          {rounds.length > 0 && (
            <li className="border-t-0 pb-2">
              <ul aria-label="Today's interviews" className="ml-7 divide-y divide-zinc-100 border-l-2 dark:divide-zinc-800 border-zinc-200 dark:border-zinc-700">
                {rounds.map((iv) => (
                  <TodayRound key={roundKey(iv)} iv={iv} now={now} tz={tz}>
                    {/* an old round with no id of its own can't be answered from here: the Interviews page handles it */}
                    {isToday && roundState(iv, now) === 'unmarked' && !!iv.roundId && (
                      <div className="mt-1.5 flex flex-wrap gap-2">{outcomeButtons(asNeedsInput(iv))}</div>
                    )}
                  </TodayRound>
                ))}
              </ul>
            </li>
          )}
          {followUps.map((row, i) => {
            const days = daysWithoutResult(row);
            return (
              <li key={needsInputKey(row)} className={LINE}>
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0"
                  aria-label={`I followed up with ${row.companyName || 'the company'}`}
                  // Stays ticked while it saves; a saved row leaves the list, a failed one comes back unticked.
                  checked={isSaving(row)}
                  disabled={isSaving(row) || !!userId}
                  onChange={() => followUp(row)}
                />
                <span className={NAME}>Follow up</span>
                <span className="min-w-0 flex-1 basis-52">
                  <b className="font-medium text-strong">{row.companyName || 'Untitled company'}</b> · {stageLabel(row.stage)}
                  <span className="text-muted"> · {days === null ? 'no result yet' : `no result for ${days} days`}</span>
                </span>
                {i === 0 && <span className="rounded-full border border-zinc-200 px-2 py-0.5 text-[11px] text-muted dark:border-zinc-700">{userId ? 'theirs to tick' : 'tick when you have followed up'}</span>}
              </li>
            );
          })}
          {daily.map(row)}
        </ul>
        {toGo === 0 && (
          <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
            <span aria-hidden>✓ </span>{userId ? 'All done for the day.' : "All done for today. You're good to go."}
          </p>
        )}
      </section>
      <section className="panel p-4">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-heading">{thisWeek ? 'This week' : 'Week'} · {monthDay(monday)} – {monthDay(addDays(monday, 4))}</h2>
          <span className="text-xs text-muted">
            {weekly.length > 0 && <b className="font-semibold text-body">{count(weekly)}</b>}{weekly.length > 0 && daysLeft && ' · '}{daysLeft}
          </span>
        </header>
        {w ? <WeekTable week={w} today={today} /> : week.error ? (
          <p className="mt-2 text-sm text-muted">
            Couldn&rsquo;t load this week. <button type="button" className="underline" onClick={() => week.mutate()}>Retry</button>
          </p>
        ) : week.isLoading && <div className="skeleton mt-3 h-24 w-full" />}
        {weekly.length > 0 && (
          <>
            <div className="mt-4 text-[11px] font-medium uppercase tracking-wider text-muted">
              <span>Weekly goals</span><span className="normal-case tracking-normal"> · {count(weekly)}</span>
            </div>
            <ul aria-label="Weekly goals" className="space-y-0.5">{weekly.map(row)}</ul>
          </>
        )}
      </section>
      {/* every open interview as it stands now, last on the page and folded (user, 2026-11-21) */}
      {open.length > 0 && (
        <section aria-label="Interview pipeline" className="panel p-4">
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="card-title">
              <button type="button" aria-expanded={pipelineOpen} onClick={() => setPipelineOpen(!pipelineOpen)}>
                <span aria-hidden>{pipelineOpen ? '▾ ' : '▸ '}</span>Interview pipeline <span className="text-xs font-normal text-muted">· {open.length} open</span>
              </button>
            </h2>
            <span className="text-xs text-muted">{pipelineLine}</span>
          </header>
          {pipelineOpen && <div className="mt-2"><PipelineTable items={open} /></div>}
        </section>
      )}
    </>
  );
}
