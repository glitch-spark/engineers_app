/**
 * Bidders filters, kept in the URL so a reload, a shared link or coming back from a bidder keeps them.
 *
 * The periods are pay weeks, not calendar weeks, and the server works them out: its schedule (and a switch of it)
 * decides where a pay week starts and how many report days it has (7, or 8 across the switch). The client never
 * hard-codes that schedule. It reads "now" from the server's clock (`/bids/clock`: today's report day, this pay week's
 * first and last report day, the previous pay week's first) and steps from the report days the server showed for the
 * period (`ShownWeeks`). This module turns the URL into the request the server wants (`period`, `date`, `weeks`, `to`)
 * and steps the period; every date it makes is a calendar date `YYYY-MM-DD`, with UTC math so a daylight-saving
 * change can never shift a day.
 *
 * URL keys: `range` (this_pay_week when absent), `date` (the period's anchor day, set by stepping with ‹ ›), `from` /
 * `to` (Custom), `q`, `archived=1`, `owner` (admin: absent = their own team, a user id, or `all`; see bidsUrl.ts). Old links keep working: `week=<a day>` opens that pay week and
 * `period=month|custom` with `date` / `to` open that month or range.
 *
 * A pay week's `date` (and the old `week`) is any report day inside it; the server finds its pay week. Stepping with
 * the arrows can land on a period that has no named preset. The URL then says what it is, and the dropdown shows it
 * only while it is active: `range=pay_week&date=` (one pay week), `two_pay_weeks` (two) and `month`. Landing on
 * This / Last pay week (or month, or Last 2 pay weeks) again snaps back to that preset and drops `date`.
 */
import type * as api from '../api/endpoints';
import { customError, isValidDate, rangeLabel, stepRange, type DateRange } from './dateRange.ts';

export type BidderPreset =
  | 'this_pay_week'
  | 'last_pay_week'
  | 'last_2_pay_weeks'
  | 'this_month'
  | 'last_month'
  | 'custom'
  /** Transient: a pay week / two pay weeks / month reached by stepping, held by `date`. */
  | 'pay_week'
  | 'two_pay_weeks'
  | 'month';

export const BIDDER_PRESETS: { value: BidderPreset; label: string }[] = [
  { value: 'this_pay_week', label: 'This pay week' },
  { value: 'last_pay_week', label: 'Last pay week' },
  { value: 'last_2_pay_weeks', label: 'Last 2 pay weeks' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'custom', label: 'Custom' },
];
export const BIDDER_DEFAULT_RANGE: BidderPreset = 'this_pay_week';

const TRANSIENT_OPTIONS: Partial<Record<BidderPreset, { label: string; after: BidderPreset }>> = {
  pay_week: { label: 'Pay week', after: 'last_2_pay_weeks' },
  two_pay_weeks: { label: '2 pay weeks', after: 'last_2_pay_weeks' },
  month: { label: 'Month', after: 'last_month' },
};

/** The dropdown's options: the presets, plus the stepped period's own entry while one is active. */
export function bidderPresetOptions(active: BidderPreset): { value: BidderPreset; label: string }[] {
  const extra = TRANSIENT_OPTIONS[active];
  if (!extra) return BIDDER_PRESETS;
  const at = BIDDER_PRESETS.findIndex((o) => o.value === extra.after);
  return [...BIDDER_PRESETS.slice(0, at + 1), { value: active, label: extra.label }, ...BIDDER_PRESETS.slice(at + 1)];
}

/**
 * Every key the Bidders list reads or writes. `week` and `period` are the old URL's keys: they are read when `range`
 * is absent and removed when the period changes (a preset pick, a step, a custom range) and by Clear, so they can't
 * pin the page to an old period. The other filters (owner, archived, search) leave them as they are.
 * An empty `range` is the default (This pay week).
 */
export type BidderKey = 'owner' | 'archived' | 'q' | 'range' | 'date' | 'from' | 'to' | 'week' | 'period';
export type BidderUrlValues = Record<BidderKey, string>;
export const BIDDER_URL_DEFAULTS: BidderUrlValues = {
  owner: '', archived: '', q: '', range: '', date: '', from: '', to: '', week: '', period: '',
};
/** What Clear (and any filter change) puts back: the bar's own keys plus the old URL's period keys. */
export const BIDDER_CLEAR_KEYS: BidderKey[] = [
  'owner', 'archived', 'q', 'range', 'date', 'from', 'to', 'week', 'period',
];

export type BidderFilters = {
  owner: string;
  archived: boolean;
  q: string;
  range: BidderPreset;
  /** The period's anchor day when stepping moved it off the preset's own period: any report day of the (last) pay
   *  week, the first of the month. '' = the preset's own period. */
  date: string;
  /** Custom range, as typed in the URL (may be partial or invalid; see `bidderPeriodRequest`). */
  from: string;
  to: string;
};

// ---- the report clock ------------------------------------------------------

/** "Now" as the server's report clock sees it (`/bids/clock`, loaded by `useReportClock`). */
export type ReportClock = api.BidClock;

/** The first and last report day of the pay week(s) the server showed for the period. */
export type ShownWeeks = { first: string; last: string };

const DAY_MS = 86_400_000;
const parseDay = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const fmtDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (s: string, n: number) => fmtDay(parseDay(s) + n * DAY_MS);
const firstOfMonth = (s: string) => `${s.slice(0, 8)}01`;
const monthStep = (s: string, n: number) => {
  const d = new Date(parseDay(s));
  return fmtDay(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
};
const lastOfMonth = (s: string) => addDays(monthStep(s, 1), -1);

/**
 * A report day of the pay week(s) next to the shown one(s): back = the day before the first; forward = the last plus
 * 7 days (two pay weeks: plus 14). A pay week has 7 report days or, across a schedule switch, 8, so 7 days from the
 * first would land in the same long week again; the last + 7 is inside the following week (the caller clamps a day
 * past the current pay week). The one pay-week stepper, for the list's arrows and the bidder page's WeekNav.
 */
export function stepPayWeekDay(shown: ShownWeeks, dir: -1 | 1, weeks: 1 | 2 = 1): string {
  return dir < 0 ? addDays(shown.first, -1) : addDays(shown.last, 7 * weeks);
}

/**
 * The report days the server showed for a period: the pay week's days when it sent them, the two pay weeks' `start` /
 * `end` (cut to the day) for `period=week` without them, else undefined (a month, a Custom range).
 */
export function shownWeeksOf(resp: {
  period: string; start: string; end: string; payWeek?: { days: { day: string }[] } | null;
}): ShownWeeks | undefined {
  const days = resp.payWeek?.days;
  if (days && days.length > 0) return { first: days[0].day, last: days[days.length - 1].day };
  if (resp.period === 'week' && !resp.payWeek) return { first: resp.start.slice(0, 10), last: resp.end.slice(0, 10) };
  return undefined;
}

// ---- URL -> filters --------------------------------------------------------

const KNOWN = [...BIDDER_PRESETS.map((p) => p.value), 'pay_week', 'two_pay_weeks', 'month'] as string[];
const isWeekPreset = (r: BidderPreset) =>
  r === 'this_pay_week' || r === 'last_pay_week' || r === 'last_2_pay_weeks' || r === 'pay_week' || r === 'two_pay_weeks';
const isMonthPreset = (r: BidderPreset) => r === 'this_month' || r === 'last_month' || r === 'month';
const weeksOf = (r: BidderPreset): 1 | 2 => (r === 'last_2_pay_weeks' || r === 'two_pay_weeks' ? 2 : 1);

/** The anchor day a preset has on its own (no `date`): a report day of its (last) pay week, or the month's first day. */
function ownAnchor(range: BidderPreset, clock: ReportClock): string {
  if (range === 'this_pay_week' || range === 'pay_week') return clock.payWeekStart;
  if (range === 'last_pay_week' || range === 'last_2_pay_weeks' || range === 'two_pay_weeks') return addDays(clock.payWeekStart, -1);
  if (range === 'this_month' || range === 'month') return firstOfMonth(clock.today);
  if (range === 'last_month') return monthStep(clock.today, -1);
  return '';
}

/** Whether a report day is in the previous pay week (the clock says where it starts: it may have 8 days). */
const inLastPayWeek = (day: string, clock: ReportClock) => day >= clock.previousPayWeekStart && day < clock.payWeekStart;

/**
 * The preset (and `date`) a period with this anchor is known by. The current and previous pay week / month snap to
 * This / Last (no `date`); any other is the transient entry, held by `date`. A pay week's anchor is any report day
 * of it, so one on or after this pay week's first day is This pay week.
 */
function settle(range: BidderPreset, anchor: string, clock: ReportClock): { range: BidderPreset; date: string } {
  if (isMonthPreset(range)) {
    if (anchor === ownAnchor('this_month', clock)) return { range: 'this_month', date: '' };
    if (anchor === ownAnchor('last_month', clock)) return { range: 'last_month', date: '' };
    return { range: 'month', date: anchor };
  }
  if (weeksOf(range) === 2) {
    return inLastPayWeek(anchor, clock) ? { range: 'last_2_pay_weeks', date: '' } : { range: 'two_pay_weeks', date: anchor };
  }
  if (anchor >= clock.payWeekStart) return { range: 'this_pay_week', date: '' };
  if (inLastPayWeek(anchor, clock)) return { range: 'last_pay_week', date: '' };
  return { range: 'pay_week', date: anchor };
}

/** The period a URL's `range` and `date` name: the date's pay week / month when it is usable, else the preset's own. */
function settleUrl(range: BidderPreset, date: string, clock: ReportClock): { range: BidderPreset; date: string } {
  if (isValidDate(date)) {
    // Nothing past the current pay week / month: a future day in an old link is not a period.
    if (isWeekPreset(range)) {
      if (date <= clock.payWeekEnd) return settle(range, date, clock);
    } else if (firstOfMonth(date) <= firstOfMonth(clock.today)) {
      return settle(range, firstOfMonth(date), clock);
    }
  }
  // No usable date: a stepped period has nothing to hold it, so it is the preset it was stepped from.
  const own = range === 'pay_week' ? 'this_pay_week' : range === 'two_pay_weeks' ? 'last_2_pay_weeks' : range === 'month' ? 'this_month' : range;
  return { range: own, date: '' };
}

/** URL values (strings, possibly junk) -> typed filters. Never throws; bad values fall back to the defaults. */
export function parseBidderValues(values: BidderUrlValues, clock: ReportClock): BidderFilters {
  const base = { owner: values.owner, archived: values.archived === '1', q: values.q };
  let range: BidderPreset = BIDDER_DEFAULT_RANGE;
  let date = values.date;
  let from = values.from;
  let to = values.to;
  if (values.range) {
    // An unknown preset is the default; its dates mean nothing.
    if (KNOWN.includes(values.range)) range = values.range as BidderPreset;
    else date = '';
  } else if (values.period === 'custom') {
    range = 'custom';
    from = values.from || values.date;
  } else if (values.period === 'month') {
    range = 'this_month';
  } else if (!date && isValidDate(values.week)) {
    date = values.week;
  }
  if (range === 'custom') return { ...base, range, date: '', from, to };
  return { ...base, ...settleUrl(range, date, clock), from: '', to: '' };
}

/** Whether the bar shows anything that differs from its defaults (the Clear button). `owner` only counts for admins. */
export function bidderCanClear(f: BidderFilters, isAdmin: boolean): boolean {
  return (isAdmin && !!f.owner) || f.archived || !!f.q || f.range !== BIDDER_DEFAULT_RANGE || !!f.date;
}

// ---- filters -> request ----------------------------------------------------

/** The `/bids/performance` / `/bids/insights` query for a period. */
export type BidderPeriodRequest = { period: 'week' | 'month' | 'custom'; date?: string; to?: string; weeks?: 2 };

/** The Custom range's validation message (null when fine or when the range isn't Custom). */
export function bidderRangeError(f: BidderFilters): string | null {
  return f.range === 'custom' ? customError(f.from, f.to) : null;
}

/**
 * The period request, or null while a Custom range is partial or invalid (nothing to ask for).
 *  - This pay week: `period=week` (the server's pay week holding now, past the Saturday cutoff too).
 *  - Last pay week: `period=week&date=<the day before this pay week starts>`; Last 2 pay weeks adds `weeks=2`.
 *  - A pay week reached by stepping: `period=week&date=<a report day of it>` (and `weeks=2` for two pay weeks).
 *  - This / Last month: `period=month` / `period=month&date=<first of last month>`; Custom: `period=custom&date&to`.
 */
export function bidderPeriodRequest(f: BidderFilters, clock: ReportClock): BidderPeriodRequest | null {
  if (f.range === 'custom') return bidderRangeError(f) === null ? { period: 'custom', date: f.from, to: f.to } : null;
  if (isMonthPreset(f.range)) {
    const date = f.date || (f.range === 'last_month' ? ownAnchor('last_month', clock) : '');
    return date ? { period: 'month', date } : { period: 'month' };
  }
  const weeks = weeksOf(f.range);
  const date = f.date || (f.range === 'this_pay_week' ? '' : addDays(clock.payWeekStart, -1));
  return { period: 'week', ...(date ? { date } : {}), ...(weeks === 2 ? { weeks } : {}) };
}

/**
 * The days a period covers (a pay week's report days, a month, the Custom range), for the date inputs a Custom switch
 * is seeded from and for a label before the server's arrives. A pay week's are the ones the server showed (`shown`);
 * before they load, This / Last pay week's come from the clock (Last 2 pay weeks adds the 7 days before Last pay
 * week: only a seed, the server's days replace it) and a stepped pay week has none. Null for a bad Custom.
 */
export function bidderDays(f: BidderFilters, clock: ReportClock, shown?: ShownWeeks): DateRange | null {
  if (f.range === 'custom') return bidderRangeError(f) === null ? { from: f.from, to: f.to } : null;
  if (isMonthPreset(f.range)) {
    const anchor = f.date || ownAnchor(f.range, clock);
    return { from: anchor, to: lastOfMonth(anchor) };
  }
  if (shown) return { from: shown.first, to: shown.last };
  const lastWeek = { from: clock.previousPayWeekStart, to: addDays(clock.payWeekStart, -1) };
  if (f.date) return null;
  if (f.range === 'this_pay_week') return { from: clock.payWeekStart, to: clock.payWeekEnd };
  if (f.range === 'last_pay_week') return lastWeek;
  if (f.range === 'last_2_pay_weeks') return { from: addDays(lastWeek.from, -7), to: lastWeek.to };
  return null;
}

/** The label between ‹ and ›: the server's for pay weeks, the dates for months and Custom ('…' while it loads). */
export function bidderLabel(f: BidderFilters, days: DateRange | null, serverLabel: string | undefined): string {
  if (isWeekPreset(f.range)) return serverLabel ?? '…';
  return days ? rangeLabel(days) : '';
}

// ---- stepping --------------------------------------------------------------

/** Whether › may be used: not past the current pay week / month / the open report day. */
export function bidderCanStepForward(f: BidderFilters, clock: ReportClock): boolean {
  if (f.range === 'custom') {
    const days = bidderDays(f, clock);
    return !!days && addDays(days.to, 1) <= clock.today;
  }
  const anchor = f.date || ownAnchor(f.range, clock);
  return isWeekPreset(f.range) ? anchor < clock.payWeekStart : anchor < firstOfMonth(clock.today);
}

/** Whether ‹ may be used: a pay week steps from the days the server showed, so not until they have loaded. */
export function bidderCanStepBack(f: BidderFilters, shown?: ShownWeeks): boolean {
  return !isWeekPreset(f.range) || !!shown;
}

/** The URL value `range` has for a preset (the default is left out of the URL). */
export const rangeToUrl = (r: BidderPreset): string => (r === BIDDER_DEFAULT_RANGE ? '' : r);

/** The URL changes for a period: every period key (so no old key stays behind), `from` / `to` only for Custom. */
export type BidderPatch = Partial<Record<BidderKey, string | undefined>>;
export function periodPatch(range: BidderPreset, date: string, from = '', to = ''): BidderPatch {
  return { range: rangeToUrl(range), date: date || undefined, from: from || undefined, to: to || undefined, week: undefined, period: undefined };
}

/**
 * Arrows: a pay week steps from the report days the server showed (`stepPayWeekDay`: back to the day before the
 * first, forward to the last + 7, or + 14 for two pay weeks), a month by a month, Custom by its own length of days.
 * A step that lands on This / Last pay week (or month, or Last 2 pay weeks) takes that preset; any other period
 * becomes `pay_week` / `two_pay_weeks` / `month`, held by `date`. Stepping forward never goes past the current pay
 * week / month / today. Null for a bad Custom, and for a pay week whose days haven't loaded (no `shown`).
 */
export function stepBidderPeriod(f: BidderFilters, dir: -1 | 1, clock: ReportClock, shown?: ShownWeeks): BidderPatch | null {
  if (f.range === 'custom') {
    const days = bidderDays(f, clock);
    if (!days) return null;
    const next = stepRange(days, dir, 'custom');
    return periodPatch('custom', '', next.from, next.to > clock.today ? clock.today : next.to);
  }
  let next: string;
  if (isWeekPreset(f.range)) {
    if (!shown) return null;
    next = stepPayWeekDay(shown, dir, weeksOf(f.range));
    if (next > clock.payWeekEnd) next = clock.payWeekStart;
  } else {
    next = monthStep(f.date || ownAnchor(f.range, clock), dir);
    if (next > firstOfMonth(clock.today)) next = firstOfMonth(clock.today);
  }
  const settled = settle(f.range, next, clock);
  return periodPatch(settled.range, settled.date);
}

/** The change for a preset picked in the dropdown. Custom is seeded with the days the period covered, up to today. */
export function pickBidderPreset(
  range: BidderPreset, from: string | undefined, to: string | undefined, clock: ReportClock,
): BidderPatch {
  if (range === 'pay_week' || range === 'two_pay_weeks' || range === 'month') return {}; // only ever the active entry
  if (range !== 'custom') return periodPatch(range, '');
  const end = to && to > clock.today ? clock.today : to ?? '';
  const start = from && from > clock.today ? clock.today : from ?? '';
  return periodPatch('custom', '', start, end);
}

// ---- search ----------------------------------------------------------------

/** Whether a bidder row matches the search box: its name or its profile's name contains the text (any case). */
export function matchesBidderSearch(row: { name: string; profileName?: string | null }, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return row.name.toLowerCase().includes(needle) || (row.profileName ?? '').toLowerCase().includes(needle);
}
