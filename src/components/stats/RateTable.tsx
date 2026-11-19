import type { RateCell, RateGroup } from '../../api/endpoints';

const one = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const ENOUGH_BIDS = 30; // as the backend's MIN_MATURED: this many bids is enough, they just haven't matured yet

/** A rate cell's text: the rate, "in play" (enough bids, none matured enough yet) or "too few". */
export function RateText({ c }: { c: RateCell }) {
  if (!c.tooFew && c.per100 != null) return <>{one(c.per100)}</>;
  return c.bids >= ENOUGH_BIDS ? <span className="text-muted">in play</span> : <>too few</>;
}

/** Above a card's tables when the whole period is too young to compare: offer last month instead. */
export function NoMaturedNote({ days, onShowLastMonth }: { days: number; onShowLastMonth?: () => void }) {
  return (
    <p className="mt-2 text-sm text-muted">
      {`None of these bids have had ${days} days to get an interview yet, so there's nothing to compare. `}
      {onShowLastMonth && <button type="button" className="text-blue-600 underline dark:text-blue-400" onClick={onShowLastMonth}>Show last month</button>}
    </p>
  );
}

/** True when some bids exist but none has matured, you or team. */
export const noneMatured = (groups: RateGroup[]) =>
  groups.some((g) => g.you.bids + g.team.bids > 0) && groups.every((g) => g.you.matured + g.team.matured === 0);

const EXPECTED_MIN = 3; // as the backend grades: below 3 expected interviews, a gap is chance

/** Green/red when "You" is >= 1.5x / <= 0.5x the team rate, both sides have enough bids and the team rate would
 * give 3+ interviews on your matured bids. */
function tone(you: RateCell, team: RateCell) {
  if (you.tooFew || team.tooFew || you.per100 == null || !team.per100) return '';
  if ((you.matured * team.per100) / 100 < EXPECTED_MIN) return '';
  if (you.per100 >= 1.5 * team.per100) return 'font-medium text-green-700 dark:text-green-400';
  if (you.per100 <= 0.5 * team.per100) return 'font-medium text-red-700 dark:text-red-400';
  return '';
}

/** One small table of interviews per 100 matured bids by group, you vs the team. */
export default function RateTable({ title, caption, rows }: { title: string; caption?: string; rows: RateGroup[] }) {
  return (
    <div>
      <h4 className="text-sm font-medium">{title}</h4>
      {caption && <p className="text-xs text-muted">{caption}</p>}
      <div className="mt-1 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th className="pb-1 pr-3 font-normal">Group</th>
              <th className="pb-1 pr-3 font-normal">Your bids</th>
              <th className="pb-1 pr-3 font-normal">You</th>
              <th className="pb-1 font-normal">Team</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.label} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="py-1 pr-3">{g.label}</td>
                <td className="py-1 pr-3 tabular-nums">{g.you.bids}</td>
                <td className={`whitespace-nowrap py-1 pr-3 tabular-nums ${tone(g.you, g.team)}`}><RateText c={g.you} /></td>
                <td className="whitespace-nowrap py-1 tabular-nums"><RateText c={g.team} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
