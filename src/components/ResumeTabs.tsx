import { Link, useLocation } from 'react-router-dom';
import { FileDown, ListChecks, Settings } from 'lucide-react';

const TABS = [
  { to: '/resume', label: 'Generate', icon: FileDown, exact: true },
  { to: '/resume/generated', label: 'Generated Resumes', icon: ListChecks, exact: false },
  { to: '/preferences', label: 'Prompts', icon: Settings, exact: true },
];

export default function ResumeTabs() {
  const { pathname } = useLocation();
  return (
    <nav className="tab-nav" aria-label="Resume sections">
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
        const Icon = t.icon;
        return (
          <Link
            key={t.to}
            to={t.to}
            aria-current={active ? 'page' : undefined}
            className={`tab-nav-link ${active ? 'tab-nav-link-active' : 'tab-nav-link-inactive'}`}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
