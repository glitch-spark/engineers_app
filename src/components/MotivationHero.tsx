import { quoteForToday, THEME_META, type MotivationTheme } from '../lib/motivation';

const THEME_COLORS: Record<MotivationTheme, { bar: string; tag: string; tagBg: string }> = {
  grind: { bar: '#d97706', tag: 'text-amber-700', tagBg: 'bg-amber-50' },
  why: { bar: '#047857', tag: 'text-emerald-700', tagBg: 'bg-emerald-50' },
};

export default function MotivationHero({ userId }: { userId?: string | null }) {
  const { theme, text } = quoteForToday(new Date(), userId || '');
  const meta = THEME_META[theme];
  const colors = THEME_COLORS[theme];

  return (
    <div
      className="relative bg-white rounded-md border border-gray-100 shadow-sm pl-5 pr-5 py-5 overflow-hidden"
      style={{ borderLeft: `4px solid ${colors.bar}` }}
    >
      <div className="mb-2">
        <span
          className={`text-[10px] font-semibold uppercase tracking-[0.12em] px-2 py-0.5 rounded ${colors.tag} ${colors.tagBg}`}
        >
          <span aria-hidden className="mr-1">{meta.icon}</span>
          {meta.label}
        </span>
      </div>

      <p
        className="text-gray-900 leading-snug"
        style={{
          fontFamily: 'Source Serif 4, Source Serif Pro, Merriweather, Georgia, serif',
          fontSize: 16,
          fontWeight: 500,
          letterSpacing: '-0.005em',
        }}
      >
        {text}
      </p>
    </div>
  );
}
