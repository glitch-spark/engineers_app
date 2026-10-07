import { useEffect, useId, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import * as api from '../../api/endpoints';
import { useAuth } from '../../auth/useAuth';
import { notify } from '../../lib/notify';
import { useDialog } from '../../lib/useDialog';
import { profileText } from '../../lib/interviewPanelInfo';
import NameWithAvatar from '../NameWithAvatar';
import ActionMenu from '../ActionMenu';
import InterviewSummary from './InterviewSummary';
import type { InterviewFormMode } from '../../lib/interviewForm';
import { interviewStatusBadgeClass, interviewStatusLabel, stageBadgeClass, stageLabel } from '../../lib/stageBadge';
import ConfirmDialog from '../ConfirmDialog';
import InterviewForm, { type RoundPrefill } from './InterviewForm';
import type { Interview } from './types';
import { useInterviewTimezone } from '../../lib/useInterviewTimezone';

export type PanelMode = 'view' | InterviewFormMode;

const MODE_LABEL: Record<PanelMode, string> = {
  view: 'Interview',
  new: 'New interview',
  editDetails: 'Edit details',
  addRound: 'Add next round',
  editRound: 'Edit round',
};

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
  const { tz } = useInterviewTimezone();
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const [iv, setIv] = useState<Interview | null>(interview ?? null);
  const [mode, setMode] = useState<PanelMode>(interview ? initialMode : 'new');
  const [roundId, setRoundId] = useState<string | undefined>(initialRoundId);
  const [confirm, setConfirm] = useState<{ kind: 'round'; id: string } | { kind: 'interview' } | null>(null);
  const [busy, setBusy] = useState(false);
  useDialog(open && !confirm, panelRef, onClose);

  // Reset the mode only when the panel opens or switches interview — a refreshed
  // copy of the same interview (after a save) must not reopen the form.
  useEffect(() => {
    if (!open) return;
    setMode(interview ? initialMode : 'new');
    setRoundId(initialRoundId);
    setConfirm(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, interview?._id, initialMode, initialRoundId]);
  useEffect(() => {
    if (open && interview) setIv(interview);
  }, [open, interview]);

  if (!open) return null;

  const canEdit = !iv || user?.role === 'admin' || creatorId(iv) === user?.id;
  // Read-only for everyone else, whatever mode the caller asked for.
  const shownMode: PanelMode = canEdit ? mode : 'view';
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

  const setRoundConfirmed = async (id: string, confirmed: boolean) => {
    if (!iv) return;
    try {
      const saved = await api.updateInterviewStage(iv._id, id, { confirmed });
      applySaved(saved as unknown as Interview);
      notify.success(confirmed ? 'Marked confirmed' : 'Confirmation removed');
    } catch (err) {
      notify.error(err, 'Failed to update confirmation');
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
            <div className="text-xs text-muted">{MODE_LABEL[shownMode]}</div>
            <h2 id={titleId} className="truncate font-semibold text-strong">
              {shownMode === 'new' ? 'New interview' : iv?.companyName || 'Interview'}
            </h2>
            {iv && shownMode !== 'new' && (
              <p className="truncate text-xs text-muted">
                {[iv.appliedPosition, profileText(account)].filter(Boolean).join(' · ') || 'Profile'}
              </p>
            )}
            {iv && shownMode === 'view' && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {iv.stage && <span className={`badge ${stageBadgeClass(iv.stage)}`}>{stageLabel(iv.stage)}</span>}
                {iv.status && <span className={`badge ${interviewStatusBadgeClass(iv.status)}`}>{interviewStatusLabel(iv.status)}</span>}
                {(iv.ownerName || iv.ownerEmail) && (
                  <span className="ml-1 inline-flex items-center gap-1 text-xs text-muted">
                    Owner <NameWithAvatar name={iv.ownerName || iv.ownerEmail} size="sm" />
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button type="button" onClick={onClose} className="btn-icon" title="Close" aria-label="Close panel">
              <X size={16} aria-hidden />
            </button>
          </div>
        </header>

        {shownMode === 'view' && iv ? (
          <>
            <InterviewSummary
              iv={iv}
              tz={tz}
              canEdit={canEdit}
              onStatus={setRoundStatus}
              onConfirm={setRoundConfirmed}
              onEditRound={(id) => openForm('editRound', id)}
              onDeleteRound={(id) => setConfirm({ kind: 'round', id })}
              onEditDetails={() => openForm('editDetails')}
            />
            {canEdit ? (
              <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-zinc-200 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/80">
                <button type="button" className="btn text-sm" onClick={() => openForm('addRound')}>
                  <Plus size={14} aria-hidden /> Add next round
                </button>
                <button type="button" className="btn-outline text-sm" onClick={() => openForm('editDetails')}>Edit details</button>
                <span className="ml-auto">
                  <ActionMenu
                    label="More actions"
                    items={[
                      { label: 'Open full screen', onSelect: () => window.open(`/interview/${iv._id}`, '_blank', 'noopener') },
                      { label: 'Delete interview', danger: true, onSelect: () => setConfirm({ kind: 'interview' }) },
                    ]}
                  />
                </span>
              </footer>
            ) : (
              <footer className="shrink-0 border-t border-zinc-200 px-4 py-2.5 text-xs text-muted dark:border-zinc-800">
                View only{iv.ownerName || iv.ownerEmail ? ` · owned by ${iv.ownerName || iv.ownerEmail}` : ''}
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
