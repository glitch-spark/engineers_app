import { ChevronLeft, ChevronRight } from 'lucide-react';
import { neighbourWeekKeys } from './weekDates';

/**
 * Pay-week navigator: prev / next, "This week" and the label. `days` are the shown week's report days (the server's
 * list, 7 or 8 long); null while loading. `isCurrent` disables next and hides "This week".
 */
export default function WeekNav({
  days,
  label,
  isCurrent,
  onChange,
}: {
  days: { day: string }[] | null;
  label: string | null;
  isCurrent: boolean;
  onChange: (week: string | null) => void;
}) {
  const near = days && neighbourWeekKeys(days);
  return (
    <div className="toolbar flex items-center gap-2">
      <button
        type="button"
        className="btn-icon"
        aria-label="Previous week"
        disabled={!near}
        onClick={() => near && onChange(near.prev)}
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
        disabled={!near || isCurrent}
        onClick={() => near && onChange(near.next)}
      >
        <ChevronRight size={18} aria-hidden />
      </button>
      {near && !isCurrent && (
        <button type="button" className="btn-outline text-xs" onClick={() => onChange(null)}>
          This week
        </button>
      )}
    </div>
  );
}
