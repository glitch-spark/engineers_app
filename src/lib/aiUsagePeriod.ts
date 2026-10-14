/** Periods for the admin AI usage card. Bounds are local midnights in the viewer's time zone, sent as UTC
 * instants (`to` exclusive) together with the zone name, so the backend buckets hours/days the same way. */

import { mondayOfWeek, toDateInputValue } from './dateRangePresets';

export type AiUsagePeriod = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom';

export const AI_USAGE_PERIODS: { value: AiUsagePeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This week' },
  { value: 'this_month', label: 'This month' },
  { value: 'custom', label: 'Custom' },
];

const MAX_CUSTOM_RANGE_DAYS = 366; // the backend's cap

export function viewerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function midnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

function fromInput(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Default Custom inputs: this month so far. */
export function defaultCustomRange(now: Date = new Date()): { from: string; to: string } {
  return { from: toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)), to: toDateInputValue(now) };
}

/** The message to show for bad Custom inputs, or null when the range is usable. */
export function customRangeError(custom: { from: string; to: string }): string | null {
  if (!custom.from || !custom.to) return 'Pick both dates.';
  if (custom.from > custom.to) return 'From must be on or before To.';
  const days = Math.round((fromInput(custom.to).getTime() - fromInput(custom.from).getTime()) / 86_400_000) + 1;
  if (days > MAX_CUSTOM_RANGE_DAYS) return 'Pick a range of a year or less.';
  return null;
}

/** [from, to) as ISO UTC for a period; Custom days are inclusive on both ends. */
export function aiUsageRange(
  period: AiUsagePeriod,
  custom: { from: string; to: string },
  now: Date = new Date(),
): { from: string; to: string } {
  const today = midnight(now);
  let start: Date;
  let end: Date;
  if (period === 'today') {
    start = today;
    end = addDays(today, 1);
  } else if (period === 'yesterday') {
    start = addDays(today, -1);
    end = today;
  } else if (period === 'this_week') {
    start = mondayOfWeek(now);
    end = addDays(start, 7);
  } else if (period === 'this_month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  } else {
    start = fromInput(custom.from);
    end = addDays(fromInput(custom.to), 1);
  }
  return { from: start.toISOString(), to: end.toISOString() };
}

/** Axis label for a backend bucket key: "13:00" for hours, "Oct 14" for days. */
export function bucketLabel(bucket: string): string {
  if (bucket.includes('T')) return bucket.slice(11, 16);
  return fromInput(bucket).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
