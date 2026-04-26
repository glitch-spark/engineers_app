'use client';
import { SessionProvider, useSession } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

function AuthCheck({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;

    // If user is not authenticated and trying to access protected routes
    if (!session && !pathname?.startsWith('/login') && !pathname?.startsWith('/register')) {
      router.push('/login');
      return;
    }

    // If user is authenticated and trying to access auth routes, redirect to dashboard
    if (session && (pathname?.startsWith('/login') || pathname?.startsWith('/register'))) {
      router.push('/dashboard');
      return;
    }
  }, [session, status, pathname, router]);

  // Show loading while checking authentication
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

  return <>{children}</>;
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AuthCheck>{children}</AuthCheck>
    </SessionProvider>
  );
}
