import type { StatsTeam } from '../../api/endpoints';

/** Where the subject sits in the team's spread: min-max track, p25-p75 shaded, median tick, subject dot. */
export default function RangeBar({ team, value }: { team: StatsTeam; value: number }) {
  const span = team.max - team.min;
  const at = (v: number) => (span > 0 ? Math.min(100, Math.max(0, ((v - team.min) / span) * 100)) : 50);
  const lab = 'absolute -translate-x-1/2 text-[10px] text-muted';
  return (
    <div className="relative mt-6 mb-6 h-7" aria-label="You versus team range">
      <div className="absolute inset-x-0 top-3 h-1 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="absolute top-2.5 h-2 rounded bg-indigo-200 dark:bg-indigo-900"
        style={{ left: `${at(team.p25)}%`, width: `${at(team.p75) - at(team.p25)}%` }} />
      <div data-testid="range-median" className="absolute top-1 h-5 w-0.5 bg-zinc-500" style={{ left: `${at(team.median)}%` }} />
      <span className={`${lab} -top-3`} style={{ left: `${at(team.median)}%` }}>median</span>
      <div data-testid="range-you" className="absolute top-[7px] h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-white bg-[#2a78d6] dark:border-zinc-950"
        style={{ left: `${at(value)}%` }} />
      <span className={`${lab} top-6`} style={{ left: `${at(value)}%` }}>you</span>
      <span className="absolute left-0 top-6 text-[10px] text-muted">{team.min.toLocaleString()}</span>
      <span className="absolute right-0 top-6 text-[10px] text-muted">{team.max.toLocaleString()}</span>
    </div>
  );
}
