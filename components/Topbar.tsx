'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';

export default function Topbar() {
  const { data } = useSession();
  const user = data?.user;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

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
    <header className="fixed top-0 left-0 right-0 h-16 z-40 bg-white/80 backdrop-blur-md border-b border-gray-100 shadow-soft">
      <div className="mx-auto h-full px-6 flex items-center justify-between">
        {/* Logo Section */}
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-3 group">
            <div className="relative">
              <Image 
                src="/logo-engineers.svg" 
                alt="Engineers" 
                width={160} 
                height={40} 
                priority 
                className="transition-transform duration-200 group-hover:scale-105"
              />
            </div>
            <div className="hidden md:block">
              <div className="h-6 w-px bg-gray-200"></div>
            </div>
            <div className="hidden md:block">
              <span className="text-sm font-medium text-gray-500">Financial Management</span>
            </div>
          </Link>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-4" ref={ref}>
          {/* Notifications */}
          {/* <button className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all duration-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5v-5zM4.5 19.5a2 2 0 01-2-2V7a2 2 0 012-2h12a2 2 0 012 2v10.5a2 2 0 01-2 2h-12z" />
            </svg>
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          </button> */}

          {/* User Menu */}
          <div className="relative">
            <button
              className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-100 transition-all duration-200 group"
              onClick={() => setOpen(v => !v)}
              aria-haspopup="menu"
              aria-expanded={open}
            >
              <div className="relative">
                {user?.image ? (
                  <Image 
                    src={user.image} 
                    alt="Avatar" 
                    width={36} 
                    height={36} 
                    className="rounded-full border-2 border-gray-200 group-hover:border-primary transition-colors duration-200" 
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center text-white font-semibold text-sm shadow-medium">
                    {initials || 'U'}
                  </div>
                )}
                <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-success-500 border-2 border-white rounded-full"></div>
              </div>
              
              <div className="hidden md:block text-left">
                <p className="text-sm font-medium text-gray-900">{user?.name || 'User'}</p>
                <p className="text-xs text-gray-500">{user?.email}</p>
              </div>
              
              <svg 
                className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {open && (
              <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-gray-100 bg-white shadow-strong overflow-hidden animate-fade-in-up z-50">
                {/* User Info Header */}
                <div className="p-4 border-b border-gray-100 bg-gray-50">
                  <div className="flex items-center gap-3">
                    {user?.image ? (
                      <Image 
                        src={user.image} 
                        alt="Avatar" 
                        width={40} 
                        height={40} 
                        className="rounded-full border-2 border-gray-200" 
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center text-white font-semibold">
                        {initials || 'U'}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{user?.name || 'User'}</p>
                      <p className="text-xs text-gray-500">{user?.email}</p>
                    </div>
                  </div>
                </div>
                
                {/* Menu Items */}
                <div className="p-2">
                  <Link
                    href="/profile"
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 text-sm text-gray-700 transition-colors duration-200"
                    onClick={() => setOpen(false)}
                  >
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    Profile Settings
                  </Link>
                  
                  <Link
                    href="/dashboard"
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 text-sm text-gray-700 transition-colors duration-200"
                    onClick={() => setOpen(false)}
                  >
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
                    </svg>
                    Dashboard
                  </Link>
                  
                  <div className="border-t border-gray-100 my-2"></div>
                  
                  <button
                    onClick={() => { setOpen(false); signOut(); }}
                    className="flex items-center gap-3 w-full px-3 py-2 rounded-lg hover:bg-red-50 text-sm text-red-600 transition-colors duration-200"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Sign Out
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
