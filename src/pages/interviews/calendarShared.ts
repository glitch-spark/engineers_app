import type { InterviewRoundRow } from '../../api/endpoints';
import { isLegacyAllDay, type CalEvent } from '../../lib/calendarLayout';
import { normalizeInterviewStatus, stageBadgeClass } from '../../lib/stageBadge';
import { toWall } from '../../lib/interviewTimezone';

export type RoundEvent = CalEvent & { row: InterviewRoundRow };

/** Events on `tz`'s wall clock (see toWall), so layout can use local Date getters. */
export function toEvents(rows: InterviewRoundRow[], tz: string): RoundEvent[] {
  return rows.map((row) => {
    const start = toWall(new Date(row.scheduledAt), tz);
    const end = row.endsAt ? toWall(new Date(row.endsAt), tz) : new Date(start.getTime() + 60 * 60000);
    return { id: row.roundId, start, end: end > start ? end : new Date(start.getTime() + 30 * 60000), allDay: isLegacyAllDay(row.scheduledAt, row.endsAt), row };
  });
}

/** Stage colour; canceled rounds are muted and struck through, rejected get a red edge. */
export function roundClass(row: InterviewRoundRow): string {
  const status = normalizeInterviewStatus(row.status);
  return [
    stageBadgeClass(row.stage),
    status === 'canceled' ? 'opacity-60 line-through' : '',
    status === 'rejected' ? 'border-l-4 border-l-red-500' : '',
  ].join(' ');
}

export function timeText(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseLocalDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** "Sep 28 – Oct 4, 2026" or "September 2026". */
export function rangeLabel(view: 'week' | 'month', days: Date[], anchor: Date): string {
  if (view === 'month') return anchor.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const a = days[0];
  const b = days[days.length - 1];
  const sameYear = a.getFullYear() === b.getFullYear();
  const left = a.toLocaleString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
  const right = b.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${left} – ${right}`;
}
