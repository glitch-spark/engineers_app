import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import useSWR from 'swr';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ExternalLink,
  Minus,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import * as api from '../api/endpoints';
import type { InterviewStageEntry } from '../api/endpoints';
import { useAuth } from '../auth/useAuth';
import { useInterviewTimezone } from '../lib/useInterviewTimezone';
import ZoneSelect from '../components/interview/ZoneSelect';
import InterviewPanel, { type PanelMode } from '../components/interview/InterviewPanel';
import ConfirmDialog from '../components/ConfirmDialog';
import { notify } from '../lib/notify';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { formatProfileLabel } from '../lib/countries';
import {
  interviewStatusBadgeClass,
  interviewStatusLabel,
  normalizeInterviewStatus,
  normalizeInterviewStage,
  stageBadgeClass,
  stageLabel,
} from '../lib/stageBadge';
import ThemeToggle from '../components/ThemeToggle';
import { formatScheduledDate } from '../components/interview/format';
import type { Interview } from '../components/interview/types';
import { safeHref } from '../lib/safeHref';

type StepTone = 'done' | 'failed' | 'muted' | 'pending';

function stepTone(e: InterviewStageEntry): StepTone {
  const status = normalizeInterviewStatus(e.status);
  if (status === 'rejected') return 'failed';
  if (status === 'passed' || status === 'completed') return 'done';
  if (status === 'canceled') return 'muted';
  return 'pending';
}

const STEP_CIRCLE: Record<StepTone, string> = {
  done: 'bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-500 dark:border-emerald-500',
  failed: 'bg-red-500 text-white border-red-500',
  muted: 'bg-zinc-200 text-zinc-500 border-zinc-200 dark:bg-zinc-700 dark:text-zinc-300 dark:border-zinc-700',
  pending: 'bg-white text-sky-700 border-sky-500 dark:bg-zinc-950 dark:text-sky-300 dark:border-sky-400',
};

/** Screen-reader text for a step's outcome (the circle shows it by colour + icon). */
function stepStatusText(e: InterviewStageEntry): string {
  return e.status ? interviewStatusLabel(e.status) : 'No status';
}

const STEP_ANIM_MS = 900;

export default function InterviewFocusPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  const { data, isLoading, error, mutate } = useSWR(
    id ? (['interview', id] as const) : null,
    () => api.getInterview(id!),
    { revalidateOnFocus: false },
  );
  const iv = data as unknown as Interview | undefined;
  const history = useMemo(() => iv?.stageHistory ?? [], [iv]);

  const [panel, setPanel] = useState<{ mode: PanelMode; roundId?: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [animatingId, setAnimatingId] = useState<string | null>(null);

  const stageParam = searchParams.get('stage');
  const selected = history.find((e) => e.id === stageParam) ?? history[history.length - 1];

  const selectStage = useCallback(
    (stageId: string) => {
      const next = new URLSearchParams(searchParams);
      next.set('stage', stageId);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  useDocumentTitle(iv?.companyName ? `${iv.companyName} · Interview` : 'Interview');

  useEffect(() => {
    if (!animatingId) return;
    const t = window.setTimeout(() => setAnimatingId(null), STEP_ANIM_MS);
    return () => window.clearTimeout(t);
  }, [animatingId]);

  if (!id) return <div className="p-6 text-muted">Missing interview id.</div>;
  if (isLoading) {
    return (
      <div className="shell-content min-h-screen flex items-center justify-center text-muted" role="status">
        <div className="spinner spinner-md mr-3" aria-hidden />
        Loading interview...
      </div>
    );
  }
  if (error || !iv) {
    const status = (error as { status?: number } | undefined)?.status;
    const friendly =
      status === 403 ? 'You don\'t have access to this interview.'
      : status === 404 ? 'This interview no longer exists.'
      : 'Couldn\'t load this interview.';
    return (
      <div className="shell-content min-h-screen p-6 space-y-3">
        <div className="text-red-600 dark:text-red-400 font-medium" role="alert">{friendly}</div>
        <Link to="/interviews" className="btn-outline"><ArrowLeft size={16} aria-hidden /> Back to Interviews</Link>
      </div>
    );
  }

  const account = typeof iv.accountId === 'object' ? iv.accountId : null;
  const createdById = typeof iv.createdBy === 'string' ? iv.createdBy : iv.createdBy?._id;
  const canEdit = user?.role === 'admin' || createdById === user?.id;
  const applyUpdate = (next: Record<string, unknown>) => mutate(next, { revalidate: false });

  const onDelete = async () => {
    setConfirmDelete(false);
    try {
      await api.deleteInterview(iv._id);
      notify.success('Interview deleted');
      navigate('/interviews');
    } catch (err) {
      notify.error(err, 'Failed to delete interview');
    }
  };

  return (
    <div className="shell-content min-h-screen">
      <header className="shell-surface sticky top-0 z-30 border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link
            to={`/interviews?panel=${iv._id}`}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted hover:bg-zinc-200/60 hover:text-zinc-900 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
          >
            <ArrowLeft size={16} aria-hidden /> Interviews
          </Link>
          <div className="flex items-center gap-1.5">
            {canEdit && (
              <button type="button" className="btn-outline btn-sm" onClick={() => setPanel({ mode: 'editDetails' })}>
                Edit details
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="shell-icon-btn hover:!bg-red-50 hover:!text-red-600 dark:hover:!bg-red-950/40 dark:hover:!text-red-400"
                title="Delete interview"
                aria-label="Delete interview"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            )}
            <ZoneSelect />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-8 sm:px-6">
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {formatProfileLabel(account?.name, account?.country, 'Interview', account?.region)}
            </p>
            <h1 className="page-title mt-1 truncate">{iv.companyName || 'Untitled company'}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-body">
              <span className="font-medium">{iv.appliedPosition || 'Position not set'}</span>
              {safeHref(iv.jobUrl) && (
                <a href={safeHref(iv.jobUrl)} target="_blank" rel="noopener noreferrer" className="link-inline text-sm">
                  Job description <ExternalLink size={13} aria-hidden />
                </a>
              )}
              {iv.interviewerName && <span className="text-muted">with {iv.interviewerName}</span>}
            </div>
          </div>
          {iv.status && (
            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${interviewStatusBadgeClass(iv.status)}`}>
              {interviewStatusLabel(iv.status)}
            </span>
          )}
        </section>

        <StageStepper
          history={history}
          selectedId={selected?.id}
          animatingId={animatingId}
          canAdd={canEdit}
          adding={panel?.mode === 'addRound'}
          onSelect={(sid) => selectStage(sid)}
          onAdd={() => setPanel({ mode: 'addRound' })}
        />

        {panel && (
          <>
            <div className="fixed inset-0 top-16 z-40 bg-black/25" onClick={() => setPanel(null)} aria-hidden />
            <InterviewPanel
              open
              interview={iv}
              initialMode={panel.mode}
              initialRoundId={panel.roundId}
              onClose={() => setPanel(null)}
              onChanged={async (saved) => {
                if (!saved) {
                  navigate('/interviews');
                  return;
                }
                const before = new Set(history.map((e) => e.id));
                await applyUpdate(saved as unknown as Record<string, unknown>);
                const added = (saved.stageHistory ?? []).find((e) => !before.has(e.id));
                if (added) {
                  setAnimatingId(added.id);
                  selectStage(added.id);
                }
              }}
            />
          </>
        )}

        {selected ? (
          <StageWorkspace
            key={`workspace-${selected.id}`}
            interviewId={iv._id}
            entry={selected}
            index={history.findIndex((e) => e.id === selected.id)}
            canEdit={canEdit}
            onEditDetails={() => setPanel({ mode: 'editRound', roundId: selected.id })}
            onSaved={applyUpdate}
          />
        ) : (
          <div className="panel p-10 text-center">
            <p className="card-title">No stages yet</p>
            <p className="section-desc mt-1">
              {canEdit ? 'Add the first round with the + button to start keeping scripts and notes.' : 'Nothing has been recorded for this interview.'}
            </p>
          </div>
        )}
      </main>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete interview?"
        body={`Deletes this interview and its ${history.length} round${history.length === 1 ? '' : 's'}.`}
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function StageStepper({
  history,
  selectedId,
  animatingId,
  canAdd,
  adding,
  onSelect,
  onAdd,
}: {
  history: InterviewStageEntry[];
  selectedId?: string;
  animatingId: string | null;
  canAdd: boolean;
  adding: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  const { tz } = useInterviewTimezone();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (selectedId) tabRefs.current[selectedId]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selectedId]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    let next = -1;
    if (e.key === 'ArrowRight') next = Math.min(idx + 1, history.length - 1);
    else if (e.key === 'ArrowLeft') next = Math.max(idx - 1, 0);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = history.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const target = history[next];
    onSelect(target.id);
    tabRefs.current[target.id]?.focus();
  };

  // Steps + the trailing "+" share one track so connectors line up.
  const slots = history.length + (canAdd ? 1 : 0);

  return (
    <nav className="panel-elevated overflow-x-auto px-2 pb-4 pt-2 sm:px-4" aria-label="Interview stages">
      <ol className="flex min-w-full" role="tablist" aria-orientation="horizontal">
        {history.map((entry, i) => {
          const tone = stepTone(entry);
          const isSelected = entry.id === selectedId;
          const isNew = entry.id === animatingId;
          const nextIsNew = history[i + 1]?.id === animatingId;
          const hasConnector = i < slots - 1;
          const connectorToAdd = i === history.length - 1 && canAdd;
          return (
            <li key={entry.id} role="presentation" className="relative flex min-w-[104px] flex-1 flex-col items-center">
              {hasConnector && (
                <span
                  aria-hidden
                  className={`absolute left-1/2 top-[33px] w-full ${
                    connectorToAdd
                      ? 'border-t-2 border-dashed border-zinc-200 dark:border-zinc-700'
                      : 'h-0.5 bg-zinc-200 dark:bg-zinc-700'
                  }`}
                >
                  {!connectorToAdd && tone === 'done' && (
                    <span className={`absolute inset-0 bg-emerald-500 ${nextIsNew ? 't-step-line-fill' : ''}`} />
                  )}
                  {!connectorToAdd && tone !== 'done' && nextIsNew && (
                    <span className="t-step-line-fill absolute inset-0 bg-zinc-300 dark:bg-zinc-600" />
                  )}
                </span>
              )}
              <span className="flex h-5 items-start" aria-hidden>
                <ChevronDown
                  size={16}
                  className={`text-zinc-500 transition-opacity duration-200 dark:text-zinc-400 ${isSelected ? 'opacity-100' : 'opacity-0'}`}
                />
              </span>
              <button
                ref={(el) => { tabRefs.current[entry.id] = el; }}
                type="button"
                role="tab"
                id={`stage-tab-${entry.id}`}
                aria-selected={isSelected}
                aria-controls="stage-workspace"
                tabIndex={isSelected ? 0 : -1}
                onClick={() => onSelect(entry.id)}
                onKeyDown={(e) => onKeyDown(e, i)}
                className="group flex flex-col items-center gap-1.5 rounded-lg px-2 focus-visible:outline-none"
              >
                <span
                  className={`relative z-[1] flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-semibold tabular-nums transition-shadow duration-200 ${STEP_CIRCLE[tone]} ${
                    isSelected
                      ? 'ring-4 ring-zinc-900/10 dark:ring-white/15'
                      : 'group-hover:ring-4 group-hover:ring-zinc-900/5 dark:group-hover:ring-white/10'
                  } group-focus-visible:ring-2 group-focus-visible:ring-sky-600 group-focus-visible:ring-offset-2 dark:group-focus-visible:ring-sky-400 dark:group-focus-visible:ring-offset-zinc-950 ${isNew ? 't-step-pop' : ''}`}
                >
                  {tone === 'done' ? <Check size={14} strokeWidth={3} aria-hidden />
                    : tone === 'failed' ? <X size={14} strokeWidth={3} aria-hidden />
                    : tone === 'muted' ? <Minus size={14} strokeWidth={3} aria-hidden />
                    : i + 1}
                </span>
                <span className={`flex flex-col items-center ${isNew ? 't-step-pop' : ''}`}>
                  <span className={`whitespace-nowrap text-xs ${isSelected ? 'font-semibold text-strong' : 'font-medium text-body'}`}>
                    {stageLabel(entry.stage)}
                  </span>
                  <span className="text-[11px] tabular-nums text-faint">
                    {entry.scheduledAt ? formatScheduledDate(entry.scheduledAt, tz) : '—'}
                  </span>
                  <span className="sr-only">, {stepStatusText(entry)}</span>
                </span>
              </button>
            </li>
          );
        })}
        {canAdd && (
          <li role="presentation" className="relative flex min-w-[104px] flex-1 flex-col items-center">
            <span className="h-5" aria-hidden />
            <button
              type="button"
              onClick={onAdd}
              aria-expanded={adding}
              aria-controls="stage-composer"
              className="group flex flex-col items-center gap-1.5 rounded-lg px-2 focus-visible:outline-none"
            >
              <span
                className={`relative z-[1] flex h-7 w-7 items-center justify-center rounded-full border-2 border-dashed transition-all duration-200 group-focus-visible:ring-2 group-focus-visible:ring-sky-600 group-focus-visible:ring-offset-2 dark:group-focus-visible:ring-sky-400 dark:group-focus-visible:ring-offset-zinc-950 ${
                  adding
                    ? 'rotate-45 border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                    : 'border-zinc-300 bg-white text-zinc-500 group-hover:border-zinc-500 group-hover:text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-400 dark:group-hover:border-zinc-400 dark:group-hover:text-zinc-100'
                }`}
              >
                <Plus size={14} strokeWidth={2.5} aria-hidden />
              </span>
              <span className="whitespace-nowrap text-xs font-medium text-muted group-hover:text-strong">
                {adding ? 'Cancel' : 'Add stage'}
              </span>
            </button>
          </li>
        )}
      </ol>
    </nav>
  );
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const AUTOSAVE_MS = 800;

/** A round's header and its notes, saved as you type. */
function StageWorkspace({
  interviewId,
  entry,
  index,
  canEdit,
  onEditDetails,
  onSaved,
}: {
  interviewId: string;
  entry: InterviewStageEntry;
  index: number;
  canEdit: boolean;
  onEditDetails: () => void;
  onSaved: (next: Record<string, unknown>) => unknown;
}) {
  const { tz } = useInterviewTimezone();
  const [note, setNote] = useState(entry.note ?? '');
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const pending = useRef<{ note?: string }>({});
  const timer = useRef<number | null>(null);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const flush = useCallback(async () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const body = pending.current;
    if (body.note === undefined) return;
    pending.current = {};
    setSaveState('saving');
    try {
      const res = await api.updateInterviewStage(interviewId, entry.id, body);
      onSavedRef.current(res);
      setSaveState('saved');
    } catch (err) {
      pending.current = { ...body, ...pending.current };
      setSaveState('error');
      notify.error(err, 'Could not save');
    }
  }, [interviewId, entry.id]);

  // Switching stages unmounts this workspace; don't drop unsaved typing.
  useEffect(() => () => { void flush(); }, [flush]);

  const queue = (patch: { note?: string }) => {
    pending.current = { ...pending.current, ...patch };
    setSaveState('idle');
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void flush(); }, AUTOSAVE_MS);
  };

  return (
    <section
      id="stage-workspace"
      role="tabpanel"
      aria-labelledby={`stage-tab-${entry.id}`}
      className="panel-elevated overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200/80 px-5 py-4 dark:border-zinc-800">
        <h2 className="sr-only">{stageLabel(entry.stage)} stage</h2>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-xs font-medium tabular-nums text-faint">Stage {index + 1}</span>
          <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${stageBadgeClass(normalizeInterviewStage(entry.stage))}`}>
            {stageLabel(entry.stage)}
          </span>
          <span className="text-sm tabular-nums text-body">
            {entry.scheduledAt ? formatScheduledDate(entry.scheduledAt, tz) : 'No date'}
          </span>
          {entry.status && (
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${interviewStatusBadgeClass(entry.status)}`}>
              {interviewStatusLabel(entry.status)}
            </span>
          )}
        </div>
        {canEdit && (
          <button type="button" className="btn-outline btn-sm" onClick={onEditDetails}>
            <Pencil size={13} aria-hidden /> Edit details
          </button>
        )}
      </div>

      <div className="p-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <label htmlFor="stage-note" className="form-label">Notes for this round</label>
          <span className="text-xs text-faint" aria-live="polite">
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Not saved' : ''}
          </span>
        </div>
        <textarea
          id="stage-note"
          className="input min-h-[280px] resize-y leading-relaxed"
          value={note}
          readOnly={!canEdit}
          onChange={(e) => { setNote(e.target.value); queue({ note: e.target.value }); }}
          onBlur={() => { void flush(); }}
          placeholder={canEdit ? 'What went well, what to prepare for next time…' : 'No notes for this round.'}
        />
      </div>
    </section>
  );
}
