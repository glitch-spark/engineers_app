import { useMemo } from 'react';
import useSWR from 'swr';
import { ChevronLeft, ChevronRight, Settings2 } from 'lucide-react';
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
import { useCallers } from '../../lib/useCallers';
import { CALLER_DOT, UNASSIGNED_CHIP, callerChipClass, callerLabel } from '../../lib/callerColors';

/** Week (default) and Month calendar of rounds; click a round to edit it, a slot to create one.
 * `callers`: the Callers calendar — every user's caller rounds, coloured by caller. */
export default function InterviewsCalendar({
  filters,
  update,
  onOpenRound,
  onNew,
  callers = false,
  onManageCallers,
}: {
  filters: InterviewFilters;
  update: (patch: Partial<InterviewFilters>) => void;
  onOpenRound: (iv: Interview, roundId: string) => void;
  onNew: (prefill: { date: string; time?: string }) => void;
  callers?: boolean;
  /** Shown to Admin / interview managers on the Callers calendar. */
  onManageCallers?: () => void;
}) {
  const { tz } = useInterviewTimezone();
  const { callers: callerList, byId, canManage } = useCallers();
  // One Date range drives both views: the calendar shows the period it names.
  const now = toWall(new Date(), tz);
  const { view, anchor: anchorKey } = calendarFromFilters(filters, now);
  const anchor = parseLocalDate(anchorKey);
  const days = useMemo(() => (view === 'week' ? weekDays(anchor) : monthGrid(anchor)), [view, anchorKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const showPeriod = (v: 'week' | 'month', key: string) => update(filtersForCalendar(v, key, now));
  const range = rangeFor(view, anchor);
  const query = roundsQuery(filters, range, tz, { callers });
  const { data, isLoading, isValidating } = useSWR(['interview-rounds', JSON.stringify(query)], () => api.listInterviewRounds(query), {
    keepPreviousData: true,
  });
  const events = useMemo(() => {
    const base = toEvents(data?.rounds ?? [], tz);
    return callers ? base.map((e) => ({ ...e, cls: callerChipClass(e.row, byId), detail: callerLabel(e.row) })) : base;
  }, [data, tz, callers, byId]);
  // First load, or a period / filter not fetched yet (the previous one stays dimmed underneath).
  const loading = isLoading;

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
          {isValidating && !loading && <span className="spinner spinner-sm ml-2" aria-label="Refreshing" />}
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

      {callers && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" aria-label="Caller colours">
            {callerList.map((c) => (
              <li key={c._id} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${CALLER_DOT[c.color] ?? 'bg-zinc-400'}`} aria-hidden />
                {c.name}
              </li>
            ))}
            <li className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full border ${UNASSIGNED_CHIP}`} aria-hidden />
              No caller yet
            </li>
          </ul>
          {canManage && onManageCallers && (
            <button type="button" className="btn-outline btn-sm" onClick={onManageCallers}>
              <Settings2 size={14} aria-hidden /> Manage callers
            </button>
          )}
        </div>
      )}

      <div className="relative" aria-busy={loading}>
        {view === 'week' ? (
          <>
            <div className="hidden sm:block"><CalendarWeek days={days} events={events} tz={tz} onOpen={open} onNew={newAt} /></div>
            <div className="sm:hidden"><CalendarAgenda days={days} events={events} onOpen={open} onNew={newAt} /></div>
          </>
        ) : (
          <CalendarMonth days={days} anchor={anchor} events={events} tz={tz} onOpen={open} onNew={newAt}
            onShowWeek={(date) => showPeriod('week', date)} />
        )}
        {loading && (
          <div className="absolute inset-0 z-40 flex items-start justify-center rounded-xl bg-white/70 pt-24 backdrop-blur-[1px] dark:bg-zinc-950/70">
            <div className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900" role="status">
              <span className="spinner spinner-sm" aria-hidden />
              Loading {callers ? 'caller rounds' : 'interviews'}…
            </div>
          </div>
        )}
      </div>
      {callers && !loading && events.length === 0 && (
        <p className="text-sm text-muted">No caller rounds in this period{filters.caller ? ' for this caller' : ''}.</p>
      )}
    </div>
  );
}
