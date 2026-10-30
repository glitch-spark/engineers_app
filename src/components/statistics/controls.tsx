import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { StatsPeriod, StatsRegion } from '../../api/endpoints';

/** Shared by the Statistics tabs: the region filter (by each profile's region), the Month / Week / Custom switch and
 * the period stepper or custom range. */
export const REGIONS: { value: StatsRegion; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'Latam', label: 'LATAM' },
  { value: 'EU', label: 'EU' },
  { value: 'US', label: 'US' },
];

export const PERIODS: { value: StatsPeriod; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'custom', label: 'Custom' },
];

/** The longest custom range, in days (as the API allows). */
const MAX_CUSTOM_DAYS = 366;

/** The Statistics filters, shared by its tabs: `day` is any day in the week or month; `from`–`to` a custom range. */
export interface StatsFilters {
  region: StatsRegion;
  period: StatsPeriod;
  day: string;
  from: string;
  to: string;
}

export function initialFilters(): StatsFilters {
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  return { region: 'all', period: 'month', day: isoDay(today), from: isoDay(first), to: isoDay(today) };
}

/** Why the custom range can't be asked for, or null when it can (week and month always can). */
export function filtersError(f: StatsFilters): string | null {
  if (f.period !== 'custom') return null;
  if (!f.from || !f.to) return 'Pick both dates.';
  if (f.from > f.to) return 'From must be on or before To.';
  const days = Math.round((parseDay(f.to).getTime() - parseDay(f.from).getTime()) / 86_400_000) + 1;
  if (days > MAX_CUSTOM_DAYS) return 'Pick a range of a year or less.';
  return null;
}

/** The API's period, date and to for the filters. */
export function filterParams(f: StatsFilters) {
  return f.period === 'custom'
    ? { period: f.period, date: f.from, to: f.to, region: f.region }
    : { period: f.period, date: f.day, region: f.region };
}

/** "Oct 2026", "Oct 26 – Nov 1, 2026": the selected week or month, as the API labels it. */
function periodLabel(period: 'week' | 'month', iso: string): string {
  const d = parseDay(iso);
  const mon = (x: Date) => x.toLocaleString('en-US', { month: 'short' });
  if (period === 'month') return `${mon(d)} ${d.getFullYear()}`;
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  if (start.getFullYear() !== end.getFullYear()) {
    return `${mon(start)} ${start.getDate()}, ${start.getFullYear()} – ${mon(end)} ${end.getDate()}, ${end.getFullYear()}`;
  }
  return start.getMonth() === end.getMonth()
    ? `${mon(start)} ${start.getDate()}–${end.getDate()}, ${end.getFullYear()}`
    : `${mon(start)} ${start.getDate()} – ${mon(end)} ${end.getDate()}, ${end.getFullYear()}`;
}

/**
 * Region, period and the week / month stepper or the custom range, pinned under the top bar so they stay at hand
 * while the page scrolls. `children` go at the end of the row (a tab's own controls, a loading spinner).
 */
export function FilterBar({ value: f, onChange, children }: {
  value: StatsFilters; onChange: (f: StatsFilters) => void; children?: ReactNode;
}) {
  const error = filtersError(f);
  const today = isoDay(new Date());
  return (
    <div className="sticky top-16 z-20 -mt-2 flex flex-wrap items-center gap-3 border-b border-zinc-200/80 bg-background py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <Segmented label="Region" options={REGIONS} value={f.region} onChange={(region) => onChange({ ...f, region })} />
      <Segmented label="Period" options={PERIODS} value={f.period} onChange={(period) => onChange({ ...f, period })} />
      {f.period === 'custom' ? (
        <div className="flex items-center gap-2">
          <input type="date" className="input !w-auto !py-1.5" aria-label="From" value={f.from} max={today}
            onChange={(e) => onChange({ ...f, from: e.target.value })} />
          <span className="text-muted" aria-hidden>–</span>
          <input type="date" className="input !w-auto !py-1.5" aria-label="To" value={f.to} max={today}
            onChange={(e) => onChange({ ...f, to: e.target.value })} />
          {error && <span className="text-xs text-red-700 dark:text-red-400" role="alert">{error}</span>}
        </div>
      ) : (
        <PeriodNav period={f.period} day={f.day} label={periodLabel(f.period, f.day)} onDay={(day) => onChange({ ...f, day })} />
      )}
      {children}
    </div>
  );
}

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
