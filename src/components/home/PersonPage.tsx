import { useState, type ReactNode } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import * as api from '../../api/endpoints';
import type { PipelineItem } from '../../api/endpoints';
import { formatInZone, parseServerTime, zonedDateKey } from '../../lib/interviewTimezone';
import { stageLabel } from '../../lib/stageBadge';
import { useInterviewTimezone } from '../../lib/useInterviewTimezone';
import { shortDay } from '../interview/useNeedsInputActions';
import { kept } from '../report/ItemRow';
import BidsDays, { weekdayShort } from './BidsDays';
import PendingItems from './PendingItems';
import RoutinesGrid from './RoutinesGrid';
import TodayRound, { roundKey, roundState, useNow } from './TodayRound';

const LABEL = 'text-[11px] font-medium uppercase tracking-wider text-muted';
const AMBER = 'text-amber-700 dark:text-amber-400';
const TH = 'px-1.5 py-1 text-right text-[11px] font-normal normal-case tracking-normal text-muted first:pl-0 first:text-left';
const TD = 'whitespace-nowrap px-1.5 py-1.5 text-right tabular-nums';
const num = (n: number) => n.toLocaleString('en-US');
/** Every read of this page; refetched together after an admin sets a round's result. */
const PIPELINE_GROUPS: [PipelineItem['status'], string][] = [
  ['scheduled', 'Scheduled'], ['waiting', 'Waiting for a result'], ['no_result', 'No result for a week or more'],
  ['followed_up', 'Followed up'], ['passed', 'Passed, next round not set'],
];
const PERSON_KEYS = ['team-today', 'person-day', 'person-week', 'person-pipeline', 'home-pending', 'interviews-needs-input'];

function Card({ title, summary, children }: { title: string; summary?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="panel p-4">
      <header className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2">
        <h3 className="card-title">{title}</h3>
        {summary && <span className="text-xs text-muted">{summary}</span>}
      </header>
      {children}
    </section>
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

/**
 * The admin's page for one person: their bids, interviews, daily to-dos, weekly goals and pending items. `day` is
 * the day shown (today or yesterday) for the bids table, the rounds and the to-dos summary; the week, the pipeline
 * and the pending items are always as of now. Read-only, except the interview result buttons in Pending items.
 * Each read fails on its own: the other sections stay.
 */
export default function PersonPage({ userId, name, day, today }: { userId: string; name: string; day: string; today: string }) {
  const { tz } = useInterviewTimezone();
  const now = useNow();
  const { mutate: globalMutate } = useSWRConfig();
  const plan = useSWR(['person-day', day, userId], () => api.getDayPlan(day, userId));
  const week = useSWR(['person-week', today, userId], () => api.getDashboardWeek({ userId, today }));
  const pipeline = useSWR(['person-pipeline', userId], () => api.getInterviewPipeline(userId));
  // pipeline groups folded by the admin; all but Scheduled start folded
  const [folded, setFolded] = useState<Set<PipelineItem['status']>>(() => new Set(['waiting', 'no_result', 'followed_up', 'passed']));
  const refresh = () => globalMutate((key) => Array.isArray(key) && PERSON_KEYS.includes(key[0]));

  const isToday = day === today;
  const dayWord = isToday ? 'today' : 'yesterday';
  const d = plan.data;
  const w = week.data;
  const dayFailed = !!plan.error && !d;
  const weekFailed = !!week.error && !w;

  // ---- Bids
  const totals = d && (d.bidsTotals ?? {
    self: d.done.bidsSelf, selfTarget: d.targets.bidsSelf || null, bidder: d.bidsBidderAuto, bidderTarget: d.targets.bidsBidder || null,
    total: d.done.bidsSelf + d.bidsBidderAuto, target: d.targets.bidsSelf + d.targets.bidsBidder || null,
  });
  const toGo = totals?.target ? totals.target - totals.total : 0;
  const bidsSummary = totals
    ? `${num(totals.total)}${totals.target ? ` of ${num(totals.target)}` : ''} ${dayWord}${isToday && toGo > 0 ? ` · ${num(toGo)} to go` : ''}`
    : undefined;
  const regions = d?.bidsByRegion ?? [];
  const weekTarget = w?.bids.target != null && w.bids.target > 0 ? w.bids.target : null;

  // ---- Interviews
  const rounds = d?.todayInterviews;
  const unmarked = (rounds ?? []).filter((r) => roundState(r, now) === 'unmarked').length;
  const open = pipeline.data?.items;
  const interviewsSummary = [
    rounds && `${rounds.length} ${dayWord}`,
    rounds && `${unmarked} not marked`,
    open && `${open.length} in pipeline`,
  ].filter(Boolean).join(' · ');
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
        const on = shortDay(p.followedUpAt, tz);
        return [`followed up${on ? ` ${on}` : ''}`, true];
      }
      default: return ['passed, next round not set', false];
    }
  };

  // ---- Daily to-dos and weekly goals
  const routines = (d?.items ?? []).filter((i) => kept(i) && i.scope === 'routine');
  const todosSummary = [
    w && `${w.routines.done} of ${w.routines.expected} this week`,
    d && routines.length > 0 && `${routines.filter((i) => i.result?.done).length} of ${routines.length} ${dayWord}`,
  ].filter(Boolean).join(' · ');
  const goals = (d?.items ?? []).filter((i) => kept(i) && i.scope === 'goal').map((i) => {
    const p = d?.progress[i.id];
    return { id: i.id, text: i.text, kind: i.kind, done: p?.done ?? i.result?.done ?? false, value: p?.value ?? 0, target: p?.target ?? i.target, doneOn: p?.doneOn };
  });
  const [y, m, dd] = today.split('-').map(Number);
  const dow = new Date(y, m - 1, dd).getDay(); // 1 = Mon .. 5 = Fri
  const left = dow === 5 ? 'last day' : dow >= 1 && dow <= 4 ? `${6 - dow} days left` : '';
  const goalsSummary = d ? [`${goals.filter((g) => g.done).length} of ${goals.length} done`, left].filter(Boolean).join(' · ') : undefined;

  return (
    <div className="space-y-4">
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <Card title="Bids" summary={bidsSummary}>
            {dayFailed ? <Failed what="the day" retry={plan.mutate} /> : !d ? <Loading /> : regions.length > 0 && totals && (
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
            {w && (
              <>
                <div className={`mt-3 ${LABEL}`}>This week · {num(w.bids.total)}{weekTarget ? ` of ${num(weekTarget)}` : ''}</div>
                <BidsDays days={w.bids.byDay ?? []} today={today} />
              </>
            )}
          </Card>

          <Card title="Interviews" summary={interviewsSummary || undefined}>
            {!dayFailed && !d && <Loading />}
            {rounds && (
              <>
                <div className={LABEL}>{isToday ? 'Today' : 'Yesterday'}</div>
                {rounds.length === 0 ? <p className="py-1 text-sm text-muted">None {dayWord}.</p> : (
                  <ul aria-label={`${isToday ? 'Today' : 'Yesterday'}'s interviews`} className="border-l-2 border-zinc-200 dark:border-zinc-700">
                    {rounds.map((iv) => <TodayRound key={roundKey(iv)} iv={iv} now={now} tz={tz} />)}
                  </ul>
                )}
              </>
            )}
            {pipeline.error && !open ? <div className="mt-3"><Failed what="the pipeline" retry={pipeline.mutate} /></div> : open && (
              <>
                <div className={`mt-3 ${LABEL}`}>In pipeline ({open.length})</div>
                {open.length === 0 ? <p className="py-1 text-sm text-muted">Nothing in the pipeline.</p> : (
                  <div className="overflow-x-auto">
                    <table aria-label="In pipeline" className="w-full border-collapse text-sm">
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
              </>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card title="Daily to-dos" summary={todosSummary || undefined}>
            {weekFailed ? <Failed what="the week" retry={week.mutate} /> : !w ? <Loading />
              : w.routines.rows?.length ? <RoutinesGrid rows={w.routines.rows} today={today} />
                : <p className="text-sm text-muted">No daily to-dos this week.</p>}
          </Card>

          <Card title="Weekly goals" summary={goalsSummary}>
            {dayFailed ? <Failed what="the day" retry={plan.mutate} /> : !d ? <Loading /> : goals.length === 0 ? <p className="text-sm text-muted">No weekly goals.</p> : (
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

      {/* Rounds of the day shown count as "ended today" only when that day is today. */}
      <PendingItems mode="admin" userId={userId} name={name} today={isToday ? rounds ?? [] : []} onSaved={refresh} />
    </div>
  );
}
