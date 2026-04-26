'use client';
import { useSession } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function RoleGuard({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;

    // AuthGuard handles authentication, so session should always exist here
    if (!session) return;

    const userRole = (session.user as any)?.role;
    
    // Accountant users can only access the accountants page
    if (userRole === 'accountant') {
      if (pathname !== '/accountants') {
        router.push('/accountants');
        return;
      }
    }
    
    // Admin users can access all pages
    if (userRole === 'admin') {
      return; // Allow access to all pages
    }
    
    // Staff users can access dashboard, accounts, transactions, profile, weekly-plan
    if (userRole === 'staff') {
      const allowedPaths = ['/dashboard', '/accounts', '/transactions', '/profile', '/cardlink', '/weekly-plan'];
      if (!allowedPaths.includes(pathname)) {
        router.push('/dashboard');
        return;
      }
    }
  }, [session, status, pathname, router]);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-14 w-14 border-b-4 border-primary mx-auto mb-4"></div>
          <p className="mt-2 text-primary-dark text-lg font-semibold">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return null; // Will redirect to login
  }

  return <>{children}</>;
}
