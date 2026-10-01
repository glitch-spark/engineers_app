import { CheckCircle2, Circle, Target } from 'lucide-react';
import type { WeekPlan } from '../../api/endpoints';
import ProgressMetric from './ProgressMetric';

/** The week's goal and how far along it is. */
export default function WeekGoalCard({
  week,
  canEdit,
  onOpen,
}: {
  week: WeekPlan;
  canEdit: boolean;
  onOpen: () => void;
}) {
  const { goal, done } = week;
  const ticked = week.goalItems.filter((i) => i.done).length;
  const hasGoal =
    goal.bidsSelf + goal.bidsBidder + goal.interviewsSelf + goal.interviewsCaller > 0 || week.goalItems.length > 0;

  return (
    <section className="panel flex h-full flex-col p-4" aria-labelledby="week-goal-card-title">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-50 text-accent-700 dark:bg-accent-900/30 dark:text-accent-300">
            <Target size={18} aria-hidden />
          </span>
          <div>
            <h2 id="week-goal-card-title" className="card-title">Week goal</h2>
            <p className="text-xs text-muted">Set once for the week · Done adds up automatically</p>
          </div>
        </div>
        <button type="button" className="btn-outline shrink-0 text-sm" onClick={onOpen}>
          {canEdit ? (week.exists ? 'Edit goals' : 'Set goals') : 'View'}
        </button>
      </header>

      {!hasGoal ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-zinc-200 px-4 py-6 text-center dark:border-zinc-800">
          <p className="text-sm font-medium text-strong">No week goal yet</p>
          <p className="mt-1 text-xs text-muted">
            {canEdit ? 'Set your bids and interviews for the week to track progress here.' : 'This teammate has not set a week goal.'}
          </p>
          {canEdit && (
            <button type="button" className="btn mt-3 text-sm" onClick={onOpen}>Set week goal</button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <ProgressMetric label="Bids · self" done={done.bidsSelf} goal={goal.bidsSelf} />
            <ProgressMetric label="Bids · bidder" done={done.bidsBidder} goal={goal.bidsBidder} />
            <ProgressMetric label="Interviews · self" done={done.interviewsSelf} goal={goal.interviewsSelf} />
            <ProgressMetric label="Interviews · caller" done={done.interviewsCaller} goal={goal.interviewsCaller} />
          </div>
          <p className="mt-2 text-[11px] text-muted">Interviews are counted from the Interviews page.</p>

          {week.goalItems.length > 0 && (
            <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-800">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="form-label">Goal lines</h3>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium tabular-nums text-body dark:bg-zinc-800">
                  {ticked}/{week.goalItems.length} done
                </span>
              </div>
              <ul className="space-y-1">
                {week.goalItems.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    {item.done ? (
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success-600" aria-hidden />
                    ) : (
                      <Circle size={16} className="mt-0.5 shrink-0 text-zinc-300 dark:text-zinc-600" aria-hidden />
                    )}
                    <span className={item.done ? 'text-muted line-through' : 'text-body'}>{item.text}</span>
                    <span className="sr-only">{item.done ? '(done)' : '(not done)'}</span>
                  </li>
                ))}
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
