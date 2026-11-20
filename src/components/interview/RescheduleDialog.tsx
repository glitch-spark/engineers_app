import { useState } from 'react';
import * as api from '../../api/endpoints';
import { fromZoned, parseServerTime, zonedDateKey, zonedTime } from '../../lib/interviewTimezone';
import { notify } from '../../lib/notify';
import { normalizeInterviewStatus, stageLabel } from '../../lib/stageBadge';
import { reschedulePayload, startMoved } from '../../lib/interviewForm';
import { RescheduleQuestion } from './ReasonSelect';
import Modal from '../Modal';
import type { Interview } from './types';

/**
 * Changes only the time of one round, for an interview manager who cannot open the full round form.
 * Sends `scheduledAt` and, for a scheduled round, why it was rescheduled: the server refuses a manager's PATCH that
 * carries any other round field.
 */
export default function RescheduleDialog({
  open,
  interview,
  roundId,
  tz,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** Only the id and the round are read, so a caller without the whole interview can pass just those. */
  interview: Pick<Interview, '_id' | 'stageHistory'>;
  roundId: string;
  tz: string;
  onClose: () => void;
  onSaved: (saved: Interview) => void;
}) {
  const entry = interview.stageHistory?.find((e) => e.id === roundId);
  return (
    <Modal open={open && !!entry} onClose={onClose} title={`Change time · ${stageLabel(entry?.stage)}`} size="sm">
      {entry && (
        <RescheduleForm
          key={`${interview._id}:${roundId}`}
          interview={interview}
          roundId={roundId}
          scheduledAt={entry.scheduledAt}
          scheduled={normalizeInterviewStatus(entry.status) === 'scheduled'}
          tz={tz}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </Modal>
  );
}

function RescheduleForm({
  interview,
  roundId,
  scheduledAt,
  scheduled,
  tz,
  onClose,
  onSaved,
}: {
  interview: Pick<Interview, '_id'>;
  roundId: string;
  scheduledAt?: string | null;
  scheduled: boolean;
  tz: string;
  onClose: () => void;
  onSaved: (saved: Interview) => void;
}) {
  const start = scheduledAt ? parseServerTime(scheduledAt) : null;
  const [date, setDate] = useState(start ? zonedDateKey(start, tz) : '');
  const [time, setTime] = useState(start ? zonedTime(start, tz) : '');
  const [why, setWhy] = useState({ rescheduleReason: '', rescheduleNote: '' });
  const [busy, setBusy] = useState(false);
  // Asked only when a scheduled round's start really changes.
  const asks = scheduled && startMoved(scheduledAt, date, time, tz);
  const ready = !!date && !!time && (!asks || !!why.rescheduleReason);

  const save = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      const saved = await api.updateInterviewStage(interview._id, roundId, {
        scheduledAt: fromZoned(date, time, tz).toISOString(),
        ...(asks ? reschedulePayload(why.rescheduleReason, why.rescheduleNote) : {}),
      });
      notify.success('Time updated');
      onSaved(saved as unknown as Interview);
    } catch (err) {
      notify.error(err, 'Failed to change the time');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="reschedule-date" className="mb-1 block text-sm font-medium">Date</label>
          <input id="reschedule-date" type="date" className="input" required value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label htmlFor="reschedule-time" className="mb-1 block text-sm font-medium">Time</label>
          <input id="reschedule-time" type="time" className="input" required value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-muted">In {tz.replace(/_/g, ' ')}.</p>
      {asks && (
        <RescheduleQuestion id="reschedule-reason" reason={why.rescheduleReason} note={why.rescheduleNote}
          onChange={(p) => setWhy((w) => ({ ...w, ...p }))} />
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-outline text-sm" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn text-sm" disabled={busy || !ready}>Save</button>
      </div>
    </form>
  );
}
