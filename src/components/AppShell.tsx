import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import Topbar from './Topbar';
import Sidebar from './Sidebar';

const SIDEBAR_KEY = 'sidebar-collapsed';
const NARROW_QUERY = '(max-width: 767px)';

function useIsNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

export default function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === '1';
    } catch {
      return false;
    }
  });
  // Below md the full-width sidebar would squeeze the page, so pin the icon rail.
  const isNarrow = useIsNarrow();
  const collapsed = isNarrow || isSidebarCollapsed;
  const isAuth = pathname.startsWith('/login') || pathname.startsWith('/register');
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);

  // SPA navigation doesn't move focus, so screen-reader and keyboard users stay on the old
  // sidebar link. Put them at the top of the new page instead.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, isSidebarCollapsed ? '1' : '0');
    } catch {
      /* localStorage unavailable — silently skip; collapse won't persist. */
    }
  }, [isSidebarCollapsed]);

  if (isAuth) return <>{children}</>;
  const useWideLayout =
    pathname === '/interviews'
    || pathname === '/interviews/calendar'
    || pathname === '/interviews/analyze';
  return (
    <div className="shell-content flex min-h-screen flex-col transition-all duration-300">
      <a href="#main" className="skip-link">Skip to main content</a>
      <Topbar />
      <Sidebar
        isCollapsed={collapsed}
        onToggle={isNarrow ? undefined : () => setIsSidebarCollapsed((v) => !v)}
      />
      <div className={`flex-1 pt-16 transition-all duration-300 ${
        collapsed ? 'pl-[4.75rem]' : 'pl-64'
      }`}>
        <main
          id="main"
          ref={mainRef}
          tabIndex={-1}
          className={
            useWideLayout
              ? 'w-[94%] max-w-[1920px] mx-auto px-4 sm:px-6 pt-6 pb-12 focus:outline-none'
              : 'max-w-7xl mx-auto p-4 sm:p-6 pb-12 focus:outline-none'
          }
        >
          <div className="animate-fade-in-up">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
