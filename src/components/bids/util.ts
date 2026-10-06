import { REJECT_REASONS, type BidReviewItem, type RejectReason } from '../../api/endpoints';

// Viewer-local, like the other pages.
export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** "45s", "3m 20s", "1h 5m". */
export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

export const reasonLabel = (reason: RejectReason | null): string | null =>
  reason ? REJECT_REASONS.find((r) => r.value === reason)?.label ?? reason : null;

/** Oldest first (by first screenshot); ids break ties so the order is stable. */
export const byFirstAt = (a: BidReviewItem, b: BidReviewItem) =>
  Date.parse(a.firstAt) - Date.parse(b.firstAt) || a.id.localeCompare(b.id);

/** Keys must not fire while the user is typing or choosing in a form control. */
export function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
}

/** A modal (useDialog marks the document) or a popover dialog is open. */
export const dialogIsOpen = () =>
  document.documentElement.classList.contains('dialog-open') || document.querySelector('[role="dialog"]') !== null;
