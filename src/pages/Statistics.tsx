import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import Tabs from '../components/Tabs';
import AiUsageCard from '../components/statistics/AiUsageCard';
import CallersTab from '../components/statistics/CallersTab';
import BidsTab from '../components/statistics/BidsTab';
import InterviewsTab from '../components/statistics/InterviewsTab';
import ResumeCompareTab from '../components/statistics/ResumeCompareTab';
import { initialFilters } from '../components/statistics/controls';
import { useCallers } from '../lib/useCallers';

/** Statistics: everyone's bids (self and bidder), interviews (self and caller) and how bids turn into interviews,
 * resumes compared side by side, each caller's pass rate, and AI usage. The region and period filters are shared by
 * the first four tabs, so switching tabs keeps them; AI usage has its own period, down to the hour. */
export default function Statistics() {
  const [tab, setTab] = useState('bids');
  const [filters, setFilters] = useState(initialFilters);
  const { canManage } = useCallers();
  const tabs = [
    { key: 'bids', label: 'Bids' },
    { key: 'interviews', label: 'Interviews' },
    { key: 'callers', label: 'Callers' },
    { key: 'resume-compare', label: 'Resume compare' },
    { key: 'ai-usage', label: 'AI usage' },
  ];
  return (
    <div className="space-y-4">
      <PageHeader title="Statistics" />
      <Tabs tabs={tabs} value={tab} onChange={setTab} ariaLabel="Statistics">
        {tab === 'bids' ? <BidsTab filters={filters} onFilters={setFilters} />
          : tab === 'interviews' ? <InterviewsTab filters={filters} onFilters={setFilters} />
          : tab === 'resume-compare' ? <ResumeCompareTab filters={filters} onFilters={setFilters} />
            : tab === 'callers' ? <CallersTab filters={filters} onFilters={setFilters} canManage={canManage} />
              : <AiUsageCard />}
      </Tabs>
    </div>
  );
}
