/**
 * Profiles list and Profile metrics filters, kept in the URL so a reload or a shared link keeps them.
 *
 * Pure mapping only: URL values (strings, possibly junk) -> typed filters -> the requests the two pages send. Every
 * date is a calendar date `YYYY-MM-DD`; nothing here reads the clock (`today` is passed in).
 *
 * List URL keys: `user` (admin), `status`, `region`, `q`, `range`, `from`, `to`, `page`, `size`.
 * Metrics tab keys (on /accounts/<id>?tab=metrics): `range`, `from`, `to`. They don't clash with the page's `tab`.
 */
import { customError, legacyPreset, presetOptions, rangeFor, toStatsParams, type DatePreset, type DateRange } from './dateRange';
import { regionOptions } from './regions';
import { PROFILE_STATUS_OPTIONS, type ProfileStatus } from './profileArchive';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from '../components/Pagination';
import type { ProfileMetricPeriod } from '../api/endpoints';

/** The standard presets with All time below them (the default). */
export const PROFILE_PRESETS = presetOptions({ after: ['all_time'] });
export const PROFILE_DEFAULT_RANGE: DatePreset = 'all_time';

/** Regions the profiles endpoint knows: the Statistics set plus Canada, Asia and profiles without one. */
export const PROFILE_REGION_OPTIONS = regionOptions(['Latam', 'EU', 'US', 'Canada', 'Asia', 'none']);

const KNOWN_PRESETS = PROFILE_PRESETS.map((o) => o.value as string);
const KNOWN_REGIONS = PROFILE_REGION_OPTIONS.map((o) => o.value);
const KNOWN_STATUSES = PROFILE_STATUS_OPTIONS.map((o) => o.value as string);

/** The preset an odd URL value stands for: old names are mapped, anything not offered falls back to All time. */
export function normalizeProfileRange(raw: string): DatePreset {
  const mapped: string = legacyPreset(raw) ?? raw;
  return KNOWN_PRESETS.includes(mapped) ? (mapped as DatePreset) : PROFILE_DEFAULT_RANGE;
}

// ---- the Profiles list -----------------------------------------------------

export type ProfileKey = 'user' | 'status' | 'region' | 'q' | 'range' | 'from' | 'to' | 'page' | 'size';
export type ProfileUrlValues = Record<ProfileKey, string>;

/** URL defaults (left out of the URL). `from` / `to` default to '' as the shared date control requires. */
export const PROFILE_URL_DEFAULTS: ProfileUrlValues = {
  user: '',
  status: 'active',
  region: '',
  q: '',
  range: PROFILE_DEFAULT_RANGE,
  from: '',
  to: '',
  page: '1',
  size: String(DEFAULT_PAGE_SIZE),
};

export type ProfileFilters = {
  /** Owner id ('' = every owner). Only an admin's request carries it. */
  user: string;
  status: ProfileStatus;
  /** '' = every region, `none` = profiles without one. */
  region: string;
  q: string;
  range: DatePreset;
  /** Custom range, as typed in the URL (may be partial or invalid; see `profileRangeError`). */
  from: string;
  to: string;
  page: number;
  size: number;
};

/** URL values -> typed filters. Never throws; bad values fall back to the defaults. */
export function parseProfileValues(values: ProfileUrlValues): ProfileFilters {
  const range = normalizeProfileRange(values.range);
  const page = Number.parseInt(values.page, 10);
  const size = Number.parseInt(values.size, 10);
  return {
    user: values.user,
    status: (KNOWN_STATUSES.includes(values.status) ? values.status : 'active') as ProfileStatus,
    region: KNOWN_REGIONS.includes(values.region) ? values.region : '',
    q: values.q,
    range,
    // Only a Custom range reads from / to; they are kept as typed so the bar can say what is wrong with them.
    from: range === 'custom' ? values.from : '',
    to: range === 'custom' ? values.to : '',
    page: Number.isFinite(page) && page > 1 ? page : 1,
    size: PAGE_SIZES.includes(size) ? size : DEFAULT_PAGE_SIZE,
  };
}

/** Why a Custom range can't be requested, or null (also null for every other preset). */
export function profileRangeError(f: Pick<ProfileFilters, 'range' | 'from' | 'to'>): string | null {
  return f.range === 'custom' ? customError(f.from, f.to) : null;
}

/**
 * The days to ask the metrics for, or null for All time and for a bad Custom range (see `profileRangeError`). The
 * request has always covered the whole calendar period (this week = Monday to Sunday, even days still to come), so
 * the per-week numbers don't change with the move to the shared control: `allowFuture` stays true here.
 */
export function profileDays(f: Pick<ProfileFilters, 'range' | 'from' | 'to'>, today: string): DateRange | null {
  if (f.range === 'all_time' || profileRangeError(f) !== null) return null;
  if (f.range === 'custom') return { from: f.from, to: f.to };
  return rangeFor(f.range, today, { allowFuture: true });
}

/** `GET /accounts` for the table. */
export function profileListParams(f: ProfileFilters, isAdmin: boolean) {
  return {
    page: f.page,
    limit: f.size,
    search: f.q,
    status: f.status,
    ...(f.region ? { region: f.region } : {}),
    ...(isAdmin && f.user ? { userId: f.user } : {}),
  };
}

/** `GET /accounts/metrics`: the days, or every week since each profile was created for All time. Null = nothing to ask for yet. */
export function profileMetricsParams(
  f: ProfileFilters, today: string, isAdmin: boolean,
): { from?: string; to?: string; weeks?: 'all'; userId?: string } | null {
  if (profileRangeError(f) !== null) return null;
  const days = profileDays(f, today);
  return { ...(days ?? { weeks: 'all' as const }), ...(isAdmin && f.user ? { userId: f.user } : {}) };
}

/** `GET /accounts/metrics/benchmark` ("All profiles" over the same days). Null = nothing to ask for yet. */
export function profileBenchmarkParams(
  f: Pick<ProfileFilters, 'range' | 'from' | 'to'>, today: string,
): { period: ProfileMetricPeriod; date?: string; to?: string } | null {
  if (profileRangeError(f) !== null) return null;
  const days = profileDays(f, today);
  return days ? { period: 'custom', date: days.from, to: days.to } : { period: 'all' };
}

/** Whether anything the bar shows differs from its default (the Clear button). `user` only counts for admins. */
export function profileCanClear(f: ProfileFilters, isAdmin: boolean): boolean {
  return (isAdmin && !!f.user) || f.status !== 'active' || !!f.region || !!f.q || f.range !== PROFILE_DEFAULT_RANGE;
}

/** What Clear puts back: the bar's own keys (the page and per-page size are not filters). */
export const PROFILE_CLEAR_KEYS: ProfileKey[] = ['user', 'status', 'region', 'q', 'range', 'from', 'to'];

// ---- the range the list used to keep in localStorage ------------------------

/** The old `localStorage` key. It is read once, applied to the URL, then deleted. */
export const LEGACY_RANGE_KEY = 'profiles.range';

/** The saved range exactly as stored, or null (none, or storage is unavailable). */
export function readLegacyRange(): string | null {
  try {
    return localStorage.getItem(LEGACY_RANGE_KEY);
  } catch {
    return null; // Private windows can throw; there is nothing to migrate.
  }
}

/** Deletes the saved range (it has been moved to the URL, or is junk). */
export function dropLegacyRange(): void {
  try {
    localStorage.removeItem(LEGACY_RANGE_KEY);
  } catch {
    // Private windows can throw; the key stays, and is ignored whenever the URL has a range.
  }
}

/**
 * The URL change for a range saved under `profiles.range` (`{"preset":"prev_week","from":"","to":""}`), or null when
 * there is nothing to apply: the URL already has a `range`, the saved value is missing, junk or All time, or it is a
 * Custom range that isn't valid. Old preset names are mapped (`prev_week` -> `last_week`; `all` -> All time).
 */
export function legacyRangePatch(
  urlHasRange: boolean, stored: string | null,
): { range: string; from?: string; to?: string } | null {
  if (urlHasRange || !stored) return null;
  let saved: unknown;
  try {
    saved = JSON.parse(stored);
  } catch {
    return null;
  }
  if (!saved || typeof saved !== 'object') return null;
  const { preset, from, to } = saved as Record<string, unknown>;
  if (typeof preset !== 'string') return null;
  const mapped: string = preset === 'all' ? 'all_time' : legacyPreset(preset) ?? preset;
  if (mapped === 'all_time' || !KNOWN_PRESETS.includes(mapped)) return null;
  if (mapped === 'custom') {
    if (typeof from !== 'string' || typeof to !== 'string' || customError(from, to) !== null) return null;
    return { range: 'custom', from, to };
  }
  return { range: mapped, from: undefined, to: undefined };
}

// ---- the profile's Metrics tab ----------------------------------------------

export type PanelKey = 'range' | 'from' | 'to';
export type PanelUrlValues = Record<PanelKey, string>;
export const PANEL_URL_DEFAULTS: PanelUrlValues = { range: PROFILE_DEFAULT_RANGE, from: '', to: '' };

export type PanelFilters = { range: DatePreset; from: string; to: string };

export function parsePanelValues(values: PanelUrlValues): PanelFilters {
  const range = normalizeProfileRange(values.range);
  return { range, from: range === 'custom' ? values.from : '', to: range === 'custom' ? values.to : '' };
}

/**
 * The `/accounts/<id>/metrics` (and benchmark) query for the tab's range, or null while a Custom range is partial or
 * invalid. All time is `period=all`; a week or month preset names its period; anything else is a custom range. The
 * end of a current period is clipped to today, as the server does.
 */
export function panelRequest(
  f: PanelFilters, today: string,
): { period: ProfileMetricPeriod; date?: string; to?: string } | null {
  if (f.range === 'all_time') return { period: 'all' };
  if (f.range === 'custom') {
    return customError(f.from, f.to) === null ? { period: 'custom', date: f.from, to: f.to } : null;
  }
  const days = rangeFor(f.range, today, { allowFuture: false });
  return days ? toStatsParams(f.range, days) : null;
}
