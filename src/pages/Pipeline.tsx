import useSWR from 'swr';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DndContext, DragEndEvent, PointerSensor, useSensor, useSensors,
  closestCorners, DragOverlay,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Loader2, ExternalLink, Archive, Sparkles, X } from 'lucide-react';
import * as api from '../api/endpoints';
import type { ApplicationDoc, KanbanStage } from '../api/endpoints';
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

  const [search, setSearch] = useState('');
  const [outcome, setOutcome] = useState<string>('active');
  const [adminUserId, setAdminUserId] = useState<string>('');
  const [includeArchived, setIncludeArchived] = useState(false);

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
    if (!confirm('Backfill pipeline from existing bids + interviews?')) return;
    try {
      const res = await api.migrateApplications();
      notify.success(`Pipeline initialized: ${res.applications} apps · ${res.bidsLinked} bids · ${res.interviewsLinked} interviews`);
      mutate();
    } catch (err) {
      notify.error(err, 'Migration failed');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pipeline"
        action={
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button type="button" className="btn-outline" onClick={runMigrate} title="One-off backfill from existing data">
                <Sparkles size={16} className="mr-2" /> Initialize
              </button>
            )}
          </div>
        }
      />

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
    </div>
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
