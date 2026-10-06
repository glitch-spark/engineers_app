import { useEffect, useRef, useState } from 'react';
import * as api from '../../api/endpoints';
import Modal from '../Modal';

const NOTE_MAX = 500;

/** Reject with a reason (and a note, required for Other). Re-rejecting starts from the bid's current reason and note. */
export default function RejectDialog({
  bid,
  busy = false,
  onClose,
  onSubmit,
}: {
  bid: api.BidReviewItem | null;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (reason: api.RejectReason, note: string | null) => void;
}) {
  const [reason, setReason] = useState<api.RejectReason | null>(null);
  const [note, setNote] = useState('');
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const again = bid?.status === 'rejected';
    setReason(again ? bid.rejectReason : null);
    setNote(again ? bid.note ?? '' : '');
  }, [bid]);

  // Other has to be explained; the other reasons take an optional note.
  const canReject = reason !== null && (reason !== 'other' || note.trim() !== '');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reason !== null && canReject) onSubmit(reason, note.trim() || null);
  };

  return (
    <Modal open={!!bid} onClose={onClose} title="Reject bid" size="sm">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-body">{bid?.jobTitle || bid?.jobUrl || 'This bid'} · {bid?.bidderName}</p>
        <fieldset>
          <legend className="mb-1 block text-xs font-medium text-muted">Reason</legend>
          <div className="grid grid-cols-2 gap-2">
            {api.REJECT_REASONS.map((r) => (
              <label key={r.value} className="cursor-pointer">
                <input
                  type="radio"
                  name="bid-reject-reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => {
                    setReason(r.value);
                    if (r.value === 'other') noteRef.current?.focus();
                  }}
                  className="peer sr-only"
                />
                <span className="flex h-full items-center justify-center rounded-lg border border-zinc-200 bg-white px-2 py-2 text-center text-sm font-medium text-zinc-800 transition hover:border-zinc-300 hover:bg-zinc-50 peer-checked:border-red-600 peer-checked:bg-red-50 peer-checked:text-red-800 peer-focus-visible:ring-2 peer-focus-visible:ring-sky-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 dark:peer-checked:border-red-500 dark:peer-checked:bg-red-950/40 dark:peer-checked:text-red-300 dark:peer-focus-visible:ring-sky-400">
                  {r.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="bid-reject-note" className="mb-1 block text-xs font-medium text-muted">
            {reason === 'other' ? 'Note (required for Other)' : 'Note (optional)'}
          </label>
          <textarea
            id="bid-reject-note"
            ref={noteRef}
            className="input w-full resize-y text-sm"
            rows={3}
            maxLength={NOTE_MAX}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            required={reason === 'other'}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline text-sm" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn-danger text-sm" disabled={!canReject || busy}>{busy ? 'Working…' : 'Reject'}</button>
        </div>
      </form>
    </Modal>
  );
}
