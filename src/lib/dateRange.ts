/**
 * One date-range module for every page filter.
 *
 * All dates are calendar dates in `YYYY-MM-DD` strings. All math is done in
 * UTC (Date.UTC / getUTC*) so a daylight-saving change can never shift a day.
 * `today` is always passed in by the caller; nothing here reads the clock.
 * Weeks are Monday-Sunday.
 */

export type DatePreset =
  | 'this_week'
  | 'next_week'
  | 'last_week'
  | 'last_2_weeks'
  | 'last_month'
  | 'this_month'
  | 'this_year'
  | 'today'
  | 'yesterday'
  | 'all_time'
  | 'custom';

/** Inclusive YYYY-MM-DD bounds. `null` stands for `all_time`. */
export type DateRange = { from: string; to: string };

const DAY_MS = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const PRESET_LABELS: Record<DatePreset, string> = {
  this_week: 'This week',
  next_week: 'Next week',
  last_week: 'Last week',
  last_2_weeks: 'Last 2 weeks',
  last_month: 'Last month',
  this_month: 'This month',
  this_year: 'This year',
  today: 'Today',
  yesterday: 'Yesterday',
  all_time: 'All time',
  custom: 'Custom',
};

// ---- calendar-date helpers (UTC) ------------------------------------------

function parse(s: string): { y: number; m: number; d: number; ms: number } {
  const match = DATE_RE.exec(s);
  if (!match) throw new Error(`Invalid date "${s}", expected YYYY-MM-DD`);
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  return { y, m, d, ms: Date.UTC(y, m - 1, d) };
}

function fmt(ms: number): string {
  const dt = new Date(ms);
  const y = String(dt.getUTCFullYear()).padStart(4, '0');
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(s: string, n: number): string {
  return fmt(parse(s).ms + n * DAY_MS);
}

/** Inclusive number of days from `from` to `to`. */
function dayCount(from: string, to: string): number {
  return Math.round((parse(to).ms - parse(from).ms) / DAY_MS) + 1;
}

function mondayOf(s: string): string {
  const dow = new Date(parse(s).ms).getUTCDay(); // Sun=0 ... Sat=6
  return addDays(s, dow === 0 ? -6 : 1 - dow);
}

function firstOfMonth(y: number, m: number): string {
  return fmt(Date.UTC(y, m - 1, 1));
}

/** Last day of month `m` (1-12); Date.UTC normalizes month overflow. */
function lastOfMonth(y: number, m: number): string {
  return fmt(Date.UTC(y, m, 0));
}

/** First day of the month `offset` months from the month of `s`. */
function monthStart(s: string, offset: number): string {
  const { y, m } = parse(s);
  return fmt(Date.UTC(y, m - 1 + offset, 1));
}

function monthEnd(s: string, offset: number): string {
  const { y, m } = parse(s);
  return fmt(Date.UTC(y, m + offset, 0));
}

function minDate(a: string, b: string): string {
  return a <= b ? a : b;
}

// ---- public API -----------------------------------------------------------

/**
 * Preset dropdown options. `before` items go right after This week, `after`
 * items after This year; Custom is always last.
 */
export function presetOptions(
  extras: { before?: DatePreset[]; after?: DatePreset[] } = {},
): { value: DatePreset; label: string }[] {
  const opt = (value: DatePreset) => ({ value, label: PRESET_LABELS[value] });
  const standard: DatePreset[] = ['last_week', 'last_2_weeks', 'last_month', 'this_month', 'this_year'];
  return [
    opt('this_week'),
    ...(extras.before ?? []).map(opt),
    ...standard.map(opt),
    ...(extras.after ?? []).map(opt),
    opt('custom'),
  ];
}

/**
 * The range a preset stands for on `today`. `all_time` and `custom` have none
 * (null). With `allowFuture: false` this_week/this_month/this_year end today.
 */
export function rangeFor(
  preset: DatePreset,
  today: string,
  opts: { allowFuture?: boolean } = {},
): DateRange | null {
  const allowFuture = opts.allowFuture ?? true;
  const clip = (range: DateRange): DateRange => (allowFuture ? range : { from: range.from, to: minDate(range.to, today) });
  const { y, m } = parse(today);
  const monday = mondayOf(today);

  switch (preset) {
    case 'this_week':
      return clip({ from: monday, to: addDays(monday, 6) });
    case 'next_week':
      return { from: addDays(monday, 7), to: addDays(monday, 13) };
    case 'last_week':
      return { from: addDays(monday, -7), to: addDays(monday, -1) };
    case 'last_2_weeks':
      return { from: addDays(monday, -14), to: addDays(monday, -1) };
    case 'last_month':
      return { from: monthStart(today, -1), to: monthEnd(today, -1) };
    case 'this_month':
      return clip({ from: firstOfMonth(y, m), to: lastOfMonth(y, m) });
    case 'this_year':
      return clip({ from: `${String(y).padStart(4, '0')}-01-01`, to: `${String(y).padStart(4, '0')}-12-31` });
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const yesterday = addDays(today, -1);
      return { from: yesterday, to: yesterday };
    }
    case 'all_time':
    case 'custom':
      return null;
  }
}

/**
 * Which preset (of `allowed`, checked in order) the range equals, or 'custom'.
 * `custom` and `all_time` are never matched.
 */
export function matchPreset(
  range: DateRange,
  today: string,
  allowed: DatePreset[],
  opts: { allowFuture?: boolean } = {},
): DatePreset {
  for (const preset of allowed) {
    if (preset === 'custom' || preset === 'all_time') continue;
    const candidate = rangeFor(preset, today, opts);
    if (candidate && candidate.from === range.from && candidate.to === range.to) return preset;
  }
  return 'custom';
}

/**
 * Move a range one step back (-1) or forward (+1). Week, 2-week, month and
 * year presets step to whole periods, snapped from the range's `from` (so a
 * clipped this_month steps to a whole month). Anything else (custom, today,
 * yesterday, ...) moves by the range's own inclusive day count.
 */
export function stepRange(range: DateRange, dir: -1 | 1, preset: DatePreset): DateRange {
  switch (preset) {
    case 'this_week':
    case 'next_week':
    case 'last_week': {
      const from = addDays(mondayOf(range.from), 7 * dir);
      return { from, to: addDays(from, 6) };
    }
    case 'last_2_weeks': {
      const from = addDays(range.from, 14 * dir);
      return { from, to: addDays(from, 13) };
    }
    case 'last_month':
    case 'this_month':
      return { from: monthStart(range.from, dir), to: monthEnd(range.from, dir) };
    case 'this_year': {
      const year = String(parse(range.from).y + dir).padStart(4, '0');
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    }
    default: {
      const n = dayCount(range.from, range.to);
      return { from: addDays(range.from, n * dir), to: addDays(range.to, n * dir) };
    }
  }
}

/**
 * Whether stepping forward is allowed. With `allowFuture` it always is;
 * otherwise only while the next range would start on or before `today`.
 */
export function canStep(range: DateRange, _dir: 1, today: string, allowFuture: boolean): boolean {
  if (allowFuture) return true;
  return addDays(range.to, 1) <= today;
}

/** Human label showing the actual dates, e.g. `Nov 9–15, 2026`. */
export function rangeLabel(range: DateRange | null): string {
  if (!range) return 'All time';
  const a = parse(range.from);
  const b = parse(range.to);
  const mon = (m: number) => MONTHS[m - 1];

  if (range.from === range.to) return `${mon(a.m)} ${a.d}, ${a.y}`;
  if (a.y === b.y && a.m === 1 && a.d === 1 && b.m === 12 && b.d === 31) return String(a.y);
  if (a.y === b.y && a.m === b.m && a.d === 1 && range.to === lastOfMonth(a.y, a.m)) return `${mon(a.m)} ${a.y}`;
  if (a.y === b.y && a.m === b.m) return `${mon(a.m)} ${a.d}–${b.d}, ${a.y}`;
  if (a.y === b.y) return `${mon(a.m)} ${a.d} – ${mon(b.m)} ${b.d}, ${a.y}`;
  return `${mon(a.m)} ${a.d}, ${a.y} – ${mon(b.m)} ${b.d}, ${b.y}`;
}

/** Validation message for a custom range, or null when it is fine. */
export function customError(from: string, to: string): string | null {
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) return 'Pick both dates.';
  if (from > to) return 'From must be on or before To.';
  if (dayCount(from, to) > 366) return 'Pick a range of a year or less.';
  return null;
}

/** Old Interviews URL values -> current presets; null for anything else. */
export function legacyPreset(value: string): DatePreset | null {
  if (value === 'prev_week') return 'last_week';
  if (value === 'prev_month') return 'last_month';
  return null;
}

/** Period params for the stats endpoints. Callers handle all_time themselves. */
export function toStatsParams(
  preset: DatePreset,
  range: DateRange,
): { period: 'week' | 'month' | 'custom'; date: string; to?: string } {
  switch (preset) {
    case 'this_week':
    case 'last_week':
    case 'next_week':
      return { period: 'week', date: mondayOf(range.from) };
    case 'this_month':
    case 'last_month': {
      const { y, m } = parse(range.from);
      return { period: 'month', date: firstOfMonth(y, m) };
    }
    default:
      return { period: 'custom', date: range.from, to: range.to };
  }
}
