import type { InterviewStageEntry } from '../../api/endpoints';
import { interviewStatusLabel, normalizeInterviewStatus, stageLabel } from '../../lib/stageBadge';

const DOT: Record<string, string> = {
  scheduled: 'bg-blue-500',
  completed: 'bg-zinc-400',
  passed: 'bg-emerald-500',
  rejected: 'bg-red-500',
  canceled: 'bg-zinc-300 dark:bg-zinc-600',
};

function shortDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** One dot per round, oldest first, coloured by status. */
export default function RoundTrail({ rounds }: { rounds: InterviewStageEntry[] }) {
  if (!rounds.length) return <span className="text-muted">—</span>;
  const label = rounds
    .map((r) => `${stageLabel(r.stage)} ${interviewStatusLabel(r.status).toLowerCase()} ${shortDate(r.scheduledAt)}`.trim())
    .join(', ');
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={`Rounds: ${label}`}>
      {rounds.map((r) => (
        <span
          key={r.id}
          title={`${stageLabel(r.stage)} · ${interviewStatusLabel(r.status)} · ${shortDate(r.scheduledAt)}`}
          className={`h-2 w-2 rounded-full ${DOT[normalizeInterviewStatus(r.status)] ?? 'bg-zinc-300'}`}
        />
      ))}
    </span>
  );
}
