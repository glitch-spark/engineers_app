/** Small interview display helpers shared by the interview pages. The form and
 *  side panel live in `./interview/` (InterviewForm, InterviewPanel). */
import { PhoneCall } from 'lucide-react';
import { normalizeSlackTimezone } from '../lib/slackDigestPrefs';
import { INTERVIEW_STATUSES, getInterviewMovementTrail, stageBadgeClass, stageLabel } from '../lib/stageBadge';
import type { Interview, InterviewCaller } from './interview/types';

export {
  CALLER_METHOD_OPTIONS,
  type AccountRef,
  type CallerMethod,
  type CreatorRef,
  type Interview,
  type InterviewCaller,
} from './interview/types';
export { TranscriptUploadButton } from './interview/TranscriptUploadButton';

export type SelectOption = { value: string; label: string };

/** Status choices for forms and filters: the five round statuses. */
export const FORM_STATUSES = INTERVIEW_STATUSES;

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "10:30 AM EDT" for a caller start in its own timezone. */
export function formatCallerTime(caller?: InterviewCaller | null): string {
  if (!caller?.enabled || !caller.startsAt) return 'Time TBD';
  const d = new Date(caller.startsAt);
  if (isNaN(d.getTime())) return 'Time TBD';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: normalizeSlackTimezone(caller.timezone),
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(d);
}

export function formatScheduledDate(iso?: string | null): string {
  if (!iso) return '—';
  // YYYY-MM-DD — parse as local calendar date (avoid UTC midnight shift).
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [, m, d] = iso.split('-').map(Number);
    return `${MONTH_NAMES[m - 1]} ${d}`;
  }
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

export function openInterviewFullScreen(id: string) {
  window.open(`/interview/${id}`, '_blank', 'noopener');
}

export function CallerBadge({ interview }: { interview: Interview }) {
  const caller = interview.caller;
  if (!caller?.enabled) return null;
  const names = (caller.coworkers ?? []).map((c) => c.name || c.email).filter(Boolean);
  const title = names.length ? `Caller mode · with ${names.join(', ')}` : 'Caller mode';
  return (
    <span
      className="inline-flex items-center gap-1 rounded-[6px] border border-accent-600/30 bg-accent-600/10 px-1.5 py-0.5 text-[10px] font-medium text-accent-700 dark:text-accent-300 tabular-nums"
      title={title}
    >
      <PhoneCall size={10} aria-hidden />
      <span>Caller · {formatCallerTime(caller)}</span>
    </span>
  );
}

export function StageMovementTrail({ interview }: { interview: Interview }) {
  const trail = getInterviewMovementTrail(interview);
  // Prefer an explicit trail; fall back to current stage.
  const shown = trail.length > 0 ? trail : (interview.stage ? [interview.stage] : []);
  if (shown.length === 0) return null;
  return (
    <div className="mt-1.5 pl-1 flex flex-wrap items-center gap-1">
      {shown.map((s, i) => (
        <span key={`${s}-${i}`} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-[10px] text-faint" aria-hidden>→</span>}
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-[6px] text-[10px] font-medium border ${stageBadgeClass(s)}`}>
            {stageLabel(s)}
          </span>
        </span>
      ))}
    </div>
  );
}
