import { useMemo } from 'react';
import useSWR from 'swr';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as api from '../../api/endpoints';
import type { InterviewRoundRow } from '../../api/endpoints';
import type { Interview } from '../../components/interview/types';
import { monthGrid, rangeFor, shiftAnchor, weekDays } from '../../lib/calendarLayout';
import { calendarFromFilters, filtersForCalendar, roundsQuery, type InterviewFilters } from '../../lib/interviewFilters';
import { toDateInputValue } from '../../lib/dateRangePresets';
import CalendarAgenda from './CalendarAgenda';
import CalendarMonth from './CalendarMonth';
import CalendarWeek from './CalendarWeek';
import { parseLocalDate, rangeLabel, toEvents } from './calendarShared';
import { useInterviewTimezone } from '../../lib/useInterviewTimezone';
import { toWall, zonedDateKey } from '../../lib/interviewTimezone';

/** Week (default) and Month calendar of rounds; click a round to edit it, a slot to create one. */
export default function InterviewsCalendar({
  filters,
  update,
  onOpenRound,
  onNew,
}: {
  filters: InterviewFilters;
  update: (patch: Partial<InterviewFilters>) => void;
  onOpenRound: (iv: Interview, roundId: string) => void;
  onNew: (prefill: { date: string; time?: string }) => void;
}) {
  const { tz } = useInterviewTimezone();
  // One Date range drives both views: the calendar shows the period it names.
  const now = toWall(new Date(), tz);
  const { view, anchor: anchorKey } = calendarFromFilters(filters, now);
  const anchor = parseLocalDate(anchorKey);
  const days = useMemo(() => (view === 'week' ? weekDays(anchor) : monthGrid(anchor)), [view, anchorKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const showPeriod = (v: 'week' | 'month', key: string) => update(filtersForCalendar(v, key, now));
  const range = rangeFor(view, anchor);
  const query = roundsQuery(filters, range, tz);
  const { data, isLoading } = useSWR(['interview-rounds', JSON.stringify(query)], () => api.listInterviewRounds(query), {
    keepPreviousData: true,
  });
  const events = useMemo(() => toEvents(data?.rounds ?? [], tz), [data, tz]);

  const open = (row: InterviewRoundRow) => {
    const iv = data?.interviews?.[row.interviewId] as unknown as Interview | undefined;
    if (iv) onOpenRound(iv, row.roundId);
  };
  const newAt = (date: string, time?: string) => onNew({ date, time });
  const go = (delta: number) => showPeriod(view, toDateInputValue(shiftAnchor(view, anchor, delta)));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button type="button" className="btn-icon" onClick={() => go(-1)} aria-label={`Previous ${view}`}><ChevronLeft size={16} aria-hidden /></button>
          <button type="button" className="btn-outline btn-sm" onClick={() => showPeriod(view, zonedDateKey(new Date(), tz))}>Today</button>
          <button type="button" className="btn-icon" onClick={() => go(1)} aria-label={`Next ${view}`}><ChevronRight size={16} aria-hidden /></button>
          <h2 className="ml-2 text-sm font-semibold tabular-nums" aria-live="polite">{rangeLabel(view, days, anchor)}</h2>
          {isLoading && <span className="spinner spinner-sm ml-2" aria-label="Loading" />}
        </div>
        <div className="segmented" role="group" aria-label="Calendar view">
          {(['week', 'month'] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => showPeriod(v, anchorKey)}
              className={`segmented-btn ${view === v ? 'segmented-btn-active-neutral' : ''}`}>
              {v === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>
      </div>

      {view === 'week' ? (
        <>
          <div className="hidden sm:block"><CalendarWeek days={days} events={events} tz={tz} onOpen={open} onNew={newAt} /></div>
          <div className="sm:hidden"><CalendarAgenda days={days} events={events} onOpen={open} onNew={newAt} /></div>
        </>
      ) : (
        <CalendarMonth days={days} anchor={anchor} events={events} tz={tz} onOpen={open} onNew={newAt}
          onShowWeek={(date) => showPeriod('week', date)} />
      )}
    </div>
  );
}
