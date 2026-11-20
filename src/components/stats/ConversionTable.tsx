import { Fragment, useId, useState } from 'react';
import type { ConversionGroup } from '../../api/endpoints';

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

/** Rate bar: width relative to the table's max rate, a thin tick at the team rate. */
function RateBar({ rate, max, teamRate }: { rate: number; max: number; teamRate?: number | null }) {
  return (
    <span aria-hidden className="relative inline-block h-2 w-16 shrink-0 rounded bg-zinc-100 sm:w-24 dark:bg-zinc-800">
      <span data-bar="fill" className="absolute inset-y-0 left-0 rounded bg-blue-500 dark:bg-blue-400" style={{ width: pctOf(Math.min(rate, max), max) }} />
      {teamRate != null && (
        <span data-bar="team" className="absolute -top-[3px] h-3.5 w-0.5 bg-zinc-900 dark:bg-zinc-100" style={{ left: pctOf(teamRate, max) }} />
      )}
    </span>
  );
}

/** One Conversion breakdown: per group, bids, matured bids, interviews and the rate (interviews per 100 matured) with a
 * bar against the team rate; ★ / ⚠ from the backend's `mark`, `few` rows muted. */
export default function ConversionTable({ title, rows, teamRate, note }: { title: string; rows: ConversionGroup[]; teamRate?: number | null; note?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const head = ['Group', 'Bids', 'Matured', 'Interviews', 'Rate'];
  // "No tracked bid" rows exist only because they got an interview: their rate is meaningless, so it is not shown
  // and doesn't set the bar scale.
  const rated = (g: ConversionGroup) => g.key !== 'unknown';
  const max = Math.max(teamRate ?? 0, ...rows.filter(rated).map((g) => g.rate ?? 0)) || 1;
  const dataRow = (g: ConversionGroup, member = false) => {
    const id = member ? `m:${g.key}` : g.label;
    return (
      <Fragment>
        <tr className={`border-t border-zinc-200 dark:border-zinc-800${member || g.few ? ' text-muted' : ''}`}>
          <td className={`py-1 pr-3${member ? ' pl-4' : ''}`}>
            {g.members ? (
              <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
                {expanded ? '▾' : '▸'} {g.label} ({g.memberCount ?? g.members.length} sites)
              </button>
            ) : g.label}
            {g.mark && MARK[g.mark]}
          </td>
          <td className="py-1 pr-3 tabular-nums">{g.bids.toLocaleString()}</td>
          <td className="py-1 pr-3 tabular-nums">{g.matured.toLocaleString()}</td>
          <td className="py-1 pr-3 tabular-nums">{g.interviews.toLocaleString()}</td>
          <td className="whitespace-nowrap py-1 tabular-nums">
            {!rated(g) ? <span className="text-xs text-muted">known only from interviews</span> : (
            <span className="flex items-center gap-2">
              {g.rate != null && <RateBar rate={g.rate} max={max} teamRate={teamRate} />}
              <span>
                {g.rate == null ? '—' : `${g.rate}%`}
                {g.few && g.rate != null && (
                  <FewWarning tip={tipFor(g, teamRate)} open={open === id} onToggle={() => setOpen(open === id ? null : id)} />
                )}
              </span>
            </span>
            )}
          </td>
        </tr>
        {g.few && open === id && (
          <tr><td colSpan={5} role="note" className="pb-1 text-xs text-amber-700 dark:text-amber-400">{tipFor(g, teamRate)}</td></tr>
        )}
      </Fragment>
    );
  };
  return (
    <div>
      <h4 className="text-sm font-medium">{title}</h4>
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
                      <tr><td colSpan={5} className="py-1 pl-4 pr-3 text-muted">…and {g.moreMembers} more sites</td></tr>
                    )}
                  </>
                )}
              </Fragment>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="py-1 text-muted">No bids.</td></tr>}
          </tbody>
        </table>
      </div>
      {teamRate != null && rows.length > 0 && <p className="mt-1 text-xs text-muted">{`Bar = rate · line = team rate (${teamRate}%)`}</p>}
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
}
