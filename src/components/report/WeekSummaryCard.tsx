import type { WeekPlan } from '../../api/endpoints';
import GoalDone from './GoalDone';

/** The week's Goal vs Done at a glance. */
export default function WeekSummaryCard({
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
  const daily = week.dailyGoal;
  const dailyLines = week.dailyGoalItems.length;
  return (
    <section className="panel p-4" aria-labelledby="week-summary-title">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="week-summary-title" className="card-title">This week</h2>
        <button type="button" className="btn-outline text-sm" onClick={onOpen}>
          {canEdit ? (week.exists ? 'Edit week goals' : 'Set week goals') : 'View week'}
        </button>
      </div>
      {!week.exists && canEdit && (
        <p className="mb-3 text-sm text-muted">No goals for this week yet — set them to track your progress.</p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="form-label">Bids</div>
          <div className="mt-1 space-y-0.5 text-sm">
            <div><GoalDone label="Self" done={done.bidsSelf} goal={goal.bidsSelf} /></div>
            <div><GoalDone label="Bidder" done={done.bidsBidder} goal={goal.bidsBidder} /></div>
          </div>
        </div>
        <div>
          <div className="form-label">Interviews</div>
          <div className="mt-1 space-y-0.5 text-sm">
            <div><GoalDone label="Self" done={done.interviewsSelf} goal={goal.interviewsSelf} /></div>
            <div><GoalDone label="Caller" done={done.interviewsCaller} goal={goal.interviewsCaller} /></div>
          </div>
        </div>
        <div>
          <div className="form-label">Goals</div>
          <div className="mt-1 text-sm">
            {week.goalItems.length ? (
              <GoalDone done={ticked} goal={week.goalItems.length} label="Done" />
            ) : (
              <span className="text-muted">None listed</span>
            )}
            {week.recapNotes && <div className="mt-0.5 text-xs text-muted">Recap written</div>}
          </div>
        </div>
        <div>
          <div className="form-label">Daily goal</div>
          <div className="mt-1 space-y-0.5 text-sm">
            {daily.bidsSelf + daily.bidsBidder > 0 || dailyLines > 0 ? (
              <>
                <div>
                  Bids <span className="font-medium text-strong tabular-nums">{daily.bidsSelf}</span>
                  <span className="text-muted"> self · </span>
                  <span className="font-medium text-strong tabular-nums">{daily.bidsBidder}</span>
                  <span className="text-muted"> bidder</span>
                </div>
                <div className="text-muted">{dailyLines} goal line{dailyLines === 1 ? '' : 's'} a day</div>
              </>
            ) : (
              <span className="text-muted">Not set</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
