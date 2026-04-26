import AuthGuard from '@/components/AuthGuard';
import RoleGuard from '@/components/RoleGuard';
import AppShell from '@/components/AppShell';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <RoleGuard>
        <AppShell>{children}</AppShell>
      </RoleGuard>
    </AuthGuard>
  );
}
