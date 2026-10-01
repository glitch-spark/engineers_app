import { Plus } from 'lucide-react';
import type { InterviewRoundRow } from '../../api/endpoints';
import { sameDay } from '../../lib/calendarLayout';
import { stageLabel } from '../../lib/stageBadge';
import { localDateKey, roundClass, timeText, type RoundEvent } from './calendarShared';
import { toWall } from '../../lib/interviewTimezone';

const MAX_PER_DAY = 3;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** 6-week month grid; up to three rounds per day, then "+N more" (switches to that week). */
export default function CalendarMonth({
  days,
  anchor,
  events,
  tz,
  onOpen,
  onNew,
  onShowWeek,
}: {
  days: Date[];
  anchor: Date;
  events: RoundEvent[];
  tz: string;
  onOpen: (row: InterviewRoundRow) => void;
  onNew: (date: string, time?: string) => void;
  onShowWeek: (date: string) => void;
}) {
  const today = toWall(new Date(), tz);
  return (
    <div className="panel overflow-hidden">
      <div className="grid grid-cols-7 border-b border-zinc-200 text-center text-xs text-muted dark:border-zinc-800">
        {WEEKDAYS.map((d) => <div key={d} className="py-1.5">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const key = localDateKey(d);
          const dayEvents = events.filter((e) => sameDay(e.start, d)).sort((a, b) => a.start.getTime() - b.start.getTime());
          const inMonth = d.getMonth() === anchor.getMonth();
          const isToday = sameDay(d, today);
          const extra = dayEvents.length - MAX_PER_DAY;
          return (
            <div
              key={key}
              className={`group relative min-h-[6.5rem] border-b border-l border-zinc-200 p-1 dark:border-zinc-800 ${inMonth ? '' : 'bg-zinc-50/70 dark:bg-zinc-900/40'}`}
              onClick={(e) => { if (e.target === e.currentTarget) onNew(key, '10:00'); }}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs tabular-nums ${isToday ? 'rounded-full bg-sky-700 px-1.5 text-white' : inMonth ? 'text-body' : 'text-faint'}`}>
                  {d.getDate()}
                </span>
                <button type="button" className="btn-icon h-5 w-5 p-0 opacity-60 group-hover:opacity-100 focus:opacity-100"
                  onClick={() => onNew(key, '10:00')}
                  aria-label={`New interview on ${d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`}>
                  <Plus size={12} aria-hidden />
                </button>
              </div>
              <div className="mt-0.5 space-y-0.5">
                {dayEvents.slice(0, MAX_PER_DAY).map((e) => (
                  <button key={e.id} type="button" onClick={() => onOpen(e.row)}
                    className={`block w-full truncate rounded border px-1 py-0.5 text-left text-[11px] ${roundClass(e.row)}`}>
                    {e.allDay ? '' : `${timeText(e.start)} `}{e.row.companyName || 'Interview'} · {stageLabel(e.row.stage)}
                  </button>
                ))}
                {extra > 0 && (
                  <button type="button" className="text-[11px] font-medium text-sky-700 hover:underline dark:text-sky-400" onClick={() => onShowWeek(key)}>
                    +{extra} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
