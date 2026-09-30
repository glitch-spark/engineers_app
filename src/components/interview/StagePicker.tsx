import { INTERVIEW_STAGE_ORDER, TECH_SUB_STAGE_VALUES, stageLabel } from '../../lib/stageBadge';

const TECHNICAL = new Set<string>(TECH_SUB_STAGE_VALUES);

/** One stage dropdown; tech rounds are grouped under "Technical" (no sub-stage step). */
export default function StagePicker({
  id,
  value,
  onChange,
  disabled,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (stage: string) => void;
  disabled?: boolean;
  describedBy?: string;
}) {
  const order = INTERVIEW_STAGE_ORDER as readonly string[];
  const before = order.filter((s) => !TECHNICAL.has(s) && order.indexOf(s) < order.indexOf('tech_round_1'));
  const technical = order.filter((s) => TECHNICAL.has(s));
  const after = order.filter((s) => !TECHNICAL.has(s) && !before.includes(s));
  return (
    <select
      id={id}
      className="select focus-ring w-full"
      value={value}
      disabled={disabled}
      aria-describedby={describedBy}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Select stage…</option>
      {before.map((s) => <option key={s} value={s}>{stageLabel(s)}</option>)}
      <optgroup label="Technical">
        {technical.map((s) => <option key={s} value={s}>{stageLabel(s)}</option>)}
      </optgroup>
      {after.map((s) => <option key={s} value={s}>{stageLabel(s)}</option>)}
    </select>
  );
}
