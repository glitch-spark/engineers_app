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
    <header className="flex items-center justify-between gap-4 mb-1">
      <div className="flex items-center gap-3 min-w-0">
        {backTo && (
          <Link to={backTo} className="text-gray-500 hover:text-primary flex-shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Link>
        )}
        <h1 className="page-title truncate">{title}</h1>
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </header>
  );
}
