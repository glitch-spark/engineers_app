import { useState } from 'react';
import useSWR from 'swr';
import * as api from '../../api/endpoints';
import { todayInputValue } from '../../lib/week';
import NameWithAvatar from '../NameWithAvatar';
import Segmented from '../jobApplies/Segmented';

const TOP = 5;

const RANGES: { value: api.DashboardCompareRange; label: string }[] = [
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: '30d', label: 'Last 30 days' },
];

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const count = new Intl.NumberFormat('en-US');

const METRICS: { key: keyof api.DashboardCompare['metrics']; title: string; format: (n: number) => string }[] = [
  { key: 'bids', title: 'Bids', format: (n) => count.format(n) },
  { key: 'interviews', title: 'Interviews', format: (n) => count.format(n) },
  { key: 'earnings', title: 'Earnings', format: (n) => currency.format(n) },
];

type Row = api.DashboardCompareMetric['rows'][number];

/** "You vs team": bids, interviews and earnings ranked across the team, with the viewed user highlighted. */
export default function CompareCard({ userId }: { userId?: string }) {
  const [range, setRange] = useState<api.DashboardCompareRange>('week');
  const today = todayInputValue();
  const { data, error, isLoading, mutate } = useSWR(
    ['dashboard-compare', userId ?? 'me', range, today],
    () => api.getDashboardCompare({ range, userId, today }),
    { keepPreviousData: true },
  );

  return (
    <section className="panel p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="card-title">{userId ? 'Compared with the team' : 'You vs team'}</h2>
        <Segmented label="Period" value={range} options={RANGES} onChange={setRange} />
      </div>

      {error && !data ? (
        <div>
          <p className="mb-3 text-sm text-muted">Couldn&rsquo;t load the comparison.</p>
          <button type="button" className="btn-outline" onClick={() => mutate()}>
            Retry
          </button>
        </div>
      ) : isLoading || !data ? (
        <div className="grid gap-4 md:grid-cols-3">
          {METRICS.map((m) => (
            <div key={m.key} className="skeleton h-48 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {METRICS.map((m) => (
            <MetricBoard
              key={m.key}
              title={m.title}
              metric={data.metrics[m.key]}
              subjectId={data.subjectId}
              isSelf={!userId}
              format={m.format}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function MetricBoard({
  title,
  metric,
  subjectId,
  isSelf,
  format,
}: {
  title: string;
  metric: api.DashboardCompareMetric;
  subjectId: string;
  isSelf: boolean;
  format: (n: number) => string;
}) {
  const top = metric.rows.slice(0, TOP);
  const mine = metric.rows.find((r) => r.userId === subjectId);
  const mineBelow = mine && !top.includes(mine) ? mine : null;
  const { rank, outOf } = metric.subject;

  return (
    <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-strong">{title}</h3>
        {rank != null && (
          <span className="text-xs text-muted">
            #{rank} of {outOf}
          </span>
        )}
      </div>
      {metric.rows.length === 0 ? (
        <p className="text-sm text-muted">No one to compare yet.</p>
      ) : (
        <ol className="space-y-1">
          {top.map((r) => (
            <BoardRow key={r.userId} row={r} highlight={r.userId === subjectId} isSelf={isSelf} format={format} />
          ))}
          {mineBelow && (
            <>
              <li aria-hidden className="px-2 text-xs text-muted">
                …
              </li>
              <BoardRow row={mineBelow} highlight isSelf={isSelf} format={format} />
            </>
          )}
        </ol>
      )}
    </div>
  );
}

function BoardRow({
  row,
  highlight,
  isSelf,
  format,
}: {
  row: Row;
  highlight: boolean;
  isSelf: boolean;
  format: (n: number) => string;
}) {
  return (
    <li
      className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm ${
        highlight ? 'bg-sky-50 font-semibold text-sky-900 dark:bg-sky-950/40 dark:text-sky-200' : ''
      }`}
      aria-current={highlight ? 'true' : undefined}
    >
      <span className="w-6 shrink-0 text-right tabular-nums text-muted">{row.rank}</span>
      <span className="min-w-0 flex-1 truncate">
        <NameWithAvatar name={highlight && isSelf ? 'You' : row.name} imageUrl={row.image} size="sm" />
      </span>
      <span className="tabular-nums">{format(row.value)}</span>
    </li>
  );
}
