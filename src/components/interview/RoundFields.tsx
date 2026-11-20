import Select from '../Select';
import { INTERVIEW_STATUSES, STATUS_NOTE_MAX, statusNotePrompt, statusReasonPrompt } from '../../lib/stageBadge';
import { DURATION_OPTIONS, type RoundFormState } from '../../lib/interviewForm';
import StagePicker from './StagePicker';
import CallerFields from './CallerFields';
import ReasonSelect, { RescheduleQuestion } from './ReasonSelect';
import { fromZoned, zoneAbbrev } from '../../lib/interviewTimezone';

function durationLabel(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Stage, when, outcome and per-round details for one round. */
export default function RoundFields({
  round,
  onChange,
  disabled,
  idPrefix,
  tz,
  legend = 'Round',
  callerEditable = true,
  ownerId,
  reschedule = false,
}: {
  round: RoundFormState;
  onChange: (patch: Partial<RoundFormState>) => void;
  disabled?: boolean;
  idPrefix: string;
  /** Zone the date and time are entered in. */
  tz: string;
  legend?: string;
  /** Whether this user may pick the caller (see CallerFields). */
  callerEditable?: boolean;
  /** The interview's owner, never offered as the caller. */
  ownerId?: string;
  /** The saved start of a scheduled round was changed: ask why it was rescheduled. */
  reschedule?: boolean;
}) {
  const id = (k: string) => `${idPrefix}-round-${k}`;
  const req = <span className="text-red-700 dark:text-red-400" aria-hidden> *</span>;
  const durations = DURATION_OPTIONS.includes(round.durationMin)
    ? DURATION_OPTIONS
    : [...DURATION_OPTIONS, round.durationMin].sort((a, b) => a - b);
  // Abbreviation for the round's own date (EST vs EDT), in the chosen zone.
  const tzLabel = zoneAbbrev(round.date ? fromZoned(round.date, round.time || '12:00', tz) : new Date(), tz);
  const noteCopy = statusNotePrompt(round.status);
  const why = statusReasonPrompt(round.status);

  return (
    <fieldset className="space-y-3">
      <legend className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">{legend}</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={id('stage')} className="block text-sm font-medium mb-1">Stage{req}</label>
          <StagePicker id={id('stage')} value={round.stage} onChange={(v) => onChange({ stage: v })} disabled={disabled} />
        </div>
        <div>
          <label htmlFor={id('status')} className="block text-sm font-medium mb-1">Status</label>
          <Select
            id={id('status')}
            value={round.status}
            // Each status has its own reason list (or none): a picked reason never carries over.
            onChange={(v) => onChange({ status: v as RoundFormState['status'], statusReason: '' })}
            options={[...INTERVIEW_STATUSES]}
            disabled={disabled}
          />
        </div>
      </div>
      {why && (
        <ReasonSelect id={id('status-reason')} label={why.question} options={why.options} value={round.statusReason}
          onChange={(v) => onChange({ statusReason: v })} disabled={disabled} />
      )}
      {noteCopy && (
        <div>
          <label htmlFor={id('status-note')} className="block text-sm font-medium mb-1">{noteCopy.label}</label>
          <textarea id={id('status-note')} className="input min-h-[72px]" value={round.statusNote} disabled={disabled}
            maxLength={STATUS_NOTE_MAX} placeholder={noteCopy.placeholder}
            onChange={(e) => onChange({ statusNote: e.target.value })} />
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3">
        <div>
          <label htmlFor={id('date')} className="block text-sm font-medium mb-1">Date{req}</label>
          <input id={id('date')} className="input" type="date" value={round.date} disabled={disabled}
            onChange={(e) => onChange({ date: e.target.value })} />
        </div>
        <div>
          <label htmlFor={id('time')} className="block text-sm font-medium mb-1">
            Start{req} {tzLabel && <span className="text-xs font-normal text-muted">({tzLabel})</span>}
          </label>
          <input id={id('time')} className="input tabular-nums" type="time" step={300} value={round.time} disabled={disabled}
            onChange={(e) => onChange({ time: e.target.value })} />
        </div>
        <div>
          <label htmlFor={id('duration')} className="block text-sm font-medium mb-1">Duration</label>
          <select id={id('duration')} className="select focus-ring w-full" value={round.durationMin} disabled={disabled}
            onChange={(e) => onChange({ durationMin: Number(e.target.value) })}>
            {durations.map((m) => <option key={m} value={m}>{durationLabel(m)}</option>)}
          </select>
        </div>
      </div>
      {reschedule && (
        <RescheduleQuestion id={id('reschedule')} reason={round.rescheduleReason} note={round.rescheduleNote}
          onChange={onChange} disabled={disabled} />
      )}
      <div>
        <label htmlFor={id('interviewer')} className="block text-sm font-medium mb-1">Interviewer</label>
        <input id={id('interviewer')} className="input" value={round.interviewerName} disabled={disabled}
          placeholder="Name of the interviewer or recruiter"
          onChange={(e) => onChange({ interviewerName: e.target.value })} />
      </div>
      <CallerFields round={round} onChange={onChange} disabled={disabled} idPrefix={idPrefix} callerEditable={callerEditable} ownerId={ownerId} />
      <div>
        <label htmlFor={id('note')} className="block text-sm font-medium mb-1">Notes</label>
        <textarea id={id('note')} className="input min-h-[72px]" value={round.note} disabled={disabled}
          onChange={(e) => onChange({ note: e.target.value })} />
      </div>
    </fieldset>
  );
}
