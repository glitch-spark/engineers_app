import type { ScoreStat } from '../api/endpoints';

export const WEEK_OPTIONS = [4, 8, 12] as const;

const WEEKS_KEY = 'profileMetricsWeeks';

export function readWeeks(): number {
  try {
    const n = Number(localStorage.getItem(WEEKS_KEY));
    return (WEEK_OPTIONS as readonly number[]).includes(n) ? n : 4;
  } catch {
    return 4;
  }
}

export function writeWeeks(n: number) {
  try {
    localStorage.setItem(WEEKS_KEY, String(n));
  } catch {
    // Private windows can throw; the period just isn't remembered.
  }
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
