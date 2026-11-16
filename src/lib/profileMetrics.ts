import type { ScoreStat } from '../api/endpoints';

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
