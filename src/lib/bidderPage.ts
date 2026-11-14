// The single Bidders page (spec 2026-11-14-bidders-single-page-design.md): the totals strip, each row's money and
// review counts (the pay-week board in week mode), the time columns and the card's open state. Value imports carry
// `.ts` so Node's test runner loads this file as is (tests/bidderPage.test.mjs).
import { usd } from './money.ts';
import { shortDay } from './profileList.ts';

// A count the server doesn't know (folder weeks: no review, no rejects) shows a dash, never a made-up 0.
const count = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('en-US'));

export type StripItem = { key: 'approved' | 'review' | 'rejected' | 'today'; text: string; tone: 'good' | 'warn' | 'bad' | null };

/** The one-line strip: approved and pay, to review, rejected, and today (only for the current pay week). */
export function stripItems(t: {
  approved?: number | null; pay?: number | null; toReview?: number | null; rejected?: number | null;
  today?: { approved: number; pending: number } | null;
}): StripItem[] {
  const items: StripItem[] = [
    { key: 'approved', text: `${count(t.approved)} approved${t.pay == null ? '' : ` · ${usd(t.pay)} pay`}`, tone: 'good' },
    { key: 'review', text: `${count(t.toReview)} to review`, tone: t.toReview ? 'warn' : null },
    { key: 'rejected', text: `${count(t.rejected)} rejected`, tone: t.rejected ? 'bad' : null },
  ];
  if (t.today) {
    items.push({
      key: 'today', tone: null,
      text: `Today ${count(t.today.approved)}${t.today.pending ? ` (${count(t.today.pending)} pending)` : ''}`,
    });
  }
  return items;
}

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

export type TimeColumn = { key: string; label: string; sub: string; title: string; day?: string; isToday?: boolean; isFuture?: boolean };

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
    key: `w${i}`, label: rangeLabel(w.start, w.end), sub: w.partial ? 'part' : '',
    title: `Bids ${shortDay(w.start)} – ${shortDay(w.end)}${w.partial ? ' (part of the pay week)' : ''}`,
  }));
}

export type PagePeriod = { period: 'week' | 'month' | 'custom'; day: string; from: string; to: string };

/** The page's period from the URL: `week` (a day of the pay week; none = the current one) unless `period` says month
 *  or custom (`date`, and `to` for custom), so returning from a bidder keeps it. `today` seeds the custom defaults. */
export function periodFromParams(
  p: { week?: string | null; period?: string | null; date?: string | null; to?: string | null }, today: string,
): PagePeriod {
  const monthStart = `${today.slice(0, 8)}01`;
  if (p.period === 'month') return { period: 'month', day: p.date || today, from: monthStart, to: today };
  if (p.period === 'custom') return { period: 'custom', day: '', from: p.date || monthStart, to: p.to || today };
  return { period: 'week', day: p.week || '', from: monthStart, to: today };
}

/** The URL params for a period (null = removed): the inverse of `periodFromParams`. */
export function periodToParams(f: PagePeriod): Record<'week' | 'period' | 'date' | 'to', string | null> {
  if (f.period === 'week') return { week: f.day || null, period: null, date: null, to: null };
  if (f.period === 'month') return { week: null, period: 'month', date: f.day || null, to: null };
  return { week: null, period: 'custom', date: f.from || null, to: f.to || null };
}

/** The comparison card stays open unless the viewer closed it (remembered in this browser). */
export const cardOpen = (stored: string | null) => stored !== 'closed';
