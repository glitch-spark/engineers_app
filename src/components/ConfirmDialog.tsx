import type { ReactNode } from 'react';
import Modal from './Modal';

/** Small confirm/cancel dialog (one style for every destructive action). */
export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Delete',
  tone = 'danger',
  busy = false,
  disabledReason,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'default';
  busy?: boolean;
  /** When set, the confirm button is disabled and this explains why. */
  disabledReason?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title} size="sm">
      <div className="space-y-4">
        <div className="text-sm text-body">{body}</div>
        {disabledReason && <p className="text-sm text-muted">{disabledReason}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline text-sm" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={`${tone === 'danger' ? 'btn-danger' : 'btn'} text-sm`}
            onClick={onConfirm}
            disabled={busy || !!disabledReason}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
