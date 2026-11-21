import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import useSWR, { useSWRConfig } from 'swr';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import DayPanel from '../components/report/DayPanel';
import DayRow from '../components/report/DayRow';
import TeamTable from '../components/report/TeamTable';
import WeekPanel from '../components/report/WeekPanel';
import WeekGoalCard from '../components/report/WeekGoalCard';
import { useAuth } from '../auth/useAuth';
import * as api from '../api/endpoints';
import { addDays, dateParam, mondayOf, parseDateParam, parseWeekParam, weekLabel } from '../lib/reportWeek';
import { planView } from '../lib/planView';
import { useTeamLookup } from '../lib/useFirstTeamMember';

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

  // `?day=` (the Slack post's link) opens that day, on its own week unless `week` says otherwise.
  const dayParam = parseDateParam(params.get('day')) ? params.get('day') : null;
  const monday = parseWeekParam(params.get('week') ?? dayParam);
  const week = dateParam(monday);
  const currentMonday = mondayOf(new Date());
  const canGoNext = monday < addDays(currentMonday, 7);
  // Everyone reads the team's boards; only owners write (admins have no board of their own and write nothing).
  const { viewUser, readOnly, teamView } = planView({
    isAdmin, userId: user?.id, user: params.get('user'), view: params.get('view'),
  });
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

  const showBoard = !teamView;
  const who = viewUser ?? 'me';
  const weekKey = ['week-plan', week, who];
  const daysKey = ['day-plans', week, who];
  const weekQuery = useSWR(showBoard ? weekKey : null, () => api.getWeekPlan(week, viewUser));
  const daysQuery = useSWR(showBoard ? daysKey : null, () => api.getDayPlans(week, viewUser));

  // Admins land on the team table (no `view` needed); staff ask for it with `view=team`.
  const teamLink = isAdmin ? `/plans?week=${week}` : `/plans?week=${week}&view=team`;

  const [openDay, setOpenDay] = useState<string | null>(dayParam);
  const [weekOpen, setWeekOpen] = useState(false);

  const refresh = () => {
    mutate(weekKey);
    mutate(daysKey);
  };

  // The names for "Viewing <name>", for everyone (staff open teammates' boards too).
  const { data: usersData } = useTeamLookup();
  const viewedName = usersData?.users.find((u) => u._id === viewUser);

  return (
    <div className="space-y-4">
      <PageHeader title="Plans" />

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
        {viewUser ? (
          <span className="ml-auto flex items-center gap-2 text-sm">
            <Link to={teamLink} className="underline">← Team</Link>
            <span className="text-muted">Viewing {viewedName?.name || viewedName?.email || 'teammate'}</span>
          </span>
        ) : !isAdmin && (
          // Staff: their own board or the team table.
          <nav className="segmented ml-auto" aria-label="Plan view">
            <Link
              to={`/plans?week=${week}`}
              aria-current={teamView ? undefined : 'page'}
              className={`segmented-btn ${teamView ? '' : 'segmented-btn-active-neutral'}`}
            >
              My plan
            </Link>
            <Link
              to={teamLink}
              aria-current={teamView ? 'page' : undefined}
              className={`segmented-btn ${teamView ? 'segmented-btn-active-neutral' : ''}`}
            >
              Team
            </Link>
          </nav>
        )}
      </div>

      {!showBoard ? (
        // A row opens that person's board (read-only); the viewer's own row opens their own, editable one.
        <TeamTable week={week} onOpenUser={(id) => setParam({ user: id === user?.id ? null : id, view: null })} />
      ) : (
        <>
          {weekQuery.error ? (
            <SectionError what="this week" onRetry={() => weekQuery.mutate()} />
          ) : !weekQuery.data ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-5" aria-busy="true">
              <div className="panel space-y-2 p-4 lg:col-span-3">
                <div className="skeleton h-5 w-32" />
                <div className="skeleton h-32 w-full" />
              </div>
              <div className="panel space-y-2 p-4 lg:col-span-2">
                <div className="skeleton h-5 w-28" />
                <div className="skeleton h-32 w-full" />
              </div>
            </div>
          ) : (
            <WeekGoalCard week={weekQuery.data} canEdit={!readOnly} onOpen={() => setWeekOpen(true)} />
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
                    profiles={daysQuery.data?.profiles}
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
          onClose={() => {
            setOpenDay(null);
            if (dayParam) setParam({ day: null });
          }}
          onSaved={refresh}
        />
      )}
      {weekOpen && (
        <WeekPanel
          weekStart={week}
          userId={viewUser}
          mode={!viewUser ? 'own' : isAdmin ? 'admin' : 'view'}
          open
          onClose={() => setWeekOpen(false)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
