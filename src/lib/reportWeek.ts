/** Week math and Goal vs Done comparisons for the Report week board.
 *  Weeks start on Monday; Monday–Saturday are working days and Sunday
 *  belongs to the week that just ended.
 */
import type { Counts } from '../api/endpoints';
import { mondayOfWeek, toDateInputValue } from './dateRangePresets';

export type CompareState = 'met' | 'short' | 'over' | 'none';

/** Monday 00:00 of the week holding `d` (Sunday → the Monday before). */
export function mondayOf(d: Date): Date {
  return mondayOfWeek(d);
}

/** `YYYY-MM-DD` of a local date. */
export function dateParam(d: Date): string {
  return toDateInputValue(d);
}

/** `YYYY-MM-DD` of the week's Monday, for the `?week=` URL param and API calls. */
export function weekParam(d: Date): string {
  return dateParam(mondayOf(d));
}

/** Parse a `YYYY-MM-DD` as a local date; null when malformed. */
export function parseDateParam(s: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 ? d : null;
}

/** Monday of the week in `?week=`; the current week when missing or invalid. */
export function parseWeekParam(s: string | null): Date {
  return mondayOf(parseDateParam(s) ?? new Date());
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** Monday to Saturday of the week starting `monday`. */
export function weekDays(monday: Date): Date[] {
  return Array.from({ length: 6 }, (_, n) => addDays(monday, n));
}

/** The next Monday–Saturday day after `d` (Saturday and Sunday → Monday). */
export function nextWorkingDay(d: Date): Date {
  const next = addDays(d, 1);
  return next.getDay() === 0 ? addDays(next, 1) : next;
}

export function isSameDay(a: Date, b: Date): boolean {
  return dateParam(a) === dateParam(b);
}

export function isToday(d: Date): boolean {
  return isSameDay(d, new Date());
}

const SHORT: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };

/** "Sep 28 – Oct 3" (Monday – Saturday); adds the year when it isn't this year. */
export function weekLabel(monday: Date): string {
  const saturday = addDays(monday, 5);
  const thisYear = new Date().getFullYear();
  const start = monday.toLocaleDateString('en-US', SHORT);
  const end = saturday.toLocaleDateString('en-US', SHORT);
  if (monday.getFullYear() !== saturday.getFullYear()) {
    return `${start}, ${monday.getFullYear()} – ${end}, ${saturday.getFullYear()}`;
  }
  return monday.getFullYear() === thisYear ? `${start} – ${end}` : `${start} – ${end}, ${saturday.getFullYear()}`;
}

/** "Thu, Oct 1" */
export function dayLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Done against Goal: met/short/over, or none when neither is set. */
export function compare(done: number, goal: number): { state: CompareState; diff: number } {
  if (!goal && !done) return { state: 'none', diff: 0 };
  if (done === goal) return { state: 'met', diff: 0 };
  return done < goal ? { state: 'short', diff: goal - done } : { state: 'over', diff: done - goal };
}

export function emptyCounts(): Counts {
  return { bidsSelf: 0, bidsBidder: 0, interviewsSelf: 0, interviewsCaller: 0 };
}

/** Working days (Mon–Sat) strictly between two dates. */
function workingDaysBetween(from: Date, to: Date): number {
  let n = 0;
  for (let d = addDays(from, 1); dateParam(d) < dateParam(to); d = addDays(d, 1)) if (d.getDay() !== 0) n++;
  return n;
}

/** True when someone missed at least one working day since their last log
 *  (only meaningful while viewing the current week). */
export function isLogStale(lastLogged: string | null, today: Date, isCurrentWeek: boolean): boolean {
  if (!isCurrentWeek) return false;
  const last = parseDateParam(lastLogged);
  if (!last) return true;
  return workingDaysBetween(last, today) >= 1;
}

export type DayState = 'none' | 'planned' | 'follow-up' | 'done' | 'missed';

/** What a day row offers. Goals come from the weekly plan, so a day is either
 *  upcoming (shows its goal), waiting for its follow-up, or done. */
export function dayState({
  date, today, hasGoal, logged,
}: { date: string; today: string; hasGoal: boolean; logged: boolean }): DayState {
  if (logged) return 'done';
  if (date > today) return hasGoal ? 'planned' : 'none';
  if (date === today || hasGoal) return 'follow-up';
  return 'missed';
}
