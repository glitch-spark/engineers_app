import { useId } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Select from '../components/Select';
import FilterBar, { FilterField } from '../components/filters/FilterBar';
import TodayCard from '../components/home/TodayCard';
import WeekCard from '../components/home/WeekCard';
import MetricsCard from '../components/home/MetricsCard';
import PersonPage from '../components/home/PersonPage';
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
 * An admin's Home is the team, one person at a time, picked with a User filter at the top like the other pages
 * (user, 2026-11-21: no Me / Team switch, no list down the side, no Team totals table for now). The names come from
 * the shared team lookup, so the filter is there at once; nobody is picked on arrival and a person's page is read
 * only when they are picked. The person (`?user=`) and the day (`?day=yesterday`) sit in the URL.
 */
function AdminHome() {
  const userId = useId();
  const dayId = useId();
  const [params, setParams] = useSearchParams();
  const today = todayInputValue();
  const yesterday = params.get('day') === 'yesterday';
  const base = asDate(today);
  const before = todayInputValue(new Date(base.getFullYear(), base.getMonth(), base.getDate() - 1));
  const day = yesterday ? before : today;
  const lookup = useTeamLookup();
  const people = teamMembersAZ(lookup.data?.users).map((u) => ({ value: u._id, label: u.name?.trim() || u.email?.trim() || 'Unnamed' }));
  const picked = params.get('user') || '';
  const dayLabel = (iso: string) => asDate(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

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
      <FilterBar canClear={!!picked || yesterday} onClear={() => patch({ user: null, day: null })}>
        <FilterField label="User" htmlFor={userId} width="w-52">
          {lookup.error && !lookup.data ? (
            <p className="text-sm text-muted">
              Couldn&rsquo;t load the team. <button type="button" className="underline" onClick={() => lookup.mutate()}>Retry</button>
            </p>
          ) : (
            <Select
              id={userId}
              value={picked}
              onChange={(user) => patch({ user: user || null })}
              disabled={!lookup.data}
              options={[
                { value: '', label: 'Pick a person' },
                ...people,
                // a linked person the lookup doesn't list (yet) still shows as picked
                ...(picked && !people.some((p) => p.value === picked) ? [{ value: picked, label: 'This person' }] : []),
              ]}
            />
          )}
        </FilterField>
        <FilterField label="Day" htmlFor={dayId} width="w-52">
          <Select
            id={dayId}
            value={yesterday ? 'yesterday' : 'today'}
            onChange={(v) => patch({ day: v === 'yesterday' ? 'yesterday' : null })}
            options={[{ value: 'today', label: `Today · ${dayLabel(today)}` }, { value: 'yesterday', label: `Yesterday · ${dayLabel(before)}` }]}
          />
        </FilterField>
      </FilterBar>
      {picked ? (
        <PersonPage key={picked} userId={picked} name={people.find((p) => p.value === picked)?.label ?? ''} day={day} today={today} />
      ) : (
        <p className="panel p-6 text-sm text-muted">Pick a person to see their bids, interviews, to-dos, goals and pending items.</p>
      )}
    </>
  );
}
