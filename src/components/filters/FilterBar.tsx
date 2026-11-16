import type { ReactNode } from 'react';

/**
 * The one filter bar every list page uses: a panel of controls, each with its label above it, and a Clear button at
 * the end. Put the controls in this order: who (User / Owner), page-specific filters, search, date range.
 * Wrap each control in `FilterField` so the labels line up. `sticky` pins the bar under the top bar (Statistics).
 * Show `Clear` (via `canClear`) only when something differs from the page's default.
 */
export default function FilterBar({
  children,
  onClear,
  canClear,
  sticky = false,
}: {
  children: ReactNode;
  onClear: () => void;
  canClear: boolean;
  sticky?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Filters"
      className={`panel flex flex-wrap items-end gap-3 px-4 py-3 ${sticky ? 'sticky top-16 z-20' : ''}`}
    >
      {children}
      {canClear && (
        <button type="button" className="btn-outline" onClick={onClear}>
          Clear
        </button>
      )}
    </div>
  );
}

/** One labelled control in a `FilterBar`: the label sits above it. `width` is a Tailwind width class, e.g. `w-44`. */
export function FilterField({
  label,
  htmlFor,
  width = 'w-44',
  children,
}: {
  label: string;
  htmlFor: string;
  width?: string;
  children: ReactNode;
}) {
  return (
    <div className={width}>
      <label htmlFor={htmlFor} className="mb-1 block text-xs text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}
