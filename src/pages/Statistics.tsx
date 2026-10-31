import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import Tabs from '../components/Tabs';
import CallersTab from '../components/statistics/CallersTab';
import InterviewRateTab from '../components/statistics/InterviewRateTab';
import ResumeCompareTab from '../components/statistics/ResumeCompareTab';
import { initialFilters } from '../components/statistics/controls';
import { useCallers } from '../lib/useCallers';

/** Statistics: AI usage, how everyone's bids turn into interviews, compared side by side, and each caller's pass
 * rate. The region and period filters are shared by the tabs, so switching tabs keeps them. */
export default function Statistics() {
  const [tab, setTab] = useState('interview-rate');
  const [filters, setFilters] = useState(initialFilters);
  const { canManage } = useCallers();
  const tabs = [
    { key: 'interview-rate', label: 'Interview rate' },
    { key: 'resume-compare', label: 'Resume compare' },
    { key: 'callers', label: 'Callers' },
  ];
  return (
    <div className="space-y-4">
      <PageHeader title="Statistics" />
      <Tabs tabs={tabs} value={tab} onChange={setTab} ariaLabel="Statistics">
        {tab === 'interview-rate' ? <InterviewRateTab filters={filters} onFilters={setFilters} />
          : tab === 'resume-compare' ? <ResumeCompareTab filters={filters} onFilters={setFilters} />
            : <CallersTab filters={filters} onFilters={setFilters} canManage={canManage} />}
      </Tabs>
    </div>
  );
}
