import { Plus } from 'lucide-react';
import type { InterviewRoundRow } from '../../api/endpoints';
import { sameDay } from '../../lib/calendarLayout';
import { stageLabel } from '../../lib/stageBadge';
import { localDateKey, roundClass, timeText, type RoundEvent } from './calendarShared';

/** Phone layout for the week: rounds listed day by day. */
export default function CalendarAgenda({
  days,
  events,
  onOpen,
  onNew,
}: {
  days: Date[];
  events: RoundEvent[];
  onOpen: (row: InterviewRoundRow) => void;
  onNew: (date: string, time?: string) => void;
}) {
  return (
    <ol className="space-y-3">
      {days.map((d) => {
        const key = localDateKey(d);
        const dayEvents = events.filter((e) => sameDay(e.start, d)).sort((a, b) => a.start.getTime() - b.start.getTime());
        return (
          <li key={key} className="panel p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium">{d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</h3>
              <button type="button" className="btn-icon" onClick={() => onNew(key)}
                aria-label={`New interview on ${d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`}>
                <Plus size={14} aria-hidden />
              </button>
            </div>
            {dayEvents.length === 0 ? (
              <p className="text-xs text-muted">No rounds</p>
            ) : (
              <ul className="space-y-1">
                {dayEvents.map((e) => (
                  <li key={e.id}>
                    <button type="button" onClick={() => onOpen(e.row)}
                      className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-sm ${roundClass(e.row)}`}>
                      <span className="w-16 shrink-0 tabular-nums">{e.allDay ? 'All day' : timeText(e.start)}</span>
                      <span className="truncate">{e.row.companyName || 'Interview'} · {stageLabel(e.row.stage)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
