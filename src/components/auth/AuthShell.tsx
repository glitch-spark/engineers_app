import type { ReactNode } from 'react';
import PublicPageLayout from './PublicPageLayout';
import { useDocumentTitle } from '../../lib/useDocumentTitle';

type AuthShellProps = {
  mode: 'login' | 'register';
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
};

const KICKER = {
  login: 'Engineer workspace',
  register: 'Join the team',
} as const;

export default function AuthShell({ mode, title, subtitle, children, footer }: AuthShellProps) {
  useDocumentTitle(mode === 'login' ? 'Sign in' : 'Create account');
  return (
    <PublicPageLayout kicker={KICKER[mode]}>
      <div className="auth-card auth-card-glass">
        <header className="auth-card-header">
          <h1 className="auth-card-title">{title}</h1>
          <p className="auth-card-subtitle">{subtitle}</p>
        </header>
        {children}
      </div>

      {footer && <div className="mt-6">{footer}</div>}
    </PublicPageLayout>
  );
}
