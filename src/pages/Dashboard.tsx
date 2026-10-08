import { useId, useState } from 'react';
import useSWR from 'swr';
import PageHeader from '../components/PageHeader';
import ThisWeekCard from '../components/dashboard/ThisWeekCard';
import ActivityChartCard from '../components/dashboard/ActivityChartCard';
import NetIncomeCard from '../components/dashboard/NetIncomeCard';
import CompareCard from '../components/dashboard/CompareCard';
import TeamOverview from '../components/dashboard/TeamOverview';
import { useAuth } from '../auth/useAuth';
import * as api from '../api/endpoints';

export default function DashboardPage() {
  const formId = useId();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [selectedUserId, setSelectedUserId] = useState('');

  const { data: lookupData } = useSWR(
    isAdmin ? ['users-lookup', 'exclude-admin'] : null,
    () => api.lookupUsers({ excludeRole: 'admin' }),
  );
  const users = lookupData?.users ?? [];

  const userId = isAdmin ? (selectedUserId || undefined) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" />

      {isAdmin && (
        <div className="w-64">
          <label htmlFor={`${formId}-user`} className="block text-xs text-muted mb-1">User</label>
          <select
            id={`${formId}-user`}
            className="select focus-ring w-full text-sm"
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
          >
            <option value="">All users</option>
            {users.map((u) => (
              <option key={u._id} value={u._id}>
                {u.name || u.email}
              </option>
            ))}
          </select>
        </div>
      )}

      {isAdmin && !selectedUserId ? (
        <TeamOverview onPick={setSelectedUserId} />
      ) : (
        <div className="space-y-6">
          <ThisWeekCard userId={userId} />
          <CompareCard userId={userId} />
          <ActivityChartCard userId={userId} />
          <NetIncomeCard userId={userId} />
        </div>
      )}
    </div>
  );
}
