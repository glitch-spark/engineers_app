import type { WeekPlan } from '../../api/endpoints';
import { regionTotal, worstRegion } from '../../lib/reportWeek';
import GoalDone from './GoalDone';

function RegionLine({ title, goal, done }: { title: string; goal: Record<string, number>; done: Record<string, number> }) {
  const worst = worstRegion(goal, done);
  return (
    <div>
      <div className="form-label">{title}</div>
      <div className="mt-1 text-sm">
        <GoalDone done={regionTotal(done)} goal={regionTotal(goal)} />
        {worst && <span className="ml-2 text-xs text-amber-700 dark:text-amber-400">{worst.region} ▼{worst.short}</span>}
      </div>
    </div>
  );
}

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
        <RegionLine title="Profiles" goal={goal.profiles} done={done.profiles} />
        <RegionLine title="LinkedIn" goal={goal.linkedin} done={done.linkedin} />
      </div>
      {(week.goalItems.length > 0 || week.recapNotes) && (
        <div className="mt-3 flex flex-wrap gap-4 border-t border-zinc-100 pt-3 text-sm text-muted dark:border-zinc-800">
          {week.goalItems.length > 0 && <span>Goals checklist {ticked}/{week.goalItems.length} done</span>}
          {week.recapNotes && <span>Recap written</span>}
        </div>
      )}
    </section>
  );
}
