import { useState } from 'react';
import { Pencil, RotateCcw } from 'lucide-react';
import {
  PROFILE_REGIONS,
  REGIONS,
  type Counts,
  type InterviewStages,
  type RegionCounts,
} from '../../api/endpoints';
import { stageBadgeClass } from '../../lib/stageBadge';

type CountField = 'bidsSelf' | 'bidsBidder' | 'interviewsSelf' | 'interviewsCaller';
type RegionField = 'profiles' | 'linkedin';
export type CountsField = CountField | RegionField;
export type OverrideValue = number | RegionCounts | null;

const STAGE_LABELS: Record<string, string> = {
  intro: 'Intro', tech: 'Tech', hiring: 'Hiring', panel: 'Panel', final: 'Final',
};
// Interview board colours keyed by a representative stage of each group.
const STAGE_COLOR_KEY: Record<string, string> = {
  intro: 'intro', tech: 'tech_round_1', hiring: 'cultural', panel: 'panel', final: 'final',
};

function NumberInput({
  value, onChange, label, disabled,
}: { value: number; onChange: (n: number) => void; label: string; disabled?: boolean }) {
  return (
    <input
      type="number"
      min={0}
      inputMode="numeric"
      className="input w-20 text-right tabular-nums"
      value={value}
      aria-label={label}
      disabled={disabled}
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

/** Goal | Done grid for every tracked category.
 *
 *  Done values listed in `autoFields` are automatic: they show the value
 *  from `auto` greyed with an "auto" tag until edited, which turns them into
 *  an override (`onOverride`); ↺ hands them back to the automatic value.
 *  Other Done values are typed directly (`onDone`).
 */
export default function CountsEditor({
  goal,
  onGoal,
  done,
  onDone,
  auto,
  overrides = {},
  autoFields = [],
  onOverride,
  stages,
  readOnly = false,
  showDone = true,
}: {
  goal: Counts;
  onGoal?: (next: Counts) => void;
  done?: Counts;
  onDone?: (next: Counts) => void;
  auto?: Partial<Counts>;
  overrides?: Partial<Record<CountsField, OverrideValue>>;
  autoFields?: CountsField[];
  onOverride?: (field: CountsField, value: OverrideValue) => void;
  stages?: InterviewStages;
  readOnly?: boolean;
  showDone?: boolean;
}) {
  const [extraRegions, setExtraRegions] = useState<Record<RegionField, string[]>>({ profiles: [], linkedin: [] });

  const isAuto = (field: CountsField) => autoFields.includes(field);
  const overridden = (field: CountsField) => isAuto(field) && overrides[field] != null;

  const doneCount = (field: CountField): number => {
    if (isAuto(field)) return (overrides[field] as number | null | undefined) ?? (auto?.[field] as number) ?? 0;
    return done?.[field] ?? 0;
  };
  const doneRegions = (field: RegionField): RegionCounts => {
    if (isAuto(field)) return (overrides[field] as RegionCounts | null | undefined) ?? (auto?.[field] as RegionCounts) ?? {};
    return done?.[field] ?? {};
  };

  const setGoal = (field: CountsField, value: number | RegionCounts) => onGoal?.({ ...goal, [field]: value });
  const setDone = (field: CountsField, value: number | RegionCounts) => {
    if (overridden(field)) onOverride?.(field, value);
    else onDone?.({ ...(done as Counts), [field]: value });
  };
  const setRegion = (counts: RegionCounts, region: string, n: number): RegionCounts => {
    const next = { ...counts };
    if (n) next[region] = n;
    else delete next[region];
    return next;
  };

  const autoTag = (field: CountsField, startValue: OverrideValue) =>
    readOnly ? (
      <span className="text-[10px] uppercase tracking-wide text-muted">{overridden(field) ? 'edited' : 'auto'}</span>
    ) : overridden(field) ? (
      <button type="button" className="btn-icon" title="Use the automatic value" aria-label="Use the automatic value"
        onClick={() => onOverride?.(field, null)}>
        <RotateCcw size={14} aria-hidden />
      </button>
    ) : (
      <button type="button" className="btn-icon" title="Edit this value" aria-label="Edit this value"
        onClick={() => onOverride?.(field, startValue)}>
        <Pencil size={14} aria-hidden />
      </button>
    );

  const countRow = (field: CountField, label: string, groupLabel: string, chips?: Record<string, number>) => {
    const value = doneCount(field);
    const greyed = isAuto(field) && !overridden(field);
    const editable = !readOnly && (!isAuto(field) || overridden(field));
    return (
      <div key={field} className="grid grid-cols-[1fr_auto_auto] items-start gap-2 py-1.5">
        <div className="min-w-0 pt-2 text-sm text-body">
          {label}
          <StageChips stages={chips} />
        </div>
        {readOnly || !onGoal ? (
          <span className="w-20 pt-2 text-right text-sm tabular-nums">{goal[field]}</span>
        ) : (
          <NumberInput value={goal[field]} label={`${groupLabel} ${label} goal`} onChange={(n) => setGoal(field, n)} />
        )}
        {showDone ? (
          <div className="flex w-28 items-center justify-end gap-1">
            {editable ? (
              <NumberInput value={value} label={`${groupLabel} ${label} done`} onChange={(n) => setDone(field, n)} />
            ) : (
              <span className={`pt-2 text-right text-sm tabular-nums ${greyed ? 'text-muted' : ''}`}>{value}</span>
            )}
            {isAuto(field) && autoTag(field, value)}
          </div>
        ) : (
          <span className="w-0" />
        )}
      </div>
    );
  };

  const regionSection = (field: RegionField, title: string, allowed: readonly string[]) => {
    const doneValues = doneRegions(field);
    const autoValues = (auto?.[field] as RegionCounts | undefined) ?? {};
    const shown = allowed.filter(
      (r) => goal[field][r] || doneValues[r] || autoValues[r] || extraRegions[field].includes(r),
    );
    const remaining = allowed.filter((r) => !shown.includes(r));
    const greyed = isAuto(field) && !overridden(field);
    const editable = !readOnly && (!isAuto(field) || overridden(field));
    return (
      <section key={field} className="border-t border-zinc-100 py-2 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <h3 className="form-label">{title}</h3>
          {showDone && isAuto(field) && autoTag(field, { ...doneValues })}
        </div>
        {shown.length === 0 && <p className="py-1 text-xs text-muted">No regions yet.</p>}
        {shown.map((region) => (
          <div key={region} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 py-1">
            <span className="text-sm text-body">{region}</span>
            {readOnly || !onGoal ? (
              <span className="w-20 text-right text-sm tabular-nums">{goal[field][region] ?? 0}</span>
            ) : (
              <NumberInput
                value={goal[field][region] ?? 0}
                label={`${title} ${region} goal`}
                onChange={(n) => setGoal(field, setRegion(goal[field], region, n))}
              />
            )}
            {showDone ? (
              <div className="flex w-28 justify-end">
                {editable ? (
                  <NumberInput
                    value={doneValues[region] ?? 0}
                    label={`${title} ${region} done`}
                    onChange={(n) => setDone(field, setRegion(doneValues, region, n))}
                  />
                ) : (
                  <span className={`text-right text-sm tabular-nums ${greyed ? 'text-muted' : ''}`}>{doneValues[region] ?? 0}</span>
                )}
              </div>
            ) : (
              <span className="w-0" />
            )}
          </div>
        ))}
        {!readOnly && remaining.length > 0 && (
          <select
            className="select mt-1 w-auto text-xs"
            aria-label={`Add a ${title} region`}
            value=""
            onChange={(e) => {
              const region = e.target.value;
              if (region) setExtraRegions((prev) => ({ ...prev, [field]: [...prev[field], region] }));
            }}
          >
            <option value="">+ region</option>
            {remaining.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
      </section>
    );
  };

  return (
    <div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-2 pb-1 text-xs font-medium text-muted">
        <span />
        <span className="w-20 text-right">Goal</span>
        {showDone ? <span className="w-28 text-right">Done</span> : <span className="w-0" />}
      </div>
      <section className="py-1">
        <h3 className="form-label">Bids</h3>
        {countRow('bidsSelf', 'Self', 'Bids')}
        {countRow('bidsBidder', 'Bidder', 'Bids')}
      </section>
      <section className="border-t border-zinc-100 py-1 dark:border-zinc-800">
        <h3 className="form-label">Interviews</h3>
        {countRow('interviewsSelf', 'Self', 'Interviews', showDone ? stages?.self : undefined)}
        {countRow('interviewsCaller', 'Caller', 'Interviews', showDone ? stages?.caller : undefined)}
      </section>
      {regionSection('profiles', 'Profiles', PROFILE_REGIONS)}
      {regionSection('linkedin', 'LinkedIn', REGIONS)}
    </div>
  );
}
