/** Interviews tab filters, kept in the URL so views, reloads and shared links agree. */
import {
  DATE_RANGE_PRESET_OPTIONS,
  mondayOfWeek,
  rangeForDatePreset,
  toDateInputValue,
  type DateRangePreset,
} from './dateRangePresets';

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
  view: CalendarView;
  /** Calendar anchor, local YYYY-MM-DD. */
  date: string;
};

export type FilterDefaults = { userId: string; today: string };

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
    view: 'week',
    date: d.today,
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
    view: get('view') === 'month' ? 'month' : 'week',
    date: DATE_RE.test(get('date')) ? get('date') : base.date,
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

/** Local calendar day → UTC instant, so "Monday" means the viewer's Monday. */
function localDayStart(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toISOString();
}

function localDayEnd(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}

export function listQuery(f: InterviewFilters, limit: number, now = new Date()): Record<string, string | number> {
  const { from, to } = listDateRange(f, now);
  const q: Record<string, string | number> = { page: f.page, limit, sort: f.sort, dir: f.dir };
  if (from) q.from = localDayStart(from);
  if (to) q.to = localDayEnd(to);
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

/** `range` is local YYYY-MM-DD with an exclusive `to`; sent as local midnights. */
export function roundsQuery(f: InterviewFilters, range: { from: string; to: string }): RoundsQuery {
  const q: RoundsQuery = { from: localDayStart(range.from), to: localDayStart(range.to) };
  if (f.user && f.user !== 'all') q.creatorId = f.user;
  if (f.profile) q.accountId = f.profile;
  if (f.stage) q.stage = f.stage;
  if (f.status) q.status = f.status;
  return q;
}
