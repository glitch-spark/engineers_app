// Profiles list: the owner's profiles together vs every owner's profiles over the compared window (spec
// 2026-11-14-profiles-list-compare-design.md). Numbers and verdicts come from lib/profileList.
import { Link } from 'react-router-dom';
import type { CompareStats, ProfileMetricsRow } from '../../api/endpoints';
import { bandCells, fmtListRate, shortDay, strongestWeakest } from '../../lib/profileList';

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
  /** Shown as "since <day>" when the compared window starts after the range's first day. */
  since: string | null;
  rows: Pick<ProfileMetricsRow, 'accountId' | 'name' | 'compare'>[];
};

export default function ProfilesBand({ whose, mine, all, rangeLabel, since, rows }: Props) {
  const cells = bandCells(mine, all);
  const ends = strongestWeakest(rows);
  return (
    <section className="panel p-4 space-y-3" aria-label="Your profiles compared with all profiles">
      <h2 className="text-sm font-medium">
        {whose} {mine.profiles} {mine.profiles === 1 ? 'profile' : 'profiles'} with bids vs {all.profiles} across all owners
        <span className="text-muted font-normal"> · {rangeLabel}{since ? ` (since ${shortDay(since)})` : ''}</span>
      </h2>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cells.map((c) => (
          <div key={c.key}>
            <dt className="text-xs text-muted">{c.label}</dt>
            <dd className="text-sm">
              <span className="text-base font-semibold tabular-nums">{c.mine}</span>
              {c.dir && <Arrow dir={c.dir} title={`${c.mine} vs ${c.all} across all profiles`} />}
              <span className="text-muted"> vs {c.all}</span>
              {c.note && <div className="text-[11px] text-muted">{c.note}</div>}
            </dd>
          </div>
        ))}
      </dl>
      {ends && (
        <p className="text-xs text-muted">
          Strongest:{' '}
          <Link to={`/accounts/${ends.strongest.accountId}`} className="hover:underline text-strong">
            {ends.strongest.name || 'Unnamed'}
          </Link>{' '}
          {fmtListRate(ends.strongest.interviewsPerBid)} interviews per bid · Weakest:{' '}
          <Link to={`/accounts/${ends.weakest.accountId}`} className="hover:underline text-strong">
            {ends.weakest.name || 'Unnamed'}
          </Link>{' '}
          {fmtListRate(ends.weakest.interviewsPerBid)}
        </p>
      )}
    </section>
  );
}
