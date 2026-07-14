import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import Topbar from './Topbar';
import Sidebar from './Sidebar';

const SIDEBAR_KEY = 'sidebar-collapsed';

export default function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === '1';
    } catch {
      return false;
    }
  });
  const isAuth = pathname.startsWith('/login') || pathname.startsWith('/register');

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, isSidebarCollapsed ? '1' : '0');
    } catch {
      /* localStorage unavailable — silently skip; collapse won't persist. */
    }
  }, [isSidebarCollapsed]);

  if (isAuth) return <>{children}</>;
  return (
    <div className="shell-content flex min-h-screen flex-col transition-all duration-300">
      <Topbar />
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed((v) => !v)}
      />
      <div className={`flex-1 pt-16 transition-all duration-300 ${
        isSidebarCollapsed ? 'pl-[4.75rem]' : 'pl-64'
      }`}>
        <div className="mx-auto max-w-7xl px-6 pb-12 pt-2">
          <div className="page-stack animate-fade-in-up">{children}</div>
        </div>
      </div>
    </div>
  );
}
