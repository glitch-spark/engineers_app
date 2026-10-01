/**
 * Time zone helpers for the interview pages. Times are stored in UTC; the
 * viewer picks which zone to read and enter them in (default: browser local).
 *
 * "Wall" dates are browser-local Date objects whose local fields equal the
 * chosen zone's wall clock, so calendar layout code can keep using getHours()
 * etc. Convert back with fromWall().
 */

export type ZoneChoice = 'local' | 'America/New_York' | 'America/Chicago' | 'America/Denver' | 'America/Los_Angeles';

export const ZONE_OPTIONS: { value: ZoneChoice; label: string }[] = [
  { value: 'local', label: 'Local time' },
  { value: 'America/New_York', label: 'Eastern (EST/EDT)' },
  { value: 'America/Chicago', label: 'Central (CST/CDT)' },
  { value: 'America/Denver', label: 'Mountain (MST/MDT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PST/PDT)' },
];

export function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** IANA zone for a choice; unknown values fall back to the browser zone. */
export function resolveZone(choice: string): string {
  return ZONE_OPTIONS.some((o) => o.value === choice && choice !== 'local') ? choice : browserZone();
}

type Parts = { y: number; m: number; d: number; h: number; mi: number; s: number };

export function zonedParts(date: Date, tz: string): Parts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour') % 24, mi: get('minute'), s: get('second') };
}

const pad = (n: number) => String(n).padStart(2, '0');

export function zonedDateKey(date: Date, tz: string): string {
  const p = zonedParts(date, tz);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

export function zonedTime(date: Date, tz: string): string {
  const p = zonedParts(date, tz);
  return `${pad(p.h)}:${pad(p.mi)}`;
}

/** Offset of `tz` from UTC at instant `t`, in ms (wall clock minus UTC). */
function offsetAt(t: number, tz: string): number {
  const p = zonedParts(new Date(t), tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(t / 1000) * 1000;
}

/** Wall-clock date "YYYY-MM-DD" + "HH:MM" in `tz` → the UTC instant. */
export function fromZoned(dateKey: string, time: string, tz: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [h, mi] = (time || '00:00').split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const first = guess - offsetAt(guess, tz);
  // Re-check at the result so a DST change between guess and result is honoured.
  return new Date(guess - offsetAt(first, tz));
}

/** [start, end) of a calendar day in `tz`, as UTC instants. */
export function zonedDayBounds(dateKey: string, tz: string): [Date, Date] {
  const [y, m, d] = dateKey.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const nextKey = `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
  return [fromZoned(dateKey, '00:00', tz), fromZoned(nextKey, '00:00', tz)];
}

/** Browser-local Date showing `tz`'s wall clock (for layout code). */
export function toWall(date: Date, tz: string): Date {
  const p = zonedParts(date, tz);
  return new Date(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
}

/** Inverse of toWall. */
export function fromWall(wall: Date, tz: string): Date {
  const key = `${wall.getFullYear()}-${pad(wall.getMonth() + 1)}-${pad(wall.getDate())}`;
  const instant = fromZoned(key, `${pad(wall.getHours())}:${pad(wall.getMinutes())}`, tz);
  return new Date(instant.getTime() + wall.getSeconds() * 1000);
}

/** "EDT", "MST", … (falls back to "GMT-4"-style when the runtime has no short name). */
export function zoneAbbrev(date: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
      .formatToParts(date).find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

export function formatInZone(date: Date, tz: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-US', { ...opts, timeZone: tz }).format(date);
}
