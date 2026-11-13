import type { ScoreStat } from '../api/endpoints';

import { listDateRange } from './interviewFilters';

/** The Profiles list's date range: the Interviews page's presets (no Next week), plus All time (the default). */
export type ProfileRangePreset = 'all' | 'this_week' | 'prev_week' | 'this_month' | 'prev_month' | 'this_year' | 'custom';
export type ProfileRange = { preset: ProfileRangePreset; from: string; to: string };

export const PROFILE_RANGES: { value: ProfileRangePreset; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'this_week', label: 'This week' },
  { value: 'prev_week', label: 'Previous week' },
  { value: 'this_month', label: 'This month' },
  { value: 'prev_month', label: 'Previous month' },
  { value: 'this_year', label: 'This year' },
  { value: 'custom', label: 'Custom' },
];

const ALL_TIME: ProfileRange = { preset: 'all', from: '', to: '' };
// Kept apart from the profile page's period, so picking one there doesn't change the list's.
const LIST_RANGE_KEY = 'profiles.range';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** All time until a range is picked on the list. */
export function readProfileRange(): ProfileRange {
  try {
    const r = JSON.parse(localStorage.getItem(LIST_RANGE_KEY) || 'null') as ProfileRange | null;
    if (r && PROFILE_RANGES.some((o) => o.value === r.preset)) {
      return { preset: r.preset, from: DATE_RE.test(r.from) ? r.from : '', to: DATE_RE.test(r.to) ? r.to : '' };
    }
  } catch {
    // Private windows can throw; fall back to All time.
  }
  return ALL_TIME;
}

export function writeProfileRange(r: ProfileRange) {
  try {
    localStorage.setItem(LIST_RANGE_KEY, JSON.stringify(r));
  } catch {
    // Private windows can throw; the range just isn't remembered.
  }
}

/** Why a custom range can't be requested yet, or null. */
export function profileRangeError(r: ProfileRange): string | null {
  if (r.preset !== 'custom') return null;
  if (!r.from || !r.to) return 'Pick both dates';
  return r.from > r.to ? 'From must be on or before To' : null;
}

/** The days to ask for (weeks Monday–Sunday, as the Interviews list), or null for All time. */
export function profileRangeDates(r: ProfileRange, now = new Date()): { from: string; to: string } | null {
  if (r.preset === 'all') return null;
  return listDateRange({ range: r.preset, from: r.from, to: r.to }, now);
}

/** The profile Metrics tab's charts and table: one point per day or per week. */
export type MetricsView = 'day' | 'week';

const VIEW_KEY = 'profileMetricsView';

export function readView(): MetricsView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'day' ? 'day' : 'week';
  } catch {
    return 'week';
  }
}

export function writeView(v: MetricsView) {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    // Private windows can throw; the view just isn't remembered.
  }
}

/** One decimal with a trailing `.0` dropped (`42`, `2.5`). */
export function fmtPerWeek(n: number | null): string {
  if (n == null) return '—';
  return n.toFixed(1).replace(/\.0$/, '');
}

/** A whole count with thousands separators (`1,240`). */
/** `—` when the value is missing (a backend from before the field existed, e.g. mid-deploy). */
export function fmtCount(n: number | null | undefined): string {
  return n == null ? '—' : n.toLocaleString('en-US');
}

/** `12 resumes tailored`; null when the backend didn't send the count. */
export function tailoredText(n: number | null | undefined): string | null {
  return n == null ? null : `${fmtCount(n)} ${n === 1 ? 'resume' : 'resumes'} tailored`;
}

/** A fraction as a percentage with one decimal (`0.0595` → `6.0%`). */
export function fmtRate(n: number | null): string {
  if (n == null) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

/** Average rounded to an integer. */
export function fmtScore(s: ScoreStat | null): string {
  if (!s || s.avg == null) return '—';
  return String(Math.round(s.avg));
}
