// Profiles list: the owner's profiles together vs every owner's profiles over the compared window (spec
// 2026-11-14-profiles-list-compare-design.md). Numbers and verdicts come from lib/profileList.
import { Link } from 'react-router-dom';
import type { BenchRegionTops, CompareStats, RegionTops } from '../../api/endpoints';
import { bandCells, bandHeading, regionTopLines } from '../../lib/profileList';

/** ▲ / ▼ in the Metrics tab's up / down colours; the title says what was compared. */
export function Arrow({ dir, title }: { dir: 'up' | 'down'; title: string }) {
  return (
    <span
      className={`ml-1 text-[11px] ${dir === 'up' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
      title={title}
      aria-label={`${dir === 'up' ? 'Above' : 'Below'} all users' average. ${title}`}
      role="img"
    >
      {dir === 'up' ? '▲' : '▼'}
    </span>
  );
}

function TopName({ id, name, value }: { id: string; name: string; value: string }) {
  return (
    <>
      <Link to={`/accounts/${id}`} className="hover:underline text-strong">{name || 'Unnamed'}</Link> {value}
    </>
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
  /** The owner's top profile per region, and all users' best numbers there (no names). */
  regionTops: RegionTops | null | undefined;
  benchTops: BenchRegionTops | undefined;
};

export default function ProfilesBand({ whose, mine, all, rangeLabel, total, from, to, regionTops, benchTops }: Props) {
  const cells = bandCells(mine, all);
  const head = bandHeading({ whose, total, withBids: mine.profiles, allWithBids: all.profiles, rangeLabel, from, to });
  const tops = regionTops ? regionTopLines(regionTops, benchTops) : [];
  return (
    <section className="panel p-4 space-y-3" aria-label="Your profiles compared with the average of all users' profiles">
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
              {c.dir && <Arrow dir={c.dir} title={`Yours ${c.mine} · all users' average ${c.all}`} />}
              <span className="text-muted"> · all users' avg: {c.all}</span>
              {c.note && <div className="text-[11px] text-muted">{c.note}</div>}
            </dd>
          </div>
        ))}
      </dl>
      {tops.length > 0 && (
        <div className="border-t border-black/5 pt-3 dark:border-white/10">
          <h3 className="text-xs font-medium text-muted">Top profiles</h3>
          <ul className="mt-1 space-y-1">
            {tops.map((t) => (
              <li key={t.region} className="text-xs">
                <span className="inline-block w-12 font-medium">{t.label}</span>
                <span className="text-muted">Most interviews: </span>
                {t.most ? <TopName id={t.most.accountId} name={t.most.name} value={t.most.text} /> : '—'}
                {t.mostAll && <span className="text-muted"> ({t.mostAll})</span>}
                <span className="text-muted"> · Best interview rate: </span>
                {t.best ? <TopName id={t.best.accountId} name={t.best.name} value={t.best.text} /> : '—'}
                {t.bestAll && <span className="text-muted"> ({t.bestAll})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
