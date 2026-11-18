import { useId, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import NetIncomeCard from '../dashboard/NetIncomeCard';
import CompareCard from '../dashboard/CompareCard';
import { useAuth } from '../../auth/useAuth';
import { useTeamLookup } from '../../lib/useFirstTeamMember';

/** Net income + you-vs-team. Admins can pick a user (seeded from `?user=`); everyone else sees their own. */
export default function EarningsTab() {
  const formId = useId();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [params] = useSearchParams();
  const [selectedUserId, setSelectedUserId] = useState(params.get('user') ?? '');
  const { data: lookupData } = useTeamLookup(isAdmin);
  const users = lookupData?.users ?? [];
  const userId = isAdmin ? (selectedUserId || undefined) : undefined;

  return (
    <div className="space-y-6">
      {isAdmin && (
        <div className="w-64">
          <label htmlFor={`${formId}-user`} className="block text-xs text-muted mb-1">User</label>
          <select
            id={`${formId}-user`}
            className="select focus-ring w-full text-sm"
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
          >
            <option value="">Me</option>
            {users.map((u) => (
              <option key={u._id} value={u._id}>
                {u.name || u.email}
              </option>
            ))}
          </select>
        </div>
      )}
      <NetIncomeCard userId={userId} />
      <CompareCard userId={userId} />
    </div>
  );
}
