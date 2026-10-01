import { CalendarCheck, CheckCircle2 } from 'lucide-react';
import type { DayPlan, WeekPlan } from '../../api/endpoints';
import ProgressMetric from './ProgressMetric';

/** The goal for every day of the week, today's progress against it, and how
 *  many followed-up days reached it. */
export default function DailyGoalCard({
  week,
  days,
  today,
  canEdit,
  onOpenWeek,
  onOpenDay,
}: {
  week: WeekPlan;
  days: DayPlan[];
  today: string;
  canEdit: boolean;
  onOpenWeek: () => void;
  onOpenDay: (date: string) => void;
}) {
  const goal = week.dailyGoal;
  const goalBids = goal.bidsSelf + goal.bidsBidder;
  const lines = week.dailyGoalItems;
  const hasGoal = goalBids > 0 || lines.length > 0;
  const todayPlan = days.find((d) => d.date === today);
  const followedUp = days.filter((d) => d.loggedAt);
  const onGoal = followedUp.filter((d) => {
    const target = d.goal.bidsSelf + d.goal.bidsBidder;
    return target > 0 && d.done.bidsSelf + d.done.bidsBidder >= target;
  }).length;

  return (
    <section className="panel flex h-full flex-col p-4" aria-labelledby="daily-goal-card-title">
      <header className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-300">
          <CalendarCheck size={18} aria-hidden />
        </span>
        <div>
          <h2 id="daily-goal-card-title" className="card-title">Daily goal</h2>
          <p className="text-xs text-muted">The same every day, Monday to Saturday</p>
        </div>
      </header>

      {!hasGoal ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-zinc-200 px-4 py-6 text-center dark:border-zinc-800">
          <p className="text-sm font-medium text-strong">No daily goal yet</p>
          <p className="mt-1 text-xs text-muted">
            {canEdit ? "Set it with the week's goals — each day is then just a follow-up." : 'This teammate has not set a daily goal.'}
          </p>
          {canEdit && (
            <button type="button" className="btn mt-3 text-sm" onClick={onOpenWeek}>Set daily goal</button>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-900">
              <span className="block text-[11px] font-medium uppercase tracking-wide text-muted">Bids · self</span>
              <span className="text-lg font-semibold tabular-nums text-strong">{goal.bidsSelf}</span>
            </span>
            <span className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-900">
              <span className="block text-[11px] font-medium uppercase tracking-wide text-muted">Bids · bidder</span>
              <span className="text-lg font-semibold tabular-nums text-strong">{goal.bidsBidder}</span>
            </span>
            <span className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-900">
              <span className="block text-[11px] font-medium uppercase tracking-wide text-muted">Days on goal</span>
              <span className="text-lg font-semibold tabular-nums text-strong">{onGoal}</span>
              <span className="text-xs text-muted"> / {followedUp.length} followed up</span>
            </span>
          </div>

          {lines.length > 0 && (
            <ul className="mt-3 space-y-1">
              {lines.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-body">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400" aria-hidden />
                  {item.text}
                </li>
              ))}
            </ul>
          )}

          {todayPlan && (
            <div className="mt-4 rounded-lg border border-zinc-100 p-3 dark:border-zinc-800">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium text-strong">Today</h3>
                {todayPlan.loggedAt ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-success-700 dark:text-success-400">
                    <CheckCircle2 size={14} aria-hidden /> Followed up
                  </span>
                ) : canEdit ? (
                  <button type="button" className="btn text-xs" onClick={() => onOpenDay(today)}>Follow up</button>
                ) : (
                  <span className="text-xs text-muted">Not followed up yet</span>
                )}
              </div>
              <ProgressMetric
                label="Bids today"
                done={todayPlan.done.bidsSelf + todayPlan.done.bidsBidder}
                goal={todayPlan.goal.bidsSelf + todayPlan.goal.bidsBidder}
              />
              {todayPlan.goalItems.length > 0 && (
                <p className="mt-1 text-xs text-muted">
                  Goal lines {todayPlan.goalItems.filter((i) => i.done).length}/{todayPlan.goalItems.length} done
                </p>
              )}
            </div>
          )}

          {canEdit && (
            <button type="button" className="mt-auto self-start pt-3 text-xs text-muted underline-offset-2 hover:underline" onClick={onOpenWeek}>
              Change daily goal
            </button>
          )}
        </>
      )}
    </section>
  );
}
