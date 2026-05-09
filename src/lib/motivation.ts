/**
 * Motivation strip — three rotating themes, one quote per day.
 *
 * Theme of the day is derived from day-of-week; quote within the theme is
 * derived from a date hash so all users see the same line on the same day.
 * No backend, no LLM. Quotes hand-curated to avoid cringe.
 */

export type MotivationTheme = 'grind' | 'why';

export const THEME_META: Record<MotivationTheme, { label: string; icon: string }> = {
  grind: { label: 'Keep moving', icon: '🏃' },
  why: { label: 'Know your why', icon: '🎯' },
};

const QUOTES: Record<MotivationTheme, string[]> = {
  // Hard. Visceral. Built for the days you don't want to show up.
  grind: [
    'Pain is a payment plan. Show up and settle it.',
    'No one is coming. Save yourself.',
    'Bleed today so you don\'t beg tomorrow.',
    'Your competition is also tired. Outlast them.',
    'Comfort is the slow killer.',
    'Tired is not a reason. Tired is the rep.',
    'When it hurts, that\'s the work doing its job.',
    'Quit later. Not today.',
    'Excuses are cheap. Effort costs more. Pay it.',
    'You can rest at the top.',
    'Hard work has a smell. Earn it.',
    'The grind owes you nothing. Show up anyway.',
    'One more bid. One more cold message. One more rep.',
    'Soft seasons make soft people. Stay sharp.',
    'Lazy is expensive. Discipline is the discount.',
  ],
  // Touching. Pulls on the reason underneath.
  why: [
    'Someone is depending on you not breaking.',
    'The version of you in 5 years is watching. Don\'t disappoint them.',
    'Money buys time. Time buys more days with the ones you love.',
    'Hard times make hard people. Be useful to your family.',
    'Why you started is the only reason that lasts.',
    'Strangers won\'t remember your effort. The people who matter will.',
    'Imagine quitting today, then explaining it to them later.',
    'Burn the boats. The other side is waiting.',
    'Your name is on this. Make it heavy.',
    'Pain shapes purpose. Don\'t waste either.',
    'You\'re not just building a career. You\'re building who they get to know.',
    'The kid you used to be is still in there. Don\'t let them down.',
    'A quiet promise to yourself outlasts any loud goal.',
    'You will be your average day. Pick days you\'d repeat.',
    'When you\'re tired, remember who you\'re doing this for.',
  ],
};

/** Theme-of-the-day rotation: Mon/Tue/Thu/Fri = grind, Wed/Sat/Sun = why. */
export function themeForDate(d: Date = new Date()): MotivationTheme {
  const dow = d.getDay(); // 0=Sun .. 6=Sat
  if (dow === 1 || dow === 2 || dow === 4 || dow === 5) return 'grind';
  return 'why';
}

/** Stable hash → bucket index. Salt with userId so each user gets a
 *  different quote within the same theme on the same day. */
function hashKey(d: Date, salt: string): number {
  const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}|${salt}`;
  let h = 0;
  for (let i = 0; i < k.length; i++) {
    h = (h * 31 + k.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function quoteForToday(
  d: Date = new Date(),
  userId: string = '',
): { theme: MotivationTheme; text: string } {
  const theme = themeForDate(d);
  const list = QUOTES[theme];
  const text = list[hashKey(d, userId) % list.length];
  return { theme, text };
}

export function todayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
