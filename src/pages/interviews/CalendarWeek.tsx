import { useEffect, useState } from 'react';
import { PhoneCall, Plus } from 'lucide-react';
import type { InterviewRoundRow } from '../../api/endpoints';
import { layoutDayEvents, sameDay, visibleHourRange } from '../../lib/calendarLayout';
import { stageLabel } from '../../lib/stageBadge';
import { localDateKey, roundClass, timeText, type RoundEvent } from './calendarShared';
import { toWall } from '../../lib/interviewTimezone';

const SLOT_PX = 24; // one 30-minute row
const HOUR_PX = SLOT_PX * 2;

function hourLabel(h: number): string {
  const d = new Date(2000, 0, 1, h);
  return d.toLocaleTimeString('en-US', { hour: 'numeric' });
}

/** Mon–Sun time grid; overlapping rounds sit side by side. */
export default function CalendarWeek({
  days,
  events,
  tz,
  onOpen,
  onNew,
}: {
  days: Date[];
  events: RoundEvent[];
  /** Zone the grid is drawn in; `now` is that zone's wall clock. */
  tz: string;
  onOpen: (row: InterviewRoundRow) => void;
  onNew: (date: string, time?: string) => void;
}) {
  const [now, setNow] = useState(() => toWall(new Date(), tz));
  useEffect(() => {
    setNow(toWall(new Date(), tz));
    const t = window.setInterval(() => setNow(toWall(new Date(), tz)), 60_000);
    return () => window.clearInterval(t);
  }, [tz]);
  const hours = visibleHourRange(events);
  const slots = (hours.end - hours.start) * 2;
  const height = slots * SLOT_PX;
  const hasAllDay = events.some((e) => e.allDay);

  return (
    <div className="panel overflow-x-auto">
      <div className="grid min-w-[760px] grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]">
        <div />
        {days.map((d) => {
          const today = sameDay(d, now);
          return (
            <div key={localDateKey(d)} className="flex items-center justify-between border-b border-l border-zinc-200 px-2 py-1.5 dark:border-zinc-800">
              <span className={`text-xs ${today ? 'font-semibold text-sky-700 dark:text-sky-400' : 'text-muted'}`}>
                {d.toLocaleDateString('en-US', { weekday: 'short' })} <span className="tabular-nums">{d.getDate()}</span>
              </span>
              <button type="button" className="btn-icon h-6 w-6 p-0" onClick={() => onNew(localDateKey(d))}
                aria-label={`New interview on ${d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`}>
                <Plus size={13} aria-hidden />
              </button>
            </div>
          );
        })}

        {hasAllDay && (
          <>
            <div className="border-b border-zinc-200 px-1 py-1 text-right text-[10px] text-muted dark:border-zinc-800">all day</div>
            {days.map((d) => (
              <div key={`ad-${localDateKey(d)}`} className="space-y-0.5 border-b border-l border-zinc-200 p-0.5 dark:border-zinc-800">
                {events.filter((e) => e.allDay && sameDay(e.start, d)).map((e) => (
                  <button key={e.id} type="button" onClick={() => onOpen(e.row)}
                    className={`block w-full truncate rounded border px-1 py-0.5 text-left text-[11px] ${roundClass(e.row)}`}>
                    {e.row.companyName || 'Interview'} · {stageLabel(e.row.stage)}
                  </button>
                ))}
              </div>
            ))}
          </>
        )}

        <div className="relative" style={{ height }}>
          {Array.from({ length: hours.end - hours.start }, (_, i) => (
            <div key={i} className="absolute right-1 -translate-y-1/2 text-[10px] text-muted" style={{ top: i * HOUR_PX }}>
              {i === 0 ? '' : hourLabel(hours.start + i)}
            </div>
          ))}
        </div>
        {days.map((d) => {
          const key = localDateKey(d);
          const dayEvents = layoutDayEvents(events.filter((e) => !e.allDay && sameDay(e.start, d)));
          const today = sameDay(d, now);
          const nowTop = ((now.getHours() - hours.start) * 60 + now.getMinutes()) / 30 * SLOT_PX;
          return (
            <div key={key} className="relative border-l border-zinc-200 dark:border-zinc-800" style={{ height }}>
              {Array.from({ length: slots }, (_, i) => {
                const minutes = hours.start * 60 + i * 30;
                const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
                return (
                  <button
                    key={i}
                    type="button"
                    tabIndex={-1}
                    aria-hidden
                    className={`absolute inset-x-0 hover:bg-sky-50 dark:hover:bg-sky-950/30 ${i % 2 === 0 ? 'border-t border-zinc-100 dark:border-zinc-800/70' : ''}`}
                    style={{ top: i * SLOT_PX, height: SLOT_PX }}
                    onClick={() => onNew(key, time)}
                  />
                );
              })}
              {today && nowTop >= 0 && nowTop <= height && (
                <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-red-500" style={{ top: nowTop }} aria-hidden />
              )}
              {dayEvents.map((e) => {
                const top = ((e.start.getHours() - hours.start) * 60 + e.start.getMinutes()) / 30 * SLOT_PX;
                const mins = Math.max(20, (e.end.getTime() - e.start.getTime()) / 60000);
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onOpen(e.row)}
                    aria-label={`${timeText(e.start)} ${e.row.companyName || 'Interview'} · ${stageLabel(e.row.stage)}`}
                    className={`absolute z-20 overflow-hidden rounded-md border px-1 py-0.5 text-left text-[11px] leading-tight shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 ${roundClass(e.row)}`}
                    style={{
                      top,
                      height: Math.max(mins / 30 * SLOT_PX - 2, 18),
                      left: `calc(${(e.col / e.cols) * 100}% + 2px)`,
                      width: `calc(${100 / e.cols}% - 4px)`,
                    }}
                  >
                    <span className="flex items-center gap-1 font-medium">
                      {e.row.hasCaller && <PhoneCall size={10} aria-hidden />}
                      <span className="truncate">{e.row.companyName || 'Interview'}</span>
                    </span>
                    <span className="block truncate opacity-80">{timeText(e.start)} · {stageLabel(e.row.stage)}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
