import { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, Circle, Lock, Target } from 'lucide-react';
import { hasTarget } from '../../api/endpoints';
import type { DashboardRoutineRow, PlanItem, WeekPlan } from '../../api/endpoints';
import { preSplitSelf, selfRegionsTotal, SELF_REGIONS } from '../../lib/reportWeek';
import { dayDate, weekdayShort } from '../../lib/week';
import { dayCell } from '../home/WeekTable';

const MINE = <span className="ml-1.5 rounded bg-accent-50 px-1 text-[10px] font-bold text-accent-700 dark:bg-accent-900/30 dark:text-accent-300">MINE</span>;
const unit = (i: PlanItem) => (i.kind === 'hours' ? 'h' : '');

/** A target against its pace: where it should be by the end of `elapsed` of `total` days (null: not this week). */
function TargetRow({ label, done, goal, pace }: { label: string; done: number; goal: number; pace: number | null }) {
  const met = done >= goal;
  const expected = pace == null ? null : Math.ceil(goal * pace);
  const status = met ? '✓ done' : expected == null ? `${goal - done} to go` : done >= expected ? 'on pace' : `${expected - done} behind`;
  const tone = met || status === 'on pace' ? 'text-success-700 dark:text-success-400' : expected != null ? 'text-amber-600 dark:text-amber-400' : 'text-muted';
  return (
    <div className="grid grid-cols-[8.5rem_1fr_6rem] items-center gap-3 py-1.5">
      <span className="truncate text-sm text-body">{label}</span>
      <div
        className="relative h-2 rounded-full bg-zinc-100 dark:bg-zinc-800"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={goal}
        aria-valuenow={done}
        aria-valuetext={`${done} of ${goal}`}
      >
        <div className={`h-full rounded-full ${met ? 'bg-success-500' : 'bg-accent-500'}`} style={{ width: `${Math.min(100, (done / goal) * 100)}%` }} />
        {pace != null && !met && (
          <span className="absolute -top-1 h-4 w-0.5 bg-zinc-700 opacity-50 dark:bg-zinc-300" style={{ left: `${Math.min(100, pace * 100)}%` }} aria-hidden />
        )}
      </div>
      <span className="text-right text-xs leading-tight">
        <span className="font-semibold tabular-nums text-strong">{done} / {goal}</span>
        <span className={`block font-medium ${tone}`}>{status}</span>
      </span>
    </div>
  );
}

/** The routines × days of the week, coloured as Home's table. */
function RoutineGrid({ rows, mine, today }: { rows: DashboardRoutineRow[]; mine: Set<string>; today: string }) {
  const dates = rows[0]?.days.map((d) => d.date) ?? [];
  const TH = 'px-1.5 py-1 text-center text-[11px] font-medium text-muted';
  return (
    <div className="overflow-x-auto">
      <table aria-label="Routines by day" className="w-full min-w-[30rem] border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" className={`${TH} text-left`}><span className="sr-only">Routine</span></th>
            {dates.map((date) => (
              <th key={date} scope="col" className={`${TH} ${date === today ? 'bg-zinc-50 dark:bg-zinc-900' : ''}`}>
                {weekdayShort(date)} {dayDate(date).getDate()}
              </th>
            ))}
            <th scope="col" className={TH}>Days</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-zinc-100 dark:border-zinc-800">
              <th scope="row" className="py-1.5 pr-2 text-left font-normal text-body">{row.text}{mine.has(row.id) && MINE}</th>
              {row.days.map((d) => {
                const [text, name, color] = dayCell(d);
                return (
                  <td key={d.date} aria-label={`${weekdayShort(d.date)}: ${name}`} className={`px-1.5 py-1.5 text-center tabular-nums ${color} ${d.date === today ? 'bg-zinc-50 dark:bg-zinc-900' : ''}`}>
                    {text}
                  </td>
                );
              })}
              <td className="px-1.5 py-1.5 text-center tabular-nums text-muted">{row.doneDays}/{row.totalDays}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The week plan, today first: today's bar and checklist (this week only), the routines by day (folded this week),
 * weekly goals as compact rows, then the set targets against their pace and the recap. `adminEdit`: an admin
 * viewing a person (the board is read-only, but the Week panel opens editable). Ticking happens in the day's
 * standup: the checklist rows open today.
 */
export default function WeekGoalCard({
  week,
  canEdit: ownerEdit,
  adminEdit = false,
  today,
  onOpen,
  onOpenDay,
}: {
  week: WeekPlan;
  canEdit: boolean;
  adminEdit?: boolean;
  today: string;
  onOpen: () => void;
  onOpenDay: (date: string) => void;
}) {
  const canEdit = ownerEdit || adminEdit;
  const [gridOpen, setGridOpen] = useState(false);
  const { goal, done } = week;
  const routines = week.routines.filter((i) => !i.archived);
  const goals = week.weeklyGoals.filter((i) => !i.archived);
  const mine = new Set([...routines, ...goals].filter((i) => i.addedBy === 'self').map((i) => i.id));
  const grid = week.routineDays ?? [];
  const todayCells = new Map(grid.map((r) => [r.id, r.days.find((d) => d.date === today)]));
  const day = week.days.find((d) => d.date === today);
  const current = !!day;
  const pace = current ? week.days.filter((d) => d.date <= today).length / week.days.length : null;
  const targets = [
    { label: 'Bids · self', done: done.bidsSelf, goal: goal.bidsSelf },
    { label: 'Bids · bidder', done: done.bidsBidder, goal: goal.bidsBidder },
    { label: 'Interviews · self', done: done.interviewsSelf, goal: goal.interviewsSelf },
    { label: 'Interviews · caller', done: done.interviewsCaller, goal: goal.interviewsCaller },
  ].filter((t) => t.goal > 0);
  const bySelfRegion = selfRegionsTotal(goal) + selfRegionsTotal(done) > 0;
  const hasGoal = targets.length > 0 || routines.length > 0 || goals.length > 0;
  const adminPlanned = !week.plansOwnWeek;
  const addOwn = ownerEdit && adminPlanned && week.exists;

  return (
    <section className="panel flex h-full flex-col p-4" aria-labelledby="week-goal-card-title">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-50 text-accent-700 dark:bg-accent-900/30 dark:text-accent-300">
            <Target size={18} aria-hidden />
          </span>
          <div>
            <h2 id="week-goal-card-title" className="card-title">Week plan</h2>
            <p className="text-xs text-muted">
              {current ? `Day ${week.days.findIndex((d) => d.date === today) + 1} of ${week.days.length} · ` : ''}Done adds up automatically
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {adminPlanned && (
            <span className="hidden items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-body sm:inline-flex dark:bg-zinc-800">
              <Lock size={12} aria-hidden /> {ownerEdit ? 'Planned by your admin' : 'Planned by admin'}
            </span>
          )}
          <button type="button" className="btn-outline text-sm" onClick={onOpen}>
            {canEdit ? (week.exists ? 'Edit plan' : 'Set plan') : 'View'}
          </button>
        </div>
      </header>

      {week.draft && (
        <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-200" role="status">
          Copied from last week — save to keep
        </p>
      )}

      {!hasGoal ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-zinc-200 px-4 py-6 text-center dark:border-zinc-800">
          <p className="text-sm font-medium text-strong">No week plan yet</p>
          <p className="mt-1 text-xs text-muted">
            {ownerEdit
              ? 'Set your bids and interviews for the week to track progress here.'
              : 'This teammate has not set a week plan.'}
          </p>
          {canEdit && (
            <button type="button" className="btn mt-3 text-sm" onClick={onOpen}>Set week plan</button>
          )}
        </div>
      ) : (
        <>
          {day && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent-200 bg-accent-50 px-4 py-3 dark:border-accent-900 dark:bg-accent-900/20">
              <div>
                <h3 className="text-sm font-semibold text-strong">
                  Today · {dayDate(today).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </h3>
                <p className="text-xs text-muted">
                  {day.itemsTotal > 0 && `${day.itemsDone} of ${day.itemsTotal} done · `}
                  {day.submitted ? 'standup sent' : 'standup not sent yet'}
                </p>
              </div>
              <button type="button" className="btn text-sm" onClick={() => onOpenDay(today)}>
                {ownerEdit ? "Fill today's standup" : 'Open today'}
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-x-6 gap-y-4 lg:grid-cols-5">
            <div className="space-y-4 lg:col-span-3">
              {routines.length > 0 && (
                <div>
                  <h3 className="form-label mb-1">{current ? "Today's checklist" : 'Daily routines'}</h3>
                  {current || !grid.length ? (
                    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {routines.map((item) => {
                        const cell = todayCells.get(item.id);
                        const ok = cell?.state === 'done';
                        const label = (
                          <>
                            {ok ? (
                              <CheckCircle2 size={16} className="shrink-0 text-success-600" aria-hidden />
                            ) : (
                              <Circle size={16} className="shrink-0 text-zinc-300 dark:text-zinc-600" aria-hidden />
                            )}
                            <span className={`text-left ${ok ? 'text-muted' : 'text-body'}`}>{item.text}{mine.has(item.id) && MINE}</span>
                            {current && <span className="sr-only">{ok ? '(done)' : '(not done)'}</span>}
                            <span className="ml-auto text-xs tabular-nums text-muted">
                              {cell?.state === 'short'
                                ? `${cell.value ?? 0} / ${cell.target ?? ''}${unit(item)}`
                                : hasTarget(item.kind) && item.target != null
                                  ? `${item.target}${unit(item)} per day`
                                  : ''}
                            </span>
                          </>
                        );
                        return (
                          <li key={item.id}>
                            {current ? (
                              <button type="button" className="flex w-full items-center gap-2 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900" onClick={() => onOpenDay(today)}>
                                {label}
                              </button>
                            ) : (
                              <div className="flex items-center gap-2 py-2 text-sm">{label}</div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <RoutineGrid rows={grid} mine={mine} today={today} />
                  )}
                  {current && grid.length > 0 && (
                    <>
                      <button type="button" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-accent-700 dark:text-accent-300" aria-expanded={gridOpen} onClick={() => setGridOpen(!gridOpen)}>
                        {gridOpen ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />} Show week by day
                      </button>
                      {gridOpen && <div className="mt-2"><RoutineGrid rows={grid} mine={mine} today={today} /></div>}
                    </>
                  )}
                </div>
              )}
              {addOwn && (
                <button type="button" className="text-sm font-medium text-accent-700 dark:text-accent-300" onClick={onOpen}>+ Add my own item</button>
              )}

              {goals.length > 0 && (
                <div className="border-t border-zinc-100 pt-3 dark:border-zinc-800">
                  <h3 className="form-label mb-1">Weekly goals</h3>
                  <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {goals.map((item) => {
                      const p = week.progress[item.id];
                      const target = item.target ?? 0;
                      return (
                        <li key={item.id} className="flex items-center gap-2 py-2 text-sm">
                          {p?.done ? (
                            <CheckCircle2 size={16} className="shrink-0 text-success-600" aria-hidden />
                          ) : (
                            <Circle size={16} className="shrink-0 text-zinc-300 dark:text-zinc-600" aria-hidden />
                          )}
                          <span className={p?.done ? 'text-muted line-through' : 'text-body'}>{item.text}{mine.has(item.id) && MINE}</span>
                          <span className="sr-only">{p?.done ? '(done)' : '(not done)'}</span>
                          {hasTarget(item.kind) && (
                            <>
                              <div
                                className="ml-auto h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
                                role="progressbar"
                                aria-label={item.text}
                                aria-valuemin={0}
                                aria-valuemax={target}
                                aria-valuenow={p?.value ?? 0}
                                aria-valuetext={`${p?.value ?? 0} of ${target}`}
                              >
                                <div className={`h-full rounded-full ${p?.done ? 'bg-success-500' : 'bg-accent-500'}`} style={{ width: `${target ? Math.min(100, ((p?.value ?? 0) / target) * 100) : 0}%` }} />
                              </div>
                              <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted">{p?.value ?? 0} / {target}{unit(item)}</span>
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>

            <div className="space-y-4 lg:col-span-2">
              {targets.length > 0 && (
                <div>
                  <h3 className="form-label mb-1">Targets</h3>
                  {targets.map((t) => <TargetRow key={t.label} {...t} pace={pace} />)}
                  <p className="mt-1 text-[11px] text-muted">
                    {pace != null && 'The tick is where you should be by the end of today. '}
                    {bySelfRegion && goal.bidsSelf > 0 && `Self bids by region: ${SELF_REGIONS.map((r) => `${r.label} ${done[r.field] ?? 0}`).join(' · ')}. `}
                    {bySelfRegion && preSplitSelf(done) > 0 && `Plus ${preSplitSelf(done)} outside US / EU / LATAM. `}
                    Interviews are counted from the Interviews page.
                  </p>
                </div>
              )}
              {week.recapNotes && (
                <div className="border-t border-zinc-100 pt-3 dark:border-zinc-800">
                  <h3 className="form-label mb-1">Recap</h3>
                  <p className="line-clamp-2 whitespace-pre-wrap text-sm text-body">{week.recapNotes}</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
