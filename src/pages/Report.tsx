import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import useSWR, { useSWRConfig } from 'swr';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import DayPanel from '../components/report/DayPanel';
import DayRow from '../components/report/DayRow';
import WeekPanel from '../components/report/WeekPanel';
import WeekSummaryCard from '../components/report/WeekSummaryCard';
import { useAuth } from '../auth/useAuth';
import * as api from '../api/endpoints';
import { addDays, dateParam, mondayOf, parseWeekParam, weekLabel } from '../lib/reportWeek';

function SectionError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className="panel p-4 text-sm text-red-600 dark:text-red-400" role="alert">
      Couldn&apos;t load {what}.{' '}
      <button type="button" className="underline" onClick={onRetry}>Retry</button>
    </div>
  );
}

export default function ReportPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [params, setParams] = useSearchParams();
  const { mutate } = useSWRConfig();

  const monday = parseWeekParam(params.get('week'));
  const week = dateParam(monday);
  const currentMonday = mondayOf(new Date());
  const canGoNext = monday < addDays(currentMonday, 7);
  // Admins read other people's boards; only owners write.
  const viewUser = isAdmin ? params.get('user') || undefined : undefined;
  const readOnly = isAdmin;
  const today = dateParam(new Date());

  const setParam = useCallback(
    (patch: Record<string, string | null>) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('tab');
        for (const [key, value] of Object.entries(patch)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      }),
    [setParams],
  );

  const showBoard = !isAdmin || !!viewUser;
  const who = viewUser ?? 'me';
  const weekKey = ['week-plan', week, who];
  const daysKey = ['day-plans', week, who];
  const weekQuery = useSWR(showBoard ? weekKey : null, () => api.getWeekPlan(week, viewUser));
  const daysQuery = useSWR(showBoard ? daysKey : null, () => api.getDayPlans(week, viewUser));

  const [openDay, setOpenDay] = useState<string | null>(null);
  const [weekOpen, setWeekOpen] = useState(false);

  const refresh = () => {
    mutate(weekKey);
    mutate(daysKey);
  };

  const { data: usersData } = useSWR(isAdmin ? ['users-lookup', 'no-admin'] : null, () =>
    api.lookupUsers({ excludeRole: 'admin' }),
  );
  const viewedName = usersData?.users.find((u) => u._id === viewUser);

  return (
    <div className="space-y-4">
      <PageHeader title="Report" />

      <div className="toolbar flex flex-wrap items-center gap-2">
        <button type="button" className="btn-icon" aria-label="Previous week" onClick={() => setParam({ week: dateParam(addDays(monday, -7)) })}>
          <ChevronLeft size={18} aria-hidden />
        </button>
        <span className="min-w-[10rem] text-center font-medium text-strong" aria-live="polite">
          Week {weekLabel(monday)}
        </span>
        <button
          type="button"
          className="btn-icon"
          aria-label="Next week"
          disabled={!canGoNext}
          onClick={() => setParam({ week: dateParam(addDays(monday, 7)) })}
        >
          <ChevronRight size={18} aria-hidden />
        </button>
        {week !== dateParam(currentMonday) && (
          <button type="button" className="btn-outline text-xs" onClick={() => setParam({ week: null })}>
            This week
          </button>
        )}
        {isAdmin && viewUser && (
          <span className="ml-auto flex items-center gap-2 text-sm">
            <Link to={`/report?week=${week}`} className="underline">← Team</Link>
            <span className="text-muted">Viewing {viewedName?.name || viewedName?.email || 'teammate'}</span>
          </span>
        )}
      </div>

      {!showBoard ? (
        <section className="panel p-4">
          <label className="form-label mb-1 block" htmlFor="report-user">Teammate</label>
          <select
            id="report-user"
            className="select w-full max-w-xs"
            value=""
            onChange={(e) => setParam({ user: e.target.value || null })}
          >
            <option value="">Pick a teammate</option>
            {(usersData?.users ?? []).map((u) => (
              <option key={u._id} value={u._id}>{u.name || u.email}</option>
            ))}
          </select>
        </section>
      ) : (
        <>
          {weekQuery.error ? (
            <SectionError what="this week" onRetry={() => weekQuery.mutate()} />
          ) : !weekQuery.data ? (
            <div className="panel space-y-2 p-4" aria-busy="true">
              <div className="skeleton h-5 w-32" />
              <div className="skeleton h-16 w-full" />
            </div>
          ) : (
            <WeekSummaryCard week={weekQuery.data} canEdit={!readOnly} onOpen={() => setWeekOpen(true)} />
          )}

          {daysQuery.error ? (
            <SectionError what="the days" onRetry={() => daysQuery.mutate()} />
          ) : !daysQuery.data ? (
            <div className="panel space-y-2 p-4" aria-busy="true">
              {Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-10 w-full" />)}
            </div>
          ) : (
            <section className="panel p-2" aria-label="Days">
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {daysQuery.data.days.map((day) => (
                  <DayRow
                    key={day.date}
                    day={day}
                    today={today}
                    canEdit={!readOnly}
                    onOpen={() => setOpenDay(day.date)}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {openDay && (
        <DayPanel
          date={openDay}
          userId={viewUser}
          readOnly={readOnly}
          open
          onClose={() => setOpenDay(null)}
          onSaved={refresh}
        />
      )}
      {weekOpen && (
        <WeekPanel
          weekStart={week}
          userId={viewUser}
          readOnly={readOnly}
          open
          onClose={() => setWeekOpen(false)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
