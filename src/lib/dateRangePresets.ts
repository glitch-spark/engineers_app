/** Shared date-range presets for Interviews List / Live / Analyze filters. */

export type DateRangePreset =
  | 'prev_week'
  | 'this_week'
  | 'next_week'
  | 'prev_month'
  | 'this_month'
  | 'this_year'
  | 'custom';

export const DATE_RANGE_PRESET_OPTIONS: Array<{ value: DateRangePreset; label: string }> = [
  { value: 'prev_week', label: 'Previous week' },
  { value: 'this_week', label: 'This week' },
  { value: 'next_week', label: 'Next week' },
  { value: 'prev_month', label: 'Previous month' },
  { value: 'this_month', label: 'This month' },
  { value: 'this_year', label: 'This year' },
  { value: 'custom', label: 'Custom' },
];

export function toDateInputValue(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Monday 00:00 of the week containing `d` (Sun=0 … Sat=6). */
export function mondayOfWeek(d: Date): Date {
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/** Week filter window: Monday → Saturday (matches board badge week). */
export function weekRangeFromMonday(monday: Date): { from: string; to: string } {
  const saturday = new Date(monday);
  saturday.setDate(monday.getDate() + 5);
  return { from: toDateInputValue(monday), to: toDateInputValue(saturday) };
}

/** Default filter: this week's Monday → Saturday. */
export function currentWeekdayRange(): { from: string; to: string } {
  return weekRangeFromMonday(mondayOfWeek(new Date()));
}

export function rangeForDatePreset(
  preset: Exclude<DateRangePreset, 'custom'>,
  now = new Date(),
): { from: string; to: string } {
  if (preset === 'this_week') return weekRangeFromMonday(mondayOfWeek(now));
  if (preset === 'prev_week') {
    const monday = mondayOfWeek(now);
    monday.setDate(monday.getDate() - 7);
    return weekRangeFromMonday(monday);
  }
  if (preset === 'next_week') {
    const monday = mondayOfWeek(now);
    monday.setDate(monday.getDate() + 7);
    return weekRangeFromMonday(monday);
  }
  if (preset === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: toDateInputValue(start), to: toDateInputValue(end) };
  }
  if (preset === 'prev_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: toDateInputValue(start), to: toDateInputValue(end) };
  }
  const start = new Date(now.getFullYear(), 0, 1);
  const end = new Date(now.getFullYear(), 11, 31);
  return { from: toDateInputValue(start), to: toDateInputValue(end) };
}

/** e.g. "Jul 28 (2026)-Aug 5 (2026)" */
export function formatDateRangeText(from: string, to: string): string {
  if (!from || !to) return '';
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return iso;
    const month = new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'short' });
    return `${month} ${d} (${y})`;
  };
  return `${fmt(from)}-${fmt(to)}`;
}
