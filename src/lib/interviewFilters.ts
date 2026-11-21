/** Interviews filters, kept in the URL so views, tabs, reloads and shared links agree. */
import {
  customError,
  legacyPreset,
  matchPreset,
  presetOptions,
  rangeFor,
  stepRange,
  type DatePreset,
  type DateRange,
} from './dateRange';
import { browserZone, toWall, zonedDayBounds } from './interviewTimezone';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from '../components/Pagination';
import type { CallType, InterviewSummaryParams, listCallerRounds } from '../api/endpoints';
import { PROFILE_REGIONS } from './countries';

export type ListSort = 'latest' | 'company' | 'stage' | 'status';
export type SortDir = 'asc' | 'desc';
export type CalendarView = 'week' | 'month';

/** The Interviews Date range: the standard presets plus Next week (the one page whose range may reach the future). */
export const INTERVIEW_PRESETS = presetOptions({ before: ['next_week'] });
export const DEFAULT_RANGE: DatePreset = 'this_week';

export type InterviewFilters = {
  /** Owner id, or 'all' for every user. */
  user: string;
  profile: string;
  /** The profile's region: one of PROFILE_REGIONS, 'none' (no region), or '' for every region. */
  region: string;
  stage: string;
  status: string;
  /** Callers calendar: a caller id, 'unassigned', or '' for every caller. */
  caller: string;
  /** Callers tab: one user's interviews, or '' for every user (kept apart from `user`, which defaults to you). */
  owner: string;
  /** Company / position search ('' = none). */
  q: string;
  range: DatePreset;
  from: string;
  to: string;
  sort: ListSort;
  dir: SortDir;
  page: number;
  /** Rows per page: one of the shared sizes (10 / 20 / 50 / 100). */
  size: number;
};

export type FilterDefaults = { userId: string };

/**
 * The Self interviews User default: an admin's is the first team member A–Z (every user, `all`, when there is no team);
 * everyone else's is their own (every user while the signed-in user is unknown). Caller interviews has its own `owner`
 * filter, whose default stays every user (`''`).
 */
export function defaultInterviewUser(a: { isAdmin: boolean; userId: string | undefined; firstMember: string | undefined }): string {
  return a.isAdmin ? a.firstMember || 'all' : a.userId || 'all';
}

/** Every URL key this page owns (the values are all strings in the URL). Other keys (`panel`, `round`, `brief`, `zone`) are not ours. */
export type InterviewKey =
  | 'user' | 'profile' | 'region' | 'stage' | 'status' | 'caller' | 'owner' | 'q'
  | 'range' | 'from' | 'to' | 'sort' | 'dir' | 'page' | 'size';
export type InterviewUrlValues = Record<InterviewKey, string>;

/** URL defaults (left out of the URL). `from` / `to` default to '' as the shared date control requires. */
export function interviewUrlDefaults(d: FilterDefaults): InterviewUrlValues {
  return {
    user: d.userId,
    profile: '',
    region: '',
    stage: '',
    status: '',
    caller: '',
    owner: '',
    q: '',
    range: DEFAULT_RANGE,
    from: '',
    to: '',
    sort: 'latest',
    dir: 'desc',
    page: '1',
    size: String(DEFAULT_PAGE_SIZE),
  };
}

/** The keys each tab's filter bar shows: what Clear resets and what makes Clear appear. */
export function barKeys(callersView: boolean): InterviewKey[] {
  return callersView
    ? ['owner', 'caller', 'region', 'stage', 'status', 'q', 'range', 'from', 'to']
    : ['user', 'profile', 'region', 'stage', 'status', 'q', 'range', 'from', 'to'];
}

/** The Region filter, both tabs: an interview's region is its profile's; `none` = the profile has none. */
export const INTERVIEW_REGION_OPTIONS = [
  { value: '', label: 'All regions' },
  ...PROFILE_REGIONS.map((r) => ({ value: r as string, label: r as string })),
  { value: 'none', label: 'No region' },
];

const SORTS: ListSort[] = ['latest', 'company', 'stage', 'status'];
const KNOWN_PRESETS = INTERVIEW_PRESETS.map((o) => o.value as string);

/**
 * The preset an old or odd URL value stands for: `prev_week` / `prev_month` (the old names) map to Last week /
 * Last month; anything this page doesn't offer falls back to This week.
 */
export function normalizeRange(raw: string): DatePreset {
  const mapped: string = legacyPreset(raw) ?? raw;
  return KNOWN_PRESETS.includes(mapped) ? (mapped as DatePreset) : DEFAULT_RANGE;
}

/** URL values (strings, possibly junk) → typed filters. Never throws; bad values fall back to the defaults. */
export function parseInterviewValues(values: InterviewUrlValues, d: FilterDefaults): InterviewFilters {
  const range = normalizeRange(values.range);
  const page = Number.parseInt(values.page, 10);
  const size = Number.parseInt(values.size, 10);
  return {
    user: values.user || d.userId,
    profile: values.profile,
    region: INTERVIEW_REGION_OPTIONS.some((o) => o.value === values.region) ? values.region : '',
    stage: values.stage,
    status: values.status,
    caller: values.caller,
    owner: values.owner,
    q: values.q,
    range,
    // Only a Custom range reads from / to; they are kept as typed so the bar can say what is wrong with them.
    from: range === 'custom' ? values.from : '',
    to: range === 'custom' ? values.to : '',
    sort: (SORTS as string[]).includes(values.sort) ? (values.sort as ListSort) : 'latest',
    dir: values.dir === 'asc' ? 'asc' : 'desc',
    page: Number.isFinite(page) && page > 1 ? page : 1,
    size: PAGE_SIZES.includes(size) ? size : DEFAULT_PAGE_SIZE,
  };
}

/** A filters patch → URL string values (page numbers become strings; `undefined` stays, meaning "back to the default"). */
export function patchToUrl(patch: Partial<InterviewFilters>): Partial<InterviewUrlValues> {
  const out: Partial<InterviewUrlValues> = {};
  (Object.keys(patch) as InterviewKey[]).forEach((k) => {
    const v = patch[k];
    out[k] = v === undefined ? undefined : String(v);
  });
  return out;
}

/** Whether anything the tab's bar shows differs from its default (the Clear button). */
export function barDiffers(f: InterviewFilters, d: FilterDefaults, callersView: boolean): boolean {
  if (f.region || f.stage || f.status || f.q.trim()) return true;
  if (f.range !== DEFAULT_RANGE) return true;
  return callersView ? !!(f.owner || f.caller) : f.user !== d.userId || !!f.profile;
}

// ---- dates ----------------------------------------------------------------

/** A browser-local Date (e.g. from `toWall`) as `YYYY-MM-DD`. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * The days the Date range stands for on `today` (`YYYY-MM-DD`, the chosen zone's date), or null while there are
 * none to ask for: a Custom range that is missing a date, impossible, reversed or longer than a year.
 */
export function rangeDates(f: Pick<InterviewFilters, 'range' | 'from' | 'to'>, today: string): DateRange | null {
  if (f.range === 'custom') return customError(f.from, f.to) === null ? { from: f.from, to: f.to } : null;
  return rangeFor(f.range, today, { allowFuture: true });
}

function spanDays(r: DateRange): number {
  const [fy, fm, fd] = r.from.split('-').map(Number);
  const [ty, tm, td] = r.to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000) + 1;
}

/**
 * What the calendar shows for the shared Date range. A range of a week or less shows that week; a longer one shows
 * Month view of the month it starts in; This year shows the current month. null when the range has no dates (an
 * invalid Custom range): the calendar then asks for nothing.
 */
export function calendarFromFilters(
  f: Pick<InterviewFilters, 'range' | 'from' | 'to'>,
  today: string,
): { view: CalendarView; anchor: string } | null {
  const r = rangeDates(f, today);
  if (!r) return null;
  if (f.range === 'this_year') return { view: 'month', anchor: `${today.slice(0, 7)}-01` };
  return { view: spanDays(r) <= 7 ? 'week' : 'month', anchor: r.from };
}

/** The Date range value for a set of days: the preset it equals (Next week included), else Custom. */
export function filtersForRange(range: DateRange, today: string): Pick<InterviewFilters, 'range' | 'from' | 'to'> {
  const preset = matchPreset(range, today, INTERVIEW_PRESETS.map((o) => o.value), { allowFuture: true });
  return preset === 'custom' ? { range: 'custom', from: range.from, to: range.to } : { range: preset, from: '', to: '' };
}

/** The whole week or month (as `view`) that contains `anchor`. */
export function calendarPeriod(view: CalendarView, anchor: string): DateRange {
  return rangeFor(view === 'week' ? 'this_week' : 'this_month', anchor, { allowFuture: true })!;
}

/** Date range for a calendar period (a named preset when it matches, else Custom). */
export function filtersForCalendar(
  view: CalendarView,
  anchor: string,
  today: string,
): Pick<InterviewFilters, 'range' | 'from' | 'to'> {
  return filtersForRange(calendarPeriod(view, anchor), today);
}

/** The calendar's own ‹ ›: one week or one month from `anchor`, written as the shared Date range. */
export function stepCalendar(
  view: CalendarView,
  anchor: string,
  dir: -1 | 1,
  today: string,
): Pick<InterviewFilters, 'range' | 'from' | 'to'> {
  const next = stepRange(calendarPeriod(view, anchor), dir, view === 'week' ? 'this_week' : 'this_month');
  return filtersForRange(next, today);
}

// ---- requests -------------------------------------------------------------

/** Calendar day in the chosen zone → UTC instant, so "Monday" means that zone's Monday. */
function dayStart(key: string, tz: string): string {
  return zonedDayBounds(key, tz)[0].toISOString();
}

function dayEnd(key: string, tz: string): string {
  return new Date(zonedDayBounds(key, tz)[1].getTime() - 1).toISOString();
}

/** The search text to send, or nothing. */
const searchText = (f: Pick<InterviewFilters, 'q'>): string => f.q.trim();

/** Presets ("this week", …) are worked out from today's date in the chosen zone. */
function zoneToday(now: Date, tz: string): string {
  return dayKey(toWall(now, tz));
}

/** The Self interviews list request (always `callType=self`: rounds with no caller), or null while the Date range is invalid (nothing to ask for). */
export function listQuery(
  f: InterviewFilters,
  limit: number,
  now = new Date(),
  tz: string = browserZone(),
): Record<string, string | number> | null {
  const days = rangeDates(f, zoneToday(now, tz));
  if (!days) return null;
  const q: Record<string, string | number> = { page: f.page, limit, sort: f.sort, dir: f.dir };
  q.from = dayStart(days.from, tz);
  q.to = dayEnd(days.to, tz);
  if (f.user && f.user !== 'all') q.creatorId = f.user;
  if (f.profile) q.accountId = f.profile;
  if (f.region) q.region = f.region;
  if (f.stage) q.stage = f.stage;
  if (f.status) q.status = f.status;
  q.callType = 'self';
  if (searchText(f)) q.q = searchText(f);
  return q;
}

/** Caller interviews list: the Date range like the Self interviews list, the Caller filter, newest first by default. Null while the range is invalid. */
export function callerRoundsQuery(
  f: InterviewFilters,
  limit: number,
  now = new Date(),
  tz: string = browserZone(),
): Parameters<typeof listCallerRounds>[0] | null {
  const days = rangeDates(f, zoneToday(now, tz));
  if (!days) return null;
  const q: Parameters<typeof listCallerRounds>[0] = { page: f.page, limit, dir: f.dir };
  q.from = dayStart(days.from, tz);
  q.to = dayEnd(days.to, tz);
  if (f.region) q.region = f.region;
  if (f.stage) q.stage = f.stage;
  if (f.status) q.status = f.status;
  if (f.caller) q.callerId = f.caller;
  if (f.owner) q.creatorId = f.owner;
  if (searchText(f)) q.q = searchText(f);
  return q;
}

export type RoundsQuery = {
  from: string;
  to: string;
  creatorId?: string;
  accountId?: string;
  region?: string;
  stage?: string;
  status?: string;
  callerOnly?: string;
  callerId?: string;
  callType?: CallType;
  q?: string;
};

/** `range` is YYYY-MM-DD in `tz` with an exclusive `to`; sent as that zone's midnights.
 * `callers`: the Caller interviews calendar — every user's caller rounds, narrowed by the Caller filter. */
export function roundsQuery(
  f: InterviewFilters,
  range: { from: string; to: string },
  tz: string = browserZone(),
  { callers = false }: { callers?: boolean } = {},
): RoundsQuery {
  const q: RoundsQuery = { from: dayStart(range.from, tz), to: dayStart(range.to, tz) };
  if (callers) {
    q.callerOnly = 'true';
    if (f.caller) q.callerId = f.caller;
    if (f.owner) q.creatorId = f.owner;
  } else {
    if (f.user && f.user !== 'all') q.creatorId = f.user;
    if (f.profile) q.accountId = f.profile;
    q.callType = 'self';
  }
  if (f.region) q.region = f.region;
  if (f.stage) q.stage = f.stage;
  if (f.status) q.status = f.status;
  if (searchText(f)) q.q = searchText(f);
  return q;
}

/**
 * The totals strip's request: the request of the view under it (`listQuery`, `callerRoundsQuery` or `roundsQuery`)
 * without paging and sorting, so both count the same rounds. Null while the view has nothing to ask for.
 * `callers`: the Caller interviews tab (caller rounds only). `exclusiveTo`: the calendar's `to` is the midnight after
 * its last day, while the summary's `to` is inclusive, so it is moved to the last instant shown.
 */
export function summaryQuery(
  view: object | null,
  { callers = false, exclusiveTo = false }: { callers?: boolean; exclusiveTo?: boolean } = {},
): InterviewSummaryParams | null {
  if (!view) return null;
  const { page, limit, sort, dir, callerOnly, ...rest } = view as Record<string, unknown>;
  const q = rest as InterviewSummaryParams;
  if (callers) q.callerOnly = true;
  if (exclusiveTo && q.to) q.to = new Date(Date.parse(q.to) - 1).toISOString();
  return q;
}

/**
 * Query string for the List | Calendar switch and the Self interviews | Caller interviews tabs: every filter carries
 * over (each view ignores the other's keys); only the page number, one-off links (`panel`, `round`, `brief`)
 * and the retired `call` key are dropped.
 */
export function viewSwitchQuery(params: URLSearchParams): string {
  const keep = new URLSearchParams(params);
  ['page', 'panel', 'round', 'brief', 'call'].forEach((k) => keep.delete(k));
  const s = keep.toString();
  return s ? `?${s}` : '';
}

/**
 * Old links: `/interviews?call=caller` (the retired Self / Caller filter) goes to the matching Caller interviews view with
 * the other keys kept; a leftover `call=self` (or anything else) is dropped. Self interviews is always self rounds.
 */
export function legacyCallTarget(pathname: string, search: string): string | null {
  const params = new URLSearchParams(search);
  if (!params.has('call')) return null;
  const toCallers = params.get('call') === 'caller';
  params.delete('call');
  const qs = params.toString();
  const path = toCallers ? pathname.replace(/^\/interviews/, '/interviews/callers') : pathname;
  return `${path}${qs ? `?${qs}` : ''}`;
}
