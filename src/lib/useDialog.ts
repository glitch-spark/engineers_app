import { type RefObject, useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Dialogs can stack (a Modal opened from a drawer): only the topmost one handles keys,
// and page scroll unlocks when the last one closes.
const stack: object[] = [];

/**
 * Keyboard behaviour shared by every modal surface (Modal, side panels, drawers):
 * moves focus into the panel on open, traps Tab inside it, closes on Escape,
 * locks page scroll, and returns focus to whatever opened it on close.
 *
 * The panel element should have `role="dialog"`, `aria-modal="true"`,
 * `aria-labelledby` and `tabIndex={-1}`.
 */
export function useDialog(
  open: boolean,
  panelRef: RefObject<HTMLElement>,
  onClose: () => void,
  { initialFocus }: { initialFocus?: RefObject<HTMLElement> } = {},
) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    (initialFocus?.current ?? panel)?.focus();
    const token = {};
    stack.push(token);
    document.documentElement.classList.add('dialog-open');

    const onKeyDown = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== token) return;
      if (e.key === 'Escape') {
        // An open combobox inside the dialog closes its own listbox first.
        const target = e.target as HTMLElement | null;
        if (target?.closest?.('[role="combobox"][aria-expanded="true"]')) return;
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;

      const focusable = panel.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!panel.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      stack.splice(stack.indexOf(token), 1);
      if (stack.length === 0) document.documentElement.classList.remove('dialog-open');
      previouslyFocused?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
