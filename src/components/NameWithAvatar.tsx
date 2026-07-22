/**
 * Renders a user's name next to a small circular initials avatar.
 *
 * Avatar = initials derived from the name (first letter of each of the first
 * two words). Background color is a stable hash of the name, so the same
 * person always lands on the same color — visually scannable in tables.
 *
 * Use for USER / OWNER references only (logged-in user, owner columns in
 * tables, etc.). NOT for Account/Profile rows — those stay plain.
 */
const PALETTE = [
  'bg-zinc-700',
  'bg-zinc-600',
  'bg-sky-700',
  'bg-sky-600',
  'bg-emerald-700',
  'bg-emerald-600',
  'bg-indigo-700',
  'bg-indigo-600',
];

const SIZES = {
  md: {
    wrap: 'gap-2',
    avatar: 'w-6 h-6 text-[10px]',
    name: 'text-sm',
  },
  sm: {
    wrap: 'gap-1.5',
    avatar: 'w-4 h-4 text-[9px]',
    name: 'text-xs',
  },
} as const;

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
  imageUrl,
  className = '',
  size = 'md',
}: {
  name: string | null | undefined;
  imageUrl?: string | null;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const display = (name || '').trim() || '—';
  const s = SIZES[size];
  return (
    <span className={`inline-flex items-center min-w-0 ${s.wrap} ${className}`}>
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className={`${s.avatar} rounded-full object-cover flex-shrink-0`}
        />
      ) : (
        <span
          className={`${s.avatar} rounded-full ${colorFor(display)} text-white font-semibold flex items-center justify-center flex-shrink-0`}
          aria-hidden="true"
        >
          {initials(display)}
        </span>
      )}
      <span className={`truncate ${s.name}`}>{display}</span>
    </span>
  );
}
