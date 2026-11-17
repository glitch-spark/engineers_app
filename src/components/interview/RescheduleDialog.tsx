import { useState } from 'react';
import * as api from '../../api/endpoints';
import { fromZoned, parseServerTime, zonedDateKey, zonedTime } from '../../lib/interviewTimezone';
import { notify } from '../../lib/notify';
import { stageLabel } from '../../lib/stageBadge';
import Modal from '../Modal';
import type { Interview } from './types';

/**
 * Changes only the time of one round, for an interview manager who cannot open the full round form.
 * Sends `scheduledAt` alone: the server refuses a manager's PATCH that carries any other field.
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
  interview: Interview;
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
  tz,
  onClose,
  onSaved,
}: {
  interview: Interview;
  roundId: string;
  scheduledAt?: string | null;
  tz: string;
  onClose: () => void;
  onSaved: (saved: Interview) => void;
}) {
  const start = scheduledAt ? parseServerTime(scheduledAt) : null;
  const [date, setDate] = useState(start ? zonedDateKey(start, tz) : '');
  const [time, setTime] = useState(start ? zonedTime(start, tz) : '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!date || !time) return;
    setBusy(true);
    try {
      const saved = await api.updateInterviewStage(interview._id, roundId, {
        scheduledAt: fromZoned(date, time, tz).toISOString(),
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
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-outline text-sm" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn text-sm" disabled={busy || !date || !time}>Save</button>
      </div>
    </form>
  );
}
