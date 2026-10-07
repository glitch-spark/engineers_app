/** Calendar helpers for pay-week keys ('YYYY-MM-DD' period keys in the report time zone). */

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
