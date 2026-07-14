import { useEffect } from 'react';
import useSWR from 'swr';
import { useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import * as api from '../../api/endpoints';
import KpiCards, { type KpiKey } from './KpiCards';
import MetricsChart from './MetricsChart';

const RANGES: { label: string; days: number }[] = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '1y', days: 365 },
];

const BUCKETS: { label: string; value: 'day' | 'week' | 'month' }[] = [
  { label: 'Daily', value: 'day' },
  { label: 'Weekly', value: 'week' },
  { label: 'Monthly', value: 'month' },
];

/** Heuristic — pick a sensible bucket for the chosen range so a year of
 *  daily points doesn't render unreadable. User can override after. */
function defaultBucketFor(days: number): 'day' | 'week' | 'month' {
  if (days <= 14) return 'day';
  if (days <= 120) return 'week';
  return 'month';
}

export default function DashboardOverview({
  metrics,
  title = 'Overview',
  storageNs = '',
}: {
  metrics?: KpiKey[];
  title?: string;
  storageNs?: string;
}) {
  const [params, setParams] = useSearchParams();
  // Namespaced URL keys so multiple Overview instances on the same page (one
  // per tab) don't fight over the same query params.
  const rk = storageNs ? `${storageNs}_range` : 'range';
  const bk = storageNs ? `${storageNs}_bucket` : 'bucket';
  const range = Number(params.get(rk) || 30);
  const bucket = (params.get(bk) as 'day' | 'week' | 'month' | null) || defaultBucketFor(range);

  useEffect(() => {
    if (!params.get(bk)) {
      const next = new URLSearchParams(params);
      next.set(bk, bucket);
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setRange(days: number) {
    const next = new URLSearchParams(params);
    next.set(rk, String(days));
    next.set(bk, defaultBucketFor(days));
    setParams(next, { replace: true });
  }

  function setBucket(b: 'day' | 'week' | 'month') {
    const next = new URLSearchParams(params);
    next.set(bk, b);
    setParams(next, { replace: true });
  }

  const { data, error, isLoading } = useSWR(
    ['dashboard-metrics', range, bucket, storageNs],
    () => api.getDashboardMetrics({ range, bucket }),
    { revalidateOnFocus: false },
  );

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-body uppercase tracking-wide">{title}</h2>
        <div className="flex items-center gap-3">
          <div className="segmented">
            {BUCKETS.map((b) => (
              <button
                key={b.value}
                type="button"
                onClick={() => setBucket(b.value)}
                className={
                  'segmented-btn ' +
                  (bucket === b.value ? 'segmented-btn-active-neutral' : '')
                }
              >
                {b.label}
              </button>
            ))}
          </div>
          <div className="segmented">
            {RANGES.map((r) => (
              <button
                key={r.days}
                type="button"
                onClick={() => setRange(r.days)}
                className={
                  'segmented-btn ' +
                  (range === r.days ? 'segmented-btn-active' : '')
                }
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {error ? (
        <div className="alert-error text-sm text-red-700">
          Failed to load metrics.
        </div>
      ) : isLoading || !data ? (
        <div className="panel p-4 flex items-center gap-2 text-sm text-muted">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading metrics…
        </div>
      ) : (
        <>
          <KpiCards data={data} metrics={metrics} />
          <MetricsChart data={data} metrics={metrics} />
        </>
      )}
    </section>
  );
}
