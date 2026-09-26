/** Calendar-year week math shared by Weekly Plan and Daily Plan.
 *  Matches `app.alerts.app_week_key` on the backend (not ISO week).
 */

export function getWeekInfo(date: Date) {
  const year = date.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const days = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  const dayOfWeek = date.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const startDate = new Date(date);
  startDate.setDate(date.getDate() + mondayOffset);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);
  endDate.setHours(23, 59, 59, 999);
  return { weekNumber, year, startDate, endDate };
}

export function getWeekDateRange(year: number, weekNumber: number) {
  const jan1 = new Date(year, 0, 1);
  const jan1Day = jan1.getDay();
  const mondayOffset = jan1Day === 0 ? -6 : 1 - jan1Day;
  const firstMonday = new Date(year, 0, 1 + mondayOffset);
  const start = new Date(firstMonday);
  start.setDate(firstMonday.getDate() + (weekNumber - 1) * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

export function formatWeekOptionLabel(year: number, weekNumber: number) {
  const { start, end } = getWeekDateRange(year, weekNumber);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `Week ${weekNumber} (${start.toLocaleDateString(undefined, opts)} - ${end.toLocaleDateString(undefined, opts)})`;
}

export function todayInputValue(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Format a `YYYY-MM-DD` (or ISO datetime) as a local calendar date. */
export function formatCalendarDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString();
}
