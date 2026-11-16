import { Link, useLocation } from 'react-router-dom';
import { CalendarClock, ListChecks, Users } from 'lucide-react';
import { viewSwitchQuery } from '../lib/interviewFilters';

/** `carry`: the filters (date range, stage, status, search, ...) follow you to this tab. The Callers directory has its own list and takes none. */
const TABS = [
  { to: '/interviews', label: 'Interviews', icon: ListChecks, carry: true, match: (p: string) => p === '/interviews' || p === '/interviews/calendar' },
  { to: '/interviews/callers', label: 'Caller schedule', icon: CalendarClock, carry: true, match: (p: string) => p === '/interviews/callers' || p === '/interviews/callers/calendar' },
  { to: '/interviews/callers/list', label: 'Callers', icon: Users, carry: false, match: (p: string) => p === '/interviews/callers/list' },
];

export default function InterviewTabs() {
  const { pathname, search } = useLocation();
  // Between Interviews and Caller schedule the query string (never the page or one-off links) goes along.
  // The Callers directory page has no filters of its own to carry back.
  const fromCallers = pathname === '/interviews/callers/list';
  const carried = fromCallers ? '' : viewSwitchQuery(new URLSearchParams(search));
  return (
    <nav className="tab-nav" aria-label="Interview sections">
      {TABS.map((t) => {
        const active = t.match(pathname);
        const Icon = t.icon;
        return (
          <Link
            key={t.to}
            to={`${t.to}${t.carry ? carried : ''}`}
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
