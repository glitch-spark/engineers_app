import useSWR from 'swr';
import * as api from '../../api/endpoints';
import type { NeedsInputItem } from '../../api/endpoints';
import { useAuth } from '../../auth/useAuth';
import { daysWithoutResult, needsInputKey, shortDay, useNeedsInputActions } from '../../components/interview/useNeedsInputActions';
import { formatInZone, parseServerTime } from '../../lib/interviewTimezone';
import { interviewStatusLabel, stageBadgeClass, stageLabel } from '../../lib/stageBadge';
import { useInterviewTimezone } from '../../lib/useInterviewTimezone';

/** The reminder steps, in the order they are shown. */
const GROUPS: { need: NeedsInputItem['need']; title: string }[] = [
  { need: 'outcome', title: 'How did it go?' },
  { need: 'follow_up', title: 'Follow up with the company' },
  { need: 'heard_back', title: 'Did you hear back?' },
  { need: 'reason', title: 'Add the reason' },
];

/**
 * Every reminder about a round, for its owner: how a round went, the follow-up with the company a week after a held
 * round, whether that follow-up was answered, and why a round was canceled / rejected. Hidden when there are none.
 * `filterUser`: the page's User filter; only an admin's pick narrows the list (everyone else always gets their own).
 * `onSaved` refetches the list (a saved row leaves it); a row's buttons stay disabled until it settles.
 */
export default function NeedsInput({ filterUser, onSaved }: { filterUser: string; onSaved: () => unknown }) {
  const { user } = useAuth();
  const { tz } = useInterviewTimezone();
  const isAdmin = user?.role === 'admin';
  const userId = isAdmin && filterUser && filterUser !== 'all' ? filterUser : undefined;
  const { data } = useSWR(['interviews-needs-input', userId ?? ''], () => api.getNeedsInput(userId));
  const { dialog, followUp, ask, button, resultButtons, outcomeButtons } = useNeedsInputActions(onSaved);
  const items = data?.items ?? [];

  if (!items.length) return dialog;

  const buttons = (row: NeedsInputItem) => {
    switch (row.need) {
      case 'outcome':
        return outcomeButtons(row);
      case 'follow_up':
        return [button(row, 'I followed up', () => followUp(row)), ...resultButtons(row)];
      case 'heard_back':
        return resultButtons(row);
      default:
        return [button(row, 'Add reason', () => ask(row, row.status))];
    }
  };

  return (
    <section className="panel p-3" aria-labelledby="needs-input-title">
      {dialog}
      <h2 id="needs-input-title" className="text-sm font-semibold text-strong">Needs your input ({items.length})</h2>
      <p className="mt-0.5 text-xs text-muted">Rounds waiting for an answer from you.</p>
      <div className="max-h-96 overflow-y-auto">
        {GROUPS.map(({ need, title }) => {
          const rows = items.filter((row) => row.need === need);
          if (!rows.length) return null;
          return (
            <div key={need}>
              <h3 className="mt-3 text-xs font-semibold text-body">{title}</h3>
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {rows.map((row) => {
                  const missing = missingText(row, tz);
                  return (
                    <li key={needsInputKey(row)} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2 text-sm">
                      <div className="min-w-0 flex-1 basis-56">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-medium text-strong">{row.companyName || 'Untitled company'}</span>
                          {row.profileName && <span className="text-muted">{row.profileName}</span>}
                          <span className={`badge ${stageBadgeClass(row.stage)}`}>{stageLabel(row.stage)}</span>
                          <span className="tabular-nums text-muted">{roundTime(row, tz)}</span>
                        </div>
                        {(missing || (isAdmin && row.ownerName)) && (
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                            {missing && <span className="badge badge-warning">{missing}</span>}
                            {isAdmin && row.ownerName && <span className="text-muted">Owner: <span className="text-body">{row.ownerName}</span></span>}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">{buttons(row)}</div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** What the row is waiting for, in words; nothing for a round that only needs its outcome. */
function missingText(row: NeedsInputItem, tz: string): string {
  if (row.need === 'follow_up') {
    const days = daysWithoutResult(row);
    return days === null ? 'No result yet' : `No result for ${days} days`;
  }
  if (row.need === 'heard_back') {
    const day = shortDay(row.followedUpAt, tz);
    return day ? `Followed up on ${day}, no result yet` : 'Followed up, no result yet';
  }
  if (row.need === 'reason') return `${interviewStatusLabel(row.status)}, no reason`;
  return '';
}

/** A round waiting for its outcome says when it ended (when it started, if the server sent no end time). */
function roundTime(row: NeedsInputItem, tz: string): string {
  if (row.need !== 'outcome') return when(row.scheduledAt, tz);
  return row.endsAt ? `ended ${when(row.endsAt, tz)}` : `started ${when(row.scheduledAt, tz)}`;
}

function when(iso: string, tz: string): string {
  const d = parseServerTime(iso);
  if (isNaN(d.getTime())) return '—';
  return formatInZone(d, tz, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
