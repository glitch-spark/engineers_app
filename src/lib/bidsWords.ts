// The Bids page's words, in one place: the status and rate wording, the archive confirmation.
import { usd } from './money';

export const rateText = (rate: number): string => `${usd(rate)} per approved bid`;

/** The Pay tab's words: a block's heading, its states, the pending warning and the empty week. */
export const payWeekTitle = (label: string): string => label.replace('Week ending', 'Pay week ending');
export const PAY_STATE = {
  open: 'so far',
  closedReport: 'closed (as posted to Slack)',
  closedLive: 'closed (live count)',
};
/** The warning under a bidder's line; the copied text names the bidder (`⚠ Ana: 3 pending …`). */
export const payPendingWarning = (n: number, name?: string): string =>
  `⚠ ${name ? `${name}: ` : ''}${n} pending — not paid until reviewed`;
export const PAY_EMPTY = 'No approved or pending bids in this pay week.';
export const PAY_UNREADABLE = "couldn't read the count";
export const PAY_POINTER = 'Pay is counted per pay week — see the Pay tab.';

/** `MMM d` in the viewer's local time zone. */
export function formatInviteDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** The status line of a bidder row. `bidder` is undefined for another owner's bidder (an admin's view): no invite details. */
export function statusWords(
  status: 'active' | 'invited' | 'archived',
  bidder: { username: string | null; inviteExpiresAt: string | null } | undefined,
  now: number,
): { text: string; expired: boolean } {
  if (status === 'archived') return { text: 'Archived', expired: false };
  if (status === 'active') return { text: bidder?.username ? `Active · @${bidder.username}` : 'Active', expired: false };
  if (!bidder) return { text: 'Invited', expired: false };
  if (!bidder.inviteExpiresAt) return { text: 'Invited · no code yet', expired: false };
  return {
    text: `Invited · expires ${formatInviteDate(bidder.inviteExpiresAt)}`,
    expired: new Date(bidder.inviteExpiresAt).getTime() < now,
  };
}

/** The one archive confirmation (the row menu and the suggested-archive prompt). */
export const ARCHIVE_CONFIRM = {
  title: 'Archive bidder?',
  body: (name: string) =>
    `Archive ${name}? They're signed out of Bid Track and leave the reports. History is kept, and you can restore them any time.`,
  confirmLabel: 'Archive',
  tone: 'default' as const,
};

/** How long ago an instant was: "just now", "5m ago", "3h ago", "2d ago". */
export function relativeTime(iso: string, now: number): string {
  const mins = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}
