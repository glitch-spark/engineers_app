import { Link, useLocation } from 'react-router-dom';
import {
  CalendarCheck2,
  ChartColumn,
  ChevronsLeft,
  ChevronsRight,
  FilePenLine,
  FlaskConical,
  House,
  IdCard,
  MessagesSquare,
  Receipt,
  Send,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../auth/useAuth';

// Tailor resume owns /resume, /resume/generated and /preferences; Prompt tests owns /resume/eval*.
function isTailorSection(pathname: string) {
  return (
    pathname === '/resume' ||
    pathname.startsWith('/resume/generated') ||
    pathname === '/preferences' ||
    pathname.startsWith('/preferences/')
  );
}

function isPromptTestsActive(pathname: string) {
  return pathname === '/resume/eval' || pathname.startsWith('/resume/eval/');
}

type Item = {
  href: string;
  label: string;
  icon: LucideIcon;
  isActive?: (pathname: string) => boolean;
};

type Section = { label?: string; items: Item[]; adminOnly?: boolean };

/**
 * The menu, in the order the work happens: plan the day, set things up, get applications out, then follow what
 * comes back. Routes are fixed (bookmarks and Slack links point at them); only labels, icons and grouping live here.
 */
const SECTIONS: Section[] = [
  {
    items: [
      { href: '/dashboard', label: 'Home', icon: House },
      { href: '/plans', label: 'Daily plan', icon: CalendarCheck2 },
    ],
  },
  {
    label: 'Set up',
    items: [
      { href: '/accounts', label: 'Profiles', icon: IdCard },
      { href: '/resume/eval', label: 'Prompt tests', icon: FlaskConical, isActive: isPromptTestsActive },
    ],
  },
  {
    label: 'Apply',
    items: [
      { href: '/bidders', label: 'Bids', icon: Users },
      { href: '/job-applies', label: 'Auto apply', icon: Send },
      { href: '/resume', label: 'Tailor resume', icon: FilePenLine, isActive: isTailorSection },
    ],
  },
  {
    // Standalone pages: no heading, a thin line keeps them apart from Apply.
    items: [
      { href: '/interviews', label: 'Interviews', icon: MessagesSquare },
      { href: '/statistics', label: 'Statistics', icon: ChartColumn },
      { href: '/transactions', label: 'Transactions', icon: Receipt },
    ],
  },
  {
    label: 'Admin',
    adminOnly: true,
    items: [{ href: '/users', label: 'Users', icon: UserCog }],
  },
];

function NavLink({ item, isCollapsed }: { item: Item; isCollapsed: boolean }) {
  const { pathname } = useLocation();
  const active = item.isActive
    ? item.isActive(pathname)
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;
  return (
    <Link
      to={item.href}
      className={`nav-item ${active ? 'nav-item-active' : 'nav-item-inactive'} ${isCollapsed ? 'justify-center px-0' : ''}`}
      title={isCollapsed ? item.label : undefined}
      aria-current={active ? 'page' : undefined}
    >
      <Icon aria-hidden size={18} strokeWidth={1.75} className="shrink-0" />
      <span className={isCollapsed ? 'sr-only' : 'truncate'}>{item.label}</span>
    </Link>
  );
}

// A block of the menu: a heading when it has a label, else a thin line. Collapsed, every heading becomes a line.
function NavSection({ section, isCollapsed, first }: { section: Section; isCollapsed: boolean; first: boolean }) {
  const labelled = !!section.label;
  const line = !first && (isCollapsed || !labelled);
  return (
    <div role={labelled ? 'group' : undefined} aria-label={section.label} className={first ? '' : 'pt-4'}>
      {labelled && !isCollapsed && <p className="nav-heading">{section.label}</p>}
      {line && <div aria-hidden="true" className="mx-3 mb-3 border-t border-zinc-200 dark:border-zinc-800" />}
      <div className="space-y-0.5">
        {section.items.map((item) => (
          <NavLink key={item.href} item={item} isCollapsed={isCollapsed} />
        ))}
      </div>
    </div>
  );
}

export default function Sidebar({
  isCollapsed,
  onToggle,
}: {
  isCollapsed: boolean;
  onToggle?: () => void;
}) {
  const { user } = useAuth();
  const sections = SECTIONS.filter((s) => !s.adminOnly || user?.role === 'admin');

  return (
    <aside
      className={`shell-surface fixed bottom-0 left-0 top-16 z-30 flex flex-col border-r transition-all duration-300 ${
        isCollapsed ? 'w-[4.75rem]' : 'w-64'
      }`}
    >
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4">
        {sections.map((section, i) => (
          <NavSection key={section.label ?? `block-${i}`} section={section} isCollapsed={isCollapsed} first={i === 0} />
        ))}
      </nav>

      {onToggle && (
        <div className={`flex shrink-0 border-t border-zinc-200/80 px-3 py-2 dark:border-zinc-800 ${isCollapsed ? 'justify-center' : 'justify-end'}`}>
          <button
            type="button"
            onClick={onToggle}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="shell-icon-btn h-9 w-9"
          >
            {isCollapsed ? <ChevronsRight aria-hidden size={16} /> : <ChevronsLeft aria-hidden size={16} />}
          </button>
        </div>
      )}
    </aside>
  );
}
