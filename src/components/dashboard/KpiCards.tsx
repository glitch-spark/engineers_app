import { ArrowDown, ArrowUp, Minus, DollarSign, FileText, Briefcase, Target } from 'lucide-react';
import type { DashboardMetrics } from '../../api/endpoints';

function formatCurrency(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function formatPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

/** Percent change vs previous period. Returns null when prior period is zero
 *  (no meaningful baseline) and we should render — instead of a misleading
 *  "+∞%". For rate metrics, return percentage-point delta instead. */
function pctDelta(now: number, prev: number): { value: number; kind: '%' } | null {
  if (prev === 0) return null;
  return { value: ((now - prev) / prev) * 100, kind: '%' };
}

function ppDelta(now: number, prev: number): { value: number; kind: 'pp' } {
  return { value: (now - prev) * 100, kind: 'pp' };
}

export type KpiKey = 'income' | 'bids' | 'interviews' | 'rate';

export default function KpiCards({
  data,
  metrics,
}: {
  data: DashboardMetrics;
  metrics?: KpiKey[];
}) {
  const want = (k: KpiKey) => !metrics || metrics.includes(k);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {want('rate') && (
        <Card
          label="Conversion (Bid → Interview)"
          value={formatPct(data.totals.bidToInterview)}
          delta={ppDelta(data.totals.bidToInterview, data.previousTotals.bidToInterview)}
          icon={<Target className="w-4 h-4" />}
          highlight
          footer={`${data.totals.interviews}/${data.totals.bids} this period`}
        />
      )}
      {want('income') && (
        <Card
          label="Income (approved)"
          value={formatCurrency(data.totals.income)}
          delta={pctDelta(data.totals.income, data.previousTotals.income)}
          icon={<DollarSign className="w-4 h-4" />}
          footer={`vs ${formatCurrency(data.previousTotals.income)} prior`}
        />
      )}
      {want('bids') && (
        <Card
          label="Bids (Resume Apps)"
          value={String(data.totals.bids)}
          delta={pctDelta(data.totals.bids, data.previousTotals.bids)}
          icon={<FileText className="w-4 h-4" />}
          footer={`vs ${data.previousTotals.bids} prior`}
        />
      )}
      {want('interviews') && (
        <Card
          label="Interviews"
          value={String(data.totals.interviews)}
          delta={pctDelta(data.totals.interviews, data.previousTotals.interviews)}
          icon={<Briefcase className="w-4 h-4" />}
          footer={`vs ${data.previousTotals.interviews} prior`}
        />
      )}
    </div>
  );
}

type DeltaShape = { value: number; kind: '%' | 'pp' } | null;

function Card({
  label,
  value,
  delta,
  icon,
  footer,
  highlight,
}: {
  label: string;
  value: string;
  delta: DeltaShape;
  icon?: React.ReactNode;
  footer?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        'panel p-4 ' +
        (highlight ? 'border-sky-200 ring-1 ring-sky-100 dark:border-sky-900 dark:ring-sky-950' : '')
      }
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">{label}</span>
        <span className="text-faint">{icon}</span>
      </div>
      <div className="mt-1 text-2xl font-semibold text-strong">{value}</div>
      <div className="mt-1.5 flex items-center justify-between text-xs">
        <DeltaPill delta={delta} />
        {footer && <span className="text-faint">{footer}</span>}
      </div>
    </div>
  );
}

function DeltaPill({ delta }: { delta: DeltaShape }) {
  if (delta === null) {
    return (
      <span className="inline-flex items-center gap-1 text-faint">
        <Minus size={12} /> n/a
      </span>
    );
  }
  const positive = delta.value > 0;
  const negative = delta.value < 0;
  const cls = positive
    ? 'pill-up'
    : negative
      ? 'pill-down'
      : 'pill-flat';
  const Icon = positive ? ArrowUp : negative ? ArrowDown : Minus;
  const sign = positive ? '+' : '';
  const suffix = delta.kind === 'pp' ? 'pp' : '%';
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded ${cls}`}>
      <Icon size={12} />
      {sign}{delta.value.toFixed(1)}{suffix}
    </span>
  );
}
