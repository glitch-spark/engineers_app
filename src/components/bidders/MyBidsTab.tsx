// The My bids tab: the owner's own bids recorded by Bid Track, one row per profile over the period's time columns,
// then a Total row (with All owners: one block per owner). A day cell or a pay-week cell opens that profile's bids in
// the read-only panel; a profile name opens its pay week, but only when a single pay week is shown (the read-only
// listing takes a day or a pay week, not a month).
import type { BidPerformance, SelfBidRow } from '../../api/endpoints';
import { BASE_URL } from '../../api/client';
import { timeColumns, type TimeColumn } from '../../lib/bidderPage';
import { fmtCount } from '../../lib/profileMetrics';
import type { SelfScope } from './SelfBidsPanel';

const colName = (c: TimeColumn) => [c.label, c.sub].filter(Boolean).join(' ');

function OwnerBlock({ row, cols, weekStart, heading, onOpen }: {
  row: SelfBidRow;
  cols: TimeColumn[];
  /** The shown pay week's first report day; null in a month or range. */
  weekStart: string | null;
  heading: boolean;
  onOpen: (scope: SelfScope) => void;
}) {
  const owner = { ownerId: row.ownerId, ownerName: row.ownerName };
  const cells = (counts: number[], who: string, profile?: { accountId: string; profileName: string }) =>
    cols.map((c, i) => {
      const n = counts[i] ?? 0;
      const target = c.day ? { day: c.day } : c.end ? { week: c.end } : null;
      return (
        <td key={c.key} className="px-1 py-1.5 text-center tabular-nums">
          {c.isFuture ? <span className="text-muted">–</span> : profile && target && n > 0 ? (
            <button type="button" className="w-full rounded-md px-1 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 focus-ring"
              aria-label={`${who}, ${colName(c)}: ${n} bids`}
              onClick={() => onOpen({ ...owner, ...profile, ...target })}>
              {fmtCount(n)}
            </button>
          ) : fmtCount(n)}
        </td>
      );
    });

  return (
    <section className="space-y-2">
      {heading && <h3 className="text-sm font-semibold text-strong">{row.ownerName}</h3>}
      <div className="table-wrap">
        <table className="w-full text-sm">
          <thead className="table-head">
            <tr>
              <th scope="col" className="px-4 py-2 text-left">Profile</th>
              {cols.map((c) => (
                <th key={c.key} scope="col" title={c.title} className="px-1 py-2 text-center font-medium">
                  {c.label}
                  {c.sub && <span className="block text-[11px] font-normal text-muted">{c.sub}</span>}
                </th>
              ))}
              <th scope="col" className="px-3 py-2 text-right">Total</th>
              <th scope="col" className="px-3 py-2 text-right">Interviews</th>
            </tr>
          </thead>
          <tbody>
            {(row.profiles ?? []).map((p) => {
              const profile = { accountId: p.accountId, profileName: p.name };
              return (
                <tr key={p.accountId} className="table-row border-t border-zinc-100 dark:border-zinc-800">
                  <th scope="row" className="px-4 py-2 text-left font-normal">
                    {weekStart ? (
                      <button type="button" className="font-medium text-strong hover:underline focus-ring"
                        onClick={() => onOpen({ ...owner, ...profile, week: weekStart })}>
                        {p.name}
                      </button>
                    ) : <span className="font-medium text-strong">{p.name}</span>}
                  </th>
                  {cells(p.weekly, p.name, profile)}
                  <td className="px-3 py-2 text-right tabular-nums">{fmtCount(p.total)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtCount(p.interviews)}</td>
                </tr>
              );
            })}
            <tr className="border-t border-zinc-200 font-medium text-strong dark:border-zinc-700">
              <th scope="row" className="px-4 py-2 text-left font-medium">Total</th>
              {cells(row.weekly, 'Total')}
              <td className="px-3 py-2 text-right tabular-nums">{fmtCount(row.total)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtCount(row.interviews)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function MyBidsTab({ data, allOwners, onOpen }: {
  data: BidPerformance;
  allOwners: boolean;
  onOpen: (scope: SelfScope) => void;
}) {
  const cols = timeColumns(data);
  const weekStart = data.payWeek?.days[0]?.day ?? null;
  const rows = (data.selfRows ?? []).filter((r) => r.total > 0 || (r.profiles ?? []).length > 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Your own bids from Bid Track · {data.label}</p>
      {rows.length === 0 ? (
        <div className="panel space-y-2 p-6 text-center text-sm text-muted">
          <p>No own bids in this period. Jobs you apply to with Bid Track signed in as yourself show up here.</p>
          <a className="btn-outline inline-flex" href={`${BASE_URL}/ext/download`}>Download Bid Track</a>
        </div>
      ) : rows.map((r) => (
        <OwnerBlock key={r.ownerId} row={r} cols={cols} weekStart={weekStart} heading={allOwners} onOpen={onOpen} />
      ))}
    </div>
  );
}
