// Shared look of the "yours vs the platform" cards (Profiles and Bidders pages): one colour per meaning — green
// better, red worse, grey too few to judge — the gap spelled out, two bars, and standing chips against the best on
// the platform. Numbers and verdicts come from lib/profileList and lib/bidderInsights.
import type { BandCell, PlatformTop } from '../../lib/profileList';

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

type Tone = BandCell['tone'];

export const TONE: Record<NonNullable<Tone> | 'none', { box: string; num: string; bar: string }> = {
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

function CellBars({ bar, tone }: { bar: BandCell['bar']; tone: Tone }) {
  if (!bar) return null;
  const t = TONE[tone ?? 'none'];
  return (
    <div className="mt-2 space-y-1" aria-hidden>
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-black/5 dark:bg-white/10">
          <div className={`h-1.5 rounded-full ${t.bar}`} style={{ width: `${Math.max(2, bar.mine * 100)}%` }} />
        </div>
        <span className="w-14 text-[10px] text-muted">yours</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-black/5 dark:bg-white/10">
          <div className="h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500" style={{ width: `${Math.max(2, bar.all * 100)}%` }} />
        </div>
        <span className="w-14 text-[10px] text-muted">platform</span>
      </div>
    </div>
  );
}

/** One card cell: label, your number (coloured), arrow and gap, the platform average, bars and a note. */
export function CompareCell({ c }: { c: Omit<BandCell, 'key'> }) {
  const t = TONE[c.tone ?? 'none'];
  return (
    <div className={`rounded-lg p-3 ring-1 ${t.box}`}>
      <dt className="text-xs text-muted">{c.label}</dt>
      <dd className="mt-1 text-sm">
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <span className={`text-lg font-semibold tabular-nums ${t.num}`}>{c.mine}</span>
          {c.dir && <Arrow dir={c.dir} title={`Yours ${c.mine} · platform average ${c.all}`} />}
          {c.gap && <span className={`text-xs font-medium tabular-nums ${c.tone === 'thin' || !c.tone ? 'text-muted' : t.num}`}>{c.gap}</span>}
        </div>
        <div className="text-xs text-muted">platform average: {c.all}</div>
        <CellBars bar={c.bar} tone={c.tone} />
        {c.note && <div className="mt-1 text-[11px] text-muted">{c.note}</div>}
      </dd>
    </div>
  );
}

/** My standing against the best on the platform: a chip (🏆 lead / near / far) and the leader to look up. */
export function Standing({ top }: { top: PlatformTop | null }) {
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
