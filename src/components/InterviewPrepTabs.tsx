import { useRef, type KeyboardEvent } from 'react';
import { FileText, MessageSquareText } from 'lucide-react';

export type InterviewPrepTab = 'prompts' | 'templates';

/** Shared with InterviewPrepLibrary, which renders the matching tabpanel. */
export const INTERVIEW_PREP_PANEL_ID = 'interview-prep-tabpanel';
export const interviewPrepTabId = (tab: InterviewPrepTab) => `interview-prep-tab-${tab}`;

const TABS: { key: InterviewPrepTab; label: string; icon: typeof MessageSquareText }[] = [
  { key: 'prompts', label: 'Prompt', icon: MessageSquareText },
  { key: 'templates', label: 'Template Answers', icon: FileText },
];

export default function InterviewPrepTabs({
  tab,
  onChange,
}: {
  tab: InterviewPrepTab;
  onChange: (tab: InterviewPrepTab) => void;
}) {
  const tabRefs = useRef<Partial<Record<InterviewPrepTab, HTMLButtonElement | null>>>({});

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    let next = -1;
    if (e.key === 'ArrowRight') next = (idx + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const key = TABS[next].key;
    onChange(key);
    tabRefs.current[key]?.focus();
  };

  return (
    <div className="tab-nav" role="tablist" aria-label="Interview prep sections">
      {TABS.map((t, i) => {
        const active = tab === t.key;
        const Icon = t.icon;
        return (
          <button
            key={t.key}
            ref={(el) => { tabRefs.current[t.key] = el; }}
            type="button"
            role="tab"
            id={interviewPrepTabId(t.key)}
            aria-selected={active}
            aria-controls={INTERVIEW_PREP_PANEL_ID}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.key)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`tab-nav-link ${active ? 'tab-nav-link-active' : 'tab-nav-link-inactive'}`}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
