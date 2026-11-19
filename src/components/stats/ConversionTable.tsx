import { Fragment, useId, useState } from 'react';
import type { ConversionGroup } from '../../api/endpoints';

const tipFor = (n: number) => `Only ${n} matured bids — this rate can swing a lot.`;

/** ⚠ on a rate from under 30 matured bids: `title` on hover, the text for screen readers, and a click / tap toggles
 * the explanation as a line under the row (no popover, so the table's scroll box can't clip it). */
function FewWarning({ n, open, onToggle }: { n: number; open: boolean; onToggle: () => void }) {
  const id = useId();
  const tip = tipFor(n);
  return (
    <button type="button" title={tip} aria-label={`Few matured bids: ${tip}`} aria-describedby={id} aria-expanded={open}
      onClick={onToggle} className="ml-1 cursor-help text-amber-600 dark:text-amber-400">
      ⚠<span id={id} className="sr-only">{tip}</span>
    </button>
  );
}

const HEAD = ['Group', 'Bids', 'Matured', 'Interviews', 'Rate'];

/** One Conversion breakdown: per group, bids, matured bids, interviews and the rate (interviews per 100 matured). */
export default function ConversionTable({ title, rows }: { title: string; rows: ConversionGroup[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div>
      <h4 className="text-sm font-medium">{title}</h4>
      <div className="mt-1 overflow-x-auto">
        <table aria-label={title} className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs text-muted">{HEAD.map((h) => <th key={h} className="pb-1 pr-3 font-normal">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <Fragment key={g.key}>
                <tr className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="py-1 pr-3">{g.label}</td>
                  <td className="py-1 pr-3 tabular-nums">{g.bids.toLocaleString()}</td>
                  <td className="py-1 pr-3 tabular-nums">{g.matured.toLocaleString()}</td>
                  <td className="py-1 pr-3 tabular-nums">{g.interviews.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-1 tabular-nums">
                    {g.rate == null ? '—' : `${g.rate}%`}
                    {g.few && g.rate != null && (
                      <FewWarning n={g.matured} open={open === g.key} onToggle={() => setOpen(open === g.key ? null : g.key)} />
                    )}
                  </td>
                </tr>
                {open === g.key && (
                  <tr><td colSpan={5} role="note" className="pb-1 text-xs text-amber-700 dark:text-amber-400">{tipFor(g.matured)}</td></tr>
                )}
              </Fragment>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="py-1 text-muted">No bids.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
