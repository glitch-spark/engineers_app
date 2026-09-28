import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useDialog } from '../lib/useDialog';

export default function Modal({
  open,
  onClose,
  title,
  children,
  size = 'default',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'default' | 'sm' | 'lg';
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const [entered, setEntered] = useState(false);

  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useDialog(open, panelRef, () => onCloseRef.current());

  if (!open || typeof document === 'undefined') return null;

  const compact = size === 'sm';
  const large = size === 'lg';
  const widthClass = large ? 'max-w-4xl' : compact ? 'max-w-sm' : 'max-w-xl';
  const heightClass = large ? 'h-[calc(100vh-1.5rem)]' : 'max-h-[min(90vh,720px)]';

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        className={`modal-overlay ${entered ? 'is-open' : ''}`}
        onClick={() => onCloseRef.current()}
        aria-label="Close dialog"
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`t-modal relative z-[81] flex w-full flex-col overflow-hidden outline-none ${heightClass} ${widthClass} ${entered ? 'is-open' : ''}`}
      >
        <div className={`flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200/80 dark:border-zinc-800 ${
          compact ? 'px-4 py-3' : 'px-5 py-4'
        }`}>
          <h2 id={titleId} className={compact ? 'text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50' : 'section-title'}>
            {title}
          </h2>
          <button type="button" onClick={() => onCloseRef.current()} className="btn-icon -mr-1.5 -mt-1 h-9 w-9" aria-label="Close">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto ${large ? 'flex flex-col' : ''} ${compact ? 'px-4 py-3' : 'px-5 py-4'}`}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
