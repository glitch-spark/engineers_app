import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import Tabs from '../components/Tabs';
import InterviewRateTab from '../components/statistics/InterviewRateTab';
import ResumeCompareTab from '../components/statistics/ResumeCompareTab';

const TABS = [
  { key: 'interview-rate', label: 'Interview rate' },
  { key: 'resume-compare', label: 'Resume compare' },
];

/** Statistics: how everyone's bids turn into interviews, compared side by side. */
export default function Statistics() {
  const [tab, setTab] = useState('interview-rate');
  return (
    <div className="space-y-4">
      <PageHeader title="Statistics" />
      <Tabs tabs={TABS} value={tab} onChange={setTab} ariaLabel="Statistics">
        {tab === 'interview-rate' ? <InterviewRateTab /> : <ResumeCompareTab />}
      </Tabs>
    </div>
  );
}
