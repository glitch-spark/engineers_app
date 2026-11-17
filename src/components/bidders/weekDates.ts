/** Calendar helpers for pay-week keys ('YYYY-MM-DD' period keys in the report time zone). */
import { stepPayWeekDay } from '../../lib/bidderFilters.ts';

const fromKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/** 'YYYY-MM-DD' moved by `days` calendar days. */
export function addDaysKey(key: string, days: number): string {
  const d = fromKey(key);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * A day in the pay week before and after the one whose report days are `days` (the server's list: a pay week has 1 to
 * 8 of them), stepped with `stepPayWeekDay` like the Bidders list: the day before the first, the day after the last
 * (never past a short week). Null when the week has no days.
 */
export function neighbourWeekKeys(days: { day: string }[]): { prev: string; next: string } | null {
  if (days.length === 0) return null;
  const shown = { first: days[0].day, last: days[days.length - 1].day };
  return { prev: stepPayWeekDay(shown, -1), next: stepPayWeekDay(shown, 1) };
}

/** { weekday: 'Sun', date: 'Oct 4' } for a period key. */
export function dayParts(key: string): { weekday: string; date: string } {
  const d = fromKey(key);
  return {
    weekday: d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
  };
}

/** The local calendar date of an instant in `timeZone`, as 'YYYY-MM-DD'. */
export function dateInZone(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/** "6:30 PM" (or "Sat 6:30 PM" with `weekday`) in the report time zone (viewer-local if the zone key is unusable). */
export function timeInZone(iso: string, timeZone: string, weekday = false): string {
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', ...(weekday ? { weekday: 'short' } : {}) };
  try {
    return new Date(iso).toLocaleTimeString('en-US', { ...opts, timeZone });
  } catch {
    return new Date(iso).toLocaleTimeString('en-US', opts);
  }
}
