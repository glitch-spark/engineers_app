import { useId, useMemo } from 'react';
import useSWR from 'swr';
import Select from '../../components/Select';
import DateRangeFilter from '../../components/filters/DateRangeFilter';
import FilterBar, { FilterField } from '../../components/filters/FilterBar';
import SearchFilter from '../../components/filters/SearchFilter';
import * as api from '../../api/endpoints';
import { useAuth } from '../../auth/useAuth';
import { formatProfileLabel } from '../../lib/countries';
import { archivedLabel, filterProfiles } from '../../lib/profileArchive';
import { INTERVIEW_PRESETS, type InterviewFilters as Filters } from '../../lib/interviewFilters';
import { INTERVIEW_STAGE_ORDER, INTERVIEW_STATUSES, stageLabel } from '../../lib/stageBadge';
import { useCallers } from '../../lib/useCallers';
import { useTeamLookup } from '../../lib/useFirstTeamMember';
import { useInterviewTimezone } from '../../lib/useInterviewTimezone';
import { zonedDateKey } from '../../lib/interviewTimezone';

/**
 * The one filter bar for List and Calendar, on the Self interviews and Caller interviews tabs: who, Stage, Status, search,
 * Date range, Clear. The Date range may reach the future (it offers Next week), and it also picks the calendar's period.
 * `callers`: Caller interviews shows every user's caller rounds, so a Caller filter replaces User and Profile. Self interviews has no Self / Caller filter: it is always self rounds.
 */
export default function InterviewFilters({
  filters,
  update,
  canClear,
  onClear,
  callers: callersView = false,
}: {
  filters: Filters;
  update: (patch: Partial<Filters>) => void;
  canClear: boolean;
  onClear: () => void;
  callers?: boolean;
}) {
  const ids = useId();
  const id = (name: string) => `${ids}-${name}`;
  const { user } = useAuth();
  const { tz } = useInterviewTimezone();
  const { callers, byId } = useCallers();
  // An archived caller opened from the Manage callers tab (`?caller=`) stays selectable.
  const picked = filters.caller && filters.caller !== 'unassigned' ? byId.get(filters.caller) : undefined;
  const callerOptions = [
    { value: '', label: 'All callers' },
    { value: 'unassigned', label: 'No caller yet' },
    ...callers.map((c) => ({ value: c._id, label: c.name })),
    ...(picked?.archived ? [{ value: picked._id, label: `${picked.name} (archived)` }] : []),
  ];
  const { data: usersData } = useTeamLookup();
  const { data: accountsData } = useSWR(['accounts-lookup'], () => api.lookupAccounts());

  const userOptions = useMemo(() => {
    const users = usersData?.users ?? [];
    const opts = users.map((u) => ({ value: u._id, label: `${u.name || u.email || u._id}${u._id === user?.id ? ' (you)' : ''}` }));
    if (user?.id && !users.some((u) => u._id === user.id)) opts.unshift({ value: user.id, label: 'You' });
    return [{ value: 'all', label: 'All users' }, ...opts];
  }, [usersData, user?.id]);

  const profileOptions = useMemo(() => {
    const all = accountsData?.accounts ?? [];
    const mine = filters.user === 'all' ? all : all.filter((a) => a.createdBy === filters.user);
    return [
      { value: '', label: 'All profiles' },
      ...filterProfiles(mine).map((a) => ({
        value: a._id,
        label: archivedLabel(formatProfileLabel(a.name, a.country, a._id, a.region), a.archived),
      })),
    ];
  }, [accountsData, filters.user]);

  const stageOptions = [
    { value: '', label: 'All stages' },
    ...(INTERVIEW_STAGE_ORDER as readonly string[]).map((s) => ({ value: s, label: stageLabel(s) })),
  ];
  const statusOptions = [{ value: '', label: 'All statuses' }, ...INTERVIEW_STATUSES];

  return (
    <FilterBar canClear={canClear} onClear={onClear}>
      {callersView ? (
        <>
          <FilterField label="User" htmlFor={id('owner')} width="w-48">
            <Select
              id={id('owner')}
              value={filters.owner}
              onChange={(v) => update({ owner: v })}
              // "All users" is '' here: the Caller interviews tab shows everyone's caller rounds by default.
              options={userOptions.map((o) => (o.value === 'all' ? { ...o, value: '' } : o))}
            />
          </FilterField>
          <FilterField label="Caller" htmlFor={id('caller')} width="w-48">
            <Select id={id('caller')} value={filters.caller} onChange={(v) => update({ caller: v })} options={callerOptions} />
          </FilterField>
        </>
      ) : (
        <>
          <FilterField label="User" htmlFor={id('user')}>
            <Select id={id('user')} value={filters.user} onChange={(v) => update({ user: v, profile: '' })} options={userOptions} />
          </FilterField>
          <FilterField label="Profile" htmlFor={id('profile')} width="w-48">
            <Select id={id('profile')} value={filters.profile} onChange={(v) => update({ profile: v })} options={profileOptions} />
          </FilterField>
        </>
      )}
      <FilterField label="Stage" htmlFor={id('stage')} width="w-40">
        <Select id={id('stage')} value={filters.stage} onChange={(v) => update({ stage: v })} options={stageOptions} />
      </FilterField>
      <FilterField label="Status" htmlFor={id('status')} width="w-36">
        <Select id={id('status')} value={filters.status} onChange={(v) => update({ status: v })} options={statusOptions} />
      </FilterField>
      <SearchFilter value={filters.q} onChange={(q) => update({ q })} placeholder="Search interviews…" />
      <DateRangeFilter
        value={{ preset: filters.range, from: filters.from, to: filters.to }}
        onChange={(v) => update({ range: v.preset, from: v.from, to: v.to })}
        presets={INTERVIEW_PRESETS}
        allowFuture
        // The zone's date, so the bar, the list and the calendar all agree on what "this week" is.
        today={zonedDateKey(new Date(), tz)}
      />
    </FilterBar>
  );
}
