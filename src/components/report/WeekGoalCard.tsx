import { CheckCircle2, Circle, Target } from 'lucide-react';
import { hasTarget } from '../../api/endpoints';
import type { PlanItem, WeekPlan } from '../../api/endpoints';
import { preSplitSelf, selfRegionsTotal, SELF_REGIONS } from '../../lib/reportWeek';
import ProgressMetric from './ProgressMetric';

/**
 * The week's goal and how far along it is. `adminEdit`: an admin viewing a person (the board is read-only, but the
 * Week panel opens editable).
 */
export default function WeekGoalCard({
  week,
  canEdit: ownerEdit,
  adminEdit = false,
  onOpen,
}: {
  week: WeekPlan;
  canEdit: boolean;
  adminEdit?: boolean;
  onOpen: () => void;
}) {
  const canEdit = ownerEdit || adminEdit;
  const { goal, done } = week;
  const routines = week.routines.filter((i) => !i.archived);
  const goals = week.weeklyGoals.filter((i) => !i.archived);
  const bySelfRegion = selfRegionsTotal(goal) + selfRegionsTotal(done) > 0;
  const hasGoal =
    goal.bidsSelf + goal.bidsBidder + goal.interviewsSelf + goal.interviewsCaller > 0 || routines.length > 0 || goals.length > 0;
  const unit = (i: PlanItem) => (i.kind === 'hours' ? 'h' : '');

  return (
    <section className="panel flex h-full flex-col p-4" aria-labelledby="week-goal-card-title">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-50 text-accent-700 dark:bg-accent-900/30 dark:text-accent-300">
            <Target size={18} aria-hidden />
          </span>
          <div>
            <h2 id="week-goal-card-title" className="card-title">Week plan</h2>
            <p className="text-xs text-muted">Targets, routines and goals · Done adds up automatically</p>
          </div>
        </div>
        <button type="button" className="btn-outline shrink-0 text-sm" onClick={onOpen}>
          {canEdit ? (week.exists ? 'Edit plan' : 'Set plan') : 'View'}
        </button>
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
          <h3 className="form-label mb-2">Targets</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            {bySelfRegion ? (
              SELF_REGIONS.map((r) => (
                <ProgressMetric key={r.field} label={`Bids · self (${r.label})`} done={done[r.field] ?? 0} goal={goal[r.field] ?? 0} />
              ))
            ) : (
              <ProgressMetric label="Bids · self" done={done.bidsSelf} goal={goal.bidsSelf} />
            )}
            <ProgressMetric label="Bids · bidder" done={done.bidsBidder} goal={goal.bidsBidder} />
            <ProgressMetric label="Interviews · self" done={done.interviewsSelf} goal={goal.interviewsSelf} />
            <ProgressMetric label="Interviews · caller" done={done.interviewsCaller} goal={goal.interviewsCaller} />
          </div>
          <p className="mt-2 text-[11px] text-muted">
            Interviews are counted from the Interviews page.
            {bySelfRegion && preSplitSelf(done) > 0 && ` Plus ${preSplitSelf(done)} self bids outside US / EU / LATAM (other regions, or saved before the region split).`}
          </p>

          {routines.length > 0 && (
            <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-800">
              <h3 className="form-label mb-2">Routines</h3>
              <ul className="space-y-1">
                {routines.map((item) => (
                  <li key={item.id} className="flex items-start gap-2 text-sm text-body">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400" aria-hidden />
                    <span>{item.text}</span>
                    {hasTarget(item.kind) && item.target != null && (
                      <span className="text-xs tabular-nums text-muted">{item.target}{unit(item)} per day</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {goals.length > 0 && (
            <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-800">
              <h3 className="form-label mb-2">Weekly goals</h3>
              <ul className="space-y-3">
                {goals.map((item) => {
                  const p = week.progress[item.id];
                  return (
                    <li key={item.id}>
                      {!hasTarget(item.kind) ? (
                        <div className="flex items-start gap-2 text-sm">
                          {p?.done ? (
                            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success-600" aria-hidden />
                          ) : (
                            <Circle size={16} className="mt-0.5 shrink-0 text-zinc-300 dark:text-zinc-600" aria-hidden />
                          )}
                          <span className={p?.done ? 'text-muted line-through' : 'text-body'}>{item.text}</span>
                          <span className="sr-only">{p?.done ? '(done)' : '(not done)'}</span>
                        </div>
                      ) : (
                        <>
                          <ProgressMetric label={item.text} done={p?.value ?? 0} goal={item.target ?? 0} />
                          {p?.done && <span className="text-xs text-success-600">✓ <span className="sr-only">(done)</span></span>}
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {week.recapNotes && (
            <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-800">
              <h3 className="form-label mb-1">Recap</h3>
              <p className="line-clamp-2 whitespace-pre-wrap text-sm text-body">{week.recapNotes}</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
