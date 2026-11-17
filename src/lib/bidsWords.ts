// The Bids page's words, in one place: the glossary, the status and rate wording, the archive confirmation.
//
// SCHEDULE COPY. The pay-week and report-day times below mirror the server's report schedule: BID_DAILY_REPORT_TIME /
// BID_WEEKLY_REPORT_DAY / BID_WEEKLY_REPORT_TIME (the rules before the switch) and BID_SCHEDULE_SWITCH_AT with
// BID_NEXT_DAILY_REPORT_TIME / BID_NEXT_WEEKLY_REPORT_DAY / BID_NEXT_WEEKLY_REPORT_TIME (the rules after it), all in
// BID_REPORT_TIMEZONE (America/Chicago). The switch date is chosen at release, so no copy here names it: the text
// says which schedule applies "from the schedule change" and stays true on both sides of it. If those settings change,
// edit SCHEDULE_COPY and nothing else.
import { usd } from './money';

const SCHEDULE_COPY = {
  /** After the switch (BID_NEXT_*): the pay week closes Sunday 8 pm; a report day closes 6 pm. */
  payWeek: 'Sunday 8 pm → Sunday 8 pm, Chicago time',
  /** Before the switch (BID_WEEKLY_REPORT_DAY / BID_WEEKLY_REPORT_TIME). */
  oldPayWeek: 'Saturday 4 pm → Saturday 4 pm',
  dayClose: '6 pm',
  weekClose: 'Sunday 8 pm',
  overlap: 'Sunday 6–8 pm',
  /** Before the switch (BID_DAILY_REPORT_TIME 18:30 and the Saturday 4 pm weekly close). */
  oldOverlap: 'Saturday 4–6:30 pm',
};

export const GLOSSARY: { word: string; means: string }[] = [
  { word: 'Approved', means: 'Bids an owner approved.' },
  { word: 'Pending', means: 'Bids waiting for review. They are not paid until approved.' },
  { word: 'Bids', means: 'Approved + pending, shown only where both are meant (Performance view).' },
  { word: 'Pay', means: "Approved bids × the bidder's rate, inside the pay week. The only money figure on this page." },
  {
    word: 'Pay week',
    means:
      `${SCHEDULE_COPY.payWeek}, shown as “Week ending Sun Nov 29”. ` +
      `Weeks before the schedule change ran ${SCHEDULE_COPY.oldPayWeek}.`,
  },
  {
    word: 'My bids',
    means: 'Your own bids recorded by Bid Track while signed in as yourself. Never paid, never in the totals.',
  },
];

export const OVERLAP_NOTE =
  `A report day closes at ${SCHEDULE_COPY.dayClose} but the pay week at ${SCHEDULE_COPY.weekClose}, so bids made ` +
  `${SCHEDULE_COPY.overlap} show in Monday's day column yet count in the pay week that closes that Sunday. ` +
  `(Before the schedule change it ran the other way: bids made ${SCHEDULE_COPY.oldOverlap} showed in Saturday's column but counted in the next pay week.)`;

/** How to install Bid Track (was the hover text of the Download button). */
export const BID_TRACK_STEPS =
  'Unzip it, open chrome://extensions, turn on Developer mode and click "Load unpacked" on the folder. ' +
  'To update: unzip over the folder, then Reload.';

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
