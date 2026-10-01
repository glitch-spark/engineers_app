import { zonedDateKey } from '../../lib/interviewTimezone';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct 1" for a round date in `tz` (YYYY-MM-DD strings are calendar dates as-is). */
export function formatScheduledDate(iso: string | null | undefined, tz: string): string {
  if (!iso) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [, m, d] = iso.split('-').map(Number);
    return `${MONTH_NAMES[m - 1]} ${d}`;
  }
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const [, m, day] = zonedDateKey(d, tz).split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${day}`;
}
