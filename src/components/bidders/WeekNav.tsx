import { ChevronLeft, ChevronRight } from 'lucide-react';
import { stepPayWeekDay, type ShownWeeks } from '../../lib/bidderFilters';

/**
 * Pay-week navigator: prev / next, "This week" and the label. `shown` is the shown week's first and last report day
 * (the server's days: 7, or 8 across a schedule switch); null while loading. It steps like the Bidders list
 * (`stepPayWeekDay`): back to the day before the first, forward to the last + 7. `isCurrent` disables next and hides
 * "This week".
 */
export default function WeekNav({
  shown,
  label,
  isCurrent,
  onChange,
}: {
  shown: ShownWeeks | null;
  label: string | null;
  isCurrent: boolean;
  onChange: (week: string | null) => void;
}) {
  return (
    <div className="toolbar flex items-center gap-2">
      <button
        type="button"
        className="btn-icon"
        aria-label="Previous week"
        disabled={!shown}
        onClick={() => shown && onChange(stepPayWeekDay(shown, -1))}
      >
        <ChevronLeft size={18} aria-hidden />
      </button>
      <span className="min-w-0 flex-1 text-center font-medium text-strong sm:min-w-[13rem] sm:flex-none" aria-live="polite">
        {label ?? <span className="skeleton inline-block h-4 w-40 align-middle" />}
        {label && <span className="hidden font-normal text-muted sm:inline"> · pay week</span>}
      </span>
      <button
        type="button"
        className="btn-icon"
        aria-label="Next week"
        disabled={!shown || isCurrent}
        onClick={() => shown && onChange(stepPayWeekDay(shown, 1))}
      >
        <ChevronRight size={18} aria-hidden />
      </button>
      {shown && !isCurrent && (
        <button type="button" className="btn-outline text-xs" onClick={() => onChange(null)}>
          This week
        </button>
      )}
    </div>
  );
}
