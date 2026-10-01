import { useCallback, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useDialog } from '../lib/useDialog';

/** Right-hand slide-in dialog (full width on phones). Asks before discarding
 *  unsaved changes when `dirty` is set. */
export default function SidePanel({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  dirty = false,
}: {
  open: boolean;
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  dirty?: boolean;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const titleId = useId();

  const requestClose = useCallback(() => {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    onClose();
  }, [dirty, onClose]);

  useDialog(open, panelRef, requestClose);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 top-16 z-40 bg-black/20" aria-hidden="true" onClick={requestClose} />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="fixed top-16 right-0 bottom-0 z-50 flex w-full flex-col border-l border-zinc-200 bg-white shadow-strong dark:border-zinc-800 dark:bg-zinc-950 sm:max-w-2xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate font-semibold text-strong">{title}</h2>
            {subtitle && <div className="mt-0.5 text-xs text-muted">{subtitle}</div>}
          </div>
          <button type="button" onClick={requestClose} className="btn-icon" title="Close panel" aria-label="Close panel">
            <X size={16} aria-hidden />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer && (
          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/80">
            {footer}
          </footer>
        )}
      </aside>
    </>
  );
}
