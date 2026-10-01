import useSWR from 'swr';
import * as api from '../../api/endpoints';
import type { TeamRow } from '../../api/endpoints';
import { dateParam, isLogStale, mondayOf, parseDateParam, regionTotal } from '../../lib/reportWeek';
import GoalDone from './GoalDone';

function lastLog(row: TeamRow, week: string): { text: string; stale: boolean } {
  const isCurrentWeek = week === dateParam(mondayOf(new Date()));
  const stale = isLogStale(row.lastLoggedDate, new Date(), isCurrentWeek);
  const last = parseDateParam(row.lastLoggedDate);
  if (!last) return { text: 'No log', stale };
  const sameWeek = dateParam(mondayOf(last)) === week;
  const text = last.toLocaleDateString('en-US', sameWeek ? { weekday: 'short' } : { month: 'short', day: 'numeric' });
  return { text, stale };
}

/** Admin overview: everyone's Goal vs Done for the week; a row opens that person's board. */
export default function TeamTable({ week, onOpenUser }: { week: string; onOpenUser: (userId: string) => void }) {
  const { data, error, mutate } = useSWR(['team-report', week], () => api.getTeamReport(week));

  if (error) {
    return (
      <div className="panel p-4 text-sm text-red-600 dark:text-red-400" role="alert">
        Couldn&apos;t load the team.{' '}
        <button type="button" className="underline" onClick={() => mutate()}>Retry</button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="panel space-y-2 p-4" aria-busy="true">
        {Array.from({ length: 5 }, (_, i) => <div key={i} className="skeleton h-8 w-full" />)}
      </div>
    );
  }
  if (!data.users.length) {
    return <div className="panel p-4 text-sm text-muted">No teammates yet.</div>;
  }

  return (
    <section className="panel overflow-x-auto p-0" aria-label="Team progress">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs text-muted dark:border-zinc-800">
            <th scope="col" className="px-4 py-2 font-medium">Teammate</th>
            <th scope="col" className="px-3 py-2 font-medium">Bids</th>
            <th scope="col" className="px-3 py-2 font-medium">Interviews</th>
            <th scope="col" className="px-3 py-2 font-medium">Profiles</th>
            <th scope="col" className="px-3 py-2 font-medium">LinkedIn</th>
            <th scope="col" className="px-3 py-2 font-medium">Last log</th>
          </tr>
        </thead>
        <tbody>
          {data.users.map((row) => {
            const log = lastLog(row, week);
            return (
              <tr
                key={row.userId}
                className="cursor-pointer border-b border-zinc-100 last:border-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                onClick={() => onOpenUser(row.userId)}
              >
                <th scope="row" className="px-4 py-2 text-left font-medium">
                  <button type="button" className="text-left text-strong underline-offset-2 hover:underline focus-ring"
                    onClick={(e) => { e.stopPropagation(); onOpenUser(row.userId); }}>
                    {row.name || row.email}
                  </button>
                  {!row.hasWeeklyPlan && <span className="ml-2 text-xs font-normal text-muted">no week goals</span>}
                </th>
                <td className="px-3 py-2">
                  <GoalDone done={row.done.bidsSelf + row.done.bidsBidder} goal={row.goal.bidsSelf + row.goal.bidsBidder} />
                </td>
                <td className="px-3 py-2">
                  <GoalDone
                    done={row.done.interviewsSelf + row.done.interviewsCaller}
                    goal={row.goal.interviewsSelf + row.goal.interviewsCaller}
                  />
                </td>
                <td className="px-3 py-2">
                  <GoalDone done={regionTotal(row.done.profiles)} goal={regionTotal(row.goal.profiles)} />
                </td>
                <td className="px-3 py-2">
                  <GoalDone done={regionTotal(row.done.linkedin)} goal={regionTotal(row.goal.linkedin)} />
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {log.text}
                  {log.stale && (
                    <span className="ml-1 text-amber-700 dark:text-amber-400" title="Not logged for over a working day">
                      ⚠<span className="sr-only"> not logged recently</span>
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
