import type { DashboardWeek } from '../../api/endpoints';

/** "Mon" for a YYYY-MM-DD day. */
export const weekdayShort = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short' });
};
const num = (n: number) => n.toLocaleString('en-US');

/**
 * Mon–Fri with each day's bids: a day under its target in amber, `today` labelled, days still to come as a dash.
 * Shared by Home's This week card and the admin's page for one person. Nothing without days (an older server).
 */
export default function BidsDays({ days, today }: { days: NonNullable<DashboardWeek['bids']['byDay']>; today: string }) {
  if (!days.length) return null;
  return (
    <ol className="mt-2 flex gap-1.5">
      {days.map((d) => {
        const future = d.date > today;
        const under = !future && !!d.target && d.done < d.target;
        return (
          <li key={d.date} className="flex-1 text-center text-[11px] text-muted">
            <b className={`block text-sm tabular-nums ${future ? 'font-normal' : under ? 'text-amber-600 dark:text-amber-400' : 'text-strong'}`}>
              {future ? '–' : num(d.done)}
            </b>
            {weekdayShort(d.date)}{d.date === today && ' · today'}
            {under && <span className="sr-only">, under target</span>}
          </li>
        );
      })}
    </ol>
  );
}
