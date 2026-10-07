import { ChevronRight } from 'lucide-react';
import * as api from '../../api/endpoints';
import { FOLDER_TIP } from './TeamWeekTable';
import { dayParts, timeInZone } from './weekDates';

function Chip({ label, n, tone }: { label: string; n: number | null; tone: 'success' | 'warning' | 'danger' }) {
  if (n == null) return null;
  const cls = n ? `badge-${tone}` : 'badge-neutral opacity-60';
  return <span className={`${cls} tabular-nums`}>{label} {n}</span>;
}

/** One day of the bidder's pay week: date, window and Approved / Pending / Rejected chips. Opens the day's panel. */
export default function DayRow({
  day,
  counts,
  timezone,
  active,
  onOpen,
}: {
  day: api.BidWeekDay;
  counts: api.BidderWeekDay;
  timezone: string;
  /** This day's panel is open. */
  active: boolean;
  onOpen: () => void;
}) {
  const p = dayParts(day.day);
  const folder = counts.source === 'folders';

  return (
    <li className={`${day.isToday ? 'bg-sky-50/50 dark:bg-sky-950/20' : ''}`}>
      <button
        type="button"
        className={`flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-left hover:bg-zinc-50 focus-ring disabled:cursor-default disabled:hover:bg-transparent dark:hover:bg-zinc-900/60 ${
          active ? 'bg-zinc-50 dark:bg-zinc-900/60' : ''
        }`}
        aria-haspopup="dialog"
        disabled={day.isFuture}
        onClick={onOpen}
      >
        <span className="w-28 shrink-0">
          <span className="font-medium text-strong">{p.weekday} {p.date}</span>
          {day.isToday && <span className="badge-info ml-2 py-0">Today</span>}
        </span>
        <span className="hidden w-48 shrink-0 text-xs text-muted sm:inline">
          {timeInZone(day.start, timezone, true)} → {timeInZone(day.end, timezone, true)}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          {day.isFuture ? (
            <span className="text-muted">–</span>
          ) : counts.error ? (
            <span className="text-xs text-amber-700 dark:text-amber-400" title={counts.error}>⚠ Couldn&apos;t read the folder</span>
          ) : folder ? (
            <span className="text-xs text-muted" title={FOLDER_TIP}>{counts.approved} in folder · not reviewed</span>
          ) : (
            <>
              {!!counts.pending && <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden />}
              <Chip label="Approved" n={counts.approved} tone="success" />
              <Chip label="Pending" n={counts.pending} tone="warning" />
              <Chip label="Rejected" n={counts.rejected} tone="danger" />
            </>
          )}
          {!day.isFuture && <ChevronRight size={16} aria-hidden className="text-muted" />}
        </span>
      </button>
    </li>
  );
}
