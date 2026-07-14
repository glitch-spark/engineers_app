import type { ReactNode } from 'react';
import PublicPageLayout from './PublicPageLayout';

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
  return (
    <PublicPageLayout kicker={KICKER[mode]}>
      <div className="auth-card auth-card-glass">
        <header className="auth-card-header">
          <h2 className="auth-card-title">{title}</h2>
          <p className="auth-card-subtitle">{subtitle}</p>
        </header>
        {children}
      </div>

      {footer && <div className="mt-6">{footer}</div>}
    </PublicPageLayout>
  );
}
