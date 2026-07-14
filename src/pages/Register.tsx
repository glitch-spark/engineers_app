import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2 } from 'lucide-react';
import * as api from '../api/endpoints';
import { notify } from '../lib/notify';
import AuthShell from '../components/auth/AuthShell';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: FormEvent) => {
    e.preventDefault();

    if (!username.trim() || !email.trim() || !password || !confirmPassword) {
      notify.error('Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      notify.error('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      notify.error('Password must be at least 6 characters long');
      return;
    }

    setLoading(true);
    try {
      const res = (await api.register({ username, email, password })) as {
        ok?: boolean;
        pendingApproval?: boolean;
      };
      if (res?.pendingApproval) {
        navigate('/login?message=Registration submitted. An admin must approve your account before you can sign in.');
      } else {
        navigate('/login?message=Registration successful! Please sign in.');
      }
    } catch (err) {
      notify.error(err, 'Failed to register. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      mode="register"
      title="Create your account"
      subtitle="Set up credentials for the Engineer workspace."
      footer={
        <p className="auth-footer">
          By creating an account, you agree to our{' '}
          <a href="#" className="auth-footer-link">Terms</a>
          {' '}and{' '}
          <a href="#" className="auth-footer-link">Privacy Policy</a>.
        </p>
      }
    >
      <form onSubmit={submit} className="space-y-5">
        <div className="space-y-1.5">
          <label htmlFor="username" className="auth-label">Username</label>
          <input
            id="username"
            className="auth-input"
            placeholder="How you appear in the app"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            disabled={loading}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="email" className="auth-label">Email</label>
          <input
            id="email"
            className="auth-input"
            placeholder="you@company.com"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="password" className="auth-label">Password</label>
            <input
              id="password"
              className="auth-input"
              placeholder="Min. 6 characters"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="confirmPassword" className="auth-label">Confirm</label>
            <input
              id="confirmPassword"
              className="auth-input"
              placeholder="Repeat password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>
        </div>

        <button type="submit" className="auth-btn-primary w-full" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Creating account
            </>
          ) : (
            <>
              Create account
              <ArrowRight className="h-4 w-4" aria-hidden />
            </>
          )}
        </button>
      </form>

      <div className="auth-divider">
        <p className="auth-muted mb-4 text-center text-sm">Already registered?</p>
        <Link to="/login" className="auth-btn-secondary w-full">
          Sign in instead
        </Link>
      </div>
    </AuthShell>
  );
}
