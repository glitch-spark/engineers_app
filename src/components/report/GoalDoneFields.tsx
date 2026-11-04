import type { Counts, InterviewStages, PlanProfile } from '../../api/endpoints';
import { preSplitSelf, REGION_FIELD, selfRegionsTotal, SELF_REGIONS, withProfileBids, withSelfRegion, type SelfRegionField } from '../../lib/reportWeek';
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

// The typed counts; `bidsSelfByProfile` is a map, not a cell.
type NumberField = Exclude<keyof Counts, 'bidsSelfByProfile'>;

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
 *  Bids: goal and done are typed; self bids per region (US, EU, LATAM), which
 *  add up to the self total. With `profiles` (the day follow-up), self bids are
 *  typed per profile and the region rows turn into read-only sums. Interviews: the goal is typed on the week
 *  only; done always comes from the Interviews page (read-only, with stages).
 */
export default function GoalDoneFields({
  goal,
  onGoal,
  done,
  onDone,
  stages,
  profiles,
  showDone = true,
  showInterviewGoal = false,
  readOnly = false,
}: {
  goal: Counts;
  onGoal?: (next: Counts) => void;
  done: Counts;
  onDone?: (next: Counts) => void;
  stages?: InterviewStages;
  profiles?: PlanProfile[];
  showDone?: boolean;
  showInterviewGoal?: boolean;
  readOnly?: boolean;
}) {
  const row = showDone ? ROW_WITH_DONE : ROW_GOAL_ONLY;

  // Per-profile mode: the region Done cells are sums of the profiles' bids.
  const perProfile = showDone && !!profiles && profiles.length > 0;
  const byProfile = done.bidsSelfByProfile ?? {};
  const typedPerProfile = Object.keys(byProfile).length > 0;
  const regionLabel = (p: PlanProfile) =>
    SELF_REGIONS.find((r) => r.field === (p.region ? REGION_FIELD[p.region] : undefined))?.label ?? p.region ?? 'no region';
  const otherRegions = (profiles ?? []).reduce(
    (sum, p) => (p.region && REGION_FIELD[p.region] ? sum : sum + (byProfile[p.id] ?? 0)),
    0,
  );
  const shownProfiles = (profiles ?? []).filter((p) => !p.archived || (byProfile[p.id] ?? 0) > 0);

  const set = (c: Counts, field: NumberField, n: number): Counts =>
    SELF_REGIONS.some((r) => r.field === field) ? withSelfRegion(c, field as SelfRegionField, n) : { ...c, [field]: n };

  const goalCell = (field: NumberField, label: string) =>
    readOnly || !onGoal ? (
      <ValueBox value={goal[field] ?? 0} muted />
    ) : (
      <NumberInput value={goal[field] ?? 0} label={`${label} goal`} onChange={(n) => onGoal(set(goal, field, n))} />
    );

  const bidRow = (field: SelfRegionField | 'bidsBidder', label: string) => (
    <div key={field} className={`${row} py-1`}>
      <span className="pt-2 text-sm text-body">{label}</span>
      {goalCell(field, `Bids ${label.toLowerCase()}`)}
      {showDone && (
        perProfile && field !== 'bidsBidder' ? (
          <ValueBox value={done[field] ?? 0} title={`Sum of your ${SELF_REGIONS.find((r) => r.field === field)?.label} profiles`} />
        ) : readOnly || !onDone ? (
          <ValueBox value={done[field] ?? 0} />
        ) : (
          <NumberInput value={done[field] ?? 0} label={`Bids ${label.toLowerCase()} done`} onChange={(n) => onDone(set(done, field, n))} />
        )
      )}
    </div>
  );

  // Self bids saved before the region split: shown as-is until a region is typed.
  const preSplitGoal = preSplitSelf(goal);
  const preSplitDone = showDone ? preSplitSelf(done) : 0;
  const preSplitRow = (preSplitGoal > 0 || preSplitDone > 0) && (
    <div className={`${row} py-1`}>
      <div className="min-w-0 pt-2 text-sm text-body">
        Self (no region)
        <div className="text-[11px] text-muted">
          Saved before the region split{!readOnly && (onGoal || onDone) ? ' · typing a region replaces it' : ''}
        </div>
      </div>
      <ValueBox value={preSplitGoal} muted />
      {showDone && <ValueBox value={preSplitDone} />}
    </div>
  );

  const otherRow = perProfile && otherRegions > 0 && (
    <div className={`${row} py-1`}>
      <span className="pt-2 text-sm text-body">Self (other regions)</span>
      <span className="pt-2 text-right text-xs text-muted">—</span>
      <ValueBox value={otherRegions} />
    </div>
  );

  const profileRow = (p: PlanProfile) => {
    const label = `Self · ${p.name} (${regionLabel(p)})`;
    return (
      <div key={p.id} className={`${row} py-1`}>
        <span className="min-w-0 break-words pt-2 text-sm text-body">{label}</span>
        <span className="pt-2 text-right text-xs text-muted">—</span>
        {readOnly || !onDone ? (
          <ValueBox value={byProfile[p.id] ?? 0} />
        ) : (
          <NumberInput
            value={byProfile[p.id] ?? 0}
            label={`${label} done`}
            onChange={(n) => onDone(withProfileBids(done, { ...byProfile, [p.id]: n }, profiles ?? []))}
          />
        )}
      </div>
    );
  };

  // A day saved by region, before typing per profile existed.
  const savedByRegion = perProfile && !readOnly && !!onDone && !typedPerProfile && selfRegionsTotal(done) > 0;

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
        {SELF_REGIONS.map((r) => bidRow(r.field, `Self (${r.label})`))}
        {preSplitRow}
        {otherRow}
        {perProfile && shownProfiles.map(profileRow)}
        {savedByRegion && (
          <p className="py-1 text-[11px] text-muted">
            Saved by region: {SELF_REGIONS.map((r) => `${r.label} ${done[r.field] ?? 0}`).join(' · ')} — typing per profile replaces it
          </p>
        )}
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
