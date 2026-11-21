import { useId } from 'react';
import type { TeamToday } from '../../api/endpoints';

type Person = TeamToday['people'][number];
const DOT: Record<Person['state'], [string, string]> = {
  red: ['bg-red-500', 'Something overdue'],
  amber: ['bg-amber-500', 'Behind today'],
  green: ['bg-success-500', 'On track'],
};
const num = (n: number) => n.toLocaleString('en-US');

function Dot({ state }: { state: Person['state'] }) {
  const [color, label] = DOT[state] ?? DOT.green;
  return <span role="img" aria-label={label} title={label} className={`inline-block h-2 w-2 shrink-0 rounded-full ${color}`} />;
}

/**
 * The admin's people picker, in the order the server sends (who most needs attention first). From the `md` width
 * up: a list with each person's dot, pending count, bids and to-dos. Under it: a "Viewing" dropdown with previous /
 * next. Both are rendered; CSS shows one.
 */
export default function TeamList({ people, picked, onPick }: { people: Person[]; picked: string; onPick: (userId: string) => void }) {
  const id = useId();
  const at = people.findIndex((p) => p.userId === picked);
  const current = people[at];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 md:hidden">
        <label htmlFor={id} className="text-xs font-medium uppercase tracking-wide text-muted">Viewing</label>
        {current && <Dot state={current.state} />}
        <select id={id} className="input !w-auto min-w-0 flex-1" value={picked} onChange={(e) => onPick(e.target.value)}>
          {people.map((p) => <option key={p.userId} value={p.userId}>{p.name} · {p.pending} pending</option>)}
        </select>
        <button type="button" className="btn-outline btn-sm" aria-label="Previous person" disabled={at <= 0} onClick={() => onPick(people[at - 1].userId)}>‹</button>
        <button type="button" className="btn-outline btn-sm" aria-label="Next person" disabled={at < 0 || at >= people.length - 1} onClick={() => onPick(people[at + 1].userId)}>›</button>
        {at >= 0 && <span className="text-xs text-muted">{at + 1} of {people.length}</span>}
      </div>
      <nav aria-label="People" className="hidden md:block">
        <ul className="panel divide-y divide-zinc-100 overflow-hidden dark:divide-zinc-800">
          {people.map((p) => {
            const on = p.userId === picked;
            const target = p.bids.target != null && p.bids.target > 0 ? p.bids.target : null;
            const line = [
              target ? `${num(p.bids.done)} / ${num(target)} bids` : `${num(p.bids.done)} bids`,
              p.todos.total > 0 && `${p.todos.done} of ${p.todos.total} to-dos`,
            ].filter(Boolean).join(' · ');
            return (
              <li key={p.userId}>
                <button
                  type="button"
                  aria-current={on ? 'true' : undefined}
                  onClick={() => onPick(p.userId)}
                  className={`block w-full px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-600 ${
                    on ? 'bg-zinc-100 shadow-[inset_3px_0_0_theme(colors.zinc.900)] dark:bg-zinc-800 dark:shadow-[inset_3px_0_0_theme(colors.zinc.100)]' : 'hover:bg-zinc-50 dark:hover:bg-zinc-900'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <Dot state={p.state} />
                    <span className="min-w-0 truncate text-sm font-semibold text-strong">{p.name}</span>
                    <span
                      aria-label={`${p.pending} pending`}
                      className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${
                        p.pending > 0 ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                      }`}
                    >
                      {p.pending}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">{line}</span>
                  {target && (
                    <span
                      role="progressbar"
                      aria-label={`${p.name}: bids today`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.min(100, Math.round((p.bids.done / target) * 100))}
                      className="mt-1 block h-1.5 overflow-hidden rounded bg-zinc-200 dark:bg-zinc-700"
                    >
                      <span
                        className={`block h-full ${p.bids.done >= target ? 'bg-success-500' : 'bg-amber-500'}`}
                        style={{ width: `${Math.min(100, (p.bids.done / target) * 100)}%` }}
                      />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
