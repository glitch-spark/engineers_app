import { useMemo } from 'react';
import useSWR from 'swr';
import Select from '../../components/Select';
import * as api from '../../api/endpoints';
import { useAuth } from '../../auth/useAuth';
import { formatProfileLabel } from '../../lib/countries';
import { archivedLabel, filterProfiles } from '../../lib/profileArchive';
import { DATE_RANGE_PRESET_OPTIONS, type DateRangePreset } from '../../lib/dateRangePresets';
import { INTERVIEW_STAGE_ORDER, INTERVIEW_STATUSES, stageLabel } from '../../lib/stageBadge';
import type { InterviewFilters as Filters } from '../../lib/interviewFilters';
import { useCallers } from '../../lib/useCallers';

/** One filter bar for List and Calendar; the Date range also picks the calendar's period.
 * `callers`: the Callers calendar shows every user's caller rounds, so a Caller filter replaces User and Profile. */
export default function InterviewFilters({
  filters,
  update,
  callers: callersView = false,
}: {
  filters: Filters;
  update: (patch: Partial<Filters>) => void;
  callers?: boolean;
}) {
  const { user } = useAuth();
  const { callers } = useCallers();
  const callerOptions = [
    { value: '', label: 'All callers' },
    { value: 'unassigned', label: 'No caller yet' },
    ...callers.map((c) => ({ value: c._id, label: c.name })),
  ];
  const { data: usersData } = useSWR(['users-lookup', 'staff-only'], () => api.lookupUsers({ excludeRole: 'admin' }));
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
  const callOptions = [
    { value: '', label: 'Self and caller' },
    { value: 'self', label: 'Self' },
    { value: 'caller', label: 'Caller' },
  ];

  return (
    <div className="panel flex flex-wrap items-end gap-3 px-4 py-3">
      {callersView ? (
        <div className="w-48">
          <label htmlFor="ivf-caller" className="mb-1 block text-xs text-muted">Caller</label>
          <Select id="ivf-caller" value={filters.caller} onChange={(v) => update({ caller: v })} options={callerOptions} />
        </div>
      ) : (
        <>
          <div className="w-44">
            <label htmlFor="ivf-user" className="mb-1 block text-xs text-muted">User</label>
            <Select id="ivf-user" value={filters.user} onChange={(v) => update({ user: v, profile: '' })} options={userOptions} />
          </div>
          <div className="w-48">
            <label htmlFor="ivf-profile" className="mb-1 block text-xs text-muted">Profile</label>
            <Select id="ivf-profile" value={filters.profile} onChange={(v) => update({ profile: v })} options={profileOptions} />
          </div>
          <div className="w-40">
            <label htmlFor="ivf-call" className="mb-1 block text-xs text-muted">Self / Caller</label>
            <Select id="ivf-call" value={filters.call} onChange={(v) => update({ call: v as Filters['call'] })} options={callOptions} />
          </div>
        </>
      )}
      <div className="w-40">
        <label htmlFor="ivf-stage" className="mb-1 block text-xs text-muted">Stage</label>
        <Select id="ivf-stage" value={filters.stage} onChange={(v) => update({ stage: v })} options={stageOptions} />
      </div>
      <div className="w-36">
        <label htmlFor="ivf-status" className="mb-1 block text-xs text-muted">Status</label>
        <Select id="ivf-status" value={filters.status} onChange={(v) => update({ status: v })} options={statusOptions} />
      </div>
      <div className="w-44">
        <label htmlFor="ivf-range" className="mb-1 block text-xs text-muted">Date range</label>
        <Select
          id="ivf-range"
          value={filters.range}
          onChange={(v) => update({ range: v as DateRangePreset })}
          options={DATE_RANGE_PRESET_OPTIONS}
        />
      </div>
      {filters.range === 'custom' && (
        <>
          <div className="w-40">
            <label htmlFor="ivf-from" className="mb-1 block text-xs text-muted">From</label>
            <input id="ivf-from" type="date" className="input text-sm" value={filters.from} max={filters.to || undefined}
              onChange={(e) => update({ from: e.target.value })} />
          </div>
          <div className="w-40">
            <label htmlFor="ivf-to" className="mb-1 block text-xs text-muted">To</label>
            <input id="ivf-to" type="date" className="input text-sm" value={filters.to} min={filters.from || undefined}
              onChange={(e) => update({ to: e.target.value })} />
          </div>
        </>
      )}
    </div>
  );
}
