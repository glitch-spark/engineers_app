import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import Tabs from '../components/Tabs';
import AiUsageCard from '../components/statistics/AiUsageCard';
import CallersTab from '../components/statistics/CallersTab';
import InterviewRateTab from '../components/statistics/InterviewRateTab';
import ResumeCompareTab from '../components/statistics/ResumeCompareTab';
import { initialFilters } from '../components/statistics/controls';
import { useCallers } from '../lib/useCallers';

/** Statistics: how everyone's bids turn into interviews, compared side by side, each caller's pass rate, and AI
 * usage. The region and period filters are shared by the first three tabs, so switching tabs keeps them; AI usage
 * has its own period, down to the hour. */
export default function Statistics() {
  const [tab, setTab] = useState('interview-rate');
  const [filters, setFilters] = useState(initialFilters);
  const { canManage } = useCallers();
  const tabs = [
    { key: 'interview-rate', label: 'Interview rate' },
    { key: 'resume-compare', label: 'Resume compare' },
    { key: 'callers', label: 'Callers' },
    { key: 'ai-usage', label: 'AI usage' },
  ];
  return (
    <div className="space-y-4">
      <PageHeader title="Statistics" />
      <Tabs tabs={tabs} value={tab} onChange={setTab} ariaLabel="Statistics">
        {tab === 'interview-rate' ? <InterviewRateTab filters={filters} onFilters={setFilters} />
          : tab === 'resume-compare' ? <ResumeCompareTab filters={filters} onFilters={setFilters} />
            : tab === 'callers' ? <CallersTab filters={filters} onFilters={setFilters} canManage={canManage} />
              : <AiUsageCard />}
      </Tabs>
    </div>
  );
}
