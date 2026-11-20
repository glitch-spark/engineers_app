import { useState, type ReactNode } from 'react';
import type { ConversionSummary } from '../../api/endpoints';

const n = (v: number) => v.toLocaleString();
const GOOD = 'text-green-600 dark:text-green-400';
const BAD = 'text-red-600 dark:text-red-400';

export function Card({ title, value, rank, children }: { title: string; value: string; rank?: string | null; children: ReactNode }) {
  return (
    <div className="panel min-w-0 p-4">
      <p className="text-xs uppercase tracking-wide text-muted">{title}</p>
      <p className="my-0.5 text-2xl font-bold tabular-nums">
        <span>{value}</span>
        {rank && <span className="ml-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">{rank}</span>}
      </p>
      <div className="space-y-0.5 text-xs">{children}</div>
    </div>
  );
}

/** `▲ 12% above team median (3,504)`; nothing when there is no median to compare with or it is equal. */
export function VsMedian({ v, median }: { v: number | null; median: number | null }) {
  if (v == null || median == null || v === 0) return null;
  return <p className={v > 0 ? GOOD : BAD}>{`${v > 0 ? '▲' : '▼'} ${Math.round(Math.abs(v) * 100)}% ${v > 0 ? 'above' : 'below'} team median (${n(median)})`}</p>;
}

export const Muted = ({ children }: { children: ReactNode }) => <p className="text-muted">{children}</p>;

/** Top cards: the subject vs the team (All my profiles), or the team totals with the median per person (Whole team,
 * where the backend sends no rank). */
/** `#2 of 6`, or null without a rank (Whole team, or not ranked). */
export const rankText = (c: { rank: number | null; of: number | null }) => (c.rank != null && c.of != null ? `#${c.rank} of ${c.of}` : null);
export const CARDS_LABEL = (team: boolean) => (team ? 'Team numbers' : 'Your numbers');

export function ConversionCards({ cards, team }: { cards: ConversionSummary['cards']; team: boolean }) {
  const { bids, interviews, per100 } = cards;
  const rank = rankText;
  const median = (m: number | null) => (team && m != null ? <Muted>{`median per person ${n(m)}`}</Muted> : null);
  const rate = per100.value;
  return (
    <section aria-label={CARDS_LABEL(team)} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Card title="Bids" value={n(bids.value)} rank={rank(bids)}>
        <VsMedian v={bids.vsMedian} median={bids.median} />
        {median(bids.median)}
        <Muted>{`Self ${n(bids.self)} · bidder ${n(bids.bidder)}`}</Muted>
      </Card>
      <Card title="Interviews" value={n(interviews.value)} rank={rank(interviews)}>
        <VsMedian v={interviews.vsMedian} median={interviews.median} />
        {median(interviews.median)}
        <Muted>{`Interviews started in the period · ${n(interviews.rounds)} rounds held`}</Muted>
      </Card>
      <Card title="Interviews per 100 bids" value={rate == null ? '—' : rate.toFixed(1)} rank={rank(per100)}>
        {!team && per100.rank == null && per100.of != null && <Muted>not ranked (under 30 bids)</Muted>}
        {!team && per100.rank != null && rate != null && per100.teamRate != null && rate !== per100.teamRate && (
          <p className={rate > per100.teamRate ? GOOD : BAD}>{`${rate > per100.teamRate ? '▲' : '▼'} team ${per100.teamRate.toFixed(1)}`}</p>
        )}
        <Muted>{`${n(interviews.value)} interviews from ${n(bids.value)} bids`}</Muted>
      </Card>
    </section>
  );
}

/** What the Everyone list needs of a person, whatever the numbers are. */
interface PersonRow { userId: string; name: string; isSubject: boolean; ranks: Record<string, number | null> }
/** One number of the Everyone list: its switch label and column head, the value its bar is drawn from (null = no
 * bar) and the cell (null = "—"). `muted` greys a row out while this number ranks the list. */
export interface EveryoneMetric<R> {
  key: string; label: string; head: string;
  value: (r: R) => number | null; cell: (r: R) => ReactNode; muted?: (r: R) => boolean;
}
type ConversionPerson = ConversionSummary['everyone'][number];
const CONVERSION_METRICS: EveryoneMetric<ConversionPerson>[] = [
  { key: 'bids', label: 'Bids', head: 'Bids', value: (r) => r.bids, cell: (r) => n(r.bids) },
  { key: 'interviews', label: 'Interviews', head: 'Interviews', value: (r) => r.interviews, cell: (r) => n(r.interviews) },
  { key: 'per100', label: 'Per 100 bids', head: 'Per 100', value: (r) => r.per100, cell: (r) => r.per100?.toFixed(1) ?? null },
];

/** Everyone, ranked by the switched metric (nulls last); every row shows all the numbers, the subject highlighted;
 * an admin can click a name to view that person. The Job applies numbers by default. */
export function EveryoneList<R extends PersonRow = ConversionPerson>({ rows, onPick, metrics: given, initial = 'interviews', note }: {
  rows: R[]; onPick?: (userId: string) => void; metrics?: EveryoneMetric<R>[]; /** The metric ranked by at first. */ initial?: string; note?: string;
}) {
  const metrics = given ?? (CONVERSION_METRICS as unknown as EveryoneMetric<R>[]);
  const [metric, setMetric] = useState(initial);
  const by = metrics.find((m) => m.key === metric) ?? metrics[0];
  const sorted = [...rows].sort((a, b) => (a.ranks[metric] ?? Infinity) - (b.ranks[metric] ?? Infinity));
  const max = Math.max(0, ...rows.map((r) => by.value(r) ?? 0)) || 1;
  const cell = 'py-1 pr-3 tabular-nums';
  return (
    <div className="panel p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-semibold">Everyone</h3>
        <div role="group" aria-label="Rank by" className="flex flex-wrap gap-1">
          {metrics.map((m) => (
            <button key={m.key} type="button" aria-pressed={m.key === metric} onClick={() => setMetric(m.key)}
              className={`rounded-lg px-2.5 py-0.5 text-xs ${m.key === metric ? 'bg-zinc-100 font-semibold dark:bg-zinc-800' : 'text-muted'}`}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table aria-label="Everyone" className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs text-muted">
              {['#', 'Person', '', ...metrics.map((m) => m.head)].map((h, i) => <th key={i} className="pb-1 pr-3 font-normal">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const v = by.value(r);
              return (
                <tr key={r.userId} aria-current={r.isSubject || undefined}
                  className={`border-t border-zinc-200 dark:border-zinc-800${r.isSubject ? ' bg-blue-50 font-semibold dark:bg-blue-950/40' : ''}${by.muted?.(r) ? ' text-muted' : ''}`}>
                  <td className={cell}>{r.ranks[metric] ?? '—'}</td>
                  <td className="py-1 pr-3">
                    {onPick ? <button type="button" className="text-left hover:underline" onClick={() => onPick(r.userId)}>{r.name}</button> : r.name}
                  </td>
                  <td className="w-1/3 min-w-16 py-1 pr-3">
                    {v != null && (
                      <span aria-hidden className={`block h-2 rounded ${r.isSubject ? 'bg-blue-600 dark:bg-blue-400' : 'bg-zinc-400 dark:bg-zinc-600'}`}
                        style={{ width: `${(v / max) * 100}%` }} />
                    )}
                  </td>
                  {metrics.map((m) => <td key={m.key} className={`${cell}${m.key === metric ? ' font-semibold' : ''}`}>{m.cell(r) ?? '—'}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {note && <p className="mt-2 text-xs text-muted">{note}</p>}
    </div>
  );
}

const ICON: Record<string, ReactNode> = {
  best: <span role="img" aria-label="Works" className="text-yellow-600 dark:text-yellow-400">★</span>,
  weak: <span role="img" aria-label="Doesn't work" className="text-amber-600 dark:text-amber-400">⚠</span>,
};
// every other kind that names a problem (gap, reason, no_answer) reads as ⚠
const iconOf = (kind: string) => ICON[kind] ?? ICON.weak;

/** Key findings as the backend words them: ★ works, ⚠ doesn't; the "none" sentence as a muted line. */
export function KeyFindings({ findings, note = 'Only findings backed by at least 3 interviews (or about 3 expected) are shown.' }: {
  findings: { kind: string; text: string }[]; note?: string;
}) {
  return (
    <section aria-label="Key findings" className="panel p-4">
      <h3 className="font-semibold">Key findings</h3>
      <ul className="mt-2 space-y-1.5 text-sm">
        {findings.map((f, i) => f.kind === 'none'
          ? <li key={i} className="text-muted">{f.text}</li>
          : <li key={i}>{iconOf(f.kind)} <span>{f.text}</span></li>)}
      </ul>
      <p className="mt-2 text-xs text-muted">{note}</p>
    </section>
  );
}
