import { Link, useLocation } from 'react-router-dom';
import { CalendarClock, ListChecks, Users } from 'lucide-react';

const TABS = [
  { to: '/interviews', label: 'Interviews', icon: ListChecks, match: (p: string) => p === '/interviews' || p === '/interviews/calendar' },
  { to: '/interviews/callers', label: 'Caller schedule', icon: CalendarClock, match: (p: string) => p === '/interviews/callers' || p === '/interviews/callers/calendar' },
  { to: '/interviews/callers/list', label: 'Callers', icon: Users, match: (p: string) => p === '/interviews/callers/list' },
];

export default function InterviewTabs() {
  const { pathname } = useLocation();
  return (
    <nav className="tab-nav" aria-label="Interview sections">
      {TABS.map((t) => {
        const active = t.match(pathname);
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
