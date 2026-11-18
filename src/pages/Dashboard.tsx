import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import TodayCard from '../components/home/TodayCard';
import WeekCard from '../components/home/WeekCard';
import MetricsCard from '../components/home/MetricsCard';
import TeamOverview from '../components/dashboard/TeamOverview';
import { useAuth } from '../auth/useAuth';

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <PageHeader title="Home" />
      <TodayCard />
      <WeekCard />
      <MetricsCard />
      {user?.role === 'admin' && (
        <TeamOverview onPick={(id) => navigate(`/transactions?user=${encodeURIComponent(id)}`)} />
      )}
    </div>
  );
}
