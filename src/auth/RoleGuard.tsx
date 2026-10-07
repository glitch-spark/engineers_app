import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';

// Staff and interview managers share these routes; admins have no path restriction.
const STAFF_ALLOWED = [
  '/dashboard',
  '/leaderboard',
  '/accounts',
  '/transactions',
  '/profile',
  '/report',
  '/weekly-plan',
  '/pipeline',
  '/integrations',
  '/interviews',
  '/interview',
  '/resume',
  '/job-applies',
  '/bidders',
  '/bids',
  '/interview-prep',
  '/preferences',
];

export function RoleGuard({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { pathname } = useLocation();

  if (!user) return null; // <AuthGuard /> handles the redirect

  if (user.role !== 'admin') {
    const allowed = STAFF_ALLOWED.some((p) => pathname === p || pathname.startsWith(p + '/'));
    if (!allowed) return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
