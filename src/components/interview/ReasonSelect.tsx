import Select from '../Select';
import { JUST_FIXING_TIME, RESCHEDULE_QUESTION, RESCHEDULE_REASONS, STATUS_NOTE_MAX, type ReasonOption } from '../../lib/stageBadge';

/** A required pick from a fixed reason list, with the picked option's helper text under it. */
export default function ReasonSelect({
  id,
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  options: ReasonOption[];
  /** '' = nothing picked yet (also how a round from before reasons existed opens). */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const help = options.find((o) => o.value === value)?.help;
  return (
    <div>
      <Select
        id={id}
        label={label}
        labelClassName="mb-1 block text-sm font-medium"
        required
        placeholder="Pick a reason"
        options={options}
        value={value}
        onChange={onChange}
        disabled={disabled}
        ariaDescribedBy={help ? `${id}-help` : undefined}
      />
      {help && <p id={`${id}-help`} className="mt-1 text-xs text-muted">{help}</p>}
    </div>
  );
}

/** "Why was it rescheduled?" with optional details; "Just fixing the time" takes no details. */
export function RescheduleQuestion({
  id,
  reason,
  note,
  onChange,
  disabled,
}: {
  id: string;
  reason: string;
  note: string;
  onChange: (patch: { rescheduleReason?: string; rescheduleNote?: string }) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-3">
      <ReasonSelect id={id} label={RESCHEDULE_QUESTION} options={RESCHEDULE_REASONS} value={reason} disabled={disabled}
        onChange={(v) => onChange({ rescheduleReason: v })} />
      {reason && reason !== JUST_FIXING_TIME && (
        <div>
          <label htmlFor={`${id}-note`} className="mb-1 block text-sm font-medium">Details (optional)</label>
          <input id={`${id}-note`} className="input" value={note} disabled={disabled} maxLength={STATUS_NOTE_MAX}
            onChange={(e) => onChange({ rescheduleNote: e.target.value })} />
        </div>
      )}
    </div>
  );
}
