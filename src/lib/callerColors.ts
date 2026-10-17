/** Calendar colours for callers (keys match the backend's CALLER_COLORS). */
import type { Caller, CallerColor, InterviewRoundRow } from '../api/endpoints';

export const CALLER_COLORS: CallerColor[] = ['sky', 'violet', 'emerald', 'amber', 'rose', 'teal', 'indigo', 'orange'];

/** Event chip classes, one per colour (spelled out so Tailwind keeps them). */
const CHIP: Record<CallerColor, string> = {
  sky: 'bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-950/50 dark:text-sky-200 dark:border-sky-800',
  violet: 'bg-violet-100 text-violet-900 border-violet-300 dark:bg-violet-950/50 dark:text-violet-200 dark:border-violet-800',
  emerald: 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-800',
  amber: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-800',
  rose: 'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950/50 dark:text-rose-200 dark:border-rose-800',
  teal: 'bg-teal-100 text-teal-900 border-teal-300 dark:bg-teal-950/50 dark:text-teal-200 dark:border-teal-800',
  indigo: 'bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-indigo-950/50 dark:text-indigo-200 dark:border-indigo-800',
  orange: 'bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-950/50 dark:text-orange-200 dark:border-orange-800',
};

/** Solid swatch (legend dots, colour picker). */
export const CALLER_DOT: Record<CallerColor, string> = {
  sky: 'bg-sky-500', violet: 'bg-violet-500', emerald: 'bg-emerald-500', amber: 'bg-amber-500',
  rose: 'bg-rose-500', teal: 'bg-teal-500', indigo: 'bg-indigo-500', orange: 'bg-orange-500',
};

/** No caller yet: dashed and grey, so it stands out as still to assign. */
export const UNASSIGNED_CHIP = 'border-dashed bg-white text-zinc-600 border-zinc-400 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-600';
/** A name typed before the caller list, or a caller since removed from it. */
const OFF_LIST_CHIP = 'bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700';

export function isUnassigned(row: Pick<InterviewRoundRow, 'callerId' | 'callerName'>): boolean {
  return !row.callerId && (!row.callerName || row.callerName === 'TBD');
}

/** The round's caller as shown on the Callers calendar. */
export function callerLabel(row: Pick<InterviewRoundRow, 'callerId' | 'callerName'>): string {
  return isUnassigned(row) ? 'No caller yet' : row.callerName || 'Caller';
}

export function callerChipClass(row: InterviewRoundRow, byId: Map<string, Caller>): string {
  if (isUnassigned(row)) return UNASSIGNED_CHIP;
  const c = row.callerId ? byId.get(row.callerId) : undefined;
  return c ? CHIP[c.color] ?? OFF_LIST_CHIP : OFF_LIST_CHIP;
}
