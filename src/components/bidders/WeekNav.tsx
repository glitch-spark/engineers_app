import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDaysKey } from './weekDates';

/**
 * Pay-week navigator: prev / next, "This week" and the label. `week` is any date inside the shown week (we pass the
 * date the week ends on); null while loading. `isCurrent` disables next and hides "This week".
 */
export default function WeekNav({
  week,
  label,
  isCurrent,
  onChange,
}: {
  week: string | null;
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
        disabled={!week}
        onClick={() => week && onChange(addDaysKey(week, -7))}
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
        disabled={!week || isCurrent}
        onClick={() => week && onChange(addDaysKey(week, 7))}
      >
        <ChevronRight size={18} aria-hidden />
      </button>
      {week && !isCurrent && (
        <button type="button" className="btn-outline text-xs" onClick={() => onChange(null)}>
          This week
        </button>
      )}
    </div>
  );
}
