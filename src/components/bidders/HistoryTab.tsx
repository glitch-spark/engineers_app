import useSWR from 'swr';
import * as api from '../../api/endpoints';
import { usd } from '../../lib/money';
import { FOLDER_TIP } from './TeamWeekTable';
import { dayParts } from './weekDates';

/** Past pay weeks from the stored weekly reports, newest first; a row opens that week. */
export default function HistoryTab({ bidderId, onOpenWeek }: { bidderId: string; onOpenWeek: (week: string) => void }) {
  const { data, error, mutate } = useSWR(['bidder-reports', bidderId, 'weekly'] as const, () =>
    api.bidderReports(bidderId, 'weekly', 30),
  );

  if (error) {
    return (
      <div className="panel p-4 text-sm text-red-600 dark:text-red-400" role="alert">
        Couldn&apos;t load history.{' '}
        <button type="button" className="underline" onClick={() => mutate()}>Retry</button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="panel space-y-2 p-4" aria-busy="true">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-8 w-full" />)}
      </div>
    );
  }
  if (data.reports.length === 0) {
    return <div className="panel p-6 text-center text-sm text-muted">No weekly reports yet — the first one posts at the next weekly cutoff.</div>;
  }

  return (
    <div className="table-wrap">
      <table className="min-w-full text-sm">
        <thead className="table-head">
          <tr>
            <th scope="col" className="px-4 py-2.5">Week ending</th>
            <th scope="col" className="px-3 py-2.5 text-right">Approved</th>
            <th scope="col" className="px-3 py-2.5 text-right">Pending</th>
            <th scope="col" className="px-3 py-2.5 text-right">Rejected</th>
            <th scope="col" className="px-3 py-2.5 text-right">Rate</th>
            <th scope="col" className="px-3 py-2.5 text-right">Pay</th>
          </tr>
        </thead>
        <tbody>
          {data.reports.map((r) => {
            const p = dayParts(r.periodKey);
            const folder = r.pending == null || r.rejected == null;
            return (
              <tr key={r.periodKey} className="table-row cursor-pointer" onClick={() => onOpenWeek(r.periodKey)}>
                <th scope="row" className="px-4 py-2.5 text-left font-medium">
                  <button
                    type="button"
                    className="text-strong underline-offset-2 hover:underline focus-ring"
                    onClick={(e) => { e.stopPropagation(); onOpenWeek(r.periodKey); }}
                  >
                    {p.weekday} {p.date}
                  </button>
                  {folder && !r.error && <span className="ml-2 text-xs font-normal text-muted" title={FOLDER_TIP}>not reviewed</span>}
                </th>
                {r.error ? (
                  <td className="px-3 py-2.5 text-amber-700 dark:text-amber-400" colSpan={5}>⚠ {r.error}</td>
                ) : (
                  <>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.count ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.pending ?? <span className="text-muted">—</span>}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.rejected ?? <span className="text-muted">—</span>}</td>
                    <td className="px-3 py-2.5 text-right">{usd(r.rate)}</td>
                    <td className="px-3 py-2.5 text-right font-medium text-strong">{r.amount == null ? '—' : usd(r.amount)}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
