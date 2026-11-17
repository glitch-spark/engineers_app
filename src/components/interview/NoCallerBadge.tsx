import { normalizeInterviewStatus } from '../../lib/stageBadge';

/** A round worth a "No caller yet" badge: still scheduled and not started yet. */
export function isUpcomingScheduled(status: string | null | undefined, scheduledAt: string | null | undefined, now = new Date()): boolean {
  if (normalizeInterviewStatus(status) !== 'scheduled' || !scheduledAt) return false;
  const start = new Date(scheduledAt);
  return !isNaN(start.getTime()) && start > now;
}

/** A caller round nobody has been picked for yet. Assigning a caller is the confirmation, so there is no other badge. */
export function NoCallerBadge() {
  return <span className="badge-warning" title="Pick a caller for this round">No caller yet</span>;
}
