import { Link } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../auth/useAuth';
import { useTheme } from '../theme/ThemeProvider';
import { LogoWordmark } from './Logo';
import ThemeToggle from './ThemeToggle';

export default function Topbar() {
  const { user, logout } = useAuth();
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setImgFailed(false); }, [user?.image]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const initials = (user?.name || user?.email || 'U')
    .split('@')[0]
    .split(' ')
    .map((s: string) => s[0]?.toUpperCase())
    .slice(0, 2)
    .join('');

  return (
    <header className="shell-surface fixed top-0 left-0 right-0 z-40 h-16 border-b">
      <div className="flex h-full items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          to="/dashboard"
          className="group flex shrink-0 items-center transition-transform duration-200 hover:scale-[1.02]"
        >
          <LogoWordmark variant={theme === 'dark' ? 'dark' : 'light'} />
        </Link>

        <div className="flex items-center gap-2" ref={ref}>
          <ThemeToggle />

          <div className="relative">
            <button
              className="group flex items-center gap-3 rounded-xl p-2 transition hover:bg-zinc-200/50 dark:hover:bg-zinc-800/60"
              onClick={() => setOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={open}
            >
              <div className="relative">
                {user?.image && !imgFailed ? (
                  <img
                    src={user.image}
                    alt="Avatar"
                    width={36}
                    height={36}
                    onError={() => setImgFailed(true)}
                    className="h-9 w-9 rounded-full border-2 border-zinc-200 object-cover transition group-hover:border-zinc-300 dark:border-zinc-700 dark:group-hover:border-zinc-600"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-sm font-semibold text-white shadow-medium dark:bg-zinc-700">
                    {initials || 'U'}
                  </div>
                )}
                <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-zinc-100 bg-emerald-500 dark:border-zinc-950" />
              </div>

              <div className="hidden text-left md:block">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{user?.name || 'User'}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{user?.email}</p>
              </div>

              <svg
                className={`h-4 w-4 text-zinc-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {open && (
              <div className="panel-elevated absolute right-0 z-50 mt-2 w-64 animate-fade-in-up overflow-hidden dark:bg-zinc-900">
                <div className="border-b border-zinc-200/80 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/80">
                  <div className="flex items-center gap-3">
                    {user?.image && !imgFailed ? (
                      <img
                        src={user.image}
                        alt="Avatar"
                        width={40}
                        height={40}
                        onError={() => setImgFailed(true)}
                        className="h-10 w-10 rounded-full border-2 border-zinc-200 object-cover dark:border-zinc-700"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 text-sm font-semibold text-white dark:bg-zinc-700">
                        {initials || 'U'}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{user?.name || 'User'}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{user?.email}</p>
                    </div>
                  </div>
                </div>

                <div className="p-2">
                  <Link
                    to="/profile"
                    className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-zinc-700 transition hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    onClick={() => setOpen(false)}
                  >
                    <svg className="h-4 w-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    Account settings
                  </Link>

                  <div className="my-2 border-t border-zinc-100 dark:border-zinc-800" />

                  <button
                    onClick={() => { setOpen(false); logout(); }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
