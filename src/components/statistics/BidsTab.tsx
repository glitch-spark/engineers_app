import { useMemo, useState } from 'react';
import type { InterviewRateRow, InterviewRates } from '../../api/endpoints';
import { type StatsFilters } from './controls';
import { PerUserBars, StatTiles, StatsBody, initialsFor, pct } from './rateShared';

function day(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** Statistics → Bids: self bids (typed in daily plans) and bidder bids (Bid Track records) per user. */
export default function BidsTab({ filters, onFilters }: { filters: StatsFilters; onFilters: (f: StatsFilters) => void }) {
  return (
    <StatsBody filters={filters} onFilters={onFilters}>
      {(data) => (
        <>
          <p className="text-xs text-muted">
            Self bids are the applies typed in followed-up daily plans. Bidder bids are Bid Track’s approved and pending
            bids, in the region of the bidder’s profile.
          </p>
          <StatTiles tiles={[
            { label: 'Bids', value: data.totals.bids.toLocaleString() },
            { label: 'Self', value: data.totals.selfBids.toLocaleString() },
            { label: 'Bidder', value: data.totals.bidderBids.toLocaleString() },
            { label: 'Bidder share', value: pct(data.totals.bids ? data.totals.bidderBids / data.totals.bids : null) },
          ]} />
          <PerUserBars id="bids-per-user" title="Bids per user" chart={data.bidsChart}
            initials={initialsFor(data.bidsChart.users)} period={data.label}
            note={`Each ${data.bidsChart.unit}, one bar per user: self bids at the bottom, bidder bids on top.`}
            empty="No bids in this period."
            parts={[{ key: 'self', label: 'self' }, { key: 'bidder', label: 'bidder', faded: true }]} />
          {data.bidsRecordsStart && data.start < data.bidsRecordsStart && (
            <p className="-mt-2 text-xs text-muted">
              Bidder bids are counted from Bid Track, which starts {day(data.bidsRecordsStart)}.
            </p>
          )}
          <BidsTable data={data} />
        </>
      )}
    </StatsBody>
  );
}

type SortKey = 'name' | 'selfBids' | 'bidderBids' | 'bids' | 'share';

const share = (r: { bids: number; bidderBids: number }) => (r.bids ? r.bidderBids / r.bids : null);

function BidsTable({ data }: { data: InterviewRates }) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'bids', desc: true });
  const rows = useMemo(() => {
    const val = (r: InterviewRateRow): number | string =>
      sort.key === 'name' ? r.name.toLowerCase() : sort.key === 'share' ? share(r) ?? -1 : r[sort.key];
    return data.rows.filter((r) => r.bids > 0 || r.isMe).sort((a, b) => {
      const x = val(a), y = val(b);
      const cmp = x < y ? -1 : x > y ? 1 : 0;
      return sort.desc ? -cmp : cmp;
    });
  }, [data.rows, sort]);

  const header = (key: SortKey, label: string, align = 'text-right') => {
    const active = sort.key === key;
    return (
      <th scope="col" className={`px-3 py-2.5 ${align}`} aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : undefined}>
        <button type="button" className="inline-flex items-center gap-1 font-medium uppercase hover:text-strong"
          onClick={() => setSort({ key, desc: active ? !sort.desc : key !== 'name' })}>
          {label}
          {active && <span aria-hidden className="text-[10px] text-muted">{sort.desc ? '▼' : '▲'}</span>}
        </button>
      </th>
    );
  };

  return (
    <section className="panel overflow-hidden" aria-labelledby="bids-table-title">
      <h2 id="bids-table-title" className="card-title px-4 pt-4 pb-3">Bids per user · {data.label}</h2>
      <div className="table-wrap rounded-none border-0">
        <table className="min-w-full text-sm">
          <caption className="sr-only">Self, bidder and total bids per person</caption>
          <thead className="table-head">
            <tr>
              {header('name', 'User', 'text-left')}
              {header('selfBids', 'Self')}
              {header('bidderBids', 'Bidder')}
              {header('bids', 'Total')}
              {header('share', 'Bidder share')}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-muted">No bids in this period.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.userId} className={r.isMe ? 'bg-sky-50 dark:bg-sky-950/30' : 'table-row'}>
                <td className="px-3 py-2.5 font-medium text-strong">
                  {r.name}{r.isMe && <span className="badge badge-info ml-2">You</span>}
                </td>
                <td className="px-3 py-2.5 text-right">{r.selfBids.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-right">{r.bidderBids.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-right font-medium text-strong">{r.bids.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-right">{pct(share(r))}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="tabular-nums">
              <tr className="border-t border-zinc-200 font-medium dark:border-zinc-800">
                <td className="px-3 py-2.5 text-strong">Team total</td>
                <td className="px-3 py-2.5 text-right">{data.totals.selfBids.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-right">{data.totals.bidderBids.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-right">{data.totals.bids.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-right">{pct(share(data.totals))}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}
