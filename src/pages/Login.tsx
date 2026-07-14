import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { ApiError } from '../api/client';
import { notify } from '../lib/notify';
import AuthShell from '../components/auth/AuthShell';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const message = params.get('message');

  useEffect(() => {
    if (message) notify.success(message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();

    if (!username.trim() || !password.trim()) {
      notify.error('Please enter both username and password');
      return;
    }

    setIsLoading(true);
    try {
      await login(username, password);
      notify.success('Signed in');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        notify.error('Invalid username or password. Please try again.');
      } else {
        notify.error(err, 'An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell
      mode="login"
      title="Welcome back"
      subtitle="Sign in with your username or email."
      footer={
        <p className="auth-footer">
          By signing in, you agree to our{' '}
          <a href="#" className="auth-footer-link">Terms</a>
          {' '}and{' '}
          <a href="#" className="auth-footer-link">Privacy Policy</a>.
        </p>
      }
    >
      <form onSubmit={submit} className="space-y-5">
        <div className="space-y-1.5">
          <label htmlFor="username" className="auth-label">Username or email</label>
          <input
            id="username"
            className="auth-input"
            placeholder="you@company.com"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            disabled={isLoading}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="password" className="auth-label">Password</label>
            <button
              type="button"
              className="auth-link-muted text-xs font-medium transition-colors"
            >
              Forgot password?
            </button>
          </div>
          <input
            id="password"
            className="auth-input"
            placeholder="Your password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isLoading}
          />
        </div>

        <button type="submit" className="auth-btn-primary w-full" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Signing in
            </>
          ) : (
            <>
              Sign in
              <ArrowRight className="h-4 w-4" aria-hidden />
            </>
          )}
        </button>
      </form>

      <div className="auth-divider">
        <p className="auth-muted mb-4 text-center text-sm">New here?</p>
        <Link to="/register" className="auth-btn-secondary w-full">
          Create an account
        </Link>
      </div>
    </AuthShell>
  );
}
