import useSWR from 'swr';
import { useCallback, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Calendar, Sparkles } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import Tabs from '../components/Tabs';
import { useAuth } from '../auth/useAuth';
import * as api from '../api/endpoints';
import { formatWeekOptionLabel, getWeekInfo } from '../lib/week';
import WeeklyPlanPanel, { type WeeklyPlanActions } from './WeeklyPlan';
import DailyPlanPanel, { type DailyPlanActions } from './DailyPlan';

const REPORT_TABS = [
  { key: 'weekly', label: 'Weekly Plan' },
  { key: 'daily', label: 'Daily Plan' },
];

export default function ReportPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [searchParams, setSearchParams] = useSearchParams();
  // `?tab=weekly` deep-links (e.g. the weekly-plan alert); default is Daily.
  const tab = searchParams.get('tab') === 'weekly' ? 'weekly' : 'daily';
  const setTab = useCallback((next: string) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set('tab', next);
      return params;
    }, { replace: true });
  }, [setSearchParams]);
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [weekNumber, setWeekNumber] = useState(getWeekInfo(new Date()).weekNumber.toString());
  const [userFilter, setUserFilter] = useState<string | null>(null);
  const userId = userFilter === null ? (user?.id ?? '') : userFilter;
  const [reporting, setReporting] = useState(false);
  const weeklyActions = useRef<WeeklyPlanActions | null>(null);
  const dailyActions = useRef<DailyPlanActions | null>(null);

  const { data: usersData } = useSWR(['users-lookup'], () => api.lookupUsers());
  const users = (usersData?.users as Array<{ _id: string; name?: string; email?: string }>) || [];

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  const weekOptions = Array.from({ length: 52 }, (_, i) => i + 1);

  const onReportingChange = useCallback((next: boolean) => {
    setReporting(next);
  }, []);

  const headerAction = tab === 'weekly' ? (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="btn-outline"
        onClick={() => weeklyActions.current?.runReport()}
        disabled={reporting}
        title="Analyze plans in the current filter into progress metrics. Interview counts come from the interview board; next-week interviews are included."
      >
        <Sparkles size={16} className="mr-2" aria-hidden /> {reporting ? 'Analyzing...' : 'Run Progress Report'}
      </button>
      <button type="button" className="btn" onClick={() => weeklyActions.current?.openAdd()}>
        <Calendar size={16} className="mr-2" aria-hidden /> Add Plan
      </button>
    </div>
  ) : !isAdmin ? (
    <button type="button" className="btn" onClick={() => dailyActions.current?.openAdd()}>
      <Calendar size={16} className="mr-2" aria-hidden /> Add Plan
    </button>
  ) : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Report" action={headerAction} />

      <div className="flex items-end gap-3 flex-wrap toolbar">
        <div className="w-32">
          <label className="block text-xs text-muted mb-1" htmlFor="report-year">Year</label>
          <select id="report-year" className="select focus-ring w-full text-sm" value={year} onChange={(e) => setYear(e.target.value)}>
            {yearOptions.map((y) => (<option key={y} value={y}>{y}</option>))}
          </select>
        </div>
        <div className="w-56">
          <label className="block text-xs text-muted mb-1" htmlFor="report-week">Week</label>
          <select id="report-week" className="select focus-ring w-full text-sm" value={weekNumber} onChange={(e) => setWeekNumber(e.target.value)}>
            <option value="">All weeks</option>
            {weekOptions.map((w) => (<option key={w} value={w}>{formatWeekOptionLabel(Number(year), w)}</option>))}
          </select>
        </div>
        <div className="w-56">
          <label className="block text-xs text-muted mb-1" htmlFor="report-user">User</label>
          <select id="report-user" className="select focus-ring w-full text-sm" value={userId} onChange={(e) => setUserFilter(e.target.value)}>
            <option value="">All users</option>
            {users.map((u) => (<option key={u._id} value={u._id}>{u.name || u.email}</option>))}
          </select>
        </div>
      </div>

      <Tabs
        tabs={REPORT_TABS}
        value={tab}
        onChange={setTab}
      >
        {tab === 'daily' ? (
          <DailyPlanPanel
            year={year}
            weekNumber={weekNumber}
            userId={userId}
            actionsRef={dailyActions}
          />
        ) : (
          <WeeklyPlanPanel
            year={year}
            weekNumber={weekNumber}
            userId={userId}
            actionsRef={weeklyActions}
            onReportingChange={onReportingChange}
          />
        )}
      </Tabs>
    </div>
  );
}
