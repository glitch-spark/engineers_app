import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Tabs from '../components/Tabs';
import AiUsageCard from '../components/statistics/AiUsageCard';
import CallersTab from '../components/statistics/CallersTab';
import BidsTab from '../components/statistics/BidsTab';
import InterviewsTab from '../components/statistics/InterviewsTab';
import ResumeCompareTab from '../components/statistics/ResumeCompareTab';
import { initialFilters } from '../components/statistics/controls';

const TAB_KEYS = ['bids', 'interviews', 'callers', 'resume-compare', 'ai-usage'];

/** Statistics: everyone's bids (self and bidder), interviews (self and caller) and how bids turn into interviews,
 * resumes compared side by side, each caller's pass rate, and AI usage. The region and period filters are shared by
 * the first four tabs, so switching tabs keeps them; AI usage has its own period, down to the hour. */
export default function Statistics() {
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab') ?? '';
  const [tab, setTabState] = useState(TAB_KEYS.includes(tabParam) ? tabParam : 'bids');
  // `?caller=` opens the Callers tab on that caller (the Callers directory links here).
  const [callerParam] = useState(params.get('caller') ?? '');
  const setTab = (key: string) => {
    setTabState(key);
    const next = new URLSearchParams(params);
    next.set('tab', key);
    if (key !== 'callers') next.delete('caller');
    setParams(next, { replace: true });
  };
  const [filters, setFilters] = useState(initialFilters);
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
            : tab === 'callers' ? <CallersTab filters={filters} onFilters={setFilters} initialCaller={callerParam} />
              : <AiUsageCard />}
      </Tabs>
    </div>
  );
}
