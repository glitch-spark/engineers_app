import { useMemo } from 'react';
import useSWR from 'swr';
import Select from '../../components/Select';
import * as api from '../../api/endpoints';
import { useAuth } from '../../auth/useAuth';
import { formatProfileLabel } from '../../lib/countries';
import { DATE_RANGE_PRESET_OPTIONS, type DateRangePreset } from '../../lib/dateRangePresets';
import { INTERVIEW_STAGE_ORDER, INTERVIEW_STATUSES, stageLabel } from '../../lib/stageBadge';
import type { InterviewFilters as Filters } from '../../lib/interviewFilters';

/** Shared filter bar for List and Calendar (the date range is List-only). */
export default function InterviewFilters({
  filters,
  update,
  showDateRange,
}: {
  filters: Filters;
  update: (patch: Partial<Filters>) => void;
  showDateRange: boolean;
}) {
  const { user } = useAuth();
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
      ...mine.map((a) => ({ value: a._id, label: formatProfileLabel(a.name, a.country, a._id, a.region) })),
    ];
  }, [accountsData, filters.user]);

  const stageOptions = [
    { value: '', label: 'All stages' },
    ...(INTERVIEW_STAGE_ORDER as readonly string[]).map((s) => ({ value: s, label: stageLabel(s) })),
  ];
  const statusOptions = [{ value: '', label: 'All statuses' }, ...INTERVIEW_STATUSES];

  return (
    <div className="panel flex flex-wrap items-end gap-3 px-4 py-3">
      <div className="w-44">
        <label htmlFor="ivf-user" className="mb-1 block text-xs text-muted">User</label>
        <Select id="ivf-user" value={filters.user} onChange={(v) => update({ user: v, profile: '' })} options={userOptions} />
      </div>
      <div className="w-48">
        <label htmlFor="ivf-profile" className="mb-1 block text-xs text-muted">Profile</label>
        <Select id="ivf-profile" value={filters.profile} onChange={(v) => update({ profile: v })} options={profileOptions} />
      </div>
      <div className="w-40">
        <label htmlFor="ivf-stage" className="mb-1 block text-xs text-muted">Stage</label>
        <Select id="ivf-stage" value={filters.stage} onChange={(v) => update({ stage: v })} options={stageOptions} />
      </div>
      <div className="w-36">
        <label htmlFor="ivf-status" className="mb-1 block text-xs text-muted">Status</label>
        <Select id="ivf-status" value={filters.status} onChange={(v) => update({ status: v })} options={statusOptions} />
      </div>
      {showDateRange && (
        <>
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
        </>
      )}
    </div>
  );
}
