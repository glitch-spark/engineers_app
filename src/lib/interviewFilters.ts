/** Interviews tab filters, kept in the URL so views, reloads and shared links agree. */
import {
  DATE_RANGE_PRESET_OPTIONS,
  mondayOfWeek,
  rangeForDatePreset,
  toDateInputValue,
  type DateRangePreset,
} from './dateRangePresets';
import { browserZone, toWall, zonedDayBounds } from './interviewTimezone';

export type ListSort = 'latest' | 'company' | 'stage' | 'status';
export type SortDir = 'asc' | 'desc';
export type CalendarView = 'week' | 'month';

export type InterviewFilters = {
  /** Owner id, or 'all' for every user. */
  user: string;
  profile: string;
  stage: string;
  status: string;
  range: DateRangePreset;
  from: string;
  to: string;
  sort: ListSort;
  dir: SortDir;
  page: number;
};

export type FilterDefaults = { userId: string };

const SORTS: ListSort[] = ['latest', 'company', 'stage', 'status'];
const PRESETS = DATE_RANGE_PRESET_OPTIONS.map((o) => o.value);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function defaults(d: FilterDefaults): InterviewFilters {
  return {
    user: d.userId,
    profile: '',
    stage: '',
    status: '',
    range: 'this_week',
    from: '',
    to: '',
    sort: 'latest',
    dir: 'desc',
    page: 1,
  };
}

export function parseInterviewFilters(params: URLSearchParams, d: FilterDefaults): InterviewFilters {
  const base = defaults(d);
  const get = (k: string) => params.get(k) ?? '';
  const range = get('range') as DateRangePreset;
  const sort = get('sort') as ListSort;
  const page = Number.parseInt(get('page'), 10);
  return {
    user: get('user') || base.user,
    profile: get('profile'),
    stage: get('stage'),
    status: get('status'),
    range: PRESETS.includes(range) ? range : base.range,
    from: DATE_RE.test(get('from')) ? get('from') : '',
    to: DATE_RE.test(get('to')) ? get('to') : '',
    sort: SORTS.includes(sort) ? sort : base.sort,
    dir: get('dir') === 'asc' ? 'asc' : 'desc',
    page: Number.isFinite(page) && page > 1 ? page : 1,
  };
}

/** Query string for the URL; default values are left out. */
export function serializeInterviewFilters(f: InterviewFilters, d: FilterDefaults): URLSearchParams {
  const base = defaults(d);
  const out = new URLSearchParams();
  (Object.keys(base) as (keyof InterviewFilters)[]).forEach((k) => {
    const v = f[k];
    if (v === base[k] || v === '' || v === undefined) return;
    out.set(k, String(v));
  });
  return out;
}

/** Monday → Sunday for week presets (the shared presets stop on Saturday). */
export function listDateRange(f: InterviewFilters, now = new Date()): { from: string; to: string } {
  if (f.range === 'custom') return { from: f.from, to: f.to };
  const weekOffset = f.range === 'prev_week' ? -7 : f.range === 'next_week' ? 7 : f.range === 'this_week' ? 0 : null;
  if (weekOffset !== null) {
    const monday = mondayOfWeek(now);
    monday.setDate(monday.getDate() + weekOffset);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { from: toDateInputValue(monday), to: toDateInputValue(sunday) };
  }
  return rangeForDatePreset(f.range, now);
}

const WEEK_PRESETS: Record<string, number> = { prev_week: -1, this_week: 0, next_week: 1 };

function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * What the calendar shows for the shared Date range: week presets → that
 * week; month presets and This year → Month view; Custom → the week of
 * `from` when it spans ≤ 7 days, else that month. `now` is today's wall date.
 */
export function calendarFromFilters(f: InterviewFilters, now: Date): { view: CalendarView; anchor: string } {
  if (f.range in WEEK_PRESETS) return { view: 'week', anchor: listDateRange(f, now).from };
  if (f.range === 'this_month' || f.range === 'prev_month') return { view: 'month', anchor: listDateRange(f, now).from };
  if (f.range === 'custom' && f.from) {
    const span = f.to ? Math.round((parseKey(f.to).getTime() - parseKey(f.from).getTime()) / 86400000) + 1 : 1;
    return { view: span <= 7 ? 'week' : 'month', anchor: f.from };
  }
  if (f.range === 'this_year') {
    return { view: 'month', anchor: toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)) };
  }
  return { view: 'week', anchor: toDateInputValue(mondayOfWeek(now)) };
}

/** Date range for a calendar period (named presets when they match, else Custom). */
export function filtersForCalendar(
  view: CalendarView,
  anchor: string,
  now: Date,
): Pick<InterviewFilters, 'range' | 'from' | 'to'> {
  const day = parseKey(anchor);
  if (view === 'week') {
    const monday = mondayOfWeek(day);
    const weeks = Math.round((monday.getTime() - mondayOfWeek(now).getTime()) / (7 * 86400000));
    const named = Object.keys(WEEK_PRESETS).find((k) => WEEK_PRESETS[k] === weeks) as DateRangePreset | undefined;
    if (named) return { range: named, from: '', to: '' };
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { range: 'custom', from: toDateInputValue(monday), to: toDateInputValue(sunday) };
  }
  const months = (day.getFullYear() - now.getFullYear()) * 12 + (day.getMonth() - now.getMonth());
  if (months === 0) return { range: 'this_month', from: '', to: '' };
  if (months === -1) return { range: 'prev_month', from: '', to: '' };
  return {
    range: 'custom',
    from: toDateInputValue(new Date(day.getFullYear(), day.getMonth(), 1)),
    to: toDateInputValue(new Date(day.getFullYear(), day.getMonth() + 1, 0)),
  };
}

/** Calendar day in the chosen zone → UTC instant, so "Monday" means that zone's Monday. */
function dayStart(key: string, tz: string): string {
  return zonedDayBounds(key, tz)[0].toISOString();
}

function dayEnd(key: string, tz: string): string {
  return new Date(zonedDayBounds(key, tz)[1].getTime() - 1).toISOString();
}

export function listQuery(
  f: InterviewFilters,
  limit: number,
  now = new Date(),
  tz: string = browserZone(),
): Record<string, string | number> {
  // Presets ("this week", …) are worked out from today's date in the chosen zone.
  const { from, to } = listDateRange(f, toWall(now, tz));
  const q: Record<string, string | number> = { page: f.page, limit, sort: f.sort, dir: f.dir };
  if (from) q.from = dayStart(from, tz);
  if (to) q.to = dayEnd(to, tz);
  if (f.user && f.user !== 'all') q.creatorId = f.user;
  if (f.profile) q.accountId = f.profile;
  if (f.stage) q.stage = f.stage;
  if (f.status) q.status = f.status;
  return q;
}

export type RoundsQuery = {
  from: string;
  to: string;
  creatorId?: string;
  accountId?: string;
  stage?: string;
  status?: string;
};

/** `range` is YYYY-MM-DD in `tz` with an exclusive `to`; sent as that zone's midnights. */
export function roundsQuery(
  f: InterviewFilters,
  range: { from: string; to: string },
  tz: string = browserZone(),
): RoundsQuery {
  const q: RoundsQuery = { from: dayStart(range.from, tz), to: dayStart(range.to, tz) };
  if (f.user && f.user !== 'all') q.creatorId = f.user;
  if (f.profile) q.accountId = f.profile;
  if (f.stage) q.stage = f.stage;
  if (f.status) q.status = f.status;
  return q;
}

/**
 * Query string for the List | Calendar switch: every filter carries over
 * (each view ignores the other's keys); only the page number and one-off
 * `panel` links are dropped.
 */
export function viewSwitchQuery(params: URLSearchParams): string {
  const keep = new URLSearchParams(params);
  keep.delete('page');
  keep.delete('panel');
  const s = keep.toString();
  return s ? `?${s}` : '';
}
