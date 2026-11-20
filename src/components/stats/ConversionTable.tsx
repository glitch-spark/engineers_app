import { Fragment, useId, useState, type ReactNode } from 'react';
import type { ConversionGroup } from '../../api/endpoints';

/** What the table needs of a row, whatever its count columns are. */
export interface RateRow<T> {
  key: string; label: string; rate: number | null; few: boolean; mark?: 'best' | 'weak' | null;
  members?: T[]; moreMembers?: number; memberCount?: number;
}
/** What differs between the tables of this family: the count columns, the wording, and which rows get a bar. */
export interface RateTableSpec<T> {
  /** Head of the first (label) column. */
  groupHead: string;
  /** The count columns between the label and the rate. */
  columns: { head: string; cell: (g: T) => ReactNode }[];
  rateHead: string;
  /** The ⚠ explanation of a `few` row. */
  fewTip: (g: T, teamRate?: number | null) => string;
  /** Rows whose rate may set the bar scale. */
  scaled: (g: T) => boolean;
  /** Rows that get a bar (default: all); the others are muted like `few` rows. */
  showBar?: (g: T) => boolean;
  /** Text shown in place of a rate that means nothing, or null. */
  unrated?: (g: T) => string | null;
  /** "sites" in "Other sites (12 sites)"; '' for a bare count. */
  memberNoun: string;
  empty: string;
}

const num = (v: number) => v.toLocaleString();
const tipFor = (g: ConversionGroup, teamRate?: number | null) => (g.fewReason === 'expected' && teamRate
  ? `Only about ${((g.matured * teamRate) / 100).toFixed(1)} interviews expected from ${g.matured.toLocaleString()} matured bids at the team rate — this rate can swing a lot.`
  : `Only ${g.matured.toLocaleString()} matured bids — this rate can swing a lot.`);

/** ⚠ on a `few` rate: `title` on hover, the text for screen readers, and a click / tap toggles the explanation as a
 * line under the row (no popover, so the table's scroll box can't clip it). */
function FewWarning({ tip, open, onToggle }: { tip: string; open: boolean; onToggle: () => void }) {
  const id = useId();
  return (
    <button type="button" title={tip} aria-label={`Thin evidence: ${tip}`} aria-describedby={id} aria-expanded={open}
      onClick={onToggle} className="ml-1 cursor-help text-amber-600 dark:text-amber-400">
      ⚠<span id={id} className="sr-only">{tip}</span>
    </button>
  );
}

const MARK = {
  best: <span role="img" aria-label="Best group" title="Best group" className="ml-1 text-yellow-600 dark:text-yellow-400">★</span>,
  weak: <span role="img" aria-label="Weakest group" title="Weakest group" className="ml-1 text-amber-600 dark:text-amber-400">⚠</span>,
};
const pctOf = (v: number, max: number) => `${+((v / max) * 100).toFixed(2)}%`;

type Tone = 'good' | 'bad' | 'same';
const TONE_CLASS: Record<Tone, string> = {
  good: 'bg-green-500 dark:bg-green-400', bad: 'bg-red-500 dark:bg-red-400', same: 'bg-zinc-400 dark:bg-zinc-500',
};
/** Clearly above / below the team rate (1.5x / 0.5x, and not too few to tell), else about the same. */
function toneOf(g: { few: boolean; rate: number | null }, teamRate?: number | null): Tone {
  if (g.few || g.rate == null || !teamRate) return 'same';
  return g.rate >= 1.5 * teamRate ? 'good' : g.rate <= 0.5 * teamRate ? 'bad' : 'same';
}

/** Rate bar: width relative to the table's highest rate, coloured by the gap to the team rate (user, 2026-11-19). */
function RateBar({ rate, max, tone }: { rate: number; max: number; tone: Tone }) {
  return (
    <span aria-hidden className="relative inline-block h-2 w-16 shrink-0 rounded bg-zinc-100 sm:w-24 dark:bg-zinc-800">
      <span data-bar="fill" data-tone={tone} className={`absolute inset-y-0 left-0 rounded ${TONE_CLASS[tone]}`}
        style={{ width: pctOf(Math.min(rate, max), max) }} />
    </span>
  );
}

// "No tracked bid" rows exist only because they got an interview: their rate is meaningless, so it is not shown
// and doesn't set the bar scale.
const tracked = (g: ConversionGroup) => g.key !== 'unknown';
/** Job applies: bids, matured bids, interviews and the rate (interviews per 100 matured). */
export const CONVERSION_SPEC: RateTableSpec<ConversionGroup> = {
  groupHead: 'Group',
  columns: [
    { head: 'Bids', cell: (g) => num(g.bids) },
    { head: 'Matured', cell: (g) => num(g.matured) },
    { head: 'Interviews', cell: (g) => num(g.interviews) },
  ],
  rateHead: 'Rate',
  fewTip: tipFor,
  // a group with under 30 matured bids (e.g. 1 bid at 100%) would shrink every other bar: it doesn't set the scale
  scaled: (g) => tracked(g) && !(g.few && g.fewReason !== 'expected' && g.matured < 30),
  unrated: (g) => (tracked(g) ? null : 'known only from interviews'),
  memberNoun: 'sites',
  empty: 'No bids.',
};

interface Props<T> {
  title: string; rows: T[]; teamRate?: number | null; note?: string;
  /** Columns and wording; the Job applies ones by default. */
  spec?: RateTableSpec<T>;
  /** The bar colour legend under the table (needs a team rate). */
  legend?: boolean;
  /** Shown between the title and the table (a legend for a column). */
  above?: ReactNode;
}

/** One breakdown table: per group, the spec's count columns and the rate with a bar coloured by the gap to the team
 * rate; ★ / ⚠ from the backend's `mark`, `few` rows muted. */
export default function ConversionTable<T extends RateRow<T> = ConversionGroup>({ title, rows, teamRate, note, spec: given, legend = true, above }: Props<T>) {
  const spec = given ?? (CONVERSION_SPEC as unknown as RateTableSpec<T>);
  const [open, setOpen] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const head = [spec.groupHead, ...spec.columns.map((c) => c.head), spec.rateHead];
  const noun = spec.memberNoun && ` ${spec.memberNoun}`;
  const showBar = spec.showBar ?? (() => true);
  const max = Math.max(teamRate ?? 0, ...rows.filter(spec.scaled).map((g) => g.rate ?? 0)) || 1;
  const dataRow = (g: T, member = false) => {
    const id = member ? `m:${g.key}` : g.label;
    const unrated = spec.unrated?.(g);
    return (
      <Fragment>
        <tr className={`border-t border-zinc-200 dark:border-zinc-800${member || g.few || !showBar(g) ? ' text-muted' : ''}`}>
          <td className={`py-1 pr-3${member ? ' pl-4' : ''}`}>
            {g.members ? (
              <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
                {expanded ? '▾' : '▸'} {g.label} ({g.memberCount ?? g.members.length}{noun})
              </button>
            ) : g.label}
            {g.mark && MARK[g.mark]}
          </td>
          {spec.columns.map((c) => <td key={c.head} className="py-1 pr-3 tabular-nums">{c.cell(g)}</td>)}
          <td className="whitespace-nowrap py-1 tabular-nums">
            {unrated ? <span className="text-xs text-muted">{unrated}</span> : (
            <span className="flex items-center gap-2">
              {g.rate != null && showBar(g) && <RateBar rate={g.rate} max={max} tone={toneOf(g, teamRate)} />}
              <span>
                {g.rate == null ? '—' : `${g.rate}%`}
                {g.few && g.rate != null && (
                  <FewWarning tip={spec.fewTip(g, teamRate)} open={open === id} onToggle={() => setOpen(open === id ? null : id)} />
                )}
              </span>
            </span>
            )}
          </td>
        </tr>
        {g.few && open === id && (
          <tr><td colSpan={head.length} role="note" className="pb-1 text-xs text-amber-700 dark:text-amber-400">{spec.fewTip(g, teamRate)}</td></tr>
        )}
      </Fragment>
    );
  };
  return (
    <div>
      <h4 className="text-sm font-medium">{title}</h4>
      {above}
      <div className="mt-1 overflow-x-auto">
        <table aria-label={title} className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs text-muted">{head.map((h) => <th key={h} className="pb-1 pr-3 font-normal">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <Fragment key={g.label}>
                {dataRow(g)}
                {g.members && expanded && (
                  <>
                    {g.members.map((m) => <Fragment key={m.key}>{dataRow(m, true)}</Fragment>)}
                    {!!g.moreMembers && (
                      <tr><td colSpan={head.length} className="py-1 pl-4 pr-3 text-muted">…and {g.moreMembers} more{noun}</td></tr>
                    )}
                  </>
                )}
              </Fragment>
            ))}
            {rows.length === 0 && <tr><td colSpan={head.length} className="py-1 text-muted">{spec.empty}</td></tr>}
          </tbody>
        </table>
      </div>
      {legend && teamRate != null && rows.length > 0 && <p className="mt-1 text-xs text-muted">{`Green = clearly above the team rate (${teamRate}%), red = clearly below, grey = about the same or too few to tell.`}</p>}
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
}
