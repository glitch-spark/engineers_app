import { useEffect, useId, useRef, useState } from 'react';
import { Maximize2, Pencil, PhoneCall, Plus, Trash2, X } from 'lucide-react';
import * as api from '../../api/endpoints';
import { useAuth } from '../../auth/useAuth';
import { notify } from '../../lib/notify';
import { useDialog } from '../../lib/useDialog';
import { formatProfileLabel } from '../../lib/countries';
import type { InterviewFormMode } from '../../lib/interviewForm';
import {
  INTERVIEW_STATUSES,
  interviewStatusBadgeClass,
  normalizeInterviewStatus,
  stageBadgeClass,
  stageLabel,
} from '../../lib/stageBadge';
import ConfirmDialog from '../ConfirmDialog';
import InterviewForm, { type RoundPrefill } from './InterviewForm';
import type { Interview } from './types';

export type PanelMode = 'view' | InterviewFormMode;

const MODE_LABEL: Record<PanelMode, string> = {
  view: 'Interview',
  new: 'New interview',
  editDetails: 'Edit details',
  addRound: 'Add next round',
  editRound: 'Edit round',
};

function formatRange(start?: string | null, end?: string | null): string {
  if (!start) return '—';
  const s = new Date(start);
  if (isNaN(s.getTime())) return '—';
  const day = s.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const t = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const e = end ? new Date(end) : null;
  return e && !isNaN(e.getTime()) ? `${day}, ${t(s)} – ${t(e)}` : `${day}, ${t(s)}`;
}

function creatorId(iv: Interview): string {
  return typeof iv.createdBy === 'object' ? iv.createdBy._id : iv.createdBy;
}

/** One side panel for viewing an interview and every create/edit action. */
export default function InterviewPanel({
  open,
  interview,
  initialMode = 'view',
  initialRoundId,
  prefill,
  onClose,
  onChanged,
}: {
  open: boolean;
  interview?: Interview | null;
  initialMode?: PanelMode;
  initialRoundId?: string;
  prefill?: RoundPrefill;
  onClose: () => void;
  /** Called with the saved interview, or null after it was deleted. */
  onChanged?: (iv: Interview | null) => void;
}) {
  const { user } = useAuth();
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const [iv, setIv] = useState<Interview | null>(interview ?? null);
  const [mode, setMode] = useState<PanelMode>(interview ? initialMode : 'new');
  const [roundId, setRoundId] = useState<string | undefined>(initialRoundId);
  const [confirm, setConfirm] = useState<{ kind: 'round'; id: string } | { kind: 'interview' } | null>(null);
  const [busy, setBusy] = useState(false);
  useDialog(open && !confirm, panelRef, onClose);

  useEffect(() => {
    if (!open) return;
    setIv(interview ?? null);
    setMode(interview ? initialMode : 'new');
    setRoundId(initialRoundId);
    setConfirm(null);
  }, [open, interview, initialMode, initialRoundId]);

  if (!open) return null;

  const canEdit = !iv || user?.role === 'admin' || creatorId(iv) === user?.id;
  const rounds = [...(iv?.stageHistory ?? [])].reverse();
  const account = iv && typeof iv.accountId === 'object' ? iv.accountId : null;

  const applySaved = (saved: Interview | null) => {
    setIv(saved);
    onChanged?.(saved);
  };

  const setRoundStatus = async (id: string, status: string) => {
    if (!iv) return;
    try {
      const saved = await api.updateInterviewStage(iv._id, id, { status });
      applySaved(saved as unknown as Interview);
      notify.success('Status updated');
    } catch (err) {
      notify.error(err, 'Failed to update status');
    }
  };

  const runDelete = async () => {
    if (!iv || !confirm) return;
    setBusy(true);
    try {
      if (confirm.kind === 'round') {
        const saved = await api.deleteInterviewStage(iv._id, confirm.id);
        applySaved(saved as unknown as Interview);
        notify.success('Round deleted');
        setConfirm(null);
      } else {
        await api.deleteInterview(iv._id);
        notify.success('Interview deleted');
        setConfirm(null);
        onChanged?.(null);
        onClose();
      }
    } catch (err) {
      notify.error(err, 'Failed to delete');
    } finally {
      setBusy(false);
    }
  };

  const openForm = (next: PanelMode, id?: string) => {
    setRoundId(id);
    setMode(next);
  };

  return (
    <>
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="fixed bottom-0 right-0 top-16 z-50 flex w-full max-w-[560px] flex-col border-l border-zinc-200 bg-white shadow-strong dark:border-zinc-800 dark:bg-zinc-950 sm:w-[min(560px,45vw)] sm:min-w-[380px]"
      >
        <header className="flex shrink-0 items-start justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="min-w-0">
            <div className="text-xs text-muted">{MODE_LABEL[mode]}</div>
            <h2 id={titleId} className="truncate font-semibold text-strong">
              {mode === 'new' ? 'New interview' : iv?.companyName || 'Interview'}
            </h2>
            {iv && mode !== 'new' && (
              <p className="truncate text-xs text-muted">
                {formatProfileLabel(account?.name || account?.email, account?.country, 'Profile', account?.region)}
                {iv.appliedPosition ? ` · ${iv.appliedPosition}` : ''}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {iv && (
              <a href={`/interview/${iv._id}`} target="_blank" rel="noreferrer" className="btn-icon" title="Open full screen" aria-label="Open full screen in a new tab">
                <Maximize2 size={16} aria-hidden />
              </a>
            )}
            <button type="button" onClick={onClose} className="btn-icon" title="Close" aria-label="Close panel">
              <X size={16} aria-hidden />
            </button>
          </div>
        </header>

        {mode === 'view' && iv ? (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {iv.jobUrl && (
                <a href={iv.jobUrl} target="_blank" rel="noreferrer" className="block truncate text-sm text-blue-700 hover:underline dark:text-sky-400">
                  {iv.jobUrl}
                </a>
              )}
              <section aria-labelledby={`${titleId}-rounds`}>
                <h3 id={`${titleId}-rounds`} className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Rounds ({rounds.length})
                </h3>
                <ul className="space-y-2">
                  {rounds.map((e) => {
                    const status = normalizeInterviewStatus(e.status);
                    return (
                      <li key={e.id} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`badge ${stageBadgeClass(e.stage)}`}>{stageLabel(e.stage)}</span>
                          {e.caller?.enabled && <PhoneCall size={14} className="text-sky-600" aria-label="Caller requested" />}
                          <span className="text-sm tabular-nums text-body">{formatRange(e.scheduledAt, e.endsAt)}</span>
                        </div>
                        {e.interviewerName && <p className="mt-1 text-xs text-muted">with {e.interviewerName}</p>}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {canEdit ? (
                            <select
                              aria-label={`Status of ${stageLabel(e.stage)}`}
                              className={`select focus-ring h-8 w-auto py-0 text-xs ${interviewStatusBadgeClass(status)}`}
                              value={status}
                              onChange={(ev) => setRoundStatus(e.id, ev.target.value)}
                            >
                              {INTERVIEW_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                          ) : (
                            <span className={`badge ${interviewStatusBadgeClass(status)}`}>{INTERVIEW_STATUSES.find((s) => s.value === status)?.label ?? '—'}</span>
                          )}
                          {canEdit && (
                            <span className="ml-auto flex gap-1">
                              <button type="button" className="btn-icon" onClick={() => openForm('editRound', e.id)} aria-label={`Edit ${stageLabel(e.stage)} round`} title="Edit round">
                                <Pencil size={15} aria-hidden />
                              </button>
                              <button type="button" className="btn-icon" onClick={() => setConfirm({ kind: 'round', id: e.id })} aria-label={`Delete ${stageLabel(e.stage)} round`} title="Delete round">
                                <Trash2 size={15} aria-hidden />
                              </button>
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>
            {canEdit && (
              <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-zinc-200 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/80">
                <button type="button" className="btn text-sm" onClick={() => openForm('addRound')}>
                  <Plus size={14} aria-hidden /> Add next round
                </button>
                <button type="button" className="btn-outline text-sm" onClick={() => openForm('editDetails')}>Edit details</button>
                <button type="button" className="btn-outline ml-auto text-sm text-red-700 dark:text-red-400" onClick={() => setConfirm({ kind: 'interview' })}>
                  Delete interview
                </button>
              </footer>
            )}
          </>
        ) : (
          <InterviewForm
            key={`${mode}:${roundId ?? ''}`}
            mode={mode === 'view' ? 'new' : mode}
            interview={iv}
            roundId={roundId}
            prefill={prefill}
            onSaved={(saved) => {
              applySaved(saved);
              setMode('view');
            }}
            onCancel={() => (iv ? setMode('view') : onClose())}
          />
        )}
      </aside>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.kind === 'interview' ? 'Delete interview?' : 'Delete round?'}
        body={confirm?.kind === 'interview'
          ? `Deletes this interview and its ${rounds.length} round${rounds.length === 1 ? '' : 's'}.`
          : "Deletes this round's notes, transcript and extracted questions."}
        disabledReason={confirm?.kind === 'round' && rounds.length <= 1 ? 'An interview needs at least one round.' : undefined}
        busy={busy}
        onConfirm={runDelete}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}
