import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';

const STAFF_ALLOWED = [
  '/dashboard',
  '/leaderboard',
  '/accounts',
  '/transactions',
  '/profile',
  '/weekly-plan',
  '/pipeline',
  '/interviews',
  '/resume',
  '/preferences',
];

export function RoleGuard({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { pathname } = useLocation();

  if (!user) return null; // <AuthGuard /> handles the redirect

  if (user.role === 'accountant') {
    if (pathname !== '/accountants') return <Navigate to="/accountants" replace />;
  } else if (user.role === 'staff') {
    const allowed = STAFF_ALLOWED.some((p) => pathname === p || pathname.startsWith(p + '/'));
    if (!allowed) return <Navigate to="/dashboard" replace />;
  }
  // admin: no path restriction

  return <>{children}</>;
}
