// Profiles list: the owner's profiles together vs every owner's profiles over the compared window (spec
// 2026-11-14-profiles-list-compare-design.md). Numbers and verdicts come from lib/profileList.
import { Link } from 'react-router-dom';
import type { BenchRegionTops, CompareStats, RegionTops } from '../../api/endpoints';
import { bandCells, bandHeading, regionTopLines, type BandCell, type PlatformTop } from '../../lib/profileList';

/** ▲ / ▼ in the Metrics tab's up / down colours; the title says what was compared. */
export function Arrow({ dir, title }: { dir: 'up' | 'down'; title: string }) {
  return (
    <span
      className={`ml-1 text-[11px] ${dir === 'up' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
      title={title}
      aria-label={`${dir === 'up' ? 'Above' : 'Below'} the platform average. ${title}`}
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
  /** The owner's top profile per region, and the top profile in the platform there. */
  regionTops: RegionTops | null | undefined;
  benchTops: BenchRegionTops | undefined;
};

// One colour per meaning: green better, red worse, grey too few to judge; bids / week stays neutral.
const TONE: Record<NonNullable<BandCell['tone']> | 'none', { box: string; num: string; bar: string }> = {
  good: { box: 'bg-emerald-50 ring-emerald-200 dark:bg-emerald-950/30 dark:ring-emerald-900', num: 'text-emerald-700 dark:text-emerald-300', bar: 'bg-emerald-500' },
  bad: { box: 'bg-red-50 ring-red-200 dark:bg-red-950/30 dark:ring-red-900', num: 'text-red-700 dark:text-red-300', bar: 'bg-red-500' },
  thin: { box: 'bg-zinc-50 ring-zinc-200 dark:bg-zinc-900/40 dark:ring-zinc-800', num: 'text-zinc-500 dark:text-zinc-400', bar: 'bg-zinc-400' },
  none: { box: 'ring-black/5 dark:ring-white/10', num: '', bar: 'bg-sky-500' },
};

const CHIP: Record<'lead' | 'near' | 'far', string> = {
  lead: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
  near: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  far: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
};

function CellBars({ c }: { c: BandCell }) {
  if (!c.bar) return null;
  const t = TONE[c.tone ?? 'none'];
  return (
    <div className="mt-2 space-y-1" aria-hidden>
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-black/5 dark:bg-white/10">
          <div className={`h-1.5 rounded-full ${t.bar}`} style={{ width: `${Math.max(2, c.bar.mine * 100)}%` }} />
        </div>
        <span className="w-14 text-[10px] text-muted">yours</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-black/5 dark:bg-white/10">
          <div className="h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500" style={{ width: `${Math.max(2, c.bar.all * 100)}%` }} />
        </div>
        <span className="w-14 text-[10px] text-muted">platform</span>
      </div>
    </div>
  );
}

function Standing({ top }: { top: PlatformTop | null }) {
  if (!top) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {top.chip && (
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${CHIP[top.chip.kind]}`}>
          {top.chip.kind === 'lead' ? `🏆 ${top.chip.text}` : top.chip.text}
        </span>
      )}
      {top.leader && <span className="text-muted">{top.chip ? 'top: ' : 'Best on the platform: '}{top.leader}</span>}
    </span>
  );
}

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
        {cells.map((c) => {
          const t = TONE[c.tone ?? 'none'];
          return (
            <div key={c.key} className={`rounded-lg p-3 ring-1 ${t.box}`}>
              <dt className="text-xs text-muted">{c.label}</dt>
              <dd className="mt-1 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-1.5">
                  <span className={`text-lg font-semibold tabular-nums ${t.num}`}>{c.mine}</span>
                  {c.dir && <Arrow dir={c.dir} title={`Yours ${c.mine} · platform average ${c.all}`} />}
                  {c.gap && <span className={`text-xs font-medium tabular-nums ${c.tone === 'thin' || !c.tone ? 'text-muted' : t.num}`}>{c.gap}</span>}
                </div>
                <div className="text-xs text-muted">platform average: {c.all}</div>
                <CellBars c={c} />
                {c.note && <div className="mt-1 text-[11px] text-muted">{c.note}</div>}
              </dd>
            </div>
          );
        })}
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
