import NetIncomeCard from '../dashboard/NetIncomeCard';
import FramedTab from '../stats/FramedTab';
import { useAuth } from '../../auth/useAuth';
import { useStatsFilters } from './statsFilters';

/** Earnings: the you-vs-team frame, then the 12-month net income chart for the same person (admins pick via `user`). */
export default function EarningsTab() {
  const f = useStatsFilters();
  const viewed = useAuth().user?.role === 'admin' ? f.values.user || undefined : undefined;
  return (
    <div className="space-y-6">
      <FramedTab tab="earnings" />
      <NetIncomeCard userId={viewed} />
    </div>
  );
}
