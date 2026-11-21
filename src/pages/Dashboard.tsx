import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import useSWR from 'swr';
import * as api from '../api/endpoints';
import PageHeader from '../components/PageHeader';
import Segmented from '../components/Segmented';
import TodayCard from '../components/home/TodayCard';
import WeekCard from '../components/home/WeekCard';
import MetricsCard from '../components/home/MetricsCard';
import PersonPage from '../components/home/PersonPage';
import TeamList from '../components/home/TeamList';
import TeamOverview from '../components/dashboard/TeamOverview';
import { useAuth } from '../auth/useAuth';
import { todayInputValue } from '../lib/week';

type View = 'me' | 'team';
const VIEW_KEY = 'home-view';

/** The admin's last Me / Team choice in this browser; null when none, or when storage is blocked. */
function rememberedView(): View | null {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === 'me' || v === 'team' ? v : null;
  } catch {
    return null;
  }
}

const asDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** The team list reads everyone's day and flags: say so while it loads, the first load can take a few seconds. */
function TeamLoading() {
  return (
    <div className="panel space-y-3 p-3" role="status">
      <p className="flex items-center gap-2 text-sm text-body">
        <span className="spinner spinner-sm" aria-hidden /> Loading the team…
      </p>
      <p className="text-xs text-muted">This can take a few seconds the first time.</p>
      {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-12 w-full" />)}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  return (
    <div className="space-y-6">
      <PageHeader title="Home" />
      {user?.role === 'admin' ? <AdminHome /> : <MyHome />}
    </div>
  );
}

/** A person's own Home; an admin's also has the team table below. */
function MyHome({ admin }: { admin?: boolean }) {
  const navigate = useNavigate();
  return (
    <>
      <TodayCard />
      <WeekCard />
      <MetricsCard />
      {admin && <TeamOverview onPick={(id) => navigate(`/transactions?user=${encodeURIComponent(id)}`)} />}
    </>
  );
}

/**
 * Admins switch between their own Home (Me) and the team, one person at a time (Team). The person (`?user=`) and
 * the day (`?day=yesterday`) sit in the URL. Team is the default; a remembered Me is kept only for an admin who has
 * a plan of their own.
 */
function AdminHome() {
  const [params, setParams] = useSearchParams();
  const today = todayInputValue();
  // What was clicked this session; a link to a person opens Team.
  const [choice, setChoice] = useState<View | null>(() => (params.has('user') ? 'team' : null));
  const [remembered] = useState(rememberedView);
  const own = useSWR(!choice && remembered === 'me' ? ['home-day', today] : null, () => api.getDayPlan(today), { revalidateOnFocus: false });
  const view: View | null = choice
    ?? (remembered !== 'me' ? 'team' : own.data ? (own.data.weekSaved ? 'me' : 'team') : own.error ? 'me' : null);

  const yesterday = params.get('day') === 'yesterday';
  const base = asDate(today);
  const day = yesterday ? todayInputValue(new Date(base.getFullYear(), base.getMonth(), base.getDate() - 1)) : today;
  const team = useSWR(view === 'team' ? ['team-today', day] : null, () => api.getTeamToday(day));
  const people = team.data?.people ?? [];
  const picked = params.get('user') || people[0]?.userId || '';

  const patch = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };
  const pickView = (v: View) => {
    setChoice(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // storage blocked: the choice still holds for this visit
    }
    if (v === 'me') patch({ user: null, day: null });
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label="View" value={view} options={[{ value: 'me', label: 'Me' }, { value: 'team', label: 'Team' }]} onChange={pickView} />
        {view === 'team' && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted">{asDate(day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
            <Segmented
              label="Day"
              value={yesterday ? 'yesterday' : 'today'}
              options={[{ value: 'today', label: 'Today' }, { value: 'yesterday', label: 'Yesterday' }]}
              onChange={(v) => patch({ day: v === 'yesterday' ? 'yesterday' : null })}
            />
          </div>
        )}
      </div>
      {view === null && <div className="skeleton h-40 w-full" aria-busy="true" />}
      {view === 'me' && <MyHome admin />}
      {view === 'team' && (
        <div className="grid items-start gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
          <div className="min-w-0">
            {team.error && !team.data ? (
              <p className="panel p-3 text-sm text-muted">
                Couldn&rsquo;t load the team. <button type="button" className="underline" onClick={() => team.mutate()}>Retry</button>
              </p>
            ) : !team.data ? <TeamLoading />
              : people.length === 0 ? <p className="panel p-3 text-sm text-muted">No team members to show.</p>
                : <TeamList people={people} picked={picked} onPick={(userId) => patch({ user: userId })} />}
          </div>
          {!team.data && !team.error && !picked && (
            <div className="panel space-y-3 p-4" aria-hidden>
              <div className="skeleton h-5 w-40" />
              <div className="skeleton h-24 w-full" />
              <div className="skeleton h-24 w-full" />
            </div>
          )}
          {picked && (
            <PersonPage key={picked} userId={picked} name={people.find((p) => p.userId === picked)?.name ?? ''} day={day} today={today} />
          )}
        </div>
      )}
    </>
  );
}
