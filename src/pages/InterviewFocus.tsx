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
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import * as api from '../api/endpoints';
import type { InterviewStageEntry } from '../api/endpoints';
import { useAuth } from '../auth/useAuth';
import { notify } from '../lib/notify';
import { formatProfileLabel } from '../lib/countries';
import {
  BOARD_FORM_STAGES,
  INTERVIEW_STAGE_ORDER,
  TECH_SUB_STAGES,
  normalizeInterviewStage,
  resolveInterviewStage,
  stageBadgeClass,
  stageLabel,
  toBoardFormStage,
  toTechSubStage,
} from '../lib/stageBadge';
import Select from '../components/Select';
import ThemeToggle from '../components/ThemeToggle';
import {
  TranscriptUploadButton,
  formatScheduledDate,
  type Interview,
} from '../components/InterviewEditPanel';

const STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'passed', label: 'Passed' },
  { value: 'failed', label: 'Failed' },
  { value: 'no_show', label: 'No Show' },
  { value: 'rescheduled', label: 'Rescheduled' },
  { value: 'canceled', label: 'Canceled' },
];

const statusLabel = (s?: string | null) => STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s ?? '';

const statusBadgeClass = (s?: string | null) => {
  switch (s) {
    case 'scheduled':
    case 'rescheduled':
      return 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800';
    case 'passed':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800';
    case 'failed':
      return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800';
    case 'no_show':
      return 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800';
    default:
      return 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700';
  }
};

type StepTone = 'done' | 'failed' | 'muted' | 'pending';

function stepTone(e: InterviewStageEntry): StepTone {
  if (normalizeInterviewStage(e.stage) === 'rejected' || e.status === 'failed') return 'failed';
  if (e.status === 'passed' || e.status === 'completed') return 'done';
  if (e.status === 'canceled' || e.status === 'no_show') return 'muted';
  return 'pending';
}

const STEP_CIRCLE: Record<StepTone, string> = {
  done: 'bg-emerald-500 text-white border-emerald-500 dark:bg-emerald-500 dark:border-emerald-500',
  failed: 'bg-red-500 text-white border-red-500',
  muted: 'bg-zinc-200 text-zinc-500 border-zinc-200 dark:bg-zinc-700 dark:text-zinc-300 dark:border-zinc-700',
  pending: 'bg-white text-sky-700 border-sky-500 dark:bg-zinc-950 dark:text-sky-300 dark:border-sky-400',
};

/** YYYY-MM-DD for a date input; calendar-date prefix wins so UTC noon never shifts the day. */
function toDateInput(raw?: string | null): string {
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Suggest the next round after the current one, skipping rounds already on the path. */
function suggestNextStage(history: InterviewStageEntry[]): string {
  const used = new Set(history.map((e) => normalizeInterviewStage(e.stage)));
  const tip = normalizeInterviewStage(history[history.length - 1]?.stage);
  const order = INTERVIEW_STAGE_ORDER.filter((s) => s !== 'rejected');
  const start = tip ? order.indexOf(tip as (typeof order)[number]) + 1 : 0;
  return order.slice(Math.max(start, 0)).find((s) => !used.has(s)) ?? '';
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

  const [composer, setComposer] = useState<{ mode: 'add' } | { mode: 'edit'; stageId: string } | null>(null);
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

  useEffect(() => {
    if (iv?.companyName) document.title = `${iv.companyName} · Interview`;
  }, [iv?.companyName]);

  useEffect(() => {
    if (!animatingId) return;
    const t = window.setTimeout(() => setAnimatingId(null), STEP_ANIM_MS);
    return () => window.clearTimeout(t);
  }, [animatingId]);

  if (!id) return <div className="p-6 text-muted">Missing interview id.</div>;
  if (isLoading) {
    return (
      <div className="shell-content min-h-screen flex items-center justify-center text-muted">
        <div className="spinner spinner-md mr-3" />
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
        <div className="text-red-600 dark:text-red-400 font-medium">{friendly}</div>
        <Link to="/interviews" className="btn-outline"><ArrowLeft size={16} aria-hidden /> Back to Interviews</Link>
      </div>
    );
  }

  const account = typeof iv.accountId === 'object' ? iv.accountId : null;
  const createdById = typeof iv.createdBy === 'string' ? iv.createdBy : iv.createdBy?._id;
  const canEdit = user?.role === 'admin' || createdById === user?.id;
  const applyUpdate = (next: Record<string, unknown>) => mutate(next, { revalidate: false });

  const onDelete = async () => {
    if (!confirm('Delete this interview and all its stages? This cannot be undone.')) return;
    try {
      await api.deleteInterview(iv._id);
      notify.success('Interview deleted');
      navigate('/interviews');
    } catch (err) {
      notify.error(err, 'Failed to delete interview');
    }
  };

  const editingEntry = composer?.mode === 'edit' ? history.find((e) => e.id === composer.stageId) : undefined;

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
            <Link to={`/interviews/${iv._id}/review`} className="btn-outline btn-sm">
              <Sparkles size={14} aria-hidden /> AI Review
            </Link>
            {canEdit && (
              <button
                type="button"
                onClick={onDelete}
                className="shell-icon-btn hover:!bg-red-50 hover:!text-red-600 dark:hover:!bg-red-950/40 dark:hover:!text-red-400"
                title="Delete interview"
                aria-label="Delete interview"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            )}
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
              {iv.jobUrl && (
                <a href={iv.jobUrl} target="_blank" rel="noopener noreferrer" className="link-inline text-sm">
                  Job description <ExternalLink size={13} aria-hidden />
                </a>
              )}
              {iv.interviewerName && <span className="text-muted">with {iv.interviewerName}</span>}
            </div>
          </div>
          {iv.status && (
            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(iv.status)}`}>
              {statusLabel(iv.status)}
            </span>
          )}
        </section>

        <StageStepper
          history={history}
          selectedId={selected?.id}
          animatingId={animatingId}
          canAdd={canEdit}
          adding={composer?.mode === 'add'}
          onSelect={(sid) => {
            selectStage(sid);
            if (composer?.mode === 'edit') setComposer({ mode: 'edit', stageId: sid });
          }}
          onAdd={() => setComposer(composer?.mode === 'add' ? null : { mode: 'add' })}
        />

        {composer && (composer.mode === 'add' || editingEntry) && (
          <StageComposer
            key={composer.mode === 'add' ? 'composer-add' : `composer-${composer.stageId}`}
            mode={composer.mode}
            entry={editingEntry}
            defaultStage={suggestNextStage(history)}
            currentTip={normalizeInterviewStage(history[history.length - 1]?.stage)}
            canDelete={history.length > 1}
            onCancel={() => setComposer(null)}
            onSave={async (body) => {
              if (composer.mode === 'add') {
                const res = await api.addInterviewStage(iv._id, body as api.InterviewStageInput & { stage: string });
                const nextHistory = (res.stageHistory as InterviewStageEntry[] | undefined) ?? [];
                const added = nextHistory[nextHistory.length - 1];
                await applyUpdate(res);
                setComposer(null);
                if (added) {
                  setAnimatingId(added.id);
                  selectStage(added.id);
                }
                notify.success(`${stageLabel(body.stage)} added`);
              } else {
                const res = await api.updateInterviewStage(iv._id, composer.stageId, body);
                await applyUpdate(res);
                setComposer(null);
                notify.success('Stage updated');
              }
            }}
            onDelete={async () => {
              if (composer.mode !== 'edit') return;
              if (!confirm('Delete this stage, including its script and notes?')) return;
              const res = await api.deleteInterviewStage(iv._id, composer.stageId);
              await applyUpdate(res);
              setComposer(null);
              const next = new URLSearchParams(searchParams);
              next.delete('stage');
              setSearchParams(next, { replace: true });
              notify.success('Stage deleted');
            }}
          />
        )}

        {selected ? (
          <StageWorkspace
            key={`workspace-${selected.id}`}
            interviewId={iv._id}
            entry={selected}
            index={history.findIndex((e) => e.id === selected.id)}
            canEdit={canEdit}
            onEditDetails={() => setComposer({ mode: 'edit', stageId: selected.id })}
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
                  } group-focus-visible:ring-4 group-focus-visible:ring-sky-500/40 ${isNew ? 't-step-pop' : ''}`}
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
                    {entry.scheduledAt ? formatScheduledDate(entry.scheduledAt) : '—'}
                  </span>
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
                className={`relative z-[1] flex h-7 w-7 items-center justify-center rounded-full border-2 border-dashed transition-all duration-200 group-focus-visible:ring-4 group-focus-visible:ring-sky-500/40 ${
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

type StageFormBody = { stage: string; scheduledAt: string; status: string };

function StageComposer({
  mode,
  entry,
  defaultStage,
  currentTip,
  canDelete,
  onCancel,
  onSave,
  onDelete,
}: {
  mode: 'add' | 'edit';
  entry?: InterviewStageEntry;
  defaultStage: string;
  currentTip?: string;
  canDelete: boolean;
  onCancel: () => void;
  onSave: (body: StageFormBody) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const initialStage = entry?.stage ?? defaultStage;
  const [boardStage, setBoardStage] = useState(toBoardFormStage(initialStage));
  const [techSubStage, setTechSubStage] = useState(toTechSubStage(initialStage));
  const [date, setDate] = useState(entry ? toDateInput(entry.scheduledAt) || todayInput() : todayInput());
  const [status, setStatus] = useState(entry ? entry.status || '' : 'scheduled');
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.querySelector<HTMLElement>('select, input')?.focus({ preventScroll: true });
    root.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, []);

  const resolved = resolveInterviewStage(boardStage, techSubStage);
  const sameAsTip = mode === 'add' && !!currentTip && resolved === currentTip;
  const canSave = !!resolved && !!date && !busy && !sameAsTip;

  const run = async (fn: () => Promise<void>, failMsg: string) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      notify.error(err, failMsg);
    } finally {
      setBusy(false);
    }
  };

  const row = 'grid items-center gap-x-4 gap-y-1.5 sm:grid-cols-[112px_minmax(0,1fr)]';

  return (
    <form
      id="stage-composer"
      ref={rootRef}
      className="panel-elevated t-step-panel p-5"
      aria-label={mode === 'add' ? 'Add stage' : 'Edit stage'}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSave) return;
        void run(() => onSave({ stage: resolved, scheduledAt: date, status }), 'Could not save stage');
      }}
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="card-title">{mode === 'add' ? 'New stage' : `Edit ${stageLabel(entry?.stage)}`}</h2>
        <button type="button" className="btn-icon" onClick={onCancel} aria-label="Close">
          <X size={16} aria-hidden />
        </button>
      </div>

      <div className="grid gap-x-10 gap-y-3 lg:grid-cols-2">
        <div className={row}>
          <label className="form-label" htmlFor="stage-composer-stage">Stage</label>
          <Select
            id="stage-composer-stage"
            value={boardStage}
            onChange={(v) => { setBoardStage(v); setTechSubStage(''); }}
            options={[...BOARD_FORM_STAGES]}
            placeholder="Select a stage"
          />
        </div>
        <div className={row}>
          <label className="form-label" htmlFor="stage-composer-date">Scheduled date</label>
          <input
            id="stage-composer-date"
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
        {boardStage === 'tech' && (
          <div className={row}>
            <label className="form-label" htmlFor="stage-composer-sub">Tech round</label>
            <Select
              id="stage-composer-sub"
              value={techSubStage}
              onChange={setTechSubStage}
              options={[...TECH_SUB_STAGES]}
              placeholder="Select a Tech round"
            />
          </div>
        )}
        <div className={row}>
          <label className="form-label" htmlFor="stage-composer-status">Status</label>
          <Select
            id="stage-composer-status"
            value={status}
            onChange={setStatus}
            options={[{ value: '', label: '— None —' }, ...STATUS_OPTIONS]}
          />
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-2">
        <div>
          {mode === 'edit' && canDelete && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(onDelete, 'Could not delete stage')}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              <Trash2 size={14} aria-hidden /> Delete stage
            </button>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {sameAsTip && (
            <p className="text-xs text-muted">Pick a different stage — this round is already the latest.</p>
          )}
          <div className="flex gap-2">
            <button type="button" className="btn-outline" onClick={onCancel} disabled={busy}>Cancel</button>
            <button type="submit" className="btn" disabled={!canSave}>
              {busy ? 'Saving…' : mode === 'add' ? 'Add stage' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

type WorkspaceTab = 'script' | 'notes' | 'questions';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const AUTOSAVE_MS = 800;

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
  const [tab, setTab] = useState<WorkspaceTab>('script');
  const [transcript, setTranscript] = useState(entry.transcript ?? '');
  const [note, setNote] = useState(entry.note ?? '');
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const pending = useRef<{ transcript?: string; note?: string }>({});
  const timer = useRef<number | null>(null);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const flush = useCallback(async () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const body = pending.current;
    if (body.transcript === undefined && body.note === undefined) return;
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

  const queue = (patch: { transcript?: string; note?: string }) => {
    pending.current = { ...pending.current, ...patch };
    setSaveState('idle');
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void flush(); }, AUTOSAVE_MS);
  };

  const tabs: { key: WorkspaceTab; label: string }[] = [
    { key: 'script', label: 'Script' },
    { key: 'notes', label: 'Notes' },
    { key: 'questions', label: 'Questions' },
  ];

  return (
    <section
      id="stage-workspace"
      role="tabpanel"
      aria-labelledby={`stage-tab-${entry.id}`}
      className="panel-elevated overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200/80 px-5 py-4 dark:border-zinc-800">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-xs font-medium tabular-nums text-faint">Stage {index + 1}</span>
          <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${stageBadgeClass(normalizeInterviewStage(entry.stage))}`}>
            {stageLabel(entry.stage)}
          </span>
          <span className="text-sm tabular-nums text-body">
            {entry.scheduledAt ? formatScheduledDate(entry.scheduledAt) : 'No date'}
          </span>
          {entry.status && (
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(entry.status)}`}>
              {statusLabel(entry.status)}
            </span>
          )}
        </div>
        {canEdit && (
          <button type="button" className="btn-outline btn-sm" onClick={onEditDetails}>
            <Pencil size={13} aria-hidden /> Edit details
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 px-5 pt-4">
        <div className="segmented" role="tablist" aria-label="Stage content">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                tab === t.key
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-faint" aria-live="polite">
          {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Not saved' : ''}
        </span>
      </div>

      <div className="p-5">
        {tab === 'script' && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor="stage-script" className="form-label">Interview script</label>
              {canEdit && (
                <TranscriptUploadButton
                  hasTranscript={!!transcript}
                  onLoad={(raw) => { setTranscript(raw); queue({ transcript: raw }); }}
                />
              )}
            </div>
            <textarea
              id="stage-script"
              className="input min-h-[420px] resize-y font-mono text-xs leading-relaxed"
              value={transcript}
              readOnly={!canEdit}
              onChange={(e) => { setTranscript(e.target.value); queue({ transcript: e.target.value }); }}
              onBlur={() => { void flush(); }}
              placeholder={canEdit ? 'Paste or upload the transcript for this round…' : 'No script for this round.'}
            />
            <p className="hint mt-1.5">Questions are extracted from this round&apos;s script automatically after it is saved.</p>
          </div>
        )}
        {tab === 'notes' && (
          <div>
            <label htmlFor="stage-note" className="form-label mb-2 block">Notes for this round</label>
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
        )}
        {tab === 'questions' && (
          <ExtractedQuestions
            interviewId={interviewId}
            stageId={entry.id}
            hasTranscript={!!transcript.trim()}
            canEdit={canEdit}
          />
        )}
      </div>
    </section>
  );
}

function ExtractedQuestions({
  interviewId,
  stageId,
  hasTranscript,
  canEdit,
}: {
  interviewId: string;
  stageId: string;
  hasTranscript: boolean;
  canEdit: boolean;
}) {
  const { data, mutate, isLoading } = useSWR(
    ['interview-questions', interviewId, stageId],
    () => api.listInterviewQuestions(interviewId, stageId),
    { refreshInterval: 8000 },
  );
  const [reextracting, setReextracting] = useState(false);

  async function reextract() {
    setReextracting(true);
    try {
      await api.reextractInterview(interviewId, stageId);
      notify.success('Re-extraction queued');
      setTimeout(() => mutate(), 1500);
    } catch (err) {
      notify.error(err, 'Could not re-extract');
    } finally {
      setReextracting(false);
    }
  }

  const questions = data?.questions ?? [];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="form-label">Extracted questions</span>
        {hasTranscript && canEdit && (
          <button type="button" onClick={reextract} disabled={reextracting} className="link text-xs disabled:opacity-50">
            {reextracting ? 'Queuing…' : 'Re-extract'}
          </button>
        )}
      </div>
      {!hasTranscript ? (
        <div className="text-xs italic text-faint">Add a script for this round to enable extraction.</div>
      ) : isLoading && questions.length === 0 ? (
        <div className="text-xs text-faint">Loading…</div>
      ) : questions.length === 0 ? (
        <div className="text-xs italic text-faint">
          No extracted questions yet. Extraction runs automatically when a script is saved (~30-60s).
          Use Re-extract if it didn&apos;t trigger.
        </div>
      ) : (
        <ol className="space-y-2">
          {questions.map((q, i) => (
            <li key={q._id} className="panel p-3">
              <div className="mb-1 flex items-start justify-between gap-2">
                <p className="flex-1 text-sm font-medium text-strong">
                  <span className="mr-2 text-faint">{i + 1}.</span>
                  {q.question}
                </p>
                {q.score != null && (
                  <span className={`text-xs font-semibold ${scoreTextColor(q.score)}`}>{q.score}/10</span>
                )}
              </div>
              {q.candidateAnswer && <p className="mb-1.5 whitespace-pre-wrap text-sm text-body">{q.candidateAnswer}</p>}
              {q.scoreRationale && (
                <p className="mb-1 text-xs text-muted"><strong>Why:</strong> {q.scoreRationale}</p>
              )}
              {q.improvementTip && (
                <p className="text-xs text-blue-700 dark:text-blue-400"><strong>Tip:</strong> {q.improvementTip}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function scoreTextColor(n: number): string {
  if (n >= 8) return 'text-green-700 dark:text-green-400';
  if (n >= 6) return 'text-blue-700 dark:text-blue-400';
  if (n >= 4) return 'text-amber-700 dark:text-amber-400';
  return 'text-red-700 dark:text-red-400';
}
