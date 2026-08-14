import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import InterviewPrepLibrary from '../components/InterviewPrepLibrary';
import InterviewPrepTabs, { type InterviewPrepTab } from '../components/InterviewPrepTabs';

export default function InterviewPrepPage() {
  const [tab, setTab] = useState<InterviewPrepTab>('prompts');

  return (
    <div className="space-y-6">
      <PageHeader title="Interview Prep Library" />
      <p className="page-subtitle -mt-4">
        Shared interview prompts and template answers. Browse any teammate&apos;s library — everyone can read each other&apos;s entries.
      </p>
      <InterviewPrepTabs tab={tab} onChange={setTab} />
      <InterviewPrepLibrary tab={tab} embedded />
    </div>
  );
}
