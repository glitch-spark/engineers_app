import useSWR from 'swr';
import * as api from '../../api/endpoints';
import { todayInputValue } from '../../lib/week';

function localDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}
const shortLabel = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const weekday = (iso: string) => localDate(iso).toLocaleDateString('en-US', { weekday: 'short' });
const num = (n: number) => n.toLocaleString('en-US');
const some = (parts: (string | false)[]) => parts.filter(Boolean) as string[];

const TILE_LABEL = 'text-[11px] font-medium uppercase tracking-wider text-muted';
const BIG = 'text-xl font-bold tabular-nums text-strong';
const TRACK = 'mt-1.5 flex h-2 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800';

export default function WeekCard() {
  const today = todayInputValue();
  const { data, error, isLoading, mutate } = useSWR(['home-week', today], () => api.getDashboardWeek({ today }));

  if (error && !data) {
    return (
      <section className="panel p-4">
        <h2 className="card-title mb-3">This week</h2>
        <p className="text-sm text-muted mb-3">Couldn&rsquo;t load this week.</p>
        <button type="button" className="btn-outline" onClick={() => mutate()}>Retry</button>
      </section>
    );
  }
  if (isLoading || !data) {
    return (
      <section className="panel p-4 space-y-3">
        <div className="skeleton h-5 w-48" />
        <div className="skeleton h-10 w-full" />
        <div className="skeleton h-10 w-full" />
      </section>
    );
  }

  const start = localDate(data.week.start);
  const friday = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 4);
  const dow = new Date().getDay(); // 1 = Mon .. 5 = Fri
  const left = dow === 5 ? 'last day' : dow >= 1 && dow <= 4 ? `${6 - dow} days left` : '';
  const { rows } = data.routines;

  return (
    <section className="panel p-4">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="card-title">This week · {shortLabel(start)} – {shortLabel(friday)}</h2>
        {left && <span className="text-xs text-muted">{weekday(today)} · {left}</span>}
      </header>
      <div className="grid gap-5 sm:grid-cols-2">
        <Bids bids={data.bids} today={today} lastDay={dow === 5} />
        <Interviews interviews={data.interviews} />
      </div>
      {(data.routines.expected > 0 || !!rows?.length) && (
        <>
          <div className={`mt-5 flex flex-wrap justify-between gap-x-2 ${TILE_LABEL}`}>
            <span>Routines</span>
            <span className="normal-case tracking-normal">{data.routines.done} of {data.routines.expected} done this week</span>
          </div>
          {!!rows?.length && <RoutinesGrid rows={rows} today={today} />}
        </>
      )}
    </section>
  );
}

function Bids({ bids, today, lastDay }: { bids: api.DashboardWeek['bids']; today: string; lastDay: boolean }) {
  const target = bids.target != null && bids.target > 0 ? bids.target : null;
  const toGo = target ? target - bids.total : 0;
  const rest = target ? `of ${num(target)}${toGo > 0 ? ` · ${num(toGo)} to go ${lastDay ? 'today' : 'this week'}` : ''}` : '';
  // Behind where the week should be by today.
  const behind = !!target && bids.total < target && (bids.pace?.behindBy ?? 0) > 0;
  const days = bids.byDay ?? [];
  const perDay = days.find((d) => d.date === today)?.target ?? days.find((d) => d.target)?.target ?? null;

  return (
    <div role="group" aria-label="Bids">
      <div className={TILE_LABEL}>Bids</div>
      <p><span className={BIG}>{num(bids.total)}</span>{rest && <span className="text-xs text-muted"> {rest}</span>}</p>
      {target && (
        <div
          role="progressbar"
          aria-label="Bids this week"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, Math.round((bids.total / target) * 100))}
          className={TRACK}
        >
          <div className={behind ? 'bg-amber-500' : 'bg-success-500'} style={{ width: `${Math.min(100, (bids.total / target) * 100)}%` }} />
        </div>
      )}
      {days.length > 0 && (
        <ol className="mt-2 flex gap-1.5">
          {days.map((d) => {
            const future = d.date > today;
            const under = !future && !!d.target && d.done < d.target;
            return (
              <li key={d.date} className="flex-1 text-center text-[11px] text-muted">
                <b className={`block text-sm tabular-nums ${future ? 'font-normal' : under ? 'text-amber-600 dark:text-amber-400' : 'text-strong'}`}>
                  {future ? '–' : num(d.done)}
                </b>
                {weekday(d.date)}{d.date === today && ' · today'}
                {under && <span className="sr-only">, under target</span>}
              </li>
            );
          })}
        </ol>
      )}
      {days.length > 0 && !!perDay && <p className="mt-1 text-xs text-muted">Target {num(perDay)} a day · amber = under target</p>}
    </div>
  );
}

function Interviews({ interviews }: { interviews: api.DashboardWeek['interviews'] }) {
  const o = interviews.outcomes;
  if (!o) { // an older server: the held count and its target, as before
    return (
      <div role="group" aria-label="Interviews">
        <div className={TILE_LABEL}>Interviews</div>
        <p>
          <span className={BIG}>{interviews.done}</span>
          {!!interviews.target && <span className="text-xs text-muted"> of {interviews.target}</span>}
        </p>
      </div>
    );
  }
  const stack: [number, string, string][] = [
    [o.passed, 'passed', 'bg-success-500'],
    [o.rejected, 'rejected', 'bg-red-500'],
    [o.noAnswer, 'no answer', 'bg-zinc-400 dark:bg-zinc-500'],
    [o.waiting, 'waiting for a result', 'bg-sky-300 dark:bg-sky-700'],
    [o.canceled, 'canceled', 'bg-zinc-300 dark:bg-zinc-600'],
  ];
  const shown = stack.filter(([n]) => n > 0);
  const total = shown.reduce((sum, [n]) => sum + n, 0);
  const second = some([o.canceled > 0 && `${o.canceled} canceled`, o.scheduled > 0 && `${o.scheduled} more scheduled this week`]);

  return (
    <div role="group" aria-label="Interviews">
      <div className={TILE_LABEL}>Interviews</div>
      <p>
        <span className={BIG}>{o.held}</span>
        <span className="text-xs text-muted">
          {' '}{['held', ...some([o.passed > 0 && `${o.passed} passed`, o.waiting > 0 && `${o.waiting} waiting for a result`])].join(' · ')}
        </span>
      </p>
      {total > 0 && (
        <div role="img" aria-label={shown.map(([n, name]) => `${n} ${name}`).join(', ')} className={TRACK}>
          {shown.map(([n, name, color]) => <div key={name} title={`${n} ${name}`} className={color} style={{ width: `${(n / total) * 100}%` }} />)}
        </div>
      )}
      {second.length > 0 && <div className="mt-1.5 text-xs text-muted">{second.join(' · ')}</div>}
    </div>
  );
}

type RoutineDay = api.DashboardRoutineRow['days'][number];
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

/** One line per routine with its working days; scrolls sideways inside the card on a narrow screen. */
function RoutinesGrid({ rows, today }: { rows: api.DashboardRoutineRow[]; today: string }) {
  const now = (date: string) => (date === today ? 'bg-zinc-50 dark:bg-zinc-900' : '');
  return (
    <>
      <div className="overflow-x-auto">
        <table aria-label="Routines this week" className="mt-1 w-full min-w-[30rem] border-collapse text-sm">
          <thead>
            <tr className="text-[11px] font-normal normal-case tracking-normal text-muted">
              <th scope="col" className="text-left"><span className="sr-only">Routine</span></th>
              {rows[0].days.map((d) => <th key={d.date} scope="col" className={`px-1.5 py-1 text-center font-normal ${now(d.date)}`}>{weekday(d.date)}</th>)}
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
                    <td key={d.date} aria-label={`${weekday(d.date)}: ${name}`} className={`whitespace-nowrap px-1.5 py-1.5 text-center tabular-nums ${color} ${now(d.date)}`}>
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
