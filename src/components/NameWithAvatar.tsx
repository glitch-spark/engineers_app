/**
 * Renders a user's name next to a small circular initials avatar.
 *
 * Avatar = initials derived from the name (first letter of each of the first
 * two words). Background color is a stable hash of the name, so the same
 * person always lands on the same color — visually scannable in tables.
 *
 * One canonical size for now (6×6 = 24px). Bump or parameterize when needed.
 *
 * Use for USER / OWNER references only (logged-in user, owner columns in
 * tables, etc.). NOT for Account/Profile rows — those stay plain.
 */
const PALETTE = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-violet-500',
  'bg-teal-500',
  'bg-orange-500',
  'bg-indigo-500',
  'bg-pink-500',
  'bg-cyan-500',
];

function initials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

function colorFor(name: string): string {
  let h = 0;
  for (const c of name || '') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export default function NameWithAvatar({
  name,
  className = '',
}: {
  name: string | null | undefined;
  className?: string;
}) {
  const display = (name || '').trim() || '—';
  return (
    <span className={`inline-flex items-center gap-2 min-w-0 ${className}`}>
      <span
        className={`w-6 h-6 rounded-full ${colorFor(display)} text-white text-[10px] font-semibold flex items-center justify-center flex-shrink-0`}
        aria-hidden="true"
      >
        {initials(display)}
      </span>
      <span className="truncate">{display}</span>
    </span>
  );
}
