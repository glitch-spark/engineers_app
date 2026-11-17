// The Pay tab's "Copy pay summary": one pay week as plain text for pasting into a message.
import type * as api from '../api/endpoints';
import { usd } from './money';
import { payPendingWarning, payWeekTitle, PAY_STATE, PAY_UNREADABLE } from './bidsWords';

/** A bidder's pay line (the same words the tab's rows use). */
export function payLine(b: api.PayBidderRow): string {
  if (b.error) return `${b.name} — ${PAY_UNREADABLE}`;
  // A folder-counted week has no pending figure: its bids are the approved ones.
  const noun = b.pending === null ? 'bids' : 'approved';
  return `${b.name} — ${b.approved ?? 0} ${noun} × ${usd(b.rate ?? 0)} = ${usd(b.pay ?? 0)}`;
}

/** The bidders in order, grouped by owner (in order of first appearance) when `groupByOwner`. */
export function ownerGroups(bidders: api.PayBidderRow[]): { ownerId: string; ownerName: string | null; bidders: api.PayBidderRow[] }[] {
  const groups = new Map<string, { ownerId: string; ownerName: string | null; bidders: api.PayBidderRow[] }>();
  for (const b of bidders) {
    const g = groups.get(b.ownerId) ?? { ownerId: b.ownerId, ownerName: b.ownerName, bidders: [] };
    g.bidders.push(b);
    groups.set(b.ownerId, g);
  }
  return [...groups.values()];
}

export function payCopyText(week: api.PayWeekBlock, opts: { groupByOwner: boolean }): string {
  const lines = [`${payWeekTitle(week.label)}${week.state === 'open' ? ` (${PAY_STATE.open})` : ''}`];
  const bidderLines = (list: api.PayBidderRow[]) => {
    for (const b of list) {
      lines.push(payLine(b));
      if (!b.error && (b.pending ?? 0) > 0) lines.push(payPendingWarning(b.pending!, b.name));
    }
  };
  if (opts.groupByOwner) {
    for (const g of ownerGroups(week.bidders)) {
      lines.push(`${g.ownerName ?? 'Unknown owner'}:`);
      bidderLines(g.bidders);
    }
  } else {
    bidderLines(week.bidders);
  }
  lines.push(`Total ${usd(week.totals.pay)}`);
  return lines.join('\n');
}
