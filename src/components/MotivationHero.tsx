import { quoteForToday, THEME_META, type MotivationTheme } from '../lib/motivation';

const THEME_COLORS: Record<MotivationTheme, { bar: string; tag: string; tagBg: string }> = {
  grind: { bar: '#d97706', tag: 'text-amber-700 dark:text-amber-300', tagBg: 'bg-amber-50 dark:bg-amber-950/50' },
  why: { bar: '#047857', tag: 'text-emerald-700 dark:text-emerald-300', tagBg: 'bg-emerald-50 dark:bg-emerald-950/50' },
};

export default function MotivationHero({ userId }: { userId?: string | null }) {
  const { theme, text } = quoteForToday(new Date(), userId || '');
  const meta = THEME_META[theme];
  const colors = THEME_COLORS[theme];

  return (
    <div
      className="relative panel pl-5 pr-5 py-5 overflow-hidden"
      style={{ borderLeft: `4px solid ${colors.bar}` }}
    >
      <div className="mb-2">
        <span className={`badge ${colors.tag} ${colors.tagBg} uppercase tracking-[0.12em]`}>
          <span aria-hidden className="mr-1">{meta.icon}</span>
          {meta.label}
        </span>
      </div>

      <p
        className="text-strong leading-snug"
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
