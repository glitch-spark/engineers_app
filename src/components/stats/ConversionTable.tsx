import type { ConversionGroup } from '../../api/endpoints';

/** ⚠ on a rate from under 30 matured bids; the tooltip shows on hover, focus and tap (a tap focuses the button). */
function FewWarning({ n }: { n: number }) {
  const tip = `Only ${n} matured bids — this rate can swing a lot.`;
  return (
    <button type="button" aria-label={tip} className="group relative ml-1 cursor-help text-amber-600 dark:text-amber-400">
      ⚠
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-full right-0 z-10 mb-1 w-56 whitespace-normal rounded bg-zinc-900 px-2 py-1 text-left text-xs font-normal text-white shadow group-hover:visible group-focus:visible dark:bg-zinc-100 dark:text-zinc-900"
      >
        {tip}
      </span>
    </button>
  );
}

const HEAD = ['Group', 'Bids', 'Matured', 'Interviews', 'Rate'];

/** One Conversion breakdown: per group, bids, matured bids, interviews and the rate (interviews per 100 matured). */
export default function ConversionTable({ title, rows }: { title: string; rows: ConversionGroup[] }) {
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
              <tr key={g.key} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="py-1 pr-3">{g.label}</td>
                <td className="py-1 pr-3 tabular-nums">{g.bids.toLocaleString()}</td>
                <td className="py-1 pr-3 tabular-nums">{g.matured.toLocaleString()}</td>
                <td className="py-1 pr-3 tabular-nums">{g.interviews.toLocaleString()}</td>
                <td className="whitespace-nowrap py-1 tabular-nums">
                  {g.rate == null ? '—' : `${g.rate}%`}
                  {g.few && g.rate != null && <FewWarning n={g.matured} />}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="py-1 text-muted">No bids.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
