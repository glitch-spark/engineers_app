import useSWR from 'swr';
import * as api from '../../api/endpoints';
import type { NeedsInputItem } from '../../api/endpoints';
import { useAuth } from '../../auth/useAuth';
import { useStatusNotePrompt } from '../../components/interview/StatusNoteDialog';
import { formatInZone } from '../../lib/interviewTimezone';
import { notify } from '../../lib/notify';
import { interviewStatusLabel, stageBadgeClass, stageLabel } from '../../lib/stageBadge';
import { useInterviewTimezone } from '../../lib/useInterviewTimezone';

/**
 * Rounds that still need something from their owner: the result of a held round, or why a round was canceled /
 * rejected. Hidden when there are none. `filterUser`: the page's User filter; only an admin's pick narrows the list
 * (everyone else always gets their own).
 */
export default function NeedsInput({ filterUser, onSaved }: { filterUser: string; onSaved: () => void }) {
  const { user } = useAuth();
  const { tz } = useInterviewTimezone();
  const isAdmin = user?.role === 'admin';
  const userId = isAdmin && filterUser && filterUser !== 'all' ? filterUser : undefined;
  const { data } = useSWR(['interviews-needs-input', userId ?? ''], () => api.getNeedsInput(userId));
  const { prompt, dialog } = useStatusNotePrompt();
  const items = data?.items ?? [];

  const save = async (row: NeedsInputItem, status: string) => {
    const answer = await prompt(status, `${row.companyName || 'Interview'} · ${stageLabel(row.stage)}`);
    if (!answer) return;
    const body: api.InterviewStageInput = row.need === 'result'
      ? { status, statusNote: answer.note, ...(answer.reason ? { statusReason: answer.reason } : {}) }
      // The round keeps its status, and its note unless details were typed here.
      : { statusReason: answer.reason, ...(answer.note ? { statusNote: answer.note } : {}) };
    try {
      await api.updateInterviewStage(row.interviewId, row.roundId, body);
      notify.success('Saved');
      onSaved();
    } catch (err) {
      notify.error(err, 'Failed to save');
    }
  };

  if (!items.length) return dialog;

  return (
    <section className="panel p-3" aria-labelledby="needs-input-title">
      {dialog}
      <h2 id="needs-input-title" className="text-sm font-semibold text-strong">Needs your input ({items.length})</h2>
      <p className="mt-0.5 text-xs text-muted">Rounds with no result yet, or canceled / rejected with no reason.</p>
      <ul className="mt-2 max-h-72 divide-y divide-zinc-200 overflow-y-auto dark:divide-zinc-800">
        {items.map((row) => (
          <li key={`${row.interviewId}:${row.roundId}`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2 text-sm">
            <div className="min-w-0 flex-1 basis-56">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-medium text-strong">{row.companyName || 'Untitled company'}</span>
                {row.profileName && <span className="text-muted">{row.profileName}</span>}
                <span className={`badge ${stageBadgeClass(row.stage)}`}>{stageLabel(row.stage)}</span>
                <span className="tabular-nums text-muted">{when(row.scheduledAt, tz)}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
                <span className="badge badge-warning">
                  {row.need === 'result' ? 'No result yet' : `${interviewStatusLabel(row.status)}, no reason`}
                </span>
                {isAdmin && row.ownerName && <span className="text-muted">Owner: <span className="text-body">{row.ownerName}</span></span>}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              {row.need === 'result' ? (
                <>
                  <button type="button" className="btn-outline btn-sm" onClick={() => save(row, 'passed')}>Passed</button>
                  <button type="button" className="btn-outline btn-sm" onClick={() => save(row, 'rejected')}>Rejected</button>
                </>
              ) : (
                <button type="button" className="btn-outline btn-sm" onClick={() => save(row, row.status)}>Add reason</button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function when(iso: string, tz: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return formatInZone(d, tz, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
