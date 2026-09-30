import { useId, useState, type FormEvent } from 'react';
import * as api from '../../api/endpoints';
import { ApiError } from '../../api/client';
import { messageOf, notify } from '../../lib/notify';
import {
  blankApplication,
  blankRound,
  missingFields,
  nextStage,
  roundFromEntry,
  roundPayload,
  type ApplicationFormState,
  type InterviewFormMode,
  type RoundFormState,
} from '../../lib/interviewForm';
import { interviewStatusBadgeClass, interviewStatusLabel, normalizeInterviewStatus, stageBadgeClass, stageLabel } from '../../lib/stageBadge';
import ApplicationFields from './ApplicationFields';
import RoundFields from './RoundFields';
import type { Interview } from './types';

export type RoundPrefill = { date?: string; time?: string; stage?: string };

function applicationFromInterview(iv: Interview): ApplicationFormState {
  return {
    accountId: typeof iv.accountId === 'object' ? iv.accountId._id : iv.accountId || '',
    companyName: iv.companyName || '',
    appliedPosition: iv.appliedPosition || '',
    jobUrl: iv.jobUrl || '',
  };
}

function formatWhen(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const SAVED_MESSAGE: Record<InterviewFormMode, string> = {
  new: 'Interview created',
  editDetails: 'Details saved',
  addRound: 'Round added',
  editRound: 'Round saved',
};

/** The one interview form: application details, a round, or both. */
export default function InterviewForm({
  mode,
  interview,
  roundId,
  prefill,
  onSaved,
  onCancel,
}: {
  mode: InterviewFormMode;
  interview?: Interview | null;
  roundId?: string;
  prefill?: RoundPrefill;
  onSaved: (saved: Interview) => void;
  onCancel: () => void;
}) {
  const idPrefix = useId();
  const history = interview?.stageHistory ?? [];
  const entry = mode === 'editRound' ? history.find((e) => e.id === roundId) : undefined;
  const previous = history[history.length - 1];
  const previousOpen = mode === 'addRound' && !!previous
    && ['scheduled', 'completed'].includes(normalizeInterviewStatus(previous.status));

  const [app, setApp] = useState<ApplicationFormState>(() => (interview ? applicationFromInterview(interview) : blankApplication()));
  const [round, setRound] = useState<RoundFormState>(() => (entry
    ? roundFromEntry(entry)
    : blankRound({
      date: prefill?.date,
      time: prefill?.time,
      stage: prefill?.stage ?? (mode === 'addRound' ? nextStage(history) : ''),
    })));
  const [markPrevious, setMarkPrevious] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const showApp = mode === 'new' || mode === 'editDetails';
  const showRound = mode !== 'editDetails';
  const missing = missingFields(mode, showApp ? app : null, showRound ? round : null);
  const hintId = `${idPrefix}-missing`;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (missing.length || saving) return;
    setSaving(true);
    setError('');
    try {
      let saved: unknown;
      const appBody = {
        accountId: app.accountId,
        companyName: app.companyName.trim(),
        appliedPosition: app.appliedPosition.trim(),
        jobUrl: app.jobUrl.trim(),
      };
      if (mode === 'new') {
        saved = await api.createInterview({ ...appBody, round: roundPayload(round) });
      } else if (mode === 'editDetails' && interview) {
        saved = await api.updateInterview(interview._id, appBody);
      } else if (mode === 'addRound' && interview) {
        saved = await api.addInterviewStage(interview._id, {
          ...roundPayload(round),
          markPreviousPassed: previousOpen && markPrevious,
        });
      } else if (mode === 'editRound' && interview && roundId) {
        const body = roundPayload(round);
        if (!round.callerEnabled && entry?.caller?.enabled) body.caller = { enabled: false };
        saved = await api.updateInterviewStage(interview._id, roundId, body);
      }
      notify.success(SAVED_MESSAGE[mode]);
      onSaved(saved as Interview);
    } catch (err) {
      setError(err instanceof ApiError ? messageOf(err, 'Failed to save') : 'Failed to save');
      notify.error(err, 'Failed to save interview');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
        {showApp && (
          <ApplicationFields app={app} onChange={(p) => setApp((a) => ({ ...a, ...p }))} idPrefix={idPrefix} />
        )}
        {mode === 'editDetails' && history.length > 0 && (
          <section aria-label="Rounds">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Rounds</h3>
            <ul className="space-y-1 text-sm">
              {[...history].reverse().map((e) => (
                <li key={e.id} className="flex items-center gap-2">
                  <span className={`badge ${stageBadgeClass(e.stage)}`}>{stageLabel(e.stage)}</span>
                  <span className="text-muted tabular-nums">{formatWhen(e.scheduledAt)}</span>
                  <span className={`badge ${interviewStatusBadgeClass(e.status)}`}>{interviewStatusLabel(e.status)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {showRound && (
          <RoundFields
            round={round}
            onChange={(p) => setRound((r) => ({ ...r, ...p }))}
            idPrefix={idPrefix}
            legend={mode === 'new' ? 'First round' : mode === 'addRound' ? 'Next round' : 'Round'}
          />
        )}
        {previousOpen && previous && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={markPrevious} onChange={(e) => setMarkPrevious(e.target.checked)} />
            Mark {stageLabel(previous.stage)} as Passed
          </label>
        )}
      </div>
      <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/80">
        {missing.length > 0 && (
          <p id={hintId} className="mr-auto text-xs text-muted">Required: {missing.join(', ')}</p>
        )}
        <button type="button" className="btn-outline text-sm" onClick={onCancel} disabled={saving}>Cancel</button>
        <button
          type="submit"
          className="btn text-sm"
          disabled={saving || missing.length > 0}
          aria-describedby={missing.length ? hintId : undefined}
        >
          {saving ? 'Saving…' : mode === 'new' ? 'Create interview' : mode === 'addRound' ? 'Add round' : 'Save'}
        </button>
      </footer>
    </form>
  );
}
