import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { StatsPeriod, StatsRegion } from '../../api/endpoints';

/** Shared by the Statistics tabs: the region filter (by each profile's region), the Month / Week switch and the
 * period stepper. */
export const REGIONS: { value: StatsRegion; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'Latam', label: 'LATAM' },
  { value: 'EU', label: 'EU' },
  { value: 'US', label: 'US' },
];

export const PERIODS: { value: StatsPeriod; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
];

export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** A day in the period before (-1) or after (+1) the one holding `iso`. */
export function step(period: StatsPeriod, iso: string, dir: -1 | 1): string {
  const d = parseDay(iso);
  if (period === 'week') d.setDate(d.getDate() + 7 * dir);
  else d.setMonth(d.getMonth() + dir, 1);
  return isoDay(d);
}

export function Segmented<T extends string>({
  label, options, value, onChange,
}: { label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`segmented-btn ${value === o.value ? 'segmented-btn-active' : ''}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** ‹ label › for the selected week or month; no stepping into the future. */
export function PeriodNav({
  period, day, label, onDay,
}: { period: StatsPeriod; day: string; label?: string; onDay: (day: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" className="btn-icon" onClick={() => onDay(step(period, day, -1))} aria-label={`Previous ${period}`}>
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
      <span className="min-w-[9.5rem] text-center text-sm font-medium tabular-nums" aria-live="polite">{label ?? '…'}</span>
      <button
        type="button"
        className="btn-icon"
        onClick={() => onDay(step(period, day, 1))}
        disabled={parseDay(step(period, day, 1)) > new Date()}
        aria-label={`Next ${period}`}
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
