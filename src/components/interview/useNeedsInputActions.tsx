import { useState, type ReactNode } from 'react';
import * as api from '../../api/endpoints';
import type { NeedsInputItem } from '../../api/endpoints';
import { formatInZone, parseServerTime } from '../../lib/interviewTimezone';
import { notify } from '../../lib/notify';
import { stageLabel } from '../../lib/stageBadge';
import { useStatusNotePrompt } from './StatusNoteDialog';

const DAY_MS = 86400000;
export const needsInputKey = (row: NeedsInputItem) => `${row.interviewId}:${row.roundId}`;

/** Whole days since the round ended (since it started, when the server sent no end time); null for a bad date. */
export function daysWithoutResult(row: NeedsInputItem): number | null {
  const days = Math.floor((Date.now() - parseServerTime(row.endsAt || row.scheduledAt).getTime()) / DAY_MS);
  return isNaN(days) ? null : days;
}

/** "Nov 6" in `tz`; '' for a missing or bad date. */
export function shortDay(iso: string | null | undefined, tz: string): string {
  const d = iso ? parseServerTime(iso) : null;
  return d && !isNaN(d.getTime()) ? formatInZone(d, tz, { month: 'short', day: 'numeric' }) : '';
}

/**
 * What a round waiting on its owner can be answered with, shared by the Interviews page's "Needs your input" and
 * Home's "Interviews waiting on you": the saves, the feedback / reason dialog (render `dialog`) and the buttons.
 * `onSaved` refetches the list the row is in; the row's controls stay disabled (`isSaving`) until it settles.
 */
export function useNeedsInputActions(onSaved: () => unknown) {
  const { prompt, dialog } = useStatusNotePrompt();
  const [saving, setSaving] = useState<string[]>([]);
  const isSaving = (row: NeedsInputItem) => saving.includes(needsInputKey(row));

  const run = async (row: NeedsInputItem, send: () => Promise<unknown>) => {
    if (isSaving(row)) return; // one save per row at a time
    const key = needsInputKey(row);
    setSaving((keys) => [...keys, key]);
    try {
      try {
        await send();
      } catch (err) {
        notify.error(err, 'Failed to save');
        return;
      }
      notify.success('Saved');
      await onSaved();
    } finally {
      setSaving((keys) => keys.filter((k) => k !== key));
    }
  };

  const setStatus = (row: NeedsInputItem, body: api.InterviewStageInput) =>
    run(row, () => api.updateInterviewStage(row.interviewId, row.roundId, body));

  /** Records "I followed up with the company". */
  const followUp = (row: NeedsInputItem) => run(row, () => api.followUpInterviewStage(row.interviewId, row.roundId));

  /** Passed asks for optional feedback; Rejected / Canceled for the reason. */
  const ask = async (row: NeedsInputItem, status: string) => {
    const answer = await prompt(status, `${row.companyName || 'Interview'} · ${stageLabel(row.stage)}`);
    if (!answer) return;
    await setStatus(row, row.need === 'reason'
      // The round keeps its status, and its note unless details were typed here.
      ? { statusReason: answer.reason, ...(answer.note ? { statusNote: answer.note } : {}) }
      : { status, statusNote: answer.note, ...(answer.reason ? { statusReason: answer.reason } : {}) });
  };

  const button = (row: NeedsInputItem, label: string, onClick: () => unknown): ReactNode => (
    <button key={label} type="button" className="btn-outline btn-sm" disabled={isSaving(row)} onClick={onClick}>{label}</button>
  );

  /** Passed / Rejected, after "No, close as rejected" on a round whose follow-up got no answer. */
  const resultButtons = (row: NeedsInputItem): ReactNode[] => [
    ...(row.need === 'heard_back'
      ? [button(row, 'No, close as rejected', () => setStatus(row, { status: 'rejected', statusReason: 'no_answer' }))]
      : []),
    button(row, 'Passed', () => ask(row, 'passed')),
    button(row, 'Rejected', () => ask(row, 'rejected')),
  ];

  return { dialog, isSaving, setStatus, followUp, ask, button, resultButtons };
}
