// Profiles list: the owner's profiles together vs every owner's profiles over the compared window (spec
// 2026-11-14-profiles-list-compare-design.md). Numbers and verdicts come from lib/profileList.
import { Link } from 'react-router-dom';
import type { BenchRegionTops, CompareStats, RegionTops } from '../../api/endpoints';
import { bandCells, bandHeading, regionTopLines } from '../../lib/profileList';
import { Arrow, CompareCell, Standing } from '../insights/compareParts';

// The cell, chip and arrow look are shared with the Bidders card (components/insights/compareParts).
export { Arrow };

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
  /** The owner's top profile per region, and the top profile in the platform there. */
  regionTops: RegionTops | null | undefined;
  benchTops: BenchRegionTops | undefined;
};

export default function ProfilesBand({ whose, mine, all, rangeLabel, total, from, to, regionTops, benchTops }: Props) {
  const cells = bandCells(mine, all);
  const head = bandHeading({ whose, total, withBids: mine.profiles, allWithBids: all.profiles, rangeLabel, from, to });
  const tops = regionTops ? regionTopLines(regionTops, benchTops) : [];
  return (
    <section className="panel p-4 space-y-4" aria-label="Your profiles compared with the platform average">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium">{head.title}</h2>
          <p className="text-xs text-muted">{head.note}</p>
        </div>
        <span className="rounded-full bg-black/5 px-2.5 py-1 text-xs text-muted dark:bg-white/10">{head.dates}</span>
      </div>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cells.map((c) => <CompareCell key={c.key} c={c} />)}
      </dl>
      {tops.length > 0 && (
        <div className="border-t border-black/5 pt-3 dark:border-white/10">
          <h3 className="text-xs font-medium text-muted">Top profiles</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[11px] text-muted">
                  <th className="py-1 pr-3 font-normal" scope="col"><span className="sr-only">Region</span></th>
                  <th className="py-1 pr-3 font-normal" scope="col">Most interviews</th>
                  <th className="py-1 pr-3 font-normal" scope="col"><span className="sr-only">vs the platform</span></th>
                  <th className="py-1 pr-3 font-normal" scope="col">Best interview rate</th>
                  <th className="py-1 font-normal" scope="col"><span className="sr-only">vs the platform</span></th>
                </tr>
              </thead>
              <tbody>
                {tops.map((t) => (
                  <tr key={t.region} className="border-t border-black/5 dark:border-white/5">
                    <th scope="row" className="py-1.5 pr-3 text-left font-medium">{t.label}</th>
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      {t.most ? <TopName id={t.most.accountId} name={t.most.name} value={t.most.text} /> : <span className="text-muted">—</span>}
                    </td>
                    <td className="py-1.5 pr-3"><Standing top={t.mostTop} /></td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      {t.best ? <TopName id={t.best.accountId} name={t.best.name} value={t.best.text} /> : <span className="text-muted">—</span>}
                    </td>
                    <td className="py-1.5"><Standing top={t.bestTop} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
