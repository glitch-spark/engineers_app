import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Tabs from '../components/Tabs';
import AiUsageCard from '../components/statistics/AiUsageCard';
import CallersTab from '../components/statistics/CallersTab';
import BidsTab from '../components/statistics/BidsTab';
import EarningsTab from '../components/statistics/EarningsTab';
import InterviewsTab from '../components/statistics/InterviewsTab';
import ProfilesTab from '../components/statistics/ProfilesTab';
import ResumeCompareTab from '../components/statistics/ResumeCompareTab';

const TAB_KEYS = ['bids', 'interviews', 'profiles', 'earnings', 'callers', 'resume-compare', 'ai-usage'];

/** Statistics: everyone's bids (self and bidder), interviews (self and caller) and how bids turn into interviews,
 * resumes compared side by side, each caller's pass rate, and AI usage. Every tab has the one sticky filter bar, and
 * its values (region, range, from, to, q, users, features, models) live in the URL, so switching tabs keeps them; AI
 * usage adds Today and Yesterday (down to the hour). */
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
  const tabs = [
    { key: 'bids', label: 'Bids' },
    { key: 'interviews', label: 'Interviews' },
    { key: 'profiles', label: 'Profiles' },
    { key: 'callers', label: 'Callers' },
    { key: 'resume-compare', label: 'Resume compare' },
    { key: 'earnings', label: 'Earnings' },
    { key: 'ai-usage', label: 'AI usage' },
  ];
  return (
    <div className="space-y-4">
      <PageHeader title="Statistics" />
      <Tabs tabs={tabs} value={tab} onChange={setTab} ariaLabel="Statistics">
        {tab === 'bids' ? <BidsTab />
          : tab === 'interviews' ? <InterviewsTab />
          : tab === 'profiles' ? <ProfilesTab />
          : tab === 'earnings' ? <EarningsTab />
          : tab === 'resume-compare' ? <ResumeCompareTab />
            : tab === 'callers' ? <CallersTab initialCaller={callerParam} />
              : <AiUsageCard />}
      </Tabs>
    </div>
  );
}
