import useSWR from 'swr';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DndContext, DragEndEvent, KeyboardSensor, PointerSensor, useDroppable, useSensor, useSensors,
  closestCorners, DragOverlay,
} from '@dnd-kit/core';
import type { Announcements } from '@dnd-kit/core';
import {
  SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Loader2, ExternalLink, Archive, Sparkles, X, RefreshCw, Check, GripVertical } from 'lucide-react';
import * as api from '../api/endpoints';
import type { ApplicationDoc, KanbanStage } from '../api/endpoints';
import { useAuth } from '../auth/useAuth';
import PageHeader from '../components/PageHeader';
import NameWithAvatar from '../components/NameWithAvatar';
import { notify } from '../lib/notify';
import { useDialog } from '../lib/useDialog';
import { getReachedInterviewStages, stageBadgeClass, stageLabel } from '../lib/stageBadge';

const BOARD_COLUMNS = [
  {
    key: 'applied',
    label: 'Applied',
    tone: 'border-zinc-300 dark:border-zinc-600',
    layout: 'list',
    columnClass: 'w-64 shrink-0',
  },
  {
    key: 'in_progress',
    label: 'In Progress',
    tone: 'border-blue-300',
    layout: 'grid',
    columnClass: 'flex-1 min-w-0',
  },
] as const;

type BoardColumnKey = (typeof BOARD_COLUMNS)[number]['key'];
type ColumnLayout = (typeof BOARD_COLUMNS)[number]['layout'];

const COLUMN_LABEL = Object.fromEntries(
  BOARD_COLUMNS.map((c) => [c.key, c.label]),
) as Record<BoardColumnKey, string>;

const DND_INSTRUCTIONS = {
  draggable:
    'To move this card between columns, press Space or Enter to pick it up, use the arrow keys to move it, '
    + 'then press Space or Enter to drop it, or Escape to cancel. '
    + 'You can also open the card and use the Board column buttons.',
};

const IN_PROGRESS_STAGES: KanbanStage[] = [
  'ai_interview', 'intro', 'tech', 'tech_round_1', 'tech_round_2',
  'live_coding', 'system_design', 'home_assessment', 'panel', 'cultural', 'final',
];

const TERMINAL_STAGES: KanbanStage[] = ['rejected', 'offer', 'withdrawn'];

const TERMINAL_OUTCOMES = new Set(['offer', 'rejected', 'withdrawn']);

function isInProgressStage(stage: string): boolean {
  return IN_PROGRESS_STAGES.includes(stage as KanbanStage);
}

function isTerminalApp(app: ApplicationDoc): boolean {
  return TERMINAL_STAGES.includes(app.stage as KanbanStage)
    || TERMINAL_OUTCOMES.has(app.outcome);
}

/** Board column an app is bucketed into (mirrors the grouping in PipelinePage). */
function columnOf(app: ApplicationDoc): BoardColumnKey | undefined {
  if (isTerminalApp(app)) return undefined;
  return app.stage === 'bid_sent' ? 'applied' : 'in_progress';
}

function sortCards(cards: ApplicationDoc[]): ApplicationDoc[] {
  return [...cards].sort((a, b) => Number(a.confirmed) - Number(b.confirmed));
}

function resolveDropColumn(overId: string): BoardColumnKey | undefined {
  if (overId === 'applied' || overId.startsWith('applied:')) return 'applied';
  if (overId === 'in_progress' || overId.startsWith('in_progress:')) return 'in_progress';
  return undefined;
}

function terminalSectionTitle(outcome: string): string {
  if (outcome === 'offer') return 'Offer';
  if (outcome === 'rejected') return 'Rejected';
  if (outcome === 'withdrawn') return 'Withdrawn';
  return 'Closed';
}

function timeAgo(iso?: string | null): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - t);
  const m = Math.round(diff / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

export default function PipelinePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [search, setSearch] = useState('');
  const [outcome, setOutcome] = useState<string>('active');
  const [adminUserId, setAdminUserId] = useState<string>('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [liveMessage, setLiveMessage] = useState('');
  const filterId = useId();

  const { data, isLoading, mutate } = useSWR(
    ['applications', search, outcome, isAdmin ? adminUserId : '', includeArchived] as const,
    () => api.listApplications({
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(outcome ? { outcome } : {}),
      ...(isAdmin && adminUserId ? { userId: adminUserId } : {}),
      ...(includeArchived ? { includeArchived: true } : {}),
    }),
    { revalidateOnFocus: false },
  );

  const { data: usersData } = useSWR(isAdmin ? ['users-list'] : null, () => api.listUsers());
  const users = (usersData?.users as Array<{ _id: string; name?: string; email?: string }>) || [];

  const { data: accountsData, mutate: mutateAccounts } = useSWR(['email-accounts'], () => api.listEmailAccounts());
  const accounts = (accountsData?.accounts || []).filter((a) => !a.disconnectedAt);

  const apps = data?.applications ?? [];
  const pendingCount = useMemo(() => apps.filter((a) => !a.confirmed).length, [apps]);

  const { applied, inProgress, terminal } = useMemo(() => {
    const appliedCards: ApplicationDoc[] = [];
    const inProgressCards: ApplicationDoc[] = [];
    const terminalCards: ApplicationDoc[] = [];

    for (const a of apps) {
      if (isTerminalApp(a)) {
        terminalCards.push(a);
      } else if (a.stage === 'bid_sent') {
        appliedCards.push(a);
      } else if (isInProgressStage(a.stage)) {
        inProgressCards.push(a);
      } else {
        // Unknown stage — treat as in progress if not applied/terminal.
        inProgressCards.push(a);
      }
    }

    return {
      applied: sortCards(appliedCards),
      inProgress: sortCards(inProgressCards),
      terminal: sortCards(terminalCards),
    };
  }, [apps]);

  const boardBuckets: Record<BoardColumnKey, ApplicationDoc[]> = {
    applied,
    in_progress: inProgress,
  };

  const [activeApp, setActiveApp] = useState<ApplicationDoc | null>(null);
  const [detailApp, setDetailApp] = useState<ApplicationDoc | null>(null);

  // Keep the open drawer in sync with the latest list (e.g. after "Move to").
  useEffect(() => {
    if (!detailApp) return;
    const fresh = apps.find((a) => a._id === detailApp._id);
    if (fresh && fresh !== detailApp) setDetailApp(fresh);
  }, [apps, detailApp]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function companyOf(id: string | number): string {
    return apps.find((a) => a._id === String(id))?.companyName || 'Untitled';
  }

  /** Column under a drop target: a column droppable, or the column of the card hovered. */
  function resolveOverColumn(overId: string): BoardColumnKey | undefined {
    const col = resolveDropColumn(overId);
    if (col) return col;
    const overApp = apps.find((a) => a._id === overId);
    return overApp ? columnOf(overApp) : undefined;
  }

  function describeOver(overId: string): string {
    const col = resolveOverColumn(overId);
    return col ? `the ${COLUMN_LABEL[col]} column` : 'no column';
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${companyOf(active.id)}.`,
    onDragOver: ({ active, over }) => (over
      ? `${companyOf(active.id)} is over ${describeOver(String(over.id))}.`
      : `${companyOf(active.id)} is not over a column.`),
    onDragEnd: ({ active, over }) => (over
      ? `${companyOf(active.id)} dropped on ${describeOver(String(over.id))}.`
      : `${companyOf(active.id)} dropped outside the board. No change.`),
    onDragCancel: ({ active }) => `Moving ${companyOf(active.id)} was cancelled. No change.`,
  };

  async function moveToColumn(app: ApplicationDoc, column: BoardColumnKey) {
    if (isTerminalApp(app)) return;
    let moved = false;
    try {
      if (column === 'applied') {
        if (app.stage === 'bid_sent') return;
        await api.patchApplication(app._id, { stage: 'bid_sent', outcome: 'active' });
        moved = true;
      } else if (column === 'in_progress') {
        if (isInProgressStage(app.stage)) return;
        if (app.stage === 'bid_sent') {
          await api.patchApplication(app._id, { stage: 'intro', outcome: 'active' });
          moved = true;
        }
      }
      mutate();
      if (moved) setLiveMessage(`Moved ${app.companyName || 'Untitled'} to ${COLUMN_LABEL[column]}.`);
    } catch (err) {
      notify.error(err, 'Failed to move card');
    }
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveApp(null);
    if (!e.over) return;
    const droppedColumn = resolveOverColumn(String(e.over.id));
    if (!droppedColumn) return;
    const app = apps.find((a) => a._id === String(e.active.id));
    if (!app) return;
    await moveToColumn(app, droppedColumn);
  }

  async function onConfirm(app: ApplicationDoc) {
    try {
      await api.confirmApplication(app._id);
      mutate();
    } catch (err) {
      notify.error(err, 'Failed to confirm');
    }
  }

  async function onReject(app: ApplicationDoc) {
    try {
      await api.rejectApplication(app._id);
      mutate();
    } catch (err) {
      notify.error(err, 'Failed to remove');
    }
  }

  async function onSyncAll() {
    if (accounts.length === 0) {
      notify.info('Connect a Gmail or Outlook account in Integrations first.');
      return;
    }
    setSyncing(true);
    for (const a of accounts) {
      try {
        const { stats } = await api.syncEmailAccount(a.id);
        notify.success(`${a.email}: ${stats.fetched} fetched, ${stats.on_board} on board, ${stats.ignored} ignored`);
      } catch (err) {
        notify.error(err, `Sync failed for ${a.email}`);
      }
    }
    setSyncing(false);
    mutate();
    mutateAccounts();
  }

  async function runMigrate() {
    if (!confirm('Backfill pipeline from existing interviews only? (Resume-only bids are no longer auto-added — pipeline is email-driven.)')) return;
    try {
      const res = await api.migrateApplications();
      notify.success(`Pipeline initialized: ${res.applications} apps · ${res.interviewsLinked} interviews linked`);
      mutate();
    } catch (err) {
      notify.error(err, 'Migration failed');
    }
  }

  async function runWipeBidOnly() {
    if (!confirm('Delete every Application that has no attached interviews? This removes the resume-only bid_sent backfill. Cannot be undone.')) return;
    try {
      const res = await api.wipeBidOnlyApplications();
      notify.success(`Removed ${res.deleted} bid-only applications`);
      mutate();
    } catch (err) {
      notify.error(err, 'Wipe failed');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pipeline"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-outline"
              onClick={onSyncAll}
              disabled={syncing}
              title={accounts.length ? 'Sync connected inboxes' : 'Connect an inbox in Integrations'}
            >
              {syncing ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}
              Sync inbox
            </button>
            {isAdmin && (
              <>
                <button type="button" className="btn-outline" onClick={runMigrate} title="One-off backfill from existing interviews">
                  <Sparkles size={16} className="mr-2" /> Initialize
                </button>
                <button type="button" className="btn-outline" onClick={runWipeBidOnly} title="Delete Applications with no interviews">
                  <Archive size={16} className="mr-2" /> Clear bid-only
                </button>
              </>
            )}
          </div>
        }
      />

      {pendingCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-2.5 text-sm flex items-center gap-2 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300">
          <Sparkles className="w-4 h-4 shrink-0" aria-hidden />
          <span><strong>{pendingCount}</strong> AI-suggested {pendingCount === 1 ? 'card' : 'cards'} awaiting your confirmation — review the dashed cards and keep (✓) or remove (✕) each.</span>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-end gap-3 flex-wrap panel px-4 py-3">
        <div className="w-full sm:w-64">
          <label htmlFor={`${filterId}-search`} className="block text-xs text-muted mb-1">Search company</label>
          <input
            id={`${filterId}-search`}
            className="input w-full text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Acme, Stripe…"
          />
        </div>
        <div className="w-40">
          <label htmlFor={`${filterId}-outcome`} className="block text-xs text-muted mb-1">Outcome</label>
          <select id={`${filterId}-outcome`} className="select focus-ring w-full text-sm" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="offer">Offer</option>
            <option value="rejected">Rejected</option>
            <option value="withdrawn">Withdrawn</option>
            <option value="no_response">No response</option>
          </select>
        </div>
        {isAdmin && (
          <div className="w-56">
            <label htmlFor={`${filterId}-user`} className="block text-xs text-muted mb-1">User</label>
            <select id={`${filterId}-user`} className="select focus-ring w-full text-sm" value={adminUserId} onChange={(e) => setAdminUserId(e.target.value)}>
              <option value="">All users</option>
              {users.map((u) => (<option key={u._id} value={u._id}>{u.name || u.email}</option>))}
            </select>
          </div>
        )}
        <label className="inline-flex items-center gap-2 text-xs text-muted pb-2">
          <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
          Show archived
        </label>
      </div>

      {/* Board */}
      {isLoading && !data ? (
        <div role="status" className="panel p-6 flex items-center gap-2 text-sm text-muted">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Loading pipeline…
        </div>
      ) : apps.length === 0 ? (
        <div className="panel p-8 text-center text-sm text-muted">
          No applications yet. Connect an inbox in <Link to="/integrations" className="text-primary underline">Integrations</Link> and hit <strong>Sync inbox</strong>, or generate a resume to create a bid.
          {isAdmin && ' Admins can also Initialize to backfill from existing interviews.'}
        </div>
      ) : (
        <>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            accessibility={{ announcements, screenReaderInstructions: DND_INSTRUCTIONS }}
            onDragStart={(e) => setActiveApp(apps.find((a) => a._id === String(e.active.id)) ?? null)}
            onDragEnd={onDragEnd}
            onDragCancel={() => setActiveApp(null)}
          >
            <div className="flex gap-4 pb-2 w-full">
              {BOARD_COLUMNS.map((col) => (
                <Column
                  key={col.key}
                  columnKey={col.key}
                  label={col.label}
                  tone={col.tone}
                  layout={col.layout}
                  columnClass={col.columnClass}
                  cards={boardBuckets[col.key]}
                  showStageBadge={col.key === 'in_progress'}
                  onCardClick={setDetailApp}
                  onConfirm={onConfirm}
                  onReject={onReject}
                  isAdmin={isAdmin}
                />
              ))}
            </div>
            <DragOverlay>
              {activeApp ? (
                <div className="w-[220px] max-w-full">
                  <Card
                    app={activeApp}
                    isOverlay
                    isAdmin={isAdmin}
                    showStageBadge={isInProgressStage(activeApp.stage) || getReachedInterviewStages(activeApp).length > 0}
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          {terminal.length > 0 && (
            <TerminalList
              title={terminalSectionTitle(outcome)}
              cards={terminal}
              onCardClick={setDetailApp}
              isAdmin={isAdmin}
            />
          )}
        </>
      )}

      {detailApp && (
        <DetailDrawer
          app={detailApp}
          column={columnOf(detailApp)}
          onMove={(column) => moveToColumn(detailApp, column)}
          onClose={() => setDetailApp(null)}
          onChanged={() => { mutate(); }}
        />
      )}
      <div role="status" aria-live="polite" className="sr-only">{liveMessage}</div>
    </div>
  );
}

function LabelChip({ label, confidence }: { label?: string | null; confidence: number }) {
  if (!label) return null;
  const tone =
    label === 'offer' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
    : label === 'rejection' ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
    : label === 'noise' || label === 'follow_up' ? 'bg-zinc-50 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700'
    : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800';
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-medium ${tone}`}>
      {label.replace(/_/g, ' ')}
      <span className="tabular-nums">{Math.round(confidence * 100)}%</span>
    </span>
  );
}

function StageBadge({ stage }: { stage: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-[8px] text-[11px] font-medium border ${stageBadgeClass(stage)}`}>
      {stageLabel(stage)}
    </span>
  );
}

function StageBadgeRow({
  app,
  highlightCurrent,
  align = 'start',
}: {
  app: ApplicationDoc;
  highlightCurrent?: boolean;
  align?: 'start' | 'end';
}) {
  const stages = getReachedInterviewStages(app);
  if (stages.length === 0) {
    if (isInProgressStage(app.stage)) {
      return (
        <div className={`flex flex-wrap gap-1 ${align === 'end' ? 'justify-end' : ''}`}>
          <StageBadge stage={app.stage} />
        </div>
      );
    }
    return null;
  }
  return (
    <div className={`flex flex-wrap gap-1 ${align === 'end' ? 'justify-end' : ''}`}>
      {stages.map((s) => (
        <span
          key={s}
          className={s === app.stage && highlightCurrent ? 'ring-1 ring-primary/40 rounded-[8px]' : undefined}
        >
          <StageBadge stage={s} />
          {s === app.stage && highlightCurrent && <span className="sr-only"> (current stage)</span>}
        </span>
      ))}
    </div>
  );
}

// ---------- Column ----------

function Column({
  columnKey, label, tone, layout, columnClass, cards, showStageBadge, onCardClick, onConfirm, onReject, isAdmin,
}: {
  columnKey: BoardColumnKey;
  label: string;
  tone: string;
  layout: ColumnLayout;
  columnClass: string;
  cards: ApplicationDoc[];
  showStageBadge: boolean;
  onCardClick: (a: ApplicationDoc) => void;
  onConfirm: (a: ApplicationDoc) => void;
  onReject: (a: ApplicationDoc) => void;
  isAdmin: boolean;
}) {
  const ids = useMemo(() => cards.map((c) => c._id), [cards]);
  const isGrid = layout === 'grid';
  const sortStrategy = isGrid ? rectSortingStrategy : verticalListSortingStrategy;
  const cardsClass = isGrid
    ? 'p-2 min-h-[80px] grid gap-2 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]'
    : 'p-2 space-y-2 min-h-[80px]';
  const headingId = useId();
  // Column-level drop target so empty columns (and gaps between cards) accept drops.
  const { setNodeRef: setDropRef } = useDroppable({ id: columnKey });

  return (
    <section aria-labelledby={headingId} className={`${columnClass} bg-zinc-50 dark:bg-zinc-900/60 rounded-xl border-t-4 ${tone} border-x border-b border-zinc-100 dark:border-zinc-800`}>
      <header className="px-3 py-2 flex items-center justify-between text-xs text-muted uppercase tracking-wide font-medium">
        <h2 id={headingId}>{label}</h2>
        <span className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-1.5 py-0.5 text-[10px] tabular-nums">
          {cards.length}<span className="sr-only"> {cards.length === 1 ? 'card' : 'cards'}</span>
        </span>
      </header>
      <SortableContext id={columnKey} items={ids} strategy={sortStrategy}>
        <div ref={setDropRef} className={cardsClass} data-stage={columnKey} id={columnKey}>
          {cards.map((a) => (
            <SortableCardWrap
              key={a._id}
              app={a}
              grid={isGrid}
              showStageBadge={showStageBadge}
              onClick={() => onCardClick(a)}
              onConfirm={onConfirm}
              onReject={onReject}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      </SortableContext>
    </section>
  );
}

function SortableCardWrap({
  app, grid, showStageBadge, onClick, onConfirm, onReject, isAdmin,
}: {
  app: ApplicationDoc;
  grid?: boolean;
  showStageBadge: boolean;
  onClick: () => void;
  onConfirm: (a: ApplicationDoc) => void;
  onReject: (a: ApplicationDoc) => void;
  isAdmin: boolean;
}) {
  const {
    attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging,
  } = useSortable({ id: app._id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const company = app.companyName || 'Untitled';
  // The card surface is not itself interactive: pointer drag + click-to-open stay on it for
  // mouse users, while keyboard users get a real "open" button (the title) and a drag handle.
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={grid ? 'min-w-0 h-full' : undefined}
      onPointerDown={(e) => listeners?.onPointerDown?.(e)}
      onClick={onClick}
    >
      <Card
        app={app}
        grid={grid}
        showStageBadge={showStageBadge}
        isAdmin={isAdmin}
        onConfirm={onConfirm}
        onReject={onReject}
        onOpen={onClick}
        dragHandle={(
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            onKeyDown={(e) => listeners?.onKeyDown?.(e)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Move ${company}`}
            className="shrink-0 -mr-1 rounded p-0.5 text-muted hover:text-strong cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="w-3.5 h-3.5" aria-hidden />
          </button>
        )}
      />
    </div>
  );
}

function Card({
  app, isOverlay, isAdmin, grid, showStageBadge, onConfirm, onReject, onOpen, dragHandle,
}: {
  app: ApplicationDoc;
  isOverlay?: boolean;
  isAdmin?: boolean;
  grid?: boolean;
  showStageBadge?: boolean;
  onConfirm?: (a: ApplicationDoc) => void;
  onReject?: (a: ApplicationDoc) => void;
  onOpen?: () => void;
  dragHandle?: React.ReactNode;
}) {
  const bidCount = app.bidJobIds?.length ?? 0;
  const ivCount = app.interviewIds?.length ?? 0;
  const pending = !app.confirmed;
  const stop = (e: React.SyntheticEvent) => { e.stopPropagation(); };
  const company = app.companyName || 'Untitled';
  return (
    <div className={'reveal-scope rounded-[8px] p-3 text-sm cursor-grab active:cursor-grabbing shadow-sm '
      + (grid ? 'h-full ' : '')
      + (pending ? 'bg-amber-50 dark:bg-amber-950/30 border border-dashed border-amber-300 dark:border-amber-700 ' : 'bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 ')
      + (isOverlay ? 'ring-2 ring-primary' : (pending ? 'hover:border-amber-400' : 'hover:border-primary'))}>
      <div className="flex items-start gap-1">
        {onOpen ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpen(); }}
            className="min-w-0 flex-1 text-left font-medium text-strong truncate reveal-on-focus"
          >
            {company}<span className="sr-only">, open details</span>
          </button>
        ) : (
          <div className="min-w-0 flex-1 font-medium text-strong truncate reveal-on-focus">{company}</div>
        )}
        {dragHandle}
      </div>
      {pending && <span className="sr-only">AI-suggested, awaiting your confirmation.</span>}
      {showStageBadge && (
        <div className="mt-1.5">
          <StageBadgeRow app={app} highlightCurrent />
        </div>
      )}
      {pending && app.aiLabel && (
        <div className="mt-1">
          <LabelChip label={app.aiLabel} confidence={app.aiConfidence ?? 0} />
        </div>
      )}
      {app.jobUrl && (
        <a href={app.jobUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline mt-0.5">
          <ExternalLink size={10} aria-hidden /> JD<span className="sr-only"> for {company} (opens in new tab)</span>
        </a>
      )}
      <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
        <span>{bidCount} bid{bidCount === 1 ? '' : 's'} · {ivCount} rounds</span>
        <span>{timeAgo(app.lastTouchedAt)}</span>
      </div>
      {isAdmin && app.ownerName && (
        <div className="mt-2 text-[11px]">
          <NameWithAvatar name={app.ownerName} imageUrl={app.ownerImage} />
        </div>
      )}
      {app.archivedAt && (
        <span className="inline-flex items-center gap-1 mt-2 text-[10px] text-muted">
          <Archive size={10} aria-hidden /> archived
        </span>
      )}
      {pending && onConfirm && onReject && (
        <div className="mt-2 flex items-center gap-2" onPointerDown={stop}>
          <button
            type="button"
            onClick={(e) => { stop(e); onConfirm(app); }}
            className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 text-xs rounded-[6px] bg-emerald-700 text-white hover:opacity-90"
            title="Keep this card — label looks right"
            aria-label={`Keep ${company}`}
          >
            <Check className="w-3.5 h-3.5" aria-hidden /> Keep
          </button>
          <button
            type="button"
            onClick={(e) => { stop(e); onReject(app); }}
            className="inline-flex items-center justify-center gap-1 px-2 py-1 text-xs rounded-[6px] border border-zinc-300 dark:border-zinc-600 text-body bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            title="Remove — wrong label"
            aria-label={`Remove ${company}`}
          >
            <X className="w-3.5 h-3.5" aria-hidden /> Remove
          </button>
        </div>
      )}
    </div>
  );
}

function TerminalList({
  title, cards, onCardClick, isAdmin,
}: {
  title: string;
  cards: ApplicationDoc[];
  onCardClick: (a: ApplicationDoc) => void;
  isAdmin: boolean;
}) {
  return (
    <section className="panel overflow-hidden">
      <header className="px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <h2 className="text-xs font-medium text-muted uppercase tracking-wide">{title}</h2>
        <span className="text-[10px] tabular-nums text-muted bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-1.5 py-0.5">
          {cards.length}
        </span>
      </header>
      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {cards.map((app) => (
          <li key={app._id}>
            <button
              type="button"
              onClick={() => onCardClick(app)}
              className="reveal-scope w-full text-left px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="font-medium text-sm text-strong truncate reveal-on-focus">{app.companyName || 'Untitled'}</div>
                {isAdmin && app.ownerName && (
                  <div className="mt-1 text-[11px]">
                    <NameWithAvatar name={app.ownerName} imageUrl={app.ownerImage} />
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <StageBadgeRow app={app} align="end" />
                {isTerminalApp(app) && <StageBadge stage={app.stage} />}
                <span className="text-[11px] text-muted whitespace-nowrap">{timeAgo(app.lastTouchedAt)}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- Detail drawer ----------

function DetailDrawer({
  app, column, onMove, onClose, onChanged,
}: {
  app: ApplicationDoc;
  column?: BoardColumnKey;
  onMove: (column: BoardColumnKey) => void;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [notes, setNotes] = useState(app.notes || '');
  const [saving, setSaving] = useState(false);
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  useDialog(true, panelRef, onClose);

  async function saveNotes() {
    setSaving(true);
    try {
      await api.patchApplication(app._id, { notes });
      notify.success('Notes saved');
      onChanged();
    } catch (err) {
      notify.error(err, 'Failed to save notes');
    } finally {
      setSaving(false);
    }
  }

  async function setOutcome(outcome: 'offer' | 'rejected' | 'withdrawn' | 'active') {
    try {
      await api.patchApplication(app._id, { outcome, stage: outcome === 'active' ? undefined : outcome });
      notify.success(`Marked ${outcome}`);
      onChanged();
      onClose();
    } catch (err) {
      notify.error(err, 'Update failed');
    }
  }

  async function archive() {
    if (!confirm('Archive this application?')) return;
    try {
      await api.patchApplication(app._id, { archived: true });
      notify.success('Archived');
      onChanged();
      onClose();
    } catch (err) {
      notify.error(err, 'Archive failed');
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} aria-hidden />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="fixed top-0 right-0 bottom-0 w-full sm:w-[520px] bg-white dark:bg-zinc-950 shadow-strong border-l border-zinc-200 dark:border-zinc-800 z-50 flex flex-col"
      >
        <header className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs text-muted">Application</div>
            <h2 id={titleId} className="font-semibold text-strong break-words text-lg">{app.companyName}</h2>
            <div className="text-xs text-muted mt-1 space-y-1">
              {(getReachedInterviewStages(app).length > 0
                || isInProgressStage(app.stage)
                || (isTerminalApp(app) && !isInProgressStage(app.stage))) && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span>Stages:</span>
                  <StageBadgeRow app={app} highlightCurrent />
                  {isTerminalApp(app) && !isInProgressStage(app.stage) && (
                    <StageBadge stage={app.stage} />
                  )}
                </div>
              )}
              <div>
                Outcome: <span className="font-medium text-body">{app.outcome}</span>
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="btn-icon" title="Close" aria-label="Close"><X className="w-4 h-4" aria-hidden /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {app.jobUrl && (
            <section>
              <a href={app.jobUrl} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
                <ExternalLink size={12} aria-hidden /> Job description<span className="sr-only"> (opens in new tab)</span>
              </a>
            </section>
          )}

          {column && (
            <section>
              <h3 id={`${titleId}-column`} className="card-title mb-2">Board column</h3>
              <div role="group" aria-labelledby={`${titleId}-column`} className="segmented w-fit">
                {BOARD_COLUMNS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    aria-pressed={column === c.key}
                    onClick={() => { if (column !== c.key) onMove(c.key); }}
                    className={`segmented-btn ${column === c.key ? 'segmented-btn-active' : ''}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="card-title mb-2">Bids ({app.bidJobIds?.length ?? 0})</h3>
            {app.bidJobIds?.length ? (
              <ul className="space-y-1 text-xs">
                {app.bidJobIds.map((id) => (
                  <li key={id}>
                    <Link to={`/resume/generated?focus=${id}`} className="text-primary hover:underline">Bid {id.slice(-6)}</Link>
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-faint italic">No bids linked.</p>}
          </section>

          <section>
            <h3 className="card-title mb-2">Interviews ({app.interviewIds?.length ?? 0})</h3>
            {app.interviewIds?.length ? (
              <ul className="space-y-1 text-xs">
                {app.interviewIds.map((id) => (
                  <li key={id}>
                    <Link to={`/interview/${id}`} className="text-primary hover:underline">Interview {id.slice(-6)}</Link>
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-faint italic">No interviews linked.</p>}
          </section>

          <section>
            <h3 id={`${titleId}-notes`} className="card-title mb-2">Notes</h3>
            <textarea
              aria-labelledby={`${titleId}-notes`}
              className="input w-full text-sm"
              rows={5}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What happened? next steps? questions to ask?"
            />
            <div className="flex justify-end mt-2">
              <button type="button" className="btn" onClick={saveNotes} disabled={saving || notes === (app.notes || '')}>
                {saving ? 'Saving…' : 'Save notes'}
              </button>
            </div>
          </section>

          <section>
            <h3 className="card-title mb-2">History</h3>
            <ol className="space-y-1 text-xs text-muted">
              {app.stageHistory.map((h, i) => (
                <li key={i}>
                  <span className="font-medium text-body">{stageLabel(h.stage)}</span>
                  <span className="text-faint"> · {new Date(h.at).toLocaleString()}</span>
                  {h.source && <span className="text-faint"> · {h.source}</span>}
                </li>
              ))}
            </ol>
          </section>
        </div>

        <footer className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex flex-wrap gap-2 justify-between">
          <div className="flex gap-2">
            <button type="button" className="btn-outline" onClick={() => setOutcome('offer')}>Mark Offer</button>
            <button type="button" className="btn-outline" onClick={() => setOutcome('rejected')}>Mark Rejected</button>
            <button type="button" className="btn-outline" onClick={() => setOutcome('withdrawn')}>Withdraw</button>
          </div>
          <button type="button" className="text-xs text-muted hover:text-red-600 dark:hover:text-red-400" onClick={archive}>
            <Archive size={12} className="inline mr-1" aria-hidden /> Archive
          </button>
        </footer>
      </aside>
    </>
  );
}
