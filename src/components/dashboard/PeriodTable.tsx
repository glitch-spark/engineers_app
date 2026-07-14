import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { DashboardMetrics, DashboardSeriesPoint } from '../../api/endpoints';

type SortKey = 'bucketStart' | 'income' | 'bids' | 'interviews' | 'rate';
type Dir = 'asc' | 'desc';

function formatBucketLabel(iso: string, bucket: string): string {
  const d = new Date(iso);
  if (bucket === 'month') return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  if (bucket === 'week') {
    return `Week of ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  }
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function dollar(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export default function PeriodTable({
  data,
  metrics,
}: {
  data: DashboardMetrics;
  metrics?: ('income' | 'bids' | 'interviews' | 'rate')[];
}) {
  const want = (k: 'income' | 'bids' | 'interviews' | 'rate') =>
    !metrics || metrics.includes(k);
  const [sortKey, setSortKey] = useState<SortKey>('bucketStart');
  const [dir, setDir] = useState<Dir>('desc');

  const rows: DashboardSeriesPoint[] = useMemo(() => {
    const copy = [...data.series];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = typeof av === 'string' && typeof bv === 'string'
        ? av.localeCompare(bv)
        : (av as number) - (bv as number);
      return dir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [data.series, sortKey, dir]);

  function toggle(k: SortKey) {
    if (k === sortKey) {
      setDir(dir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(k);
      setDir(k === 'bucketStart' ? 'desc' : 'desc');
    }
  }

  if (rows.length === 0) return null;

  return (
    <section className="table-wrap">
      <header className="px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-body uppercase tracking-wide">Period breakdown</h2>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-900/80 text-xs text-muted">
            <tr>
              <Th label="Period" k="bucketStart" sortKey={sortKey} dir={dir} onClick={toggle} />
              {want('income') && <Th label="Income" k="income" sortKey={sortKey} dir={dir} onClick={toggle} alignRight />}
              {want('bids') && <Th label="Bids" k="bids" sortKey={sortKey} dir={dir} onClick={toggle} alignRight />}
              {want('interviews') && <Th label="Interviews" k="interviews" sortKey={sortKey} dir={dir} onClick={toggle} alignRight />}
              {want('rate') && <Th label="Conv %" k="rate" sortKey={sortKey} dir={dir} onClick={toggle} alignRight />}
            </tr>
          </thead>
          <tbody className="row-divider">
            {rows.map((r) => (
              <tr key={r.bucketStart} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
                <td className="px-4 py-2 text-strong">{formatBucketLabel(r.bucketStart, data.bucket)}</td>
                {want('income') && <td className="px-4 py-2 text-right text-strong">{dollar(r.income)}</td>}
                {want('bids') && <td className="px-4 py-2 text-right text-strong">{r.bids}</td>}
                {want('interviews') && <td className="px-4 py-2 text-right text-strong">{r.interviews}</td>}
                {want('rate') && <td className="px-4 py-2 text-right text-strong">{pct(r.rate)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Th({
  label, k, sortKey, dir, onClick, alignRight,
}: {
  label: string; k: SortKey; sortKey: SortKey; dir: Dir;
  onClick: (k: SortKey) => void; alignRight?: boolean;
}) {
  const active = sortKey === k;
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      className={
        'px-4 py-2 cursor-pointer select-none ' +
        (alignRight ? 'text-right' : 'text-left')
      }
      onClick={() => onClick(k)}
    >
      <span className={'inline-flex items-center gap-1 ' + (alignRight ? 'justify-end' : '')}>
        {label}
        <Icon size={11} className={active ? 'text-body' : 'text-faint'} />
      </span>
    </th>
  );
}
