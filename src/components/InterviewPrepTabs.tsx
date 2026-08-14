import { FileText, MessageSquareText } from 'lucide-react';

export type InterviewPrepTab = 'prompts' | 'templates';

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
  return (
    <nav className="tab-nav" aria-label="Interview prep sections">
      {TABS.map((t) => {
        const active = tab === t.key;
        const Icon = t.icon;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            className={`tab-nav-link ${active ? 'tab-nav-link-active' : 'tab-nav-link-inactive'}`}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
