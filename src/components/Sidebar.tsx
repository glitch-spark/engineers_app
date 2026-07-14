import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

const NavLink = ({ href, label, isCollapsed, icon, badge }: {
  href: string;
  label: string;
  isCollapsed: boolean;
  icon: React.ReactNode;
  badge?: number;
}) => {
  const { pathname } = useLocation();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      to={href}
      className={`${active ? 'nav-item-active group' : 'nav-item-inactive group'} ${isCollapsed ? 'justify-center' : ''}`}
      title={isCollapsed ? label : undefined}
    >
      <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 w-full'}`}>
        <div className={`flex-shrink-0 transition-colors duration-200 ${
          active ? 'nav-item-icon-active' : 'nav-item-icon-inactive'
        }`}>
          {icon}
        </div>
        {!isCollapsed && <span className="flex-1 text-sm">{label}</span>}
        {!isCollapsed && badge ? (
          <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-sky-500 px-2 py-0.5 text-xs font-medium text-white">
            {badge}
          </span>
        ) : null}
      </div>
      {active && !isCollapsed && (
        <div className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r-full bg-sky-500 dark:bg-sky-400" />
      )}
    </Link>
  );
};

export default function Sidebar({
  isCollapsed,
  onToggle,
}: {
  isCollapsed: boolean;
  onToggle?: () => void;
}) {
  const { user } = useAuth();
  const role = user?.role;

  return (
    <aside
      className={`shell-surface fixed bottom-0 left-0 top-16 z-30 overflow-y-auto border-r transition-all duration-300 ${
        isCollapsed ? 'w-[4.75rem]' : 'w-64'
      }`}
    >
      {onToggle && (
        <div className={`flex px-3 pt-3 pb-1 ${isCollapsed ? 'justify-center' : 'justify-end'}`}>
          <button
            type="button"
            onClick={onToggle}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="shell-icon-btn"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isCollapsed ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7M19 19l-7-7 7-7" />
              )}
            </svg>
          </button>
        </div>
      )}

      <nav className="space-y-1 p-3 pt-1">
        <NavLink
          href="/dashboard"
          label="Dashboard"
          isCollapsed={isCollapsed}
          icon={
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 5a2 2 0 012-2h4a2 2 0 012 2v6H8V5z" />
            </svg>
          }
        />
        <NavLink
          href="/leaderboard"
          label="Leaderboard"
          isCollapsed={isCollapsed}
          icon={
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          }
        />
        <NavLink
          href="/accounts"
          label="Profiles"
          isCollapsed={isCollapsed}
          icon={
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          }
        />
        <NavLink
          href="/transactions"
          label="Transactions"
          isCollapsed={isCollapsed}
          icon={
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          }
        />
        <NavLink
          href="/weekly-plan"
          label="Weekly Plan"
          isCollapsed={isCollapsed}
          icon={
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          }
        />
        <NavLink
          href="/interviews"
          label="Interviews"
          isCollapsed={isCollapsed}
          icon={
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 4v-4z" />
            </svg>
          }
        />
        <NavLink
          href="/resume"
          label="Resume Generator"
          isCollapsed={isCollapsed}
          icon={
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
        />

        {role === 'admin' && (
          <div className="mt-4 border-t border-zinc-200/80 pt-4 dark:border-zinc-800">
            {!isCollapsed && (
              <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-500">
                Admin
              </p>
            )}
            <NavLink
              href="/users"
              label="Users"
              isCollapsed={isCollapsed}
              icon={
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                </svg>
              }
            />
          </div>
        )}
      </nav>
    </aside>
  );
}
