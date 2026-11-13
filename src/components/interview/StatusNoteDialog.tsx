import { useState } from 'react';
import Modal from '../Modal';
import { STATUS_NOTE_MAX, statusNotePrompt } from '../../lib/stageBadge';

type Ask = { status: string; round: string; note: string; resolve: (note: string | null) => void };

/**
 * Asks why a round got its status — the recruiter's reason (Canceled) or feedback (Passed / Rejected) — before
 * saving it. `prompt` resolves with the text (possibly empty) or null when the user backs out.
 */
export function useStatusNotePrompt() {
  const [ask, setAsk] = useState<Ask | null>(null);

  const prompt = (status: string, round: string, note = '') =>
    new Promise<string | null>((resolve) => setAsk({ status, round, note, resolve }));

  const finish = (note: string | null) => {
    ask?.resolve(note);
    setAsk(null);
  };

  const dialog = ask ? (
    <StatusNoteDialog
      key={`${ask.status}:${ask.round}`}
      status={ask.status}
      round={ask.round}
      initial={ask.note}
      onSave={(note) => finish(note)}
      onCancel={() => finish(null)}
    />
  ) : null;

  return { prompt, dialog, asking: !!ask };
}

function StatusNoteDialog({
  status,
  round,
  initial,
  onSave,
  onCancel,
}: {
  status: string;
  round: string;
  initial: string;
  onSave: (note: string) => void;
  onCancel: () => void;
}) {
  const copy = statusNotePrompt(status);
  const [note, setNote] = useState(initial);
  if (!copy) return null;

  return (
    <Modal open onClose={onCancel} title={`${copy.title} · ${round}`}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(note.trim());
        }}
      >
        <div>
          <label htmlFor="status-note" className="mb-1 block text-sm font-medium">{copy.label}</label>
          <textarea
            id="status-note"
            autoFocus
            className="input min-h-[110px]"
            maxLength={STATUS_NOTE_MAX}
            placeholder={copy.placeholder}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onSave(note.trim());
              }
            }}
          />
          <p className="mt-1 text-xs text-muted">{copy.hint}</p>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline text-sm" onClick={onCancel}>Back</button>
          <button type="submit" className="btn text-sm">Save as {copy.statusLabel}</button>
        </div>
      </form>
    </Modal>
  );
}
