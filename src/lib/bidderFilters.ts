/**
 * Bidders filters, kept in the URL so a reload, a shared link or coming back from a bidder keeps them.
 *
 * The periods are pay weeks (Sat 16:00 -> Sat 16:00 America/Chicago; report days Sun..Sat, a report day closes at
 * 18:30), not calendar weeks, and the server works them out. This module only turns the URL into the request the
 * server wants (`period`, `date`, `weeks`, `to`) and steps the period; every date it makes is a calendar date
 * `YYYY-MM-DD`, with UTC math so a daylight-saving change can never shift a day.
 *
 * URL keys: `range` (this_pay_week when absent), `date` (the period's anchor day, set by stepping with ‹ ›), `from` /
 * `to` (Custom), `q`, `archived=1`, `owner` (admin). Old links keep working: `week=<a day>` opens that pay week and
 * `period=month|custom` with `date` / `to` open that month or range.
 *
 * Stepping with the arrows can land on a period that has no named preset. The URL then says what it is, and the
 * dropdown shows it only while it is active: `range=pay_week&date=` (one pay week), `two_pay_weeks` (two) and `month`.
 * Landing on This / Last pay week (or month, or Last 2 pay weeks) again snaps back to that preset and drops `date`.
 */
import { customError, isValidDate, rangeLabel, stepRange, type DateRange } from './dateRange';

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
 * is absent and cleared whenever a filter changes, so they can't pin the page to an old period.
 * An empty `range` is the default (This pay week).
 */
export type BidderKey = 'owner' | 'archived' | 'q' | 'range' | 'date' | 'from' | 'to' | 'week' | 'period';
export type BidderUrlValues = Record<BidderKey, string>;
export const BIDDER_URL_DEFAULTS: BidderUrlValues = {
  owner: '', archived: '', q: '', range: '', date: '', from: '', to: '', week: '', period: '',
};
/** What Clear (and any filter change) puts back: the bar's own keys plus the old URL's period keys. */
export const BIDDER_CLEAR_KEYS: BidderKey[] = ['owner', 'archived', 'q', 'range', 'date', 'from', 'to', 'week', 'period'];

export type BidderFilters = {
  owner: string;
  archived: boolean;
  q: string;
  range: BidderPreset;
  /** The period's anchor day when stepping moved it off the preset's own period: the Sunday of the pay week, the
   *  first of the month. '' = the preset's own period. */
  date: string;
  /** Custom range, as typed in the URL (may be partial or invalid; see `bidderPeriodRequest`). */
  from: string;
  to: string;
};

// ---- the report clock ------------------------------------------------------

const REPORT_TZ = 'America/Chicago';
const DAILY_CUTOFF_MIN = 18 * 60 + 30;
const WEEKLY_CUTOFF_MIN = 16 * 60;
const DAY_MS = 86_400_000;

const parseDay = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const fmtDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (s: string, n: number) => fmtDay(parseDay(s) + n * DAY_MS);
/** Sunday on or before `s`: the first report day of the pay week holding `s`. */
export const payWeekStartOf = (s: string) => addDays(s, -new Date(parseDay(s)).getUTCDay());
const firstOfMonth = (s: string) => `${s.slice(0, 8)}01`;
const monthStep = (s: string, n: number) => {
  const d = new Date(parseDay(s));
  return fmtDay(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
};
const lastOfMonth = (s: string) => addDays(monthStep(s, 1), -1);

/** "Now" as the server's report clock sees it. */
export type ReportClock = {
  /** The open report day: the Chicago date, tomorrow's once 18:30 has passed. */
  today: string;
  /** The first report day (a Sunday) of the pay week holding now; Saturday after 16:00 already opens the next one. */
  payWeekStart: string;
};

export function reportClock(now: Date = new Date()): ReportClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: REPORT_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const num = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const date = `${String(num('year')).padStart(4, '0')}-${String(num('month')).padStart(2, '0')}-${String(num('day')).padStart(2, '0')}`;
  const minutes = num('hour') * 60 + num('minute');
  const weekday = new Date(parseDay(date)).getUTCDay();
  const payWeekStart = weekday === 6 && minutes >= WEEKLY_CUTOFF_MIN ? addDays(date, 1) : payWeekStartOf(date);
  return { today: minutes >= DAILY_CUTOFF_MIN ? addDays(date, 1) : date, payWeekStart };
}

// ---- URL -> filters --------------------------------------------------------

const KNOWN = [...BIDDER_PRESETS.map((p) => p.value), 'pay_week', 'two_pay_weeks', 'month'] as string[];
const isWeekPreset = (r: BidderPreset) =>
  r === 'this_pay_week' || r === 'last_pay_week' || r === 'last_2_pay_weeks' || r === 'pay_week' || r === 'two_pay_weeks';
const isMonthPreset = (r: BidderPreset) => r === 'this_month' || r === 'last_month' || r === 'month';
const weeksOf = (r: BidderPreset): 1 | 2 => (r === 'last_2_pay_weeks' || r === 'two_pay_weeks' ? 2 : 1);

/** The anchor day a preset has on its own (no `date`): the pay week's Sunday or the month's first day. */
function ownAnchor(range: BidderPreset, clock: ReportClock): string {
  if (range === 'this_pay_week' || range === 'pay_week') return clock.payWeekStart;
  if (range === 'last_pay_week' || range === 'last_2_pay_weeks' || range === 'two_pay_weeks') return addDays(clock.payWeekStart, -7);
  if (range === 'this_month' || range === 'month') return firstOfMonth(clock.today);
  if (range === 'last_month') return monthStep(clock.today, -1);
  return '';
}

/** The latest anchor a kind of period may have: the current pay week's Sunday / the current month's first day. */
const currentAnchor = (range: BidderPreset, clock: ReportClock) =>
  isWeekPreset(range) ? clock.payWeekStart : firstOfMonth(clock.today);

/**
 * The preset (and `date`) a period with this anchor is known by. The current and previous pay week / month snap to
 * This / Last (no `date`); any other is the transient entry, held by `date`.
 */
function settle(range: BidderPreset, anchor: string, clock: ReportClock): { range: BidderPreset; date: string } {
  if (isMonthPreset(range)) {
    if (anchor === ownAnchor('this_month', clock)) return { range: 'this_month', date: '' };
    if (anchor === ownAnchor('last_month', clock)) return { range: 'last_month', date: '' };
    return { range: 'month', date: anchor };
  }
  if (weeksOf(range) === 2) {
    return anchor === ownAnchor('last_2_pay_weeks', clock)
      ? { range: 'last_2_pay_weeks', date: '' }
      : { range: 'two_pay_weeks', date: anchor };
  }
  if (anchor === ownAnchor('this_pay_week', clock)) return { range: 'this_pay_week', date: '' };
  if (anchor === ownAnchor('last_pay_week', clock)) return { range: 'last_pay_week', date: '' };
  return { range: 'pay_week', date: anchor };
}

/** The period a URL's `range` and `date` name: the date's pay week / month when it is usable, else the preset's own. */
function settleUrl(range: BidderPreset, date: string, clock: ReportClock): { range: BidderPreset; date: string } {
  if (isValidDate(date)) {
    const anchor = isWeekPreset(range) ? payWeekStartOf(date) : firstOfMonth(date);
    // Nothing past the current pay week / month: a future day in an old link is not a period.
    if (anchor <= currentAnchor(range, clock)) return settle(range, anchor, clock);
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
 *  - A pay week reached by stepping: `period=week&date=<its Sunday>` (and `weeks=2` for Last 2 pay weeks).
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
 * The days a period covers by the calendar (a pay week's report days Sun..Sat, a month, the Custom range), for the
 * date inputs a Custom switch is seeded from and for a label before the server's arrives. Null for a bad Custom.
 */
export function bidderDays(f: BidderFilters, clock: ReportClock): DateRange | null {
  if (f.range === 'custom') return bidderRangeError(f) === null ? { from: f.from, to: f.to } : null;
  const anchor = f.date || ownAnchor(f.range, clock);
  if (isMonthPreset(f.range)) return { from: anchor, to: lastOfMonth(anchor) };
  return { from: addDays(anchor, weeksOf(f.range) === 2 ? -7 : 0), to: addDays(anchor, 6) };
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
  return anchor < currentAnchor(f.range, clock);
}

/** The URL value `range` has for a preset (the default is left out of the URL). */
export const rangeToUrl = (r: BidderPreset): string => (r === BIDDER_DEFAULT_RANGE ? '' : r);

/** The URL changes for a period: every period key (so no old key stays behind), `from` / `to` only for Custom. */
export type BidderPatch = Partial<Record<BidderKey, string | undefined>>;
export function periodPatch(range: BidderPreset, date: string, from = '', to = ''): BidderPatch {
  return { range: rangeToUrl(range), date: date || undefined, from: from || undefined, to: to || undefined, week: undefined, period: undefined };
}

/**
 * Arrows: a pay week moves by 7 days on `date` (two pay weeks by 14), a month by a month, Custom by its own length of
 * days. A step that lands on This / Last pay week (or month, or Last 2 pay weeks) takes that preset; any other period
 * becomes `pay_week` / `two_pay_weeks` / `month`, held by `date`. Stepping forward never goes past the current pay week / month / today. Null for a bad Custom.
 */
export function stepBidderPeriod(f: BidderFilters, dir: -1 | 1, clock: ReportClock): BidderPatch | null {
  if (f.range === 'custom') {
    const days = bidderDays(f, clock);
    if (!days) return null;
    const next = stepRange(days, dir, 'custom');
    return periodPatch('custom', '', next.from, next.to > clock.today ? clock.today : next.to);
  }
  const anchor = f.date || ownAnchor(f.range, clock);
  let next = isWeekPreset(f.range) ? addDays(anchor, 7 * weeksOf(f.range) * dir) : monthStep(anchor, dir);
  if (next > currentAnchor(f.range, clock)) next = currentAnchor(f.range, clock);
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
