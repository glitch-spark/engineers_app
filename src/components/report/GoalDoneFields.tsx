import type { Counts, InterviewStages } from '../../api/endpoints';
import { stageBadgeClass } from '../../lib/stageBadge';

const STAGE_LABELS: Record<string, string> = {
  intro: 'Intro', tech: 'Tech', hiring: 'Hiring', panel: 'Panel', final: 'Final',
};
// Interview colours keyed by a representative stage of each group.
const STAGE_COLOR_KEY: Record<string, string> = {
  intro: 'intro', tech: 'tech_round_1', hiring: 'cultural', panel: 'panel', final: 'final',
};

// Every row shares these columns so headers, inputs and read-only values line up.
const ROW_WITH_DONE = 'grid grid-cols-[minmax(0,1fr)_6.5rem_6.5rem] items-start gap-3';
const ROW_GOAL_ONLY = 'grid grid-cols-[minmax(0,1fr)_6.5rem] items-start gap-3';

function NumberInput({
  value, onChange, label,
}: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <input
      type="number"
      min={0}
      inputMode="numeric"
      className="input text-right tabular-nums"
      value={value}
      aria-label={label}
      onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
    />
  );
}

/** A read-only number in the same box as an input, so the columns match. */
function ValueBox({ value, muted = false, title }: { value: number; muted?: boolean; title?: string }) {
  return (
    <span
      title={title}
      className={`flex min-h-[2.375rem] items-center justify-end rounded-xl border border-transparent bg-zinc-100/70 px-3.5 text-sm tabular-nums dark:bg-zinc-800/60 ${
        muted ? 'text-muted' : 'font-medium text-strong'
      }`}
    >
      {value}
    </span>
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
  const row = showDone ? ROW_WITH_DONE : ROW_GOAL_ONLY;

  const goalCell = (field: keyof Counts, label: string) =>
    readOnly || !onGoal ? (
      <ValueBox value={goal[field]} muted />
    ) : (
      <NumberInput value={goal[field]} label={`${label} goal`} onChange={(n) => onGoal({ ...goal, [field]: n })} />
    );

  const bidRow = (field: 'bidsSelf' | 'bidsBidder', label: string) => (
    <div key={field} className={`${row} py-1`}>
      <span className="pt-2 text-sm text-body">{label}</span>
      {goalCell(field, `Bids ${label.toLowerCase()}`)}
      {showDone && (
        readOnly || !onDone ? (
          <ValueBox value={done[field]} />
        ) : (
          <NumberInput value={done[field]} label={`Bids ${label.toLowerCase()} done`} onChange={(n) => onDone({ ...done, [field]: n })} />
        )
      )}
    </div>
  );

  const interviewRow = (field: 'interviewsSelf' | 'interviewsCaller', label: string, chips?: Record<string, number>) => (
    <div key={field} className={`${row} py-1`}>
      <div className="min-w-0 pt-2 text-sm text-body">
        {label}
        {showDone && <StageChips stages={chips} />}
      </div>
      {showInterviewGoal ? goalCell(field, `Interviews ${label.toLowerCase()}`) : <span className="pt-2 text-right text-xs text-muted">—</span>}
      {showDone && <ValueBox value={done[field]} title="From the Interviews page" />}
    </div>
  );

  return (
    <div>
      <div className={`${row} pb-1 text-xs font-medium text-muted`}>
        <span />
        <span className="pr-3.5 text-right">Goal</span>
        {showDone && <span className="pr-3.5 text-right">Done</span>}
      </div>
      <section className="py-1">
        <h3 className="form-label mb-0.5">Bids</h3>
        {bidRow('bidsSelf', 'Self')}
        {bidRow('bidsBidder', 'Bidder')}
      </section>
      {(showDone || showInterviewGoal) && (
        <section className="mt-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
          <h3 className="form-label mb-0.5">
            Interviews <span className="font-normal normal-case text-muted">· from the Interviews page</span>
          </h3>
          {interviewRow('interviewsSelf', 'Self', stages?.self)}
          {interviewRow('interviewsCaller', 'Caller', stages?.caller)}
        </section>
      )}
    </div>
  );
}
