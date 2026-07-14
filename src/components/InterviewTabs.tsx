import { Link, useLocation } from 'react-router-dom';
import { ListChecks, BarChart3 } from 'lucide-react';

const TABS = [
  { to: '/interviews', label: 'List', icon: ListChecks, exact: true },
  { to: '/interviews/analyze', label: 'Analyze', icon: BarChart3, exact: false },
];

export default function InterviewTabs() {
  const { pathname } = useLocation();
  return (
    <nav className="tab-nav" aria-label="Interview sections">
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
