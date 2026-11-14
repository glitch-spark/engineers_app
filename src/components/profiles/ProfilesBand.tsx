// Profiles list: the owner's profiles together vs every owner's profiles over the compared window (spec
// 2026-11-14-profiles-list-compare-design.md). Numbers and verdicts come from lib/profileList.
import { Link } from 'react-router-dom';
import type { CompareStats, ProfileMetricsRow } from '../../api/endpoints';
import { bandCells, bandHeading, fmtListRate, strongestWeakest } from '../../lib/profileList';

/** ▲ / ▼ in the Metrics tab's up / down colours; the title says what was compared. */
export function Arrow({ dir, title }: { dir: 'up' | 'down'; title: string }) {
  return (
    <span
      className={`ml-1 text-[11px] ${dir === 'up' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
      title={title}
      aria-label={`${dir === 'up' ? 'Above' : 'Below'} all profiles. ${title}`}
      role="img"
    >
      {dir === 'up' ? '▲' : '▼'}
    </span>
  );
}

type Props = {
  /** "Your" for the signed-in owner, "These" for an admin looking at one user's profiles. */
  whose: 'Your' | 'These';
  mine: CompareStats;
  all: CompareStats;
  rangeLabel: string;
  /** Every listed (active) profile of the owner, with bids or not. */
  total: number;
  /** The compared days, first and last (ISO). */
  from: string;
  to: string;
  rows: Pick<ProfileMetricsRow, 'accountId' | 'name' | 'compare'>[];
};

export default function ProfilesBand({ whose, mine, all, rangeLabel, total, from, to, rows }: Props) {
  const cells = bandCells(mine, all);
  const head = bandHeading({ whose, total, withBids: mine.profiles, allWithBids: all.profiles, rangeLabel, from, to });
  const ends = strongestWeakest(rows);
  return (
    <section className="panel p-4 space-y-3" aria-label="Your profiles compared with all profiles">
      <div>
        <h2 className="text-sm font-medium">
          {head.title}
          <span className="text-muted font-normal"> · {head.dates}</span>
        </h2>
        <p className="text-xs text-muted">{head.note}</p>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cells.map((c) => (
          <div key={c.key}>
            <dt className="text-xs text-muted">{c.label}</dt>
            <dd className="text-sm">
              <span className="text-base font-semibold tabular-nums">{c.mine}</span>
              {c.dir && <Arrow dir={c.dir} title={`${c.mine} vs ${c.all} across all profiles`} />}
              <span className="text-muted"> · all profiles: {c.all}</span>
              {c.note && <div className="text-[11px] text-muted">{c.note}</div>}
            </dd>
          </div>
        ))}
      </dl>
      {ends && (
        <p className="text-xs text-muted">
          Best interview rate:{' '}
          <Link to={`/accounts/${ends.strongest.accountId}`} className="hover:underline text-strong">
            {ends.strongest.name || 'Unnamed'}
          </Link>{' '}
          {fmtListRate(ends.strongest.interviewsPerBid)} · Lowest:{' '}
          <Link to={`/accounts/${ends.weakest.accountId}`} className="hover:underline text-strong">
            {ends.weakest.name || 'Unnamed'}
          </Link>{' '}
          {fmtListRate(ends.weakest.interviewsPerBid)} <span>(profiles with 30+ bids)</span>
        </p>
      )}
    </section>
  );
}
