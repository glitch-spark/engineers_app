/** Which working days a daily to-do runs: null = every day Mon–Sat, else weekday numbers (0 = Mon .. 5 = Sat). */
export type Days = number[] | null;

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const PRESETS: { label: string; days: Days }[] = [
  { label: 'Mon–Sat', days: null },
  { label: 'Mon–Fri', days: [0, 1, 2, 3, 4] },
  { label: 'Sat only', days: [5] },
];

/** Sorted, unique, 0..5; all six (or none given) = null. */
export function normDays(d?: number[] | null): Days {
  if (!d) return null;
  const out = [...new Set(d)].filter((x) => x >= 0 && x <= 5).sort((a, b) => a - b);
  return out.length === 6 || out.length === 0 ? null : out;
}

export const sameDays = (a?: Days, b?: Days) => JSON.stringify(normDays(a)) === JSON.stringify(normDays(b));

export function daysLabel(d?: Days): string {
  const n = normDays(d);
  return PRESETS.find((p) => sameDays(p.days, n))?.label ?? (n ?? []).map((x) => DAY_NAMES[x]).join(', ');
}
