import type { RateCell, RateGroup } from '../../api/endpoints';

const one = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const show = (c: RateCell) => (c.tooFew || c.per100 == null ? 'too few' : one(c.per100));

/** Green/red when "You" is >= 1.5x / <= 0.5x the team rate and both sides have enough bids. */
function tone(you: RateCell, team: RateCell) {
  if (you.tooFew || team.tooFew || you.per100 == null || team.per100 == null) return '';
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
                <td className={`whitespace-nowrap py-1 pr-3 tabular-nums ${tone(g.you, g.team)}`}>{show(g.you)}</td>
                <td className="whitespace-nowrap py-1 tabular-nums">{show(g.team)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
