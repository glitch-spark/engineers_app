// The single Bidders page (spec 2026-11-14-bidders-single-page-design.md): each row's money and review counts (the
// pay-week board in week mode), the time columns and their cells, and the card's open state. The period filters
// are in bidderFilters.ts. Value imports carry `.ts` so Node's test runner loads this file as is (tests/bidderPage.test.mjs).
import { shortDay } from './profileList.ts';

type WeekBlock = { approved: number | null; pending: number | null; pay: number | null; toReview: number | null; source?: string };

/** A row's money and review numbers: the pay-week board's block in week mode (the pay-week window, folder counts
 *  before records start), else the period's report-day sums. */
export function rowMoney(r: {
  total: number; approved: number; pending: number; pay?: number; toReview?: number; week?: WeekBlock | null;
}): { approved: number | null; bids: number; pay: number | null; toReview: number | null; folder: boolean } {
  if (r.week) {
    return {
      approved: r.week.approved, bids: (r.week.approved ?? 0) + (r.week.pending ?? 0), pay: r.week.pay,
      toReview: r.week.toReview, folder: r.week.source === 'folders',
    };
  }
  return { approved: r.approved, bids: r.total, pay: r.pay ?? null, toReview: r.toReview ?? r.pending, folder: false };
}

export type TimeColumn = { key: string; label: string; sub: string; title: string; day?: string;
  /** A pay-week column of a month / range: the week's last report day, a key the read-only listing takes as `week`. */
  end?: string; isToday?: boolean; isFuture?: boolean };

const weekday = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });

function rangeLabel(start: string, end: string): string {
  if (start === end) return shortDay(start);
  const [s, e] = [shortDay(start), shortDay(end)];
  return s.split(' ')[0] === e.split(' ')[0] ? `${s}–${e.split(' ')[1]}` : `${s} – ${e}`;
}

/** The table's time columns: a pay week's report days (week mode) or the pay weeks of a month / range. */
export function timeColumns(resp: {
  payWeek?: { days: { day: string; isToday: boolean; isFuture: boolean }[] } | null;
  weeks: { start: string; end: string; partial: boolean }[];
}): TimeColumn[] {
  if (resp.payWeek) {
    return resp.payWeek.days.map((d) => ({
      key: d.day, label: weekday(d.day), sub: shortDay(d.day), title: `Bids on ${weekday(d.day)} ${shortDay(d.day)}`,
      day: d.day, isToday: d.isToday, isFuture: d.isFuture,
    }));
  }
  return resp.weeks.map((w, i) => ({
    key: `w${i}`, label: rangeLabel(w.start, w.end), sub: w.partial ? 'part' : '', end: w.end,
    title: `Bids ${shortDay(w.start)} – ${shortDay(w.end)}${w.partial ? ' (part of the pay week)' : ''}`,
  }));
}

/** A time column's cell of a row: the pay week's day cell (week mode), else the column's approved / pending split
 *  (`weekly` is approved + pending, `weeklyPending` the pending part). Unknown parts are null, never a made-up 0. */
export function weekCell(
  row: { weekly: number[]; weeklyPending?: number[]; dayCells?: BidCountsLike[] | null },
  i: number,
  weekMode: boolean,
): BidCountsLike {
  if (weekMode) return row.dayCells?.[i] ?? { approved: null, pending: null, rejected: null };
  const pending = row.weeklyPending?.[i];
  const all = row.weekly[i];
  if (pending == null || all == null) return { approved: null, pending: null, rejected: null };
  return { approved: all - pending, pending, rejected: null };
}

/** api.BidCounts, plus a day cell's folder source and read error (week mode). */
type BidCountsLike = { approved: number | null; pending: number | null; rejected: number | null; source?: string; error?: string | null };

/** The comparison card is folded unless the viewer unfolded it (remembered in this browser). */
export const cardOpen = (stored: string | null) => stored === 'open';
