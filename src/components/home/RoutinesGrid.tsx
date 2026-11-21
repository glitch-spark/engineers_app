import type { DashboardRoutineRow } from '../../api/endpoints';
import { weekdayShort } from './BidsDays';

type RoutineDay = DashboardRoutineRow['days'][number];
/** What a day's cell shows, what it is called for a screen reader, and its colour. */
function dayCell(d: RoutineDay): [string, string, string] {
  switch (d.state) {
    case 'done': return ['✓', 'done', 'font-bold text-emerald-600 dark:text-emerald-400'];
    case 'missed': return ['✗', 'missed', 'font-bold text-red-600 dark:text-red-400'];
    case 'short':
      return d.target
        ? [`${d.value ?? 0} / ${d.target}`, `${d.value ?? 0} of ${d.target}, short of the target`, 'font-semibold text-amber-600 dark:text-amber-400']
        : [`${d.value ?? 0}`, `${d.value ?? 0}, short of the target`, 'font-semibold text-amber-600 dark:text-amber-400'];
    case 'today': return ['·', 'today, not done yet', 'text-muted'];
    case 'future': return ['', 'still to come', ''];
    default: return ['', 'not planned', ''];
  }
}

/**
 * One line per routine with its working days and the legend; scrolls sideways inside its card on a narrow screen.
 * Shared by Home's This week card and the admin's page for one person.
 */
export default function RoutinesGrid({ rows, today }: { rows: DashboardRoutineRow[]; today: string }) {
  const now = (date: string) => (date === today ? 'bg-zinc-50 dark:bg-zinc-900' : '');
  return (
    <>
      <div className="overflow-x-auto">
        <table aria-label="Routines this week" className="mt-1 w-full min-w-[30rem] border-collapse text-sm">
          <thead>
            <tr className="text-[11px] font-normal normal-case tracking-normal text-muted">
              <th scope="col" className="text-left"><span className="sr-only">Routine</span></th>
              {rows[0].days.map((d) => <th key={d.date} scope="col" className={`px-1.5 py-1 text-center font-normal ${now(d.date)}`}>{weekdayShort(d.date)}</th>)}
              <th scope="col"><span className="sr-only">Days done</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-zinc-100 dark:border-zinc-800">
                <th scope="row" className="py-1.5 pr-2 text-left font-normal text-body">{row.text}</th>
                {row.days.map((d) => {
                  const [text, name, color] = dayCell(d);
                  return (
                    <td key={d.date} aria-label={`${weekdayShort(d.date)}: ${name}`} className={`whitespace-nowrap px-1.5 py-1.5 text-center tabular-nums ${color} ${now(d.date)}`}>
                      {text}
                    </td>
                  );
                })}
                <td className="whitespace-nowrap py-1.5 pl-2 text-right text-xs text-muted">{row.doneDays} of {row.totalDays} days</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-xs text-muted">✓ done · ✗ missed · a number = short of that day&apos;s target · · = today, not done yet</p>
    </>
  );
}
