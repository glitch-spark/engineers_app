import { Fragment, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import useSWR, { useSWRConfig } from 'swr';
import * as api from '../../api/endpoints';
import type { DashboardWeek, PipelineItem, TodayInterview } from '../../api/endpoints';
import { formatInZone, parseServerTime, zonedDateKey } from '../../lib/interviewTimezone';
import { stageLabel } from '../../lib/stageBadge';
import { useInterviewTimezone } from '../../lib/useInterviewTimezone';
import { dayDate, dayLabel, mondayOf, monthDay } from '../../lib/week';
import { shortDay, useNeedsInputActions } from '../interview/useNeedsInputActions';
import { kept } from '../report/ItemRow';
import { weekdayShort } from './BidsDays';
import PendingItems, { usePending } from './PendingItems';
import RoutinesGrid from './RoutinesGrid';
import TodayRound, { asNeedsInput, roundKey, roundState, useNow } from './TodayRound';
import { useDayItems } from './useDayItems';

const LABEL = 'text-[11px] font-medium uppercase tracking-wider text-muted';
const AMBER = 'text-amber-700 dark:text-amber-400';
const BIG = 'text-2xl font-bold tabular-nums text-strong';
const TRACK = 'mt-1.5 flex h-2 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800';
const NONE: TodayInterview[] = [];
const TH = 'px-1.5 py-1 text-right text-[11px] font-normal normal-case tracking-normal text-muted first:pl-0 first:text-left';
const TD = 'whitespace-nowrap px-1.5 py-1.5 text-right tabular-nums';
const num = (n: number) => n.toLocaleString('en-US');
const count = (n: number, one: string) => `${num(n)} ${one}${n === 1 ? '' : 's'}`;
const PIPELINE_GROUPS: [PipelineItem['status'], string][] = [
  ['scheduled', 'Scheduled'], ['waiting', 'Waiting for a result'], ['no_result', 'No result for a week or more'],
  ['followed_up', 'Followed up'], ['passed', 'Passed, next round not set'],
];
/** Every read of this page (and of the owner's This month card below it); refetched together after a round's result is set. */
const PERSON_KEYS = ['team-today', 'person-day', 'person-week', 'person-pipeline', 'home-pending', 'interviews-needs-input', 'home-week', 'home-month-interviews'];
/** What shows a day's ticks summed up: this page's week, and the week behind the owner's This month card. */
const WEEK_KEYS = ['person-week', 'home-week'];

function Card({ title, summary, children }: { title: string; summary?: string; children: ReactNode }) {
  return (
    <section aria-label={title} data-section={title} className="panel scroll-mt-20 p-4">
      <header className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2">
        <h3 className="card-title">{title}</h3>
        {summary && <span className="text-xs text-muted">{summary}</span>}
      </header>
      {children}
    </section>
  );
}

/** One of the four numbers at the top. */
function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="panel min-w-0 px-4 py-3">
      <div className={LABEL}>{label}</div>
      {children}
    </div>
  );
}

/** A half's heading: what it is about on the left, its number on the right. */
function Sub({ title, children, className = '' }: { title: string; children?: ReactNode; className?: string }) {
  return (
    <div className={`mb-1.5 flex flex-wrap items-baseline justify-between gap-x-2 ${className}`}>
      <h4 className={LABEL}>{title}</h4>
      {children != null && children !== '' && <span className="text-xs font-semibold text-strong">{children}</span>}
    </div>
  );
}

function Failed({ what, retry }: { what: string; retry: () => unknown }) {
  return (
    <p className="text-sm text-muted">
      Couldn&rsquo;t load {what}. <button type="button" className="underline" onClick={() => retry()}>Retry</button>
    </p>
  );
}
const Loading = () => <div className="skeleton h-16 w-full" aria-busy="true" />;

/** `done / target`, amber (and said so) when under; just the number without a target. */
function Against({ done, target, head }: { done: number; target: number | null | undefined; head?: boolean }) {
  const under = !!target && done < target;
  return (
    <td className={`${TD} ${under ? AMBER : ''} ${head ? 'font-semibold' : ''}`}>
      {num(done)}{!!target && ` / ${num(target)}`}{under && <span className="sr-only">, under target</span>}
    </td>
  );
}

/** How far along a target: green once reached, amber under. */
function Meter({ label, value, target }: { label: string; value: number; target: number }) {
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round((value / target) * 100))} className={TRACK}>
      <div className={value >= target ? 'bg-success-500' : 'bg-amber-500'} style={{ width: `${Math.min(100, (value / target) * 100)}%` }} />
    </div>
  );
}

type Outcome = { n: number; short: string; name: string; color: string };
/** The week's held rounds by how they ended, as one stacked bar. */
function OutcomeBar({ parts }: { parts: Outcome[] }) {
  const total = parts.reduce((sum, p) => sum + p.n, 0);
  if (!total) return null;
  return (
    <div role="img" aria-label={parts.map((p) => `${p.n} ${p.name}`).join(', ')} className={TRACK}>
      {parts.map((p) => <div key={p.name} className={p.color} style={{ width: `${(p.n / total) * 100}%` }} />)}
    </div>
  );
}

/**
 * One bar per weekday with its number: green at or over the day's target, amber under, today's in blue, a dash for
 * a day still to come. Each bar is a button that picks its day and says the same in words. The dashed line marks
 * the daily target, drawn only when every day has the same one.
 */
function WeekBars({ days, today, picked, onPick }: { days: NonNullable<DashboardWeek['bids']['byDay']>; today: string; picked: string; onPick: (day: string) => void }) {
  const max = Math.max(1, ...days.flatMap((d) => [d.done, d.target ?? 0]));
  const height = (n: number) => `${(n / max) * 80}%`; // the rest of the height is room for the number above the bar
  const line = days.every((d) => !!d.target && d.target === days[0].target) ? days[0].target : null;
  return (
    <>
      <div role="group" aria-label="Bids by weekday" className="relative mt-1 flex h-28 items-stretch gap-2 border-b border-zinc-200 dark:border-zinc-700">
        {!!line && (
          <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-zinc-400 dark:border-zinc-500" style={{ bottom: height(line) }}>
            <span className="absolute -top-4 right-0 text-[10px] text-muted">target {num(line)} a day</span>
          </div>
        )}
        {days.map((d) => {
          const future = d.date > today;
          const isToday = d.date === today;
          const against = !d.target ? '' : d.done < d.target ? `, under the ${num(d.target)} target` : `, at or over the ${num(d.target)} target`;
          const color = isToday ? 'bg-sky-300 dark:bg-sky-700' : !d.target ? 'bg-zinc-300 dark:bg-zinc-600' : d.done < d.target ? 'bg-amber-500' : 'bg-success-500';
          return (
            <button
              key={d.date} type="button" disabled={future} aria-pressed={d.date === picked} onClick={() => onPick(d.date)}
              aria-label={future ? `${dayLabel(d.date)}: still to come` : `${dayLabel(d.date)}${isToday ? ', today' : ''}: ${count(d.done, 'bid')}${against} — show this day`}
              className={`flex min-w-0 flex-1 flex-col items-center justify-end rounded-t ${d.date === picked ? 'bg-zinc-100 dark:bg-zinc-800' : ''} ${future ? '' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
            >
              <span className={`text-[11px] tabular-nums ${future ? 'text-muted' : 'font-semibold text-strong'}`}>{future ? '–' : num(d.done)}</span>
              <span className={`block w-[70%] rounded-t ${color}`} style={{ height: future ? 0 : height(d.done) }} />
            </button>
          );
        })}
      </div>
      <div aria-hidden className="mt-1 flex gap-2 text-center text-[11px] text-muted">
        {days.map((d) => <span key={d.date} className="min-w-0 flex-1">{weekdayShort(d.date)}{d.date === today && ' · today'}</span>)}
      </div>
    </>
  );
}

/**
 * One person's Home page: four numbers, then their bids, interviews, daily to-dos, weekly goals and pending items.
 * `day` is the day picked in the filter bar: the day tile, the day halves of Bids and Interviews and the to-dos day
 * count follow it; the week tiles and halves, the to-dos grid and the weekly goals follow its week; the pipeline
 * and the pending items always show how things stand now. `today` is the real current date. `onPickDay`: a
 * weekday's bar or to-dos column head picks that day. Each read fails on its own: the other parts stay.
 *
 * `admin`: the admin's page for `userId` (`name`), read-only except the interview result buttons in Pending items.
 * `owner`: the signed-in person's own page (no `userId`: the server refuses one from a non-admin). They work from
 * it: today's to-dos are rows to tick above the week grid, the weekly goals can be ticked while this week shows,
 * a round of today that ended unmarked has its answer buttons, and follow-ups have their checkbox. A past day or
 * week is read-only for them too.
 */
const SECTIONS = ['Bids', 'Interviews', 'Daily to-dos', 'Weekly goals'];

export default function PersonPage({ mode, userId, name, day, today, onPickDay }: {
  mode: 'admin' | 'owner'; userId?: string; name?: string; day: string; today: string; onPickDay: (day: string) => void;
}) {
  const { tz } = useInterviewTimezone();
  const now = useNow();
  const root = useRef<HTMLDivElement>(null);
  const { mutate: globalMutate } = useSWRConfig();
  const isToday = day === today;
  const monday = mondayOf(day);
  const thisWeek = monday === mondayOf(today);
  const owner = mode === 'owner';
  const who = userId ?? '';
  // the owner types into today's rows: a refetch on focus must not run under them
  const dayRead = { revalidateOnFocus: !owner };
  const plan = useSWR(['person-day', day, who], () => api.getDayPlan(day, userId), dayRead);
  // today: its rounds for the pending items whatever day is picked, and the owner's rows to tick (the same read as
  // above when the day is today)
  const nowPlan = useSWR(['person-day', today, who], () => api.getDayPlan(today, userId), dayRead);
  // Keyed by the week, so another day of a past week is not read again; the server takes any date of the week.
  const week = useSWR(
    ['person-week', today, who, ...(thisWeek ? [] : [monday])],
    () => api.getDashboardWeek({ ...(userId ? { userId } : {}), today, ...(thisWeek ? {} : { weekOf: day }) }),
  );
  const pipeline = useSWR(['person-pipeline', who], () => api.getInterviewPipeline(userId));
  const todayRounds = nowPlan.data?.todayInterviews ?? NONE;
  // The owner answers today's unmarked rounds in the day's list when it shows today; otherwise they wait in Pending.
  const listToday = !(owner && isToday);
  const pend = usePending(mode, userId, todayRounds, listToday);
  // pipeline groups folded by the admin; all but Scheduled start folded
  const [folded, setFolded] = useState<Set<PipelineItem['status']>>(() => new Set(['waiting', 'no_result', 'followed_up', 'passed']));
  const refresh = () => globalMutate((key) => Array.isArray(key) && PERSON_KEYS.includes(key[0]));
  const { dialog, outcomeButtons } = useNeedsInputActions(refresh);
  const items = useDayItems({
    today, plan: nowPlan.data, mutate: nowPlan.mutate,
    onSaved: () => globalMutate((key) => Array.isArray(key) && WEEK_KEYS.includes(key[0])),
  });

  const on = isToday ? 'today' : `on ${dayLabel(day)}`;
  const dayHead = isToday ? 'Today' : dayLabel(day);
  const inWeek = thisWeek ? 'this week' : `in the week of ${monthDay(monday)}`;
  const weekHead = thisWeek ? 'This week' : `Week of ${monthDay(monday)}`;
  const dow = dayDate(today).getDay(); // 1 = Mon .. 5 = Fri
  const weekRuns = thisWeek && dow >= 1 && dow <= 5; // a past week, or the weekend after this one, is over
  // What the owner can change: today's to-dos (on a weekend the week just ended shows, with today's rows still
  // above its grid) and the goals of the week that is running.
  const editToday = owner && (isToday || (thisWeek && !weekRuns));
  const editGoals = owner && thisWeek;
  const t = nowPlan.data;
  const todayFailed = !!nowPlan.error && !t;
  const d = plan.data;
  const w = week.data;
  const dayFailed = !!plan.error && !d;
  const weekFailed = !!week.error && !w;
  const dayGone = <Failed what="the day" retry={plan.mutate} />;
  const weekGone = <Failed what="the week" retry={week.mutate} />;

  // ---- Bids
  const totals = d && (d.bidsTotals ?? {
    self: d.done.bidsSelf, selfTarget: d.targets.bidsSelf || null, bidder: d.bidsBidderAuto, bidderTarget: d.targets.bidsBidder || null,
    total: d.done.bidsSelf + d.bidsBidderAuto, target: d.targets.bidsSelf + d.targets.bidsBidder || null,
  });
  const dayTarget = totals?.target || null;
  const dayLine = totals && [
    dayTarget && (totals.total >= dayTarget ? 'target reached' : `${num(dayTarget - totals.total)} ${isToday ? 'to go' : 'short'}`),
    `self ${num(totals.self)}`, `bidder ${num(totals.bidder)}`,
  ].filter(Boolean).join(' · ');
  const of = (done: number, target: number | null) => `${num(done)}${target ? ` of ${num(target)}` : ''}`;
  const regions = d?.bidsByRegion ?? [];
  // Mon–Fri when the server sends it: the older total also counts weekend bids
  const weekBids = w && (w.bids.week ?? { total: w.bids.total, target: w.bids.target });
  const weekTarget = weekBids?.target || null;
  const daysLeft = dow === 5 ? 'last day of the week' : `${6 - dow} days left`;
  const weekLine = weekBids && [
    weekTarget && (weekBids.total >= weekTarget ? 'target reached' : `${num(weekTarget - weekBids.total)} ${weekRuns ? 'to go' : 'short'}`),
    weekRuns && daysLeft,
  ].filter(Boolean).join(' · ');

  // ---- Interviews
  const rounds = d?.todayInterviews;
  const unmarked = (rounds ?? []).filter((r) => roundState(r, now) === 'unmarked').length;
  const o = w?.interviews.outcomes;
  const outcomes: Outcome[] = !o ? [] : [
    { n: o.passed, short: 'passed', name: 'passed', color: 'bg-success-500' },
    { n: o.rejected, short: 'rejected', name: 'rejected', color: 'bg-red-500' },
    { n: o.noAnswer, short: 'no answer', name: 'no answer', color: 'bg-zinc-400 dark:bg-zinc-500' },
    { n: o.waiting, short: 'waiting', name: 'waiting for a result', color: 'bg-sky-300 dark:bg-sky-700' },
  ].filter((p) => p.n > 0);
  const ivDays = w?.interviews.byDay;
  // A day before today that still has rounds "not held yet": they ended and nobody marked them.
  const stale = (ivDays ?? []).filter((x) => x.date < today).reduce((sum, x) => sum + x.scheduled, 0);
  const toCome = ivDays ? ivDays.filter((x) => x.date >= today).reduce((sum, x) => sum + x.scheduled, 0) : o?.scheduled ?? 0;
  const weekOver = !!ivDays?.length && ivDays.every((x) => x.date < today);
  const held = o?.held ?? w?.interviews.done ?? 0;
  const sum = (key: 'held' | 'canceled') => (ivDays ?? []).reduce((total, x) => total + x[key], 0);
  const notMarked = (n: number, where: string) => <td aria-label={`${where}: ${n} not marked`} className={`${TD} ${AMBER}`}>{n} not marked</td>;
  const open = pipeline.data?.items;
  const todayKey = zonedDateKey(new Date(now), tz);
  const when = (p: PipelineItem) => {
    const at = parseServerTime(p.at);
    if (isNaN(at.getTime())) return '—';
    if (zonedDateKey(at, tz) === todayKey) return p.upcoming ? `today ${formatInZone(at, tz, { hour: 'numeric', minute: '2-digit' })}` : 'today';
    return p.upcoming ? formatInZone(at, tz, { weekday: 'short', month: 'short', day: 'numeric' }) : shortDay(p.at, tz);
  };
  const status = (p: PipelineItem): [string, boolean] => {
    switch (p.status) {
      case 'scheduled': return ['scheduled', false];
      case 'waiting': return ['waiting for a result', false];
      case 'no_result': return [p.days != null ? `no result for ${p.days} days` : 'no result yet', true];
      case 'followed_up': {
        const day = shortDay(p.followedUpAt, tz);
        return [`followed up${day ? ` ${day}` : ''}`, true];
      }
      default: return ['passed, next round not set', false];
    }
  };

  // ---- Daily to-dos and weekly goals
  const routines = (d?.items ?? []).filter((i) => kept(i) && i.scope === 'routine');
  const todayRoutines = (t?.items ?? []).filter((i) => kept(i) && i.scope === 'routine');
  const todosSummary = [
    // the owner's unsaved ticks count at once
    owner && isToday ? t && todayRoutines.length > 0 && `${todayRoutines.filter(items.isDone).length} of ${todayRoutines.length} today`
      : d && routines.length > 0 && `${routines.filter((i) => i.result?.done).length} of ${routines.length} ${on}`,
    w && `${w.routines.done} of ${w.routines.expected} ${inWeek}`,
  ].filter(Boolean).join(' · ');
  // The owner ticks this week's goals on today's plan; otherwise they are read from the picked day's plan.
  const goalsPlan = editGoals ? t : d;
  const goalsFailed = editGoals ? todayFailed : dayFailed;
  const goalItems = (goalsPlan?.items ?? []).filter((i) => kept(i) && i.scope === 'goal');
  const goals = goalItems.map((i) => {
    const p = goalsPlan?.progress[i.id];
    return { id: i.id, text: i.text, kind: i.kind, done: p?.done ?? i.result?.done ?? false, value: p?.value ?? 0, target: p?.target ?? i.target, doneOn: p?.doneOn };
  });
  const left = !weekRuns ? '' : dow === 5 ? 'last day' : `${6 - dow} days left`;
  const goalsDone = editGoals ? goalItems.filter(items.isDone).length : goals.filter((g) => g.done).length;
  const goalsSummary = goalsPlan ? [`${goalsDone} of ${goals.length} done`, left].filter(Boolean).join(' · ') : undefined;

  // ---- Pending
  const ended = pend.rows.filter((r) => r.row.need === 'outcome').length;
  const pendingParts = [
    pend.rows.length > 0 && count(pend.rows.length, 'interview'),
    pend.profiles.length > 0 && count(pend.profiles.length, 'profile'),
    pend.bidders.length > 0 && count(pend.bidders.length, 'bidder'),
  ].filter(Boolean).join(' · ');

  /** Scrolls a section into view and moves focus to its heading. */
  const pendingLink = pend.total > 0 ? ['Pending'] : [];
  // Always as of now: today's unmarked rounds count as "ended today" whatever day is picked. On a person's own Home
  // the things waiting on them come first, above Bids; on the admin's page they close it (user, 2026-11-21).
  const pendingBlock = (
    <div data-section="Pending" className="scroll-mt-20">
      <PendingItems mode={mode} userId={userId} name={name} today={todayRounds} listToday={listToday} onSaved={refresh} />
    </div>
  );
  const jump = (section: string) => {
    const el = root.current?.querySelector<HTMLElement>(`[data-section="${section}"]`);
    const heading = el?.querySelector<HTMLElement>('h3');
    if (!el || !heading) return;
    if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'start' }); // jsdom has none
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  };

  return (
    <div ref={root} className="space-y-4">
      {dialog}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label={isToday ? 'Bids today' : `Bids on ${dayLabel(day)}`}>
          {dayFailed ? dayGone : !totals ? <Loading /> : (
            <>
              <p><span className={BIG}>{num(totals.total)}</span>{!!dayTarget && <span className="text-sm text-muted"> of {num(dayTarget)}</span>}</p>
              {!!dayTarget && <Meter label={isToday ? 'Bids today' : `Bids on ${dayLabel(day)}`} value={totals.total} target={dayTarget} />}
              <p className="mt-1 text-xs text-muted">{dayLine}</p>
            </>
          )}
        </Tile>
        <Tile label={`Bids ${inWeek}`}>
          {weekFailed ? weekGone : !weekBids ? <Loading /> : (
            <>
              <p><span className={BIG}>{num(weekBids.total)}</span>{!!weekTarget && <span className="text-sm text-muted"> of {num(weekTarget)}</span>}</p>
              {!!weekTarget && <Meter label={`Bids ${inWeek}`} value={weekBids.total} target={weekTarget} />}
              {weekLine && <p className="mt-1 text-xs text-muted">{weekLine}</p>}
            </>
          )}
        </Tile>
        <Tile label={`Interviews ${inWeek}`}>
          {weekFailed ? weekGone : !w ? <Loading /> : (
            <>
              <p>
                <span className={BIG}>{num(held)}</span>
                <span className="text-sm text-muted"> held{o && ` · ${num(toCome)} still to come`}</span>
              </p>
              <OutcomeBar parts={outcomes} />
              {o && (outcomes.length > 0 || o.canceled > 0) && (
                <p className="mt-1 text-xs text-muted">
                  {[...outcomes.map((p) => `${p.n} ${p.short}`), o.canceled > 0 && `${o.canceled} canceled`].filter(Boolean).join(' · ')}
                </p>
              )}
            </>
          )}
        </Tile>
        <Tile label="Pending">
          {pend.failed ? <Failed what="the pending items" retry={pend.retry} /> : pend.loading ? <Loading /> : (
            <>
              <p><span className={BIG}>{num(pend.total)}</span></p>
              {pendingParts && <p className="mt-1 text-xs text-muted">{pendingParts}</p>}
              {ended > 0 && (
                <p className="text-xs font-semibold text-red-700 dark:text-red-400">
                  {ended === 1 ? "1 interview ended and isn't marked" : `${num(ended)} interviews ended and aren't marked`}
                </p>
              )}
            </>
          )}
        </Tile>
      </div>

      <nav aria-label="Sections" className="flex flex-wrap gap-1.5">
        {(mode === 'owner' ? [...pendingLink, ...SECTIONS] : [...SECTIONS, ...pendingLink]).map((s) => (
          <button
            key={s} type="button" onClick={() => jump(s)}
            className="rounded-full border border-zinc-200 bg-white px-3 py-0.5 text-xs text-body hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          >
            {s}{s === 'Pending' && <b className="font-semibold text-red-700 dark:text-red-400"> {num(pend.total)}</b>}
          </button>
        ))}
      </nav>

      {mode === 'owner' && pendingBlock}

      <Card title="Bids">
        <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
          <div className="min-w-0">
            <Sub title={dayHead}>{totals && of(totals.total, dayTarget)}</Sub>
            {dayFailed ? dayGone : !d ? <Loading /> : regions.length > 0 && totals && (
              <div className="overflow-x-auto">
                <table aria-label="Bids by region" className="w-full border-collapse text-sm">
                  <thead>
                    <tr>{['Region', 'Self', 'Bidder', 'Total'].map((h) => <th key={h} scope="col" className={TH}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {regions.map((r) => (
                      <tr key={r.region} className="border-t border-zinc-100 dark:border-zinc-800">
                        <th scope="row" className="py-1.5 text-left font-normal text-body">{r.region}</th>
                        <Against done={r.self} target={r.selfTarget} />
                        <td className={TD}>{num(r.bidder)}</td>
                        <td className={TD}>{num(r.total)}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-zinc-200 dark:border-zinc-700">
                      <th scope="row" className="py-1.5 text-left font-semibold text-strong">All</th>
                      <Against head done={totals.self} target={totals.selfTarget} />
                      <Against head done={totals.bidder} target={totals.bidderTarget} />
                      <Against head done={totals.total} target={totals.target} />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="min-w-0">
            <Sub title={weekHead}>{weekBids && of(weekBids.total, weekTarget)}</Sub>
            {weekFailed ? weekGone : !w ? <Loading /> : (
              <>
                {!!w.bids.byDay?.length && <WeekBars days={w.bids.byDay} today={today} picked={day} onPick={onPickDay} />}
                {w.bids.week && (
                  <div className="mt-2 overflow-x-auto">
                    <table aria-label={`Bids ${inWeek}`} className="w-full border-collapse text-sm">
                      <thead>
                        <tr>{[weekHead, 'Self', 'Bidder', 'Total'].map((h) => <th key={h} scope="col" className={TH}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        <tr className="border-t border-zinc-200 dark:border-zinc-700">
                          <th scope="row" className="py-1.5 text-left font-semibold text-strong">All regions</th>
                          <Against head done={w.bids.week.self} target={w.bids.week.selfTarget} />
                          <Against head done={w.bids.week.bidder} target={w.bids.week.bidderTarget} />
                          <Against head done={w.bids.week.total} target={w.bids.week.target} />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </Card>

      <Card title="Interviews">
        <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
          <div className="min-w-0">
            <Sub title={dayHead}>{rounds && `${count(rounds.length, 'round')} · ${unmarked} not marked`}</Sub>
            {dayFailed ? dayGone : !d ? <Loading /> : rounds && (rounds.length === 0 ? <p className="py-1 text-sm text-muted">None {on}.</p> : (
              <ul aria-label={isToday ? "Today's interviews" : `Interviews on ${dayLabel(day)}`} className="border-l-2 border-zinc-200 dark:border-zinc-700">
                {rounds.map((iv) => (
                  <TodayRound key={roundKey(iv)} iv={iv} now={now} tz={tz}>
                    {/* the owner answers a round of today that ended unmarked; an old round with no id of its own can't be answered from here */}
                    {owner && isToday && roundState(iv, now) === 'unmarked' && !!iv.roundId && (
                      <div className="mt-1.5 flex flex-wrap gap-2">{outcomeButtons(asNeedsInput(iv))}</div>
                    )}
                  </TodayRound>
                ))}
              </ul>
            ))}
          </div>
          <div className="min-w-0">
            <Sub title={weekHead}>
              {w && [`${num(held)} held`, o && !weekOver && `${num(toCome)} to come`, stale > 0 && `${num(stale)} not marked`].filter(Boolean).join(' · ')}
            </Sub>
            {weekFailed ? weekGone : !w ? <Loading /> : (
              <>
                {!!ivDays?.length && (
                  <div className="overflow-x-auto">
                    <table aria-label="Interviews by weekday" className="w-full border-collapse text-sm">
                      <thead>
                        <tr>
                          <th scope="col" className={TH}><span className="sr-only">What</span></th>
                          {ivDays.map((x) => <th key={x.date} scope="col" className={TH}>{weekdayShort(x.date)}</th>)}
                          <th scope="col" className={TH}>Week</th>
                        </tr>
                      </thead>
                      <tbody>
                        {([['Held', 'held'], ['Canceled', 'canceled']] as const).map(([label, key]) => (
                          <tr key={key} className="border-t border-zinc-100 dark:border-zinc-800">
                            <th scope="row" className="py-1.5 text-left font-normal text-body">{label}</th>
                            {ivDays.map((x) => <td key={x.date} className={TD}>{num(x[key])}</td>)}
                            <td className={`${TD} font-semibold`}>{num(sum(key))}</td>
                          </tr>
                        ))}
                        <tr className="border-t border-zinc-100 dark:border-zinc-800">
                          <th scope="row" className="whitespace-nowrap py-1.5 text-left font-normal text-body">Still to come</th>
                          {ivDays.map((x) => (x.date >= today
                            ? <td key={x.date} className={TD}>{num(x.scheduled)}</td>
                            : x.scheduled > 0 ? <Fragment key={x.date}>{notMarked(x.scheduled, weekdayShort(x.date))}</Fragment>
                              : <td key={x.date} className={`${TD} text-muted`}>–</td>))}
                          {!weekOver ? <td className={`${TD} font-semibold`}>{num(toCome)}</td>
                            : stale > 0 ? notMarked(stale, 'Week') : <td className={`${TD} text-muted`}>–</td>}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
                {outcomes.length > 0 && (
                  <>
                    <OutcomeBar parts={outcomes} />
                    <ul aria-label="Outcomes" className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-body">
                      {outcomes.map((p) => (
                        <li key={p.name} className="inline-flex items-center gap-1"><span aria-hidden className={`h-2 w-2 rounded-sm ${p.color}`} />{p.n} {p.name}</li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <Sub title="Pipeline" className="mt-4">{open && count(open.length, 'open interview')}</Sub>
        {pipeline.error && !open ? <Failed what="the pipeline" retry={pipeline.mutate} /> : !open ? <Loading />
          : open.length === 0 ? <p className="py-1 text-sm text-muted">Nothing in the pipeline.</p> : (
            <div className="overflow-x-auto">
              <table aria-label="Pipeline" className="w-full border-collapse text-sm">
                <thead>
                  <tr>{['Company', 'Stage', 'Next / last round', 'Status'].map((h) => <th key={h} scope="col" className={TH}>{h}</th>)}</tr>
                </thead>
                {/* grouped by where each interview stands; a group's heading folds it (user, 2026-11-21) */}
                {PIPELINE_GROUPS.map(([key, label]) => {
                  const rows = open.filter((p) => p.status === key);
                  if (rows.length === 0) return null;
                  const shown = !folded.has(key);
                  return (
                    <tbody key={key}>
                      <tr className="border-t border-zinc-200 dark:border-zinc-700">
                        <td colSpan={4} className="bg-zinc-50 px-1 py-1 dark:bg-zinc-900">
                          <button
                            type="button" aria-expanded={shown} className="w-full text-left text-xs font-semibold text-body"
                            onClick={() => setFolded((f) => { const n = new Set(f); if (n.has(key)) n.delete(key); else n.add(key); return n; })}
                          >
                            <span aria-hidden>{shown ? '▾ ' : '▸ '}</span>{label} ({rows.length})
                          </button>
                        </td>
                      </tr>
                      {shown && rows.map((p) => {
                        const [text, due] = status(p);
                        return (
                          <tr key={p.interviewId} className="border-t border-zinc-100 dark:border-zinc-800">
                            <th scope="row" className="py-1.5 pl-4 pr-2 text-left font-normal text-body">{p.companyName || 'Untitled company'}</th>
                            <td className={TD}>{stageLabel(p.stage)}</td>
                            <td className={TD}>{when(p)}</td>
                            <td className={`${TD} ${due ? AMBER : ''}`}>{text}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  );
                })}
              </table>
            </div>
          )}
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="min-w-0">
          <Card title="Daily to-dos" summary={todosSummary || undefined}>
            {editToday && (todayFailed ? <div className="mb-3"><Failed what="the day" retry={nowPlan.mutate} /></div> : !t ? <div className="mb-3"><Loading /></div> : (
              <>
                {items.disabled && (
                  <p className="mb-2 text-sm text-muted">
                    No plan for this week yet — <Link to="/plans" className="underline">Set this week&apos;s plan</Link>
                  </p>
                )}
                {todayRoutines.length > 0 && (
                  <>
                    <Sub title="Today" />
                    <ul aria-label="Daily" className="mb-4 space-y-0.5">{todayRoutines.map(items.row)}</ul>
                  </>
                )}
              </>
            ))}
            {weekFailed ? weekGone : !w ? <Loading />
              : w.routines.rows?.length ? <RoutinesGrid rows={w.routines.rows} today={today} onPickDay={onPickDay} />
                : <p className="text-sm text-muted">No daily to-dos {inWeek}.</p>}
          </Card>
        </div>
        <div className="min-w-0">
          <Card title="Weekly goals" summary={goalsSummary}>
            {goalsFailed ? <Failed what="the day" retry={editGoals ? nowPlan.mutate : plan.mutate} /> : !goalsPlan ? <Loading />
              : goals.length === 0 ? <p className="text-sm text-muted">No weekly goals.</p>
              : editGoals ? <ul className="space-y-0.5">{goalItems.map(items.row)}</ul> : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {goals.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm text-body">
                    <input type="checkbox" className="h-4 w-4 shrink-0" aria-label={g.text} checked={g.done} disabled readOnly />
                    <span className={`min-w-0 flex-1 ${g.done ? 'text-muted line-through' : ''}`}>{g.text}</span>
                    {g.kind !== 'check' ? (
                      <>
                        <span className="text-xs tabular-nums text-muted">{num(g.value)}{g.target ? ` / ${num(g.target)}` : ''}</span>
                        {!!g.target && (
                          <span
                            role="progressbar"
                            aria-label={`${g.text} this week`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.min(100, Math.round((g.value / g.target) * 100))}
                            className="h-1.5 w-20 shrink-0 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800"
                          >
                            <span className={`block h-full ${g.done ? 'bg-success-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, (g.value / g.target) * 100)}%` }} />
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-muted">{g.done ? `done${g.doneOn ? ` ${weekdayShort(g.doneOn)}` : ''}` : 'not yet'}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {mode !== 'owner' && pendingBlock}
    </div>
  );
}
