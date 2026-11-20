import { useState } from 'react';
import Modal from '../Modal';
import { STATUS_NOTE_MAX, statusNotePrompt, statusReasonPrompt } from '../../lib/stageBadge';
import ReasonSelect from './ReasonSelect';

/** `reason`: the picked key for Canceled / Rejected, '' for a status that takes none. */
export type StatusAnswer = { note: string; reason: string };

type Ask = { status: string; round: string; note: string; reason: string; resolve: (answer: StatusAnswer | null) => void };

/**
 * Asks why a round got its status before saving it: a required reason with optional details (Canceled / Rejected),
 * or the caller's feedback (Passed). `prompt` resolves with the answer, or null when the user backs out.
 * `note` / `reason`: what the round has saved already (an older round may have neither).
 */
export function useStatusNotePrompt() {
  const [ask, setAsk] = useState<Ask | null>(null);

  const prompt = (status: string, round: string, note?: string | null, reason?: string | null) =>
    new Promise<StatusAnswer | null>((resolve) => setAsk({ status, round, note: note || '', reason: reason || '', resolve }));

  const finish = (answer: StatusAnswer | null) => {
    ask?.resolve(answer);
    setAsk(null);
  };

  const dialog = ask ? (
    <StatusNoteDialog
      key={`${ask.status}:${ask.round}`}
      status={ask.status}
      round={ask.round}
      initial={ask.note}
      initialReason={ask.reason}
      onSave={finish}
      onCancel={() => finish(null)}
    />
  ) : null;

  return { prompt, dialog, asking: !!ask };
}

function StatusNoteDialog({
  status,
  round,
  initial,
  initialReason,
  onSave,
  onCancel,
}: {
  status: string;
  round: string;
  initial: string;
  initialReason: string;
  onSave: (answer: StatusAnswer) => void;
  onCancel: () => void;
}) {
  const copy = statusNotePrompt(status);
  const why = statusReasonPrompt(status);
  const [note, setNote] = useState(initial);
  const [reason, setReason] = useState(why?.options.some((o) => o.value === initialReason) ? initialReason : '');
  if (!copy) return null;
  const ready = !why || !!reason;
  const save = () => {
    if (ready) onSave({ note: note.trim(), reason });
  };

  return (
    <Modal open onClose={onCancel} title={`${copy.title} · ${round}`}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {why && <ReasonSelect id="status-reason" label={why.question} options={why.options} value={reason} onChange={setReason} />}
        <div>
          <label htmlFor="status-note" className="mb-1 block text-sm font-medium">{copy.label}</label>
          <textarea
            id="status-note"
            autoFocus={!why}
            className="input min-h-[110px]"
            maxLength={STATUS_NOTE_MAX}
            placeholder={copy.placeholder}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                save();
              }
            }}
          />
          <p className="mt-1 text-xs text-muted">{copy.hint}</p>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline text-sm" onClick={onCancel}>Back</button>
          <button type="submit" className="btn text-sm" disabled={!ready}>Save as {copy.statusLabel}</button>
        </div>
      </form>
    </Modal>
  );
}
