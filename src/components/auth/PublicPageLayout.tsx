import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LogoIcon } from '../Logo';

type PublicPageLayoutProps = {
  kicker?: string;
  children: ReactNode;
};

export default function PublicPageLayout({ kicker, children }: PublicPageLayoutProps) {
  return (
    <div className="auth-shell auth-shell-simple">
      <div className="auth-bg-ambient" aria-hidden>
        <div className="auth-bg-blob auth-bg-blob-a" />
        <div className="auth-bg-blob auth-bg-blob-b" />
        <div className="auth-bg-grid" />
      </div>

      <div className="auth-simple-inner auth-fade-up">
        <Link to="/" className="auth-simple-logo group" aria-label="Engineer home">
          <LogoIcon className="h-9 w-9 text-sky-600 transition-opacity group-hover:opacity-80" />
        </Link>
        {kicker && <p className="auth-simple-kicker">{kicker}</p>}
        {children}
      </div>
    </div>
  );
}
