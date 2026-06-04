import useSWR from 'swr';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DndContext, DragEndEvent, PointerSensor, useSensor, useSensors,
  closestCorners, DragOverlay,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Loader2, ExternalLink, Archive, Sparkles, X, RefreshCw, Inbox, Check } from 'lucide-react';
import * as api from '../api/endpoints';
import type { ApplicationDoc, EmailMessageDoc, KanbanStage } from '../api/endpoints';
import { useAuth } from '../auth/useAuth';
import PageHeader from '../components/PageHeader';
import NameWithAvatar from '../components/NameWithAvatar';
import { notify } from '../lib/notify';

const STAGES: { key: KanbanStage; label: string; tone: string }[] = [
  { key: 'bid_sent', label: 'Bid sent', tone: 'border-gray-300' },
  { key: 'intro', label: 'Intro', tone: 'border-gray-300' },
  { key: 'tech', label: 'Tech', tone: 'border-blue-300' },
  { key: 'live_coding', label: 'Live coding', tone: 'border-indigo-300' },
  { key: 'system_design', label: 'System design', tone: 'border-purple-300' },
  { key: 'panel', label: 'Panel', tone: 'border-purple-300' },
  { key: 'cultural', label: 'Cultural', tone: 'border-pink-300' },
  { key: 'ai_interview', label: 'AI interview', tone: 'border-cyan-300' },
  { key: 'final', label: 'Final', tone: 'border-amber-300' },
  { key: 'offer', label: 'Offer', tone: 'border-emerald-400' },
  { key: 'rejected', label: 'Rejected', tone: 'border-rose-300' },
  { key: 'withdrawn', label: 'Withdrawn', tone: 'border-gray-300' },
];

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

  const [tab, setTab] = useState<'board' | 'inbox'>('board');
  const [search, setSearch] = useState('');
  const [outcome, setOutcome] = useState<string>('active');
  const [adminUserId, setAdminUserId] = useState<string>('');
  const [includeArchived, setIncludeArchived] = useState(false);

  // Needs-review email count drives the Inbox tab badge. Cheap call —
  // we already pull this list when the tab is opened, but the badge
  // needs to be present on first render.
  const { data: reviewData, mutate: mutateReview } = useSWR(
    ['email-review-count'],
    () => api.listEmailMessages({ reviewStatus: 'needs_review', limit: 200 }),
    { revalidateOnFocus: false },
  );
  const reviewCount = (reviewData?.messages || []).length;

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

  const apps = data?.applications ?? [];
  const byStage = useMemo(() => {
    const buckets: Record<string, ApplicationDoc[]> = {};
    for (const s of STAGES) buckets[s.key] = [];
    for (const a of apps) {
      const k = a.stage as string;
      if (!buckets[k]) buckets[k] = [];
      buckets[k].push(a);
    }
    return buckets;
  }, [apps]);

  const [activeApp, setActiveApp] = useState<ApplicationDoc | null>(null);
  const [detailApp, setDetailApp] = useState<ApplicationDoc | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  async function onDragEnd(e: DragEndEvent) {
    setActiveApp(null);
    if (!e.over) return;
    const overId = String(e.over.id);
    const droppedStage: KanbanStage | undefined = STAGES.find((s) => s.key === overId || overId.startsWith(`${s.key}:`))?.key;
    if (!droppedStage) return;
    const dragId = String(e.active.id);
    const app = apps.find((a) => a._id === dragId);
    if (!app || app.stage === droppedStage) return;
    try {
      const next: { stage: string; outcome?: string } = { stage: droppedStage };
      if (droppedStage === 'offer') next.outcome = 'offer';
      else if (droppedStage === 'rejected') next.outcome = 'rejected';
      else if (droppedStage === 'withdrawn') next.outcome = 'withdrawn';
      else next.outcome = 'active';
      await api.patchApplication(app._id, next);
      mutate();
    } catch (err) {
      notify.error(err, 'Failed to move card');
    }
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
          <div className="flex items-center gap-2">
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

      {/* Tab strip */}
      <div className="border-b border-gray-200 flex items-center gap-1">
        <TabButton active={tab === 'board'} onClick={() => setTab('board')}>Board</TabButton>
        <TabButton active={tab === 'inbox'} onClick={() => setTab('inbox')}>
          <span className="inline-flex items-center gap-2">
            <Inbox className="w-4 h-4" />
            Inbox
            {reviewCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-medium bg-primary text-white rounded-full">
                {reviewCount}
              </span>
            )}
          </span>
        </TabButton>
      </div>

      {tab === 'inbox' && (
        <InboxTab
          apps={data?.applications ?? []}
          onApplied={() => { mutate(); mutateReview(); }}
        />
      )}

      {tab === 'board' && (
      <>
      {/* Filters */}
      <div className="flex items-end gap-3 flex-wrap bg-white rounded-[12px] border border-gray-100 px-4 py-3 shadow-sm">
        <div className="w-64">
          <label className="block text-xs text-gray-500 mb-1">Search company</label>
          <input
            className="input w-full text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Acme, Stripe…"
          />
        </div>
        <div className="w-40">
          <label className="block text-xs text-gray-500 mb-1">Outcome</label>
          <select className="select focus-ring w-full text-sm" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
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
            <label className="block text-xs text-gray-500 mb-1">User</label>
            <select className="select focus-ring w-full text-sm" value={adminUserId} onChange={(e) => setAdminUserId(e.target.value)}>
              <option value="">All users</option>
              {users.map((u) => (<option key={u._id} value={u._id}>{u.name || u.email}</option>))}
            </select>
          </div>
        )}
        <label className="inline-flex items-center gap-2 text-xs text-gray-600 pb-2">
          <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
          Show archived
        </label>
      </div>

      {/* Board */}
      {isLoading && !data ? (
        <div className="bg-white rounded-[12px] border border-gray-100 p-6 flex items-center gap-2 text-sm text-gray-500 shadow-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading pipeline…
        </div>
      ) : apps.length === 0 ? (
        <div className="bg-white rounded-[12px] border border-gray-100 p-8 text-center text-sm text-gray-500 shadow-sm">
          No applications yet. Generated resumes auto-create pipeline cards.
          {isAdmin && ' Or click Initialize to backfill from existing data.'}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={(e) => setActiveApp(apps.find((a) => a._id === String(e.active.id)) ?? null)}
          onDragEnd={onDragEnd}
        >
          <div className="flex gap-3 overflow-x-auto pb-2">
            {STAGES.map((s) => (
              <Column
                key={s.key}
                stage={s.key}
                label={s.label}
                tone={s.tone}
                cards={byStage[s.key] || []}
                onCardClick={setDetailApp}
                isAdmin={isAdmin}
              />
            ))}
          </div>
          <DragOverlay>
            {activeApp ? <Card app={activeApp} isOverlay isAdmin={isAdmin} /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {detailApp && (
        <DetailDrawer
          app={detailApp}
          onClose={() => setDetailApp(null)}
          onChanged={() => { mutate(); }}
        />
      )}
      </>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
        active ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-800'
      }`}
    >
      {children}
    </button>
  );
}

function InboxTab({ apps, onApplied }: { apps: ApplicationDoc[]; onApplied: () => void }) {
  const { data, isLoading, mutate } = useSWR(
    ['email-review'],
    () => api.listEmailMessages({ reviewStatus: 'needs_review', limit: 200 }),
    { revalidateOnFocus: false },
  );
  const { data: accountsData, mutate: mutateAccounts } = useSWR(['email-accounts'], () => api.listEmailAccounts());
  const accounts = (accountsData?.accounts || []).filter((a) => !a.disconnectedAt);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const messages: EmailMessageDoc[] = data?.messages || [];

  async function onSyncAll() {
    if (accounts.length === 0) {
      notify.info('Connect a Gmail account in Integrations first.');
      return;
    }
    for (const a of accounts) {
      setSyncingId(a.id);
      try {
        const { stats } = await api.syncEmailAccount(a.id);
        notify.success(`${a.email}: ${stats.fetched} fetched, ${stats.auto_applied} auto, ${stats.needs_review} to review`);
      } catch (err) {
        notify.error(err, `Sync failed for ${a.email}`);
      }
    }
    setSyncingId(null);
    mutate();
    mutateAccounts();
    onApplied();
  }

  async function onApply(msg: EmailMessageDoc, applicationId: string, stage?: string) {
    try {
      await api.applyEmailMessage(msg.id, { applicationId, stage });
      notify.success('Applied');
      mutate();
      onApplied();
    } catch (err) {
      notify.error(err, 'Apply failed');
    }
  }

  async function onDismiss(msg: EmailMessageDoc) {
    try {
      await api.dismissEmailMessage(msg.id);
      mutate();
      onApplied();
    } catch (err) {
      notify.error(err, 'Dismiss failed');
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between bg-white border border-gray-100 rounded-[12px] px-4 py-3 shadow-sm">
        <div className="text-sm text-gray-600">
          {accounts.length === 0
            ? <>No Gmail accounts connected. <Link to="/integrations" className="text-primary hover:underline">Connect one →</Link></>
            : <>{accounts.length} account{accounts.length === 1 ? '' : 's'} connected · {messages.length} email{messages.length === 1 ? '' : 's'} to review</>}
        </div>
        <button
          type="button"
          onClick={onSyncAll}
          disabled={!!syncingId || accounts.length === 0}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-[6px] bg-primary text-white hover:opacity-90 disabled:opacity-50"
        >
          {syncingId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Sync now
        </button>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-[12px] border border-gray-100 p-6 text-sm text-gray-500 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading inbox…
        </div>
      ) : messages.length === 0 ? (
        <div className="bg-white rounded-[12px] border border-gray-100 p-8 text-center text-sm text-gray-500">
          Inbox is clear. New emails will appear here for one-click confirmation.
        </div>
      ) : (
        <ul className="bg-white rounded-[12px] border border-gray-100 divide-y divide-gray-100 shadow-sm">
          {messages.map((m) => (
            <ReviewRow key={m.id} msg={m} apps={apps} onApply={onApply} onDismiss={onDismiss} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ReviewRow({
  msg, apps, onApply, onDismiss,
}: {
  msg: EmailMessageDoc;
  apps: ApplicationDoc[];
  onApply: (msg: EmailMessageDoc, applicationId: string, stage?: string) => void;
  onDismiss: (msg: EmailMessageDoc) => void;
}) {
  // Suggested match: existing applicationId on the row if backend matched it,
  // otherwise look up by the classifier's companyGuess.
  const suggestedAppId = useMemo(() => {
    if (msg.applicationId) return msg.applicationId;
    const guess = (msg.companyGuess || '').trim().toLowerCase();
    if (!guess) return '';
    const match = apps.find((a) => a.companyName.toLowerCase() === guess);
    return match?._id || '';
  }, [msg, apps]);
  const [appId, setAppId] = useState(suggestedAppId);

  return (
    <li className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500">
            <LabelChip label={msg.label} confidence={msg.confidence} />
            {msg.companyGuess && <span className="text-gray-700 font-medium">{msg.companyGuess}</span>}
            <span>·</span>
            <span>{new Date(msg.receivedAt).toLocaleString()}</span>
          </div>
          <div className="mt-1 text-sm font-medium text-gray-900 truncate">{msg.subject || '(no subject)'}</div>
          <div className="text-xs text-gray-500 truncate">from {msg.fromName ? `${msg.fromName} <${msg.fromAddress}>` : msg.fromAddress}</div>
          {msg.snippet && (
            <div className="mt-1 text-sm text-gray-600 line-clamp-2">{msg.snippet}</div>
          )}
        </div>
        <div className="flex flex-col gap-2 w-72 shrink-0">
          <select
            className="select focus-ring text-sm w-full"
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
          >
            <option value="">Link to application…</option>
            {apps.map((a) => (
              <option key={a._id} value={a._id}>{a.companyName} — {a.stage}</option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => appId && onApply(msg, appId, msg.targetStage || undefined)}
              disabled={!appId}
              className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-1.5 text-sm rounded-[6px] bg-emerald-600 text-white hover:opacity-90 disabled:opacity-40"
            >
              <Check className="w-3.5 h-3.5" /> Apply
            </button>
            <button
              type="button"
              onClick={() => onDismiss(msg)}
              className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-sm rounded-[6px] border border-gray-200 text-gray-700 hover:bg-gray-50"
            >
              <X className="w-3.5 h-3.5" /> Dismiss
            </button>
          </div>
          {msg.targetStage && (
            <div className="text-[11px] text-gray-500 text-right">Will advance to: <strong>{msg.targetStage}</strong></div>
          )}
        </div>
      </div>
    </li>
  );
}

function LabelChip({ label, confidence }: { label?: string | null; confidence: number }) {
  if (!label) return null;
  const tone =
    label === 'offer' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : label === 'rejection' ? 'bg-rose-50 text-rose-700 border-rose-200'
    : label === 'noise' || label === 'follow_up' ? 'bg-gray-50 text-gray-600 border-gray-200'
    : 'bg-blue-50 text-blue-700 border-blue-200';
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-medium ${tone}`}>
      {label.replace(/_/g, ' ')}
      <span className="opacity-70 tabular-nums">{Math.round(confidence * 100)}%</span>
    </span>
  );
}

// ---------- Column ----------

function Column({
  stage, label, tone, cards, onCardClick, isAdmin,
}: {
  stage: KanbanStage;
  label: string;
  tone: string;
  cards: ApplicationDoc[];
  onCardClick: (a: ApplicationDoc) => void;
  isAdmin: boolean;
}) {
  const ids = useMemo(() => cards.map((c) => c._id), [cards]);
  return (
    <div className={`w-64 flex-shrink-0 bg-gray-50 rounded-[12px] border-t-4 ${tone} border-x border-b border-gray-100`}>
      <header className="px-3 py-2 flex items-center justify-between text-xs text-gray-600 uppercase tracking-wide font-medium">
        <span>{label}</span>
        <span className="bg-white border border-gray-200 rounded px-1.5 py-0.5 text-[10px] tabular-nums">{cards.length}</span>
      </header>
      <SortableContext id={stage} items={ids} strategy={verticalListSortingStrategy}>
        <div className="p-2 space-y-2 min-h-[80px]" data-stage={stage} id={stage}>
          {cards.map((a) => (
            <SortableCardWrap key={a._id} app={a} onClick={() => onCardClick(a)} isAdmin={isAdmin} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

function SortableCardWrap({ app, onClick, isAdmin }: { app: ApplicationDoc; onClick: () => void; isAdmin: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: app._id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} onClick={onClick}>
      <Card app={app} isAdmin={isAdmin} />
    </div>
  );
}

function Card({ app, isOverlay, isAdmin }: { app: ApplicationDoc; isOverlay?: boolean; isAdmin?: boolean }) {
  const bidCount = app.bidJobIds?.length ?? 0;
  const ivCount = app.interviewIds?.length ?? 0;
  return (
    <div className={'bg-white rounded-[8px] border border-gray-200 p-3 text-sm cursor-grab active:cursor-grabbing shadow-sm '
      + (isOverlay ? 'ring-2 ring-primary' : 'hover:border-primary')}>
      <div className="font-medium text-gray-900 truncate">
        {app.companyName || 'Untitled'}
      </div>
      {app.jobUrl && (
        <a href={app.jobUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline mt-0.5">
          <ExternalLink size={10} /> JD
        </a>
      )}
      <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500">
        <span>{bidCount} bid{bidCount === 1 ? '' : 's'} · {ivCount} rounds</span>
        <span>{timeAgo(app.lastTouchedAt)}</span>
      </div>
      {isAdmin && app.ownerName && (
        <div className="mt-2 text-[11px]">
          <NameWithAvatar name={app.ownerName} imageUrl={app.ownerImage} />
        </div>
      )}
      {app.archivedAt && (
        <span className="inline-flex items-center gap-1 mt-2 text-[10px] text-gray-500">
          <Archive size={10} /> archived
        </span>
      )}
    </div>
  );
}

// ---------- Detail drawer ----------

function DetailDrawer({ app, onClose, onChanged }: { app: ApplicationDoc; onClose: () => void; onChanged: () => void }) {
  const [notes, setNotes] = useState(app.notes || '');
  const [saving, setSaving] = useState(false);

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
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <aside className="fixed top-0 right-0 bottom-0 w-full sm:w-[520px] bg-white shadow-strong border-l border-gray-100 z-50 flex flex-col">
        <header className="px-4 py-3 border-b border-gray-100 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs text-gray-500">Application</div>
            <div className="font-semibold text-gray-900 truncate text-lg">{app.companyName}</div>
            <div className="text-xs text-gray-500">
              Stage: <span className="font-medium text-gray-700">{app.stage}</span> · Outcome: <span className="font-medium text-gray-700">{app.outcome}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} className="btn-icon" title="Close"><X className="w-4 h-4" /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Quick links */}
          {app.jobUrl && (
            <section>
              <a href={app.jobUrl} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
                <ExternalLink size={12} /> Job description
              </a>
            </section>
          )}

          {/* Bids */}
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
            ) : <p className="text-xs text-gray-400 italic">No bids linked.</p>}
          </section>

          {/* Interviews */}
          <section>
            <h3 className="card-title mb-2">Interviews ({app.interviewIds?.length ?? 0})</h3>
            {app.interviewIds?.length ? (
              <ul className="space-y-1 text-xs">
                {app.interviewIds.map((id) => (
                  <li key={id}>
                    <Link to={`/interviews/${id}`} className="text-primary hover:underline">Interview {id.slice(-6)}</Link>
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-gray-400 italic">No interviews linked.</p>}
          </section>

          {/* Notes */}
          <section>
            <h3 className="card-title mb-2">Notes</h3>
            <textarea
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

          {/* History */}
          <section>
            <h3 className="card-title mb-2">History</h3>
            <ol className="space-y-1 text-xs text-gray-600">
              {app.stageHistory.map((h, i) => (
                <li key={i}>
                  <span className="font-medium text-gray-800">{h.stage}</span>
                  <span className="text-gray-400"> · {new Date(h.at).toLocaleString()}</span>
                  {h.source && <span className="text-gray-400"> · {h.source}</span>}
                </li>
              ))}
            </ol>
          </section>
        </div>

        <footer className="p-4 border-t border-gray-100 flex flex-wrap gap-2 justify-between">
          <div className="flex gap-2">
            <button type="button" className="btn-outline" onClick={() => setOutcome('offer')}>Mark Offer</button>
            <button type="button" className="btn-outline" onClick={() => setOutcome('rejected')}>Mark Rejected</button>
            <button type="button" className="btn-outline" onClick={() => setOutcome('withdrawn')}>Withdraw</button>
          </div>
          <button type="button" className="text-xs text-gray-500 hover:text-red-600" onClick={archive}>
            <Archive size={12} className="inline mr-1" /> Archive
          </button>
        </footer>
      </aside>
    </>
  );
}
