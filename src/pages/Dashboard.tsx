import { useSearchParams } from 'react-router-dom';
import useSWR from 'swr';
import * as api from '../api/endpoints';
import PageHeader from '../components/PageHeader';
import Segmented from '../components/Segmented';
import TodayCard from '../components/home/TodayCard';
import WeekCard from '../components/home/WeekCard';
import MetricsCard from '../components/home/MetricsCard';
import PersonPage from '../components/home/PersonPage';
import TeamList, { type Person } from '../components/home/TeamList';
import { useAuth } from '../auth/useAuth';
import { todayInputValue } from '../lib/week';
import { teamMembersAZ, useTeamLookup } from '../lib/useFirstTeamMember';

const asDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export default function DashboardPage() {
  const { user } = useAuth();
  return (
    <div className="space-y-6">
      <PageHeader title="Home" />
      {user?.role === 'admin' ? <AdminHome /> : <MyHome />}
    </div>
  );
}

/** A person's own Home. */
function MyHome() {
  return (
    <>
      <TodayCard />
      <WeekCard />
      <MetricsCard />
    </>
  );
}

/**
 * An admin's Home is always the team, one person at a time (user, 2026-11-21: no Me / Team switch). The names show
 * at once from the shared team lookup; nobody is picked on arrival, and a person's page is read only when they are
 * picked. Each name's dot, pending count and bids are filled in when the day's summary arrives, with no loading
 * state: that read is slow the first time. The Team totals table (TeamOverview) is off for now (user, 2026-11-21).
 * The person (`?user=`) and the day (`?day=yesterday`) sit in the URL.
 */
function AdminHome() {
  const [params, setParams] = useSearchParams();
  const today = todayInputValue();
  const yesterday = params.get('day') === 'yesterday';
  const base = asDate(today);
  const day = yesterday ? todayInputValue(new Date(base.getFullYear(), base.getMonth(), base.getDate() - 1)) : today;
  const lookup = useTeamLookup();
  const team = useSWR(['team-today', day], () => api.getTeamToday(day), { revalidateOnFocus: false });
  const details = new Map((team.data?.people ?? []).map((p) => [p.userId, p]));
  const people: Person[] = teamMembersAZ(lookup.data?.users).map((u) => ({
    ...details.get(u._id), userId: u._id, name: u.name?.trim() || u.email?.trim() || 'Unnamed',
  }));
  const picked = params.get('user') || '';

  const patch = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <span className="text-sm text-muted">{asDate(day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
        <Segmented
          label="Day"
          value={yesterday ? 'yesterday' : 'today'}
          options={[{ value: 'today', label: 'Today' }, { value: 'yesterday', label: 'Yesterday' }]}
          onChange={(v) => patch({ day: v === 'yesterday' ? 'yesterday' : null })}
        />
      </div>
      <div className="grid items-start gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
        <div className="min-w-0">
          {lookup.error && !lookup.data ? (
            <p className="panel p-3 text-sm text-muted">
              Couldn&rsquo;t load the team. <button type="button" className="underline" onClick={() => lookup.mutate()}>Retry</button>
            </p>
          ) : !lookup.data ? <div className="skeleton h-40 w-full" aria-busy="true" />
            : people.length === 0 ? <p className="panel p-3 text-sm text-muted">No team members to show.</p>
              : <TeamList people={people} picked={picked} onPick={(userId) => patch({ user: userId })} />}
        </div>
        {picked ? (
          <PersonPage key={picked} userId={picked} name={people.find((p) => p.userId === picked)?.name ?? ''} day={day} today={today} />
        ) : (
          <p className="panel p-6 text-sm text-muted">Pick a person to see their bids, interviews, to-dos, goals and pending items.</p>
        )}
      </div>
    </>
  );
}
