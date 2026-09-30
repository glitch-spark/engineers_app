/** Period helpers for the Dashboard cards (week / month / year navigation). */

import { mondayOfWeek, toDateInputValue } from './dateRangePresets';

export type PeriodKind = 'week' | 'month' | 'year' | 'custom';

function shortLabel(d: Date, withYear = false): string {
  return d.toLocaleDateString(
    'en-US',
    withYear ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' }
  );
}

/**
 * Week label ends, e.g. "Sep 28 – Oct 3" for a week entirely within the
 * current year. When the week falls outside the current year, the year is
 * appended so the label isn't ambiguous: "Sep 29 – Oct 4, 2025" (same year,
 * not current) or "Dec 28, 2026 – Jan 2, 2027" (spans a year boundary).
 */
function weekLabel(monday: Date, saturday: Date, today: Date = new Date()): string {
  const sameYear = monday.getFullYear() === saturday.getFullYear();
  if (sameYear && monday.getFullYear() === today.getFullYear()) {
    return `${shortLabel(monday)} – ${shortLabel(saturday)}`;
  }
  if (sameYear) {
    return `${shortLabel(monday)} – ${shortLabel(saturday, true)}`;
  }
  return `${shortLabel(monday, true)} – ${shortLabel(saturday, true)}`;
}

/**
 * `from`/`to` bound the period for API calls; `label` is the display text.
 * Week: `from` is Monday, `to` is **Sunday** (so Sunday's data reaches the
 * backend, which merges it into Saturday); the label shows Mon–Sat.
 */
export function periodRange(
  kind: Exclude<PeriodKind, 'custom'>,
  anchor: Date
): { from: string; to: string; label: string } {
  if (kind === 'week') {
    const monday = mondayOfWeek(anchor);
    const saturday = new Date(monday);
    saturday.setDate(monday.getDate() + 5);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
      from: toDateInputValue(monday),
      to: toDateInputValue(sunday),
      label: weekLabel(monday, saturday),
    };
  }
  if (kind === 'month') {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return {
      from: toDateInputValue(start),
      to: toDateInputValue(end),
      label: start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    };
  }
  // year
  const start = new Date(anchor.getFullYear(), 0, 1);
  const end = new Date(anchor.getFullYear(), 11, 31);
  return {
    from: toDateInputValue(start),
    to: toDateInputValue(end),
    label: String(anchor.getFullYear()),
  };
}

/** Moves the anchor one period forward/back. Normalizes to the 1st for
 * month/year so `setMonth`/constructor day overflow never skips a month. */
export function stepAnchor(
  kind: Exclude<PeriodKind, 'custom'>,
  anchor: Date,
  dir: -1 | 1
): Date {
  if (kind === 'week') {
    const next = new Date(anchor);
    next.setDate(next.getDate() + 7 * dir);
    return next;
  }
  if (kind === 'month') {
    return new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);
  }
  return new Date(anchor.getFullYear() + dir, 0, 1);
}

/** True when the period's `from` is after `today` (used to disable the "next" control). */
export function isFuturePeriod(
  kind: Exclude<PeriodKind, 'custom'>,
  anchor: Date,
  today: Date = new Date()
): boolean {
  const { from } = periodRange(kind, anchor);
  return from > toDateInputValue(today);
}
