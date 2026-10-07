import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2 } from 'lucide-react';
import * as api from '../api/endpoints';
import { messageOf } from '../lib/notify';
import AuthShell from '../components/auth/AuthShell';

type Field = 'username' | 'email' | 'password' | 'confirmPassword';
type FieldErrors = Partial<Record<Field, string>>;
const FIELD_ORDER: Field[] = ['username', 'email', 'password', 'confirmPassword'];

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <p id={id} className="text-xs font-medium text-red-700">{message}</p>;
}

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const navigate = useNavigate();

  const submit = async (e: FormEvent) => {
    e.preventDefault();

    const next: FieldErrors = {};
    if (!username.trim()) next.username = 'Enter a username.';
    if (!email.trim()) next.email = 'Enter your email address.';
    else if (!/^[^\s@]+@[^\s@]+$/.test(email.trim())) next.email = 'Enter a valid email address, like you@company.com.';
    if (!password) next.password = 'Enter a password.';
    else if (password.length < 8) next.password = 'Password must be at least 8 characters.';
    else if (new TextEncoder().encode(password).length > 72) next.password = 'Password is too long (72 bytes max).';
    if (!confirmPassword) next.confirmPassword = 'Re-enter your password.';
    else if (password && password !== confirmPassword) next.confirmPassword = 'Passwords do not match.';

    setErrors(next);
    setFormError('');
    const firstInvalid = FIELD_ORDER.find((f) => next[f]);
    if (firstInvalid) {
      document.getElementById(firstInvalid)?.focus();
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
      setFormError(messageOf(err, 'Failed to register. Please try again.'));
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
      <form onSubmit={submit} className="space-y-5" noValidate>
        {formError && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            {formError}
          </p>
        )}
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
            aria-invalid={errors.username ? true : undefined}
            aria-describedby={errors.username ? 'username-error' : undefined}
            disabled={loading}
          />
          <FieldError id="username-error" message={errors.username} />
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
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? 'email-error' : undefined}
            disabled={loading}
          />
          <FieldError id="email-error" message={errors.email} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="password" className="auth-label">Password</label>
            <input
              id="password"
              className="auth-input"
              placeholder="Min. 8 characters"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? 'password-hint password-error' : 'password-hint'}
              disabled={loading}
            />
            <p id="password-hint" className="auth-muted text-xs">At least 8 characters.</p>
            <FieldError id="password-error" message={errors.password} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="confirmPassword" className="auth-label">Confirm password</label>
            <input
              id="confirmPassword"
              className="auth-input"
              placeholder="Repeat password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              aria-invalid={errors.confirmPassword ? true : undefined}
              aria-describedby={errors.confirmPassword ? 'confirmPassword-error' : undefined}
              disabled={loading}
            />
            <FieldError id="confirmPassword-error" message={errors.confirmPassword} />
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
