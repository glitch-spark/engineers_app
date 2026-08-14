import useSWR from 'swr';
import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  FileText,
  Loader2,
  MessageSquareText,
  Plus,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import * as api from '../api/endpoints';
import { notify } from '../lib/notify';
import Modal from './Modal';
import NameWithAvatar from './NameWithAvatar';
import type { InterviewPrepTab } from './InterviewPrepTabs';

type PrepItem = api.InterviewPrepItem;

function formatRelative(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diffMs = Date.now() - d.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.round(hr / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function userLabel(u: { name?: string | null; email?: string | null; _id: string }, meId: string): string {
  const base = u.name || u.email || u._id;
  return u._id === meId ? `${base} (you)` : base;
}

export default function InterviewPrepLibrary({
  tab,
  embedded = false,
}: {
  tab: InterviewPrepTab;
  embedded?: boolean;
}) {
  const { user } = useAuth();
  const meId = user?.id || '';
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createBody, setCreateBody] = useState('');
  const [search, setSearch] = useState('');

  const { data: usersData } = useSWR(['users-lookup-prep'], () => api.lookupUsers());
  const users = usersData?.users ?? [];

  useEffect(() => {
    if (!selectedUserId && meId) setSelectedUserId(meId);
  }, [meId, selectedUserId]);

  const swrKey = tab === 'prompts'
    ? (['interview-prompts', selectedUserId] as const)
    : (['interview-templates', selectedUserId] as const);

  const { data, mutate, isLoading } = useSWR(
    selectedUserId ? swrKey : null,
    () => (tab === 'prompts'
      ? api.listInterviewPrompts({ userId: selectedUserId })
      : api.listInterviewTemplateAnswers({ userId: selectedUserId })),
    { revalidateOnFocus: false },
  );

  const items: PrepItem[] = useMemo(() => {
    if (!data) return [];
    return tab === 'prompts'
      ? (data as { prompts: PrepItem[] }).prompts
      : (data as { items: PrepItem[] }).items;
  }, [data, tab]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        (item.body || '').toLowerCase().includes(q),
    );
  }, [items, search]);

  const selected = items.find((x) => x._id === selectedId) ?? null;
  const isOwn = selectedUserId === meId;
  const selectedUser = users.find((u) => u._id === selectedUserId);

  useEffect(() => {
    setSelectedId(null);
    setDraftTitle('');
    setDraftBody('');
    setSearch('');
  }, [tab, selectedUserId]);

  useEffect(() => {
    if (selected) {
      setDraftTitle(selected.title);
      setDraftBody(selected.body || '');
    }
  }, [selected?._id, selected?.title, selected?.body]);

  useEffect(() => {
    if (filteredItems.length === 0) {
      if (items.length === 0) setSelectedId(null);
      return;
    }
    if (!selectedId || !filteredItems.some((x) => x._id === selectedId)) {
      setSelectedId(filteredItems[0]._id);
    }
  }, [filteredItems, items.length, selectedId]);

  function openCreateModal() {
    setCreateTitle('');
    setCreateBody('');
    setCreateOpen(true);
  }

  function closeCreateModal() {
    if (saving) return;
    setCreateOpen(false);
  }

  async function submitCreate() {
    if (!createTitle.trim()) {
      notify.error('Title is required');
      return;
    }
    setSaving(true);
    try {
      const created = tab === 'prompts'
        ? await api.createInterviewPrompt({ title: createTitle.trim(), body: createBody })
        : await api.createInterviewTemplateAnswer({ title: createTitle.trim(), body: createBody });
      notify.success('Created');
      setCreateOpen(false);
      if (meId) setSelectedUserId(meId);
      await mutate();
      setSelectedId(created._id);
      setDraftTitle(created.title);
      setDraftBody(created.body || '');
    } catch (err) {
      notify.error(err, 'Failed to create');
    } finally {
      setSaving(false);
    }
  }

  async function saveItem() {
    if (!selected || !isOwn) return;
    if (!draftTitle.trim()) {
      notify.error('Title is required');
      return;
    }
    setSaving(true);
    try {
      if (tab === 'prompts') {
        await api.updateInterviewPrompt(selected._id, { title: draftTitle.trim(), body: draftBody });
      } else {
        await api.updateInterviewTemplateAnswer(selected._id, { title: draftTitle.trim(), body: draftBody });
      }
      notify.success('Saved');
      mutate();
    } catch (err) {
      notify.error(err, 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!selected || !isOwn) return;
    setSaving(true);
    try {
      if (tab === 'prompts') {
        await api.deleteInterviewPrompt(selected._id);
      } else {
        await api.deleteInterviewTemplateAnswer(selected._id);
      }
      notify.success('Deleted');
      setDeleteOpen(false);
      setSelectedId(null);
      mutate();
    } catch (err) {
      notify.error(err, 'Failed to delete');
    } finally {
      setSaving(false);
    }
  }

  const tabSingular = tab === 'prompts' ? 'prompt' : 'template';
  const TabIcon = tab === 'prompts' ? MessageSquareText : FileText;

  return (
    <section className="panel-elevated overflow-hidden">
      {!embedded && (
        <div className="relative px-6 py-5 border-b border-zinc-200/80 dark:border-zinc-800 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-sky-50/80 via-white to-violet-50/40 dark:from-sky-950/20 dark:via-zinc-950 dark:to-violet-950/10 pointer-events-none" />
          <div className="relative">
            <h2 className="section-title">Interview Prep Library</h2>
            <p className="hint mt-1 max-w-2xl">
              Shared interview prompts and template answers. Pick a teammate to browse their library.
            </p>
          </div>
        </div>
      )}

      <div className="px-4 sm:px-5 py-3 border-b border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-44">
            <label className="block text-xs text-muted mb-1">User</label>
            <select
              className="select focus-ring text-sm w-full bg-white dark:bg-zinc-950"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
            >
              {users.map((u) => (
                <option key={u._id} value={u._id}>
                  {userLabel(u, meId)}
                </option>
              ))}
            </select>
          </div>

          <span className="text-xs text-faint hidden md:inline">
            {items.length} {items.length === 1 ? tabSingular : `${tabSingular}s`}
          </span>

          {isOwn && (
            <button
              type="button"
              className="btn text-sm ml-auto shadow-sm"
              onClick={openCreateModal}
              disabled={saving}
            >
              <Plus className="w-4 h-4" />
              New {tabSingular}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(16rem,19rem)_minmax(0,1fr)] min-h-[480px]">
        <aside className="border-b lg:border-b-0 lg:border-r border-zinc-200/80 dark:border-zinc-800 flex flex-col bg-zinc-50/30 dark:bg-zinc-900/20">
          <div className="p-3 border-b border-zinc-200/60 dark:border-zinc-800/80 space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
              <input
                type="search"
                className="input w-full pl-8 py-1.5 text-sm bg-white dark:bg-zinc-950"
                placeholder={`Search ${tab === 'prompts' ? 'prompts' : 'templates'}…`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {!isOwn && selectedUser && (
              <p className="text-[11px] text-muted px-0.5">
                Viewing <span className="font-medium text-body">{selectedUser.name || selectedUser.email}</span>&apos;s library
              </p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto max-h-[520px] p-2">
            {isLoading ? (
              <div className="p-8 text-sm text-muted flex flex-col items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-sky-500" />
                Loading…
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="p-8 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-700 text-muted shadow-sm">
                  {search ? <Search className="h-5 w-5" /> : <BookOpen className="h-5 w-5" />}
                </div>
                <p className="text-sm font-medium text-body">
                  {search
                    ? 'No matches'
                    : isOwn
                      ? (tab === 'prompts' ? 'No prompts yet' : 'No templates yet')
                      : 'Nothing here yet'}
                </p>
                <p className="text-xs text-faint mt-1">
                  {search
                    ? 'Try a different search term'
                    : isOwn
                      ? `Create your first ${tabSingular} to get started`
                      : 'This teammate has not added anything yet'}
                </p>
                {isOwn && !search && (
                  <button type="button" className="btn text-sm mt-4" onClick={openCreateModal}>
                    <Plus className="w-4 h-4" />
                    New {tabSingular}
                  </button>
                )}
              </div>
            ) : (
              <ul className="space-y-0.5">
                {filteredItems.map((item) => {
                  const active = selectedId === item._id;
                  return (
                    <li key={item._id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(item._id)}
                        className={`group w-full text-left rounded-xl px-3 py-2.5 transition-all relative overflow-hidden ${
                          active
                            ? 'bg-white dark:bg-zinc-950 shadow-sm ring-1 ring-sky-500/20 dark:ring-sky-400/25'
                            : 'hover:bg-white/70 dark:hover:bg-zinc-950/50'
                        }`}
                      >
                        {active && (
                          <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-sky-500 dark:bg-sky-400" />
                        )}
                        <div className={`text-sm font-medium truncate pl-1 ${active ? 'text-sky-900 dark:text-sky-100' : 'text-strong'}`}>
                          {item.title}
                        </div>
                        {item.body && (
                          <div className="text-xs text-faint truncate mt-1 pl-1 leading-snug">
                            {item.body.replace(/\s+/g, ' ').slice(0, 64)}
                          </div>
                        )}
                        {item.updatedAt && (
                          <div className="text-[10px] text-faint mt-1.5 pl-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {formatRelative(item.updatedAt)}
                          </div>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        <div className="flex flex-col min-h-[360px] bg-white dark:bg-zinc-950">
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-zinc-100 to-zinc-50 dark:from-zinc-900 dark:to-zinc-950 border border-zinc-200/80 dark:border-zinc-800 text-muted shadow-inner">
                <TabIcon className="h-7 w-7" />
              </div>
              <p className="text-sm font-semibold text-strong">Select a {tabSingular}</p>
              <p className="text-xs text-faint mt-1.5 max-w-sm leading-relaxed">
                Pick an item from the list to view its content
                {isOwn ? ' or start editing your own entries.' : '.'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col flex-1 min-h-0 p-5 gap-5">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-zinc-200/80 dark:border-zinc-800">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
                  {!isOwn && (
                    <NameWithAvatar
                      name={selected.ownerName || selected.ownerEmail || 'Teammate'}
                      size="sm"
                    />
                  )}
                  {selected.updatedAt && (
                    <span>Updated {formatRelative(selected.updatedAt)}</span>
                  )}
                  {!isOwn && (
                    <span className="inline-flex items-center rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                      Read only
                    </span>
                  )}
                </div>
                {isOwn && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      className="btn text-sm"
                      onClick={saveItem}
                      disabled={saving}
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Save
                    </button>
                    <button
                      type="button"
                      className="btn-outline text-sm text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-900/50 dark:hover:bg-red-950/30"
                      onClick={() => setDeleteOpen(true)}
                      disabled={saving}
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="prep-title" className="form-label mb-1.5 block">
                  Title
                </label>
                {isOwn ? (
                  <input
                    id="prep-title"
                    className="input w-full text-sm font-semibold"
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    placeholder="e.g. Live coding & System Design"
                  />
                ) : (
                  <p className="text-sm font-semibold text-strong">{selected.title}</p>
                )}
              </div>

              <div className="flex flex-1 flex-col min-h-0">
                <label htmlFor="prep-content" className="form-label mb-1.5 block">
                  Content
                </label>
                {isOwn ? (
                  <textarea
                    id="prep-content"
                    className="input w-full flex-1 min-h-[320px] text-sm leading-relaxed resize-none font-mono"
                    value={draftBody}
                    onChange={(e) => setDraftBody(e.target.value)}
                    placeholder={
                      tab === 'prompts'
                        ? 'Write your interview prompt here…'
                        : 'Write your template answer here…'
                    }
                  />
                ) : (
                  <div className="flex-1 min-h-[320px] overflow-auto rounded-xl border border-zinc-200/80 dark:border-zinc-700/80 bg-zinc-50/80 dark:bg-zinc-900/40 p-4">
                    <pre className="text-sm whitespace-pre-wrap leading-relaxed text-body font-mono">
                      {selected.body || '(empty)'}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={createOpen}
        onClose={closeCreateModal}
        title={tab === 'prompts' ? 'New prompt' : 'New template answer'}
      >
        <div className="space-y-4">
          <div>
            <label className="form-label mb-1 block">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              className="input w-full text-sm"
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              placeholder={tab === 'prompts' ? 'e.g. Behavioral — STAR format' : 'e.g. Tell me about yourself'}
              autoFocus
            />
          </div>
          <div>
            <label className="form-label mb-1 block">Content</label>
            <textarea
              className="input w-full text-sm min-h-[200px] leading-relaxed resize-y font-mono"
              value={createBody}
              onChange={(e) => setCreateBody(e.target.value)}
              placeholder={tab === 'prompts' ? 'Interview prompt content…' : 'Template answer content…'}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1 border-t border-zinc-200 dark:border-zinc-800">
            <button type="button" className="btn-outline" onClick={closeCreateModal} disabled={saving}>
              Cancel
            </button>
            <button
              type="button"
              className="btn"
              onClick={submitCreate}
              disabled={saving || !createTitle.trim()}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Creating…
                </>
              ) : (
                'Create'
              )}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => { if (!saving) setDeleteOpen(false); }}
        title={`Delete ${tabSingular}?`}
      >
        <div className="space-y-4">
          <p className="text-sm text-body">
            <span className="font-medium text-strong">&ldquo;{selected?.title}&rdquo;</span> will be permanently removed. This cannot be undone.
          </p>
          <div className="flex justify-end gap-2 pt-1 border-t border-zinc-200 dark:border-zinc-800">
            <button type="button" className="btn-outline" onClick={() => setDeleteOpen(false)} disabled={saving}>
              Cancel
            </button>
            <button
              type="button"
              className="btn bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 border-red-600"
              onClick={confirmDelete}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Deleting…
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" /> Delete
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
