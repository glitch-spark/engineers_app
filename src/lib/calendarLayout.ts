/** Pure date and layout helpers for the Interviews calendar (local time, Monday weeks). */
import { mondayOfWeek, toDateInputValue } from './dateRangePresets';

export type CalEvent = { id: string; start: Date; end: Date; allDay: boolean };
export type PositionedEvent<T extends CalEvent = CalEvent> = T & { col: number; cols: number };

/** Rounds saved before times existed: stored at 12:00 UTC with no end. */
export function isLegacyAllDay(scheduledAt: string, endsAt?: string | null): boolean {
  if (endsAt) return false;
  const d = new Date(scheduledAt);
  return !isNaN(d.getTime())
    && d.getUTCHours() === 12 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** Monday → Sunday of the week containing `anchor`. */
export function weekDays(anchor: Date): Date[] {
  const monday = mondayOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** 6 weeks (42 days) starting on the Monday on or before the 1st of `anchor`'s month. */
export function monthGrid(anchor: Date): Date[] {
  const first = mondayOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

/** Hour span to draw: the base range, stretched to fit every timed event. */
export function visibleHourRange(
  events: CalEvent[],
  base: { start: number; end: number } = { start: 7, end: 21 },
): { start: number; end: number } {
  let start = base.start;
  let end = base.end;
  for (const e of events) {
    if (e.allDay) continue;
    start = Math.min(start, e.start.getHours());
    const endHour = e.end.getHours() + (e.end.getMinutes() > 0 ? 1 : 0);
    // An event ending at midnight the next day ends at 24.
    end = Math.max(end, e.end.getDate() !== e.start.getDate() ? 24 : endHour);
  }
  return { start: Math.max(0, start), end: Math.min(24, end) };
}

/**
 * Side-by-side columns for overlapping events of one day. Events that only
 * touch (a.end == b.start) do not overlap. `cols` is the column count of the
 * event's overlap cluster, so unrelated events keep full width.
 */
export function layoutDayEvents<T extends CalEvent>(events: T[]): PositionedEvent<T>[] {
  const sorted = [...events].sort((a, b) =>
    a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime());
  const out: PositionedEvent<T>[] = [];
  let cluster: PositionedEvent<T>[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    for (const e of cluster) e.cols = columnEnds.length;
    out.push(...cluster);
    cluster = [];
    columnEnds = [];
    clusterEnd = -Infinity;
  };

  for (const e of sorted) {
    const start = e.start.getTime();
    const end = e.end.getTime();
    if (start >= clusterEnd) flush();
    let col = columnEnds.findIndex((colEnd) => colEnd <= start);
    if (col === -1) {
      col = columnEnds.length;
      columnEnds.push(end);
    } else {
      columnEnds[col] = end;
    }
    cluster.push({ ...e, col, cols: 1 });
    clusterEnd = Math.max(clusterEnd, end);
  }
  flush();
  return out;
}

/** API range for a view: `to` is exclusive; month covers the whole 42-day grid. */
export function rangeFor(view: 'week' | 'month', anchor: Date): { from: string; to: string } {
  const days = view === 'week' ? weekDays(anchor) : monthGrid(anchor);
  return { from: toDateInputValue(days[0]), to: toDateInputValue(addDays(days[days.length - 1], 1)) };
}

/** Move the anchor by whole weeks or months (months land on the 1st). */
export function shiftAnchor(view: 'week' | 'month', anchor: Date, delta: number): Date {
  if (view === 'week') return addDays(anchor, delta * 7);
  return new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1);
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
