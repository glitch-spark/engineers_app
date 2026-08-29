import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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
  size?: 'default' | 'sm';
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
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

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.focus();
    document.documentElement.classList.add('dialog-open');

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;

      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.documentElement.classList.remove('dialog-open');
      previouslyFocused.current?.focus();
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const compact = size === 'sm';

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        className={`modal-overlay ${entered ? 'is-open' : ''}`}
        onClick={() => onCloseRef.current()}
        aria-label="Close dialog"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`t-modal relative z-[81] flex max-h-[min(90vh,720px)] w-full flex-col overflow-hidden outline-none ${
          compact ? 'max-w-sm' : 'max-w-xl'
        } ${entered ? 'is-open' : ''}`}
      >
        <div className={`flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200/80 dark:border-zinc-800 ${
          compact ? 'px-4 py-3' : 'px-5 py-4'
        }`}>
          <h2 id={titleId} className={compact ? 'text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50' : 'section-title'}>
            {title}
          </h2>
          <button type="button" onClick={() => onCloseRef.current()} className="btn-icon -mr-1 -mt-0.5 text-lg leading-none" aria-label="Close">
            ×
          </button>
        </div>
        <div className={`flex-1 overflow-y-auto ${compact ? 'px-4 py-3' : 'px-5 py-4'}`}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
