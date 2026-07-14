/**
 * Brand icon — bullseye spiral with a missing top-right notch.
 * Reads "focused on the target, shipping in progress." Inherits text color
 * via `currentColor`, so wrap in a Tailwind text-* class to tint.
 */
export function LogoIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      aria-label="engineer"
    >
      <path
        d="M44 12 A24 24 0 1 0 56 28"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M48 24 A16 16 0 1 0 32 48"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M40 28 A8 8 0 1 0 32 40"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="32" cy="32" r="3.5" fill="currentColor" />
    </svg>
  );
}

/**
 * Brand lockup — icon + "engineer" wordmark with an accent dot punctuating
 * the end. Keep the dot's color in sync with the icon's accent (defaults to
 * primary blue).
 */
export function LogoWordmark({ className = '', variant = 'light' }: { className?: string; variant?: 'light' | 'dark' }) {
  const isDark = variant === 'dark';
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <LogoIcon className={`h-7 w-7 ${isDark ? 'text-sky-400' : 'text-accent'}`} />
      <span className={`text-xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-zinc-900'}`}>
        engineer<span className={isDark ? 'text-sky-400' : 'text-accent'}>.</span>
      </span>
    </div>
  );
}
