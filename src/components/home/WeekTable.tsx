import type { DashboardRoutineRow, DashboardWeek } from '../../api/endpoints';
import { formatInZone, parseServerTime } from '../../lib/interviewTimezone';
import { stageLabel } from '../../lib/stageBadge';
import { useInterviewTimezone } from '../../lib/useInterviewTimezone';
import { dayDate, weekdayShort } from '../../lib/week';

type RoutineDay = DashboardRoutineRow['days'][number];
/** What a day's cell shows, what it is called for a screen reader, and its colour. */
export function dayCell(d: RoutineDay): [string, string, string] {
  switch (d.state) {
    case 'done': return ['✓', 'done', 'font-bold text-emerald-600 dark:text-emerald-400'];
    case 'missed': return ['✗', 'missed', 'font-bold text-red-600 dark:text-red-400'];
    case 'short':
      return d.target
        ? [`${d.value ?? 0} / ${d.target}`, `${d.value ?? 0} of ${d.target}, short of the target`, 'font-semibold text-amber-600 dark:text-amber-400']
        : [`${d.value ?? 0}`, `${d.value ?? 0}, short of the target`, 'font-semibold text-amber-600 dark:text-amber-400'];
    case 'today': return ['·', 'today, not done yet', 'text-muted'];
    case 'future': return ['', 'still to come', ''];
    default: return ['—', 'not planned', 'text-zinc-300 dark:text-zinc-600'];
  }
}


type BidDay = NonNullable<DashboardWeek['bids']['byDay']>[number];

const AMBER_CHIP = 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300';
const GREY_CHIP = 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300';
/** A round's status in words and its colour. `unmarked`: still `scheduled` on a day before today. */
const STATUS: Record<string, [string, string]> = {
  scheduled: ['scheduled', 'bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-300'],
  unmarked: ['not marked', AMBER_CHIP],
  waiting: ['completed', AMBER_CHIP],
  followed_up: ['completed · followed up', 'bg-violet-50 text-violet-800 dark:bg-violet-950 dark:text-violet-300'],
  passed: ['passed', 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'],
  rejected: ['rejected', 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'],
  no_answer: ['no answer', GREY_CHIP],
  canceled: ['canceled', GREY_CHIP],
};
const UNDER = 'font-semibold text-amber-600 dark:text-amber-400';
const REACHED = 'font-semibold text-emerald-600 dark:text-emerald-400';
const TH = 'px-2 py-1.5 text-right text-[11px] font-medium text-muted first:pl-0 first:text-left';
const TD = 'whitespace-nowrap px-2 py-1.5 text-right tabular-nums';
const ROW = 'border-t border-zinc-100 dark:border-zinc-800';
const num = (n: number | null | undefined) => (n == null ? '–' : n.toLocaleString('en-US'));

/**
 * Home's This week as one read-only table, Mon–Sat with Week and Planned: bids (total, self, bidder), the
 * interviews of each day as a small calendar coloured by status, and the daily to-dos. Nothing without days (an
 * older server); a row shows what the server sent.
 */
export default function WeekTable({ week, today }: { week: DashboardWeek; today: string }) {
  const { tz } = useInterviewTimezone();
  const { bids, interviews } = week;
  const routines = week.routines.rows ?? [];
  const dates = (bids.byDay ?? routines[0]?.days ?? []).map((d) => d.date);
  if (!dates.length) return null;

  const now = (date: string) => (date === today ? 'bg-zinc-50 dark:bg-zinc-900' : '');
  /** A number against its target, under it said in words too. */
  const cell = (key: string, n: number | undefined, target: number | null | undefined, reached: string, more = '') => {
    const tone = n == null || !target ? '' : n < target ? UNDER : reached;
    return (
      <td key={key} className={`${TD} ${tone} ${more}`}>
        {num(n)}{tone === UNDER && <span className="sr-only">, under target</span>}
      </td>
    );
  };
  const bidsRow = (label: string, of: (d: BidDay) => number | undefined, total: number, target: number | null | undefined, minor: boolean) => (
    <tr className={minor ? 'text-xs text-muted' : ROW}>
      <th scope="row" className={`py-1.5 text-left ${minor ? 'pl-4 font-normal' : 'font-semibold text-strong'}`}>{label}</th>
      {dates.map((date) => {
        const d = date <= today ? bids.byDay?.find((x) => x.date === date) : undefined; // a day still to come: a dash
        return cell(date, d && of(d), minor ? null : d?.target, REACHED, now(date));
      })}
      {cell('week', total, minor ? null : target, 'font-semibold')}
      <td className={TD}>{num(target)}</td>
    </tr>
  );

  return (
    <>
      <div className="overflow-x-auto">
        <table aria-label="This week" className="mt-2 w-full min-w-[46rem] border-collapse text-sm">
          <thead>
            <tr>
              <th scope="col" className={TH}><span className="sr-only">Row</span></th>
              {dates.map((date) => (
                <th key={date} scope="col" className={`${TH} ${now(date)}`}>
                  {weekdayShort(date)} {dayDate(date).getDate()}{date === today && ' · today'}
                </th>
              ))}
              <th scope="col" className={TH}>Week</th>
              <th scope="col" className={TH}>Planned</th>
            </tr>
          </thead>
          <tbody>
            {bidsRow('Bids', (d) => d.done, bids.week?.total ?? bids.total, bids.week ? bids.week.target : bids.target, false)}
            {bidsRow('self', (d) => d.self, bids.week?.self ?? bids.self, bids.week?.selfTarget, true)}
            {bidsRow('bidder', (d) => d.bidder, bids.week?.bidder ?? bids.bidder, bids.week?.bidderTarget, true)}
            <tr className={`${ROW} align-top`}>
              <th scope="row" className="py-1.5 text-left font-semibold text-strong">
                Interviews
                <div className="text-xs font-normal text-muted">self {interviews.self} · caller {interviews.caller}</div>
              </th>
              {dates.map((date) => {
                const list = interviews.rounds?.filter((r) => r.date === date);
                return (
                  <td key={date} className={`min-w-[7.5rem] px-2 py-1.5 text-left ${now(date)}`}>
                    {list && !list.length && <span className="text-muted">–</span>}
                    {list?.map((r) => {
                      const [word, color] = STATUS[r.status === 'scheduled' && date < today ? 'unmarked' : r.status] ?? [r.status, GREY_CHIP];
                      return (
                        <div key={`${r.interviewId}:${r.at}`} className={`mb-1 rounded-md px-1.5 py-1 text-[11px] leading-tight ${color}`}>
                          <b className={`block text-xs ${r.status === 'canceled' ? 'line-through' : ''}`}>{r.companyName || 'Untitled company'}</b>
                          {formatInZone(parseServerTime(r.at), tz, { hour: 'numeric', minute: '2-digit' })} · {stageLabel(r.stage)}
                          {' · '}{r.who === 'self' ? 'self' : `caller${r.callerName ? ` ${r.callerName}` : ''}`}
                          <span className="block font-semibold">{word}</span>
                        </div>
                      );
                    })}
                  </td>
                );
              })}
              {cell('week', interviews.done, interviews.target, 'font-semibold')}
              <td className={TD}>{num(interviews.target || null)}</td>
            </tr>
          </tbody>
          {routines.length > 0 && (
            <tbody>
              <tr>
                <th scope="rowgroup" colSpan={dates.length + 3} className="bg-zinc-50 px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wider text-muted dark:bg-zinc-900">
                  Daily to-dos
                </th>
              </tr>
              {routines.map((row) => (
                <tr key={row.id} className={ROW}>
                  <th scope="row" className="py-1.5 pr-2 text-left font-normal text-body">{row.text}</th>
                  {row.days.map((d) => {
                    const [text, name, color] = dayCell(d);
                    return <td key={d.date} aria-label={`${weekdayShort(d.date)}: ${name}`} className={`${TD} ${color} ${now(d.date)}`}>{text}</td>;
                  })}
                  <td className={TD}>{row.doneDays}</td>
                  <td className={TD}>{row.totalDays}</td>
                </tr>
              ))}
            </tbody>
          )}
        </table>
      </div>
      <ul aria-label="Interview colours" className="mt-2 flex flex-wrap gap-1.5">
        {Object.values(STATUS).map(([word, color]) => (
          <li key={word} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${color}`}>{word}</li>
        ))}
      </ul>
    </>
  );
}
