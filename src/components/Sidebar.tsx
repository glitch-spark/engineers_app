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
  const active = pathname === href;
  return (
    <Link
      to={href}
      className={`group relative flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
        active
          ? 'bg-primary/10 text-primary font-medium shadow-sm'
          : 'text-gray-700 hover:bg-gray-50 hover:text-primary'
      } ${isCollapsed ? 'justify-center' : ''}`}
      title={isCollapsed ? label : undefined}
    >
      <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'space-x-3'}`}>
        <div className={`flex-shrink-0 transition-colors duration-200 ${
          active ? 'text-primary' : 'text-gray-500 group-hover:text-primary'
        }`}>
          {icon}
        </div>
        {!isCollapsed && (
          <span className="flex-1">{label}</span>
        )}
        {!isCollapsed && badge && (
          <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-medium bg-primary text-white rounded-full min-w-[20px]">
            {badge}
          </span>
        )}
      </div>

      {active && !isCollapsed && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-full"></div>
      )}
    </Link>
  );
};

export default function Sidebar({ isCollapsed }: { isCollapsed: boolean }) {
  const { user } = useAuth();
  const role = user?.role;

  return (
    <aside className={`fixed top-16 left-0 bottom-0 border-r border-gray-100 bg-white/80 backdrop-blur-md z-30 overflow-y-auto transition-all duration-300 ${
      isCollapsed ? 'w-20' : 'w-64'
    }`}>
      <nav className="p-4 space-y-2">
        <div className="mb-4">
          <NavLink
            href="/dashboard"
            label="Dashboard"
            isCollapsed={isCollapsed}
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5a2 2 0 012-2h4a2 2 0 012 2v6H8V5z" />
              </svg>
            }
          />

          <NavLink
            href="/accounts"
            label="Profiles"
            isCollapsed={isCollapsed}
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            }
          />

          <NavLink
            href="/transactions"
            label="Transactions"
            isCollapsed={isCollapsed}
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            }
          />

          <NavLink
            href="/cardlink"
            label="Subscription"
            isCollapsed={isCollapsed}
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 7a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V7zm0 3h20" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16h.01M11 16h.01" />
              </svg>
            }
          />

          <NavLink
            href="/weekly-plan"
            label="Weekly Plan"
            isCollapsed={isCollapsed}
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            }
          />

          <NavLink
            href="/interviews"
            label="Interviews"
            isCollapsed={isCollapsed}
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 4v-4z" />
              </svg>
            }
          />

          <NavLink
            href="/resume"
            label="Resume Generator"
            isCollapsed={isCollapsed}
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
          />

        </div>

        {role === 'admin' && (
          <div className="mb-4">
            {!isCollapsed && (
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-2">
                Administration
              </h3>
            )}

            <NavLink
              href="/users"
              label="Users"
              isCollapsed={isCollapsed}
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                </svg>
              }
            />
          </div>
        )}
      </nav>
    </aside>
  );
}
