import type { Counts, InterviewStages } from '../../api/endpoints';
import { stageBadgeClass } from '../../lib/stageBadge';

const STAGE_LABELS: Record<string, string> = {
  intro: 'Intro', tech: 'Tech', hiring: 'Hiring', panel: 'Panel', final: 'Final',
};
// Interview colours keyed by a representative stage of each group.
const STAGE_COLOR_KEY: Record<string, string> = {
  intro: 'intro', tech: 'tech_round_1', hiring: 'cultural', panel: 'panel', final: 'final',
};

function NumberInput({
  value, onChange, label,
}: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <input
      type="number"
      min={0}
      inputMode="numeric"
      className="input w-24 text-right tabular-nums"
      value={value}
      aria-label={label}
      onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
    />
  );
}

function StageChips({ stages }: { stages?: Record<string, number> }) {
  const entries = Object.entries(stages ?? {}).filter(([, n]) => n > 0);
  if (!entries.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {entries.map(([group, n]) => (
        <span
          key={group}
          className={`inline-flex items-center rounded-[8px] border px-1.5 py-0.5 text-[10px] font-medium ${stageBadgeClass(STAGE_COLOR_KEY[group])}`}
        >
          {STAGE_LABELS[group] ?? group} {n}
        </span>
      ))}
    </div>
  );
}

/** Goal | Done for bids and interviews.
 *
 *  Bids: goal and done are typed. Interviews: the goal is typed on the week
 *  only; done always comes from the Interviews page (read-only, with stages).
 */
export default function GoalDoneFields({
  goal,
  onGoal,
  done,
  onDone,
  stages,
  showDone = true,
  showInterviewGoal = false,
  readOnly = false,
}: {
  goal: Counts;
  onGoal?: (next: Counts) => void;
  done: Counts;
  onDone?: (next: Counts) => void;
  stages?: InterviewStages;
  showDone?: boolean;
  showInterviewGoal?: boolean;
  readOnly?: boolean;
}) {
  const goalCell = (field: keyof Counts, label: string) =>
    readOnly || !onGoal ? (
      <span className="w-24 pt-2 text-right text-sm tabular-nums">{goal[field]}</span>
    ) : (
      <NumberInput value={goal[field]} label={`${label} goal`} onChange={(n) => onGoal({ ...goal, [field]: n })} />
    );

  const bidRow = (field: 'bidsSelf' | 'bidsBidder', label: string) => (
    <div key={field} className="grid grid-cols-[1fr_auto_auto] items-start gap-2 py-1.5">
      <span className="pt-2 text-sm text-body">{label}</span>
      {goalCell(field, `Bids ${label.toLowerCase()}`)}
      {showDone ? (
        readOnly || !onDone ? (
          <span className="w-24 pt-2 text-right text-sm tabular-nums">{done[field]}</span>
        ) : (
          <NumberInput value={done[field]} label={`Bids ${label.toLowerCase()} done`} onChange={(n) => onDone({ ...done, [field]: n })} />
        )
      ) : (
        <span className="w-0" />
      )}
    </div>
  );

  const interviewRow = (field: 'interviewsSelf' | 'interviewsCaller', label: string, chips?: Record<string, number>) => (
    <div key={field} className="grid grid-cols-[1fr_auto_auto] items-start gap-2 py-1.5">
      <div className="min-w-0 pt-2 text-sm text-body">
        {label}
        {showDone && <StageChips stages={chips} />}
      </div>
      {showInterviewGoal ? goalCell(field, `Interviews ${label.toLowerCase()}`) : <span className="w-24" />}
      {showDone ? (
        <span className="w-24 pt-2 text-right text-sm tabular-nums" title="From the Interviews page">{done[field]}</span>
      ) : (
        <span className="w-0" />
      )}
    </div>
  );

  return (
    <div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-2 pb-1 text-xs font-medium text-muted">
        <span />
        <span className="w-24 text-right">Goal</span>
        {showDone ? <span className="w-24 text-right">Done</span> : <span className="w-0" />}
      </div>
      <section className="py-1">
        <h3 className="form-label">Bids</h3>
        {bidRow('bidsSelf', 'Self')}
        {bidRow('bidsBidder', 'Bidder')}
      </section>
      {(showDone || showInterviewGoal) && (
        <section className="border-t border-zinc-100 py-1 dark:border-zinc-800">
          <h3 className="form-label">
            Interviews <span className="font-normal normal-case text-muted">· from the Interviews page</span>
          </h3>
          {interviewRow('interviewsSelf', 'Self', stages?.self)}
          {interviewRow('interviewsCaller', 'Caller', stages?.caller)}
        </section>
      )}
    </div>
  );
}
