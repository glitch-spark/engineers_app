import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * Standard page header — single source of truth for the page title plus an
 * optional right-aligned action and an optional back link. Title only — no
 * subtitle, intentionally, to keep every page header visually identical.
 */
export default function PageHeader({
  title,
  action,
  backTo,
}: {
  title: string;
  action?: ReactNode;
  backTo?: string;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 items-center gap-3">
        {backTo && (
          <Link to={backTo} className="shell-icon-btn flex-shrink-0" aria-label="Go back">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        )}
        <h1 className="page-title truncate">{title}</h1>
      </div>
      {action && <div className="flex max-w-full shrink-0 flex-wrap gap-2">{action}</div>}
    </header>
  );
}
