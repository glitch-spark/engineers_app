import Select from '../Select';
import { INTERVIEW_STATUSES } from '../../lib/stageBadge';
import { DURATION_OPTIONS, type RoundFormState } from '../../lib/interviewForm';
import StagePicker from './StagePicker';
import CallerFields from './CallerFields';
import { TranscriptUploadButton } from './TranscriptUploadButton';

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
  legend = 'Round',
}: {
  round: RoundFormState;
  onChange: (patch: Partial<RoundFormState>) => void;
  disabled?: boolean;
  idPrefix: string;
  legend?: string;
}) {
  const id = (k: string) => `${idPrefix}-round-${k}`;
  const req = <span className="text-red-700 dark:text-red-400" aria-hidden> *</span>;
  const durations = DURATION_OPTIONS.includes(round.durationMin)
    ? DURATION_OPTIONS
    : [...DURATION_OPTIONS, round.durationMin].sort((a, b) => a - b);
  const tz = (() => {
    try {
      return new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(new Date())
        .find((p) => p.type === 'timeZoneName')?.value ?? '';
    } catch {
      return '';
    }
  })();

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
            onChange={(v) => onChange({ status: v as RoundFormState['status'] })}
            options={[...INTERVIEW_STATUSES]}
            disabled={disabled}
          />
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3">
        <div>
          <label htmlFor={id('date')} className="block text-sm font-medium mb-1">Date{req}</label>
          <input id={id('date')} className="input" type="date" value={round.date} disabled={disabled}
            onChange={(e) => onChange({ date: e.target.value })} />
        </div>
        <div>
          <label htmlFor={id('time')} className="block text-sm font-medium mb-1">
            Start{req} {tz && <span className="text-xs font-normal text-muted">({tz})</span>}
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
      <div>
        <label htmlFor={id('interviewer')} className="block text-sm font-medium mb-1">Interviewer</label>
        <input id={id('interviewer')} className="input" value={round.interviewerName} disabled={disabled}
          placeholder="Name of the interviewer or recruiter"
          onChange={(e) => onChange({ interviewerName: e.target.value })} />
      </div>
      <CallerFields round={round} onChange={onChange} disabled={disabled} idPrefix={idPrefix} />
      <div>
        <label htmlFor={id('note')} className="block text-sm font-medium mb-1">Notes</label>
        <textarea id={id('note')} className="input min-h-[72px]" value={round.note} disabled={disabled}
          onChange={(e) => onChange({ note: e.target.value })} />
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label htmlFor={id('transcript')} className="block text-sm font-medium">Transcript</label>
          {!disabled && (
            <TranscriptUploadButton hasTranscript={!!round.transcript} onLoad={(raw) => onChange({ transcript: raw })} />
          )}
        </div>
        <textarea id={id('transcript')} className="input min-h-[96px] font-mono text-xs" value={round.transcript}
          disabled={disabled} placeholder="Paste the transcript, or upload a file"
          onChange={(e) => onChange({ transcript: e.target.value })} />
      </div>
    </fieldset>
  );
}
