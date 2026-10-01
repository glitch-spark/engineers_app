import type { InterviewStageEntry } from '../../api/endpoints';
import { interviewStatusLabel, normalizeInterviewStatus, stageLabel } from '../../lib/stageBadge';
import { formatInZone } from '../../lib/interviewTimezone';

export const STATUS_DOT: Record<string, string> = {
  scheduled: 'bg-blue-500',
  completed: 'bg-zinc-400',
  passed: 'bg-emerald-500',
  rejected: 'bg-red-500',
  canceled: 'bg-zinc-300 dark:bg-zinc-600',
};

function shortDate(iso: string | null | undefined, tz: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : formatInZone(d, tz, { month: 'short', day: 'numeric' });
}

/** One dot per round, oldest first, coloured by status. */
export default function RoundTrail({ rounds, tz }: { rounds: InterviewStageEntry[]; tz: string }) {
  if (!rounds.length) return <span className="text-muted">—</span>;
  const label = rounds
    .map((r) => `${stageLabel(r.stage)} ${interviewStatusLabel(r.status).toLowerCase()} ${shortDate(r.scheduledAt, tz)}`.trim())
    .join(', ');
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={`Rounds: ${label}`}>
      {rounds.map((r) => (
        <span
          key={r.id}
          title={`${stageLabel(r.stage)} · ${interviewStatusLabel(r.status)} · ${shortDate(r.scheduledAt, tz)}`}
          className={`h-2 w-2 rounded-full ${STATUS_DOT[normalizeInterviewStatus(r.status)] ?? 'bg-zinc-300'}`}
        />
      ))}
    </span>
  );
}
