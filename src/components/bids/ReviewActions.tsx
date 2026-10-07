import type { RefObject } from 'react';
import { Check, X } from 'lucide-react';
import { REJECT_REASONS, type RejectReason } from '../../api/endpoints';
import Kbd from './Kbd';

const NOTE_MAX = 500;

/** Approve, and Reject with its reason buttons and note (required for Other). */
export default function ReviewActions({
  busy,
  rejectOpen,
  otherChosen,
  note,
  noteRef,
  onNote,
  onApprove,
  onToggleReject,
  onReason,
  onSubmitOther,
}: {
  busy: boolean;
  rejectOpen: boolean;
  otherChosen: boolean;
  note: string;
  noteRef: RefObject<HTMLInputElement>;
  onNote: (note: string) => void;
  onApprove: () => void;
  onToggleReject: () => void;
  onReason: (reason: RejectReason) => void;
  onSubmitOther: (e: React.FormEvent) => void;
}) {
  return (
    <div className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-success" disabled={busy} onClick={onApprove}>
          <Check size={16} aria-hidden /> Approve <Kbd onColor>A</Kbd>
        </button>
        <button
          type="button"
          className={rejectOpen ? 'btn-danger' : 'btn-outline'}
          aria-expanded={rejectOpen}
          aria-controls="focus-reject"
          disabled={busy}
          onClick={onToggleReject}
        >
          <X size={16} aria-hidden /> Reject <Kbd onColor={rejectOpen}>R</Kbd>
        </button>
      </div>
      {rejectOpen && (
        <form id="focus-reject" onSubmit={onSubmitOther} className="space-y-2">
          <div role="group" aria-label="Reject reason" className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {REJECT_REASONS.map((r) => (
              <button
                key={r.value}
                type="button"
                className={`btn-outline btn-sm justify-between text-left ${
                  r.value === 'other' && otherChosen ? 'border-red-600 text-red-800 dark:border-red-500 dark:text-red-300' : ''
                }`}
                aria-pressed={r.value === 'other' ? otherChosen : undefined}
                disabled={busy}
                onClick={() => onReason(r.value)}
              >
                <span>{r.label}{r.value === 'other' ? '…' : ''}</span>
                <Kbd>{r.key}</Kbd>
              </button>
            ))}
          </div>
          <label htmlFor="focus-reject-note" className="block text-xs font-medium text-muted">
            {otherChosen ? 'Note (required for Other)' : 'Note (optional, type it before picking a reason)'}
          </label>
          <input
            id="focus-reject-note"
            ref={noteRef}
            className="input w-full text-sm"
            maxLength={NOTE_MAX}
            value={note}
            required={otherChosen}
            onChange={(e) => onNote(e.target.value)}
            // Esc leaves the field so the reason keys work again.
            onKeyDown={(e) => {
              if (e.key === 'Escape') e.currentTarget.blur();
            }}
          />
          {otherChosen && (
            <button type="submit" className="btn-danger btn-sm w-full" disabled={busy || !note.trim()}>
              Reject as Other
            </button>
          )}
        </form>
      )}
    </div>
  );
}
