import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import PublicPageLayout from '../components/auth/PublicPageLayout';
import LoadingSpinner from '../components/LoadingSpinner';

export default function Home() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!ready) return;
    if (user) navigate('/dashboard', { replace: true });
  }, [user, ready, navigate]);

  if (!ready) {
    return (
      <div className="auth-shell auth-shell-simple flex min-h-[100dvh] items-center justify-center">
        <LoadingSpinner text="Loading..." />
      </div>
    );
  }

  return (
    <PublicPageLayout kicker="Engineer workspace">
      <div className="auth-card auth-card-glass auth-card-actions">
        <header className="auth-card-header">
          <h1 className="auth-card-title">Welcome</h1>
          <p className="auth-card-subtitle">
            Sign in to your dashboard, or create an account to join the team.
          </p>
        </header>

        <div className="flex flex-col gap-3">
          <Link to="/login" className="auth-btn-primary">
            Sign in
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link to="/register" className="auth-btn-secondary">
            Create account
          </Link>
        </div>
      </div>

      <p className="auth-footer mt-6">
        Internal team tool — ask your admin if you need access.
      </p>
    </PublicPageLayout>
  );
}
