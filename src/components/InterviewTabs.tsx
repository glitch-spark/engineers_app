import { Link, useLocation } from 'react-router-dom';
import { ListChecks, BarChart3 } from 'lucide-react';

const TABS = [
  { to: '/interviews', label: 'List', icon: ListChecks, exact: true },
  { to: '/interviews/analyze', label: 'Analyze', icon: BarChart3, exact: false },
];

export default function InterviewTabs() {
  const { pathname } = useLocation();
  return (
    <nav className="flex items-center gap-1 border-b border-gray-200 mb-5">
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
        const Icon = t.icon;
        return (
          <Link
            key={t.to}
            to={t.to}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <Icon className="w-4 h-4" />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
