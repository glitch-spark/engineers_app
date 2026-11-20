import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Tabs from '../components/Tabs';
import AiUsageCard from '../components/statistics/AiUsageCard';
import FramedTab from '../components/stats/FramedTab';
import ConversionTab from '../components/stats/ConversionTab';
import InterviewStatsTab from '../components/stats/InterviewStatsTab';
import ResumeCompareTab from '../components/statistics/ResumeCompareTab';

const TAB_KEYS = ['conversion', 'interviews', 'resume-compare', 'ai-usage'];
/** The old Bids tab became Conversion: old links open it. */
const OLD_TABS: Record<string, string> = { bids: 'conversion' };

/** Statistics: how bids turn into interviews (Conversion, with the you-vs-team bids strip), what happens to the
 * interviews after that (Interviews), resumes compared side by side, and AI usage. Every tab has the one sticky filter bar, and
 * its values (region, range, from, to, q, users, features, models) live in the URL, so switching tabs keeps them; AI
 * usage adds Today and Yesterday (down to the hour). */
export default function Statistics() {
  const [params, setParams] = useSearchParams();
  const tabParam = OLD_TABS[params.get('tab') ?? ''] ?? params.get('tab') ?? '';
  const [tab, setTabState] = useState(TAB_KEYS.includes(tabParam) ? tabParam : 'conversion');
  const setTab = (key: string) => {
    setTabState(key);
    const next = new URLSearchParams(params);
    next.set('tab', key);
    setParams(next, { replace: true });
  };
  const tabs = [
    { key: 'conversion', label: 'Bids → Interviews' },
    { key: 'interviews', label: 'Interviews' },
    { key: 'resume-compare', label: 'Resume compare' },
    { key: 'ai-usage', label: 'AI usage' },
  ];
  return (
    <div className="space-y-4">
      <PageHeader title="Statistics" />
      <Tabs tabs={tabs} value={tab} onChange={setTab} ariaLabel="Statistics">
        {tab === 'conversion' ? <ConversionTab />
          : tab === 'interviews' ? <InterviewStatsTab />
          : tab === 'resume-compare' ? <ResumeCompareTab />
            : <><FramedTab /><AiUsageCard embedded /></>}
      </Tabs>
    </div>
  );
}
