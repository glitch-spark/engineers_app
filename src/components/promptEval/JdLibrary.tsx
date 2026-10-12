import { useMemo, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { Archive, ArchiveRestore, Loader2, Pencil, Plus } from 'lucide-react';
import * as api from '../../api/endpoints';
import { EVAL_ROLES, type EvalJobDescription, type EvalRole } from '../../api/endpoints';
import { notify } from '../../lib/notify';
import ConfirmDialog from '../ConfirmDialog';
import Select from '../Select';
import SidePanel from '../SidePanel';
import Switch from '../Switch';
import { ROLE_LABEL } from './format';

const TEXT_MAX = 40_000;

type Draft = { role: EvalRole; title: string; company: string; text: string };
const EMPTY: Draft = { role: 'fullstack', title: '', company: '', text: '' };

/** The shared sample-JD library: filter by role, add or edit postings, archive the ones to stop using. */
export default function JdLibrary() {
  const [role, setRole] = useState<'' | EvalRole>('');
  const [showArchived, setShowArchived] = useState(false);
  const key = ['prompt-eval-jds', showArchived ? 'all' : 'active'] as const;
  const { data, isLoading, mutate } = useSWR(key, () => api.listEvalJds({ includeArchived: showArchived }));
  const { mutate: mutateAll } = useSWRConfig();
  const jds = useMemo(() => (data?.jds ?? []).filter((j) => !role || j.role === role), [data, role]);

  const [editing, setEditing] = useState<EvalJobDescription | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [pendingArchive, setPendingArchive] = useState<EvalJobDescription | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function refreshLists() {
    return mutateAll((k) => Array.isArray(k) && k[0] === 'prompt-eval-jds');
  }

  function openNew() {
    setDraft({ ...EMPTY, role: role || 'fullstack' });
    setEditing('new');
  }

  function openEdit(jd: EvalJobDescription) {
    setDraft({ role: jd.role, title: jd.title, company: jd.company, text: jd.text });
    setEditing(jd);
  }

  const original: Draft | null = editing && editing !== 'new' ? { role: editing.role, title: editing.title, company: editing.company, text: editing.text } : null;
  const dirty = editing === 'new'
    ? !!(draft.title || draft.company || draft.text)
    : !!original && (original.role !== draft.role || original.title !== draft.title || original.company !== draft.company || original.text !== draft.text);

  async function save() {
    if (!draft.title.trim() || !draft.company.trim() || !draft.text.trim()) {
      notify.warn('Title, company and text are required');
      return;
    }
    setSaving(true);
    try {
      if (editing === 'new') {
        await api.createEvalJd({ ...draft, title: draft.title.trim(), company: draft.company.trim(), text: draft.text.trim() });
        notify.success('Job description added');
      } else if (editing) {
        await api.updateEvalJd(editing._id, { ...draft, title: draft.title.trim(), company: draft.company.trim(), text: draft.text.trim() });
        notify.success('Job description updated');
      }
      setEditing(null);
      await refreshLists();
    } catch (err) {
      notify.error(err, 'Could not save the job description');
    } finally {
      setSaving(false);
    }
  }

  async function confirmArchive() {
    if (!pendingArchive) return;
    setBusyId(pendingArchive._id);
    try {
      await api.archiveEvalJd(pendingArchive._id);
      notify.success('Archived; it will no longer be offered for new runs');
      setPendingArchive(null);
      await refreshLists();
    } catch (err) {
      notify.error(err, 'Could not archive');
    } finally {
      setBusyId(null);
    }
  }

  async function unarchive(jd: EvalJobDescription) {
    setBusyId(jd._id);
    try {
      await api.unarchiveEvalJd(jd._id);
      await mutate();
      await refreshLists();
    } catch (err) {
      notify.error(err, 'Could not restore');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="toolbar flex flex-wrap items-end gap-3">
        <div className="w-48">
          <Select
            label="Role"
            labelClassName="block text-xs font-medium mb-1 text-muted"
            value={role}
            onChange={(v) => setRole(v as '' | EvalRole)}
            options={[{ value: '', label: 'All roles' }, ...EVAL_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))]}
          />
        </div>
        <div className="min-w-48">
          <Switch checked={showArchived} onChange={setShowArchived} label="Show archived" />
        </div>
        <button type="button" className="btn btn-sm ml-auto" onClick={openNew}>
          <Plus className="h-4 w-4" aria-hidden /> Add job description
        </button>
      </div>

      <div className="table-wrap">
        <table className="min-w-full text-sm">
          <thead className="table-head whitespace-nowrap">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Role</th>
              <th className="px-3 py-2 text-left font-medium">Title</th>
              <th className="px-3 py-2 text-left font-medium">Company</th>
              <th className="px-3 py-2 text-right font-medium">Length</th>
              <th className="px-3 py-2 text-left font-medium">Source</th>
              <th className="px-3 py-2 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="p-6 text-sm text-muted">
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
                  </span>
                </td>
              </tr>
            ) : jds.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-sm text-muted">
                  No job descriptions here.
                </td>
              </tr>
            ) : (
              jds.map((jd) => (
                <tr key={jd._id} className={`table-row align-middle ${jd.archived ? 'opacity-60' : ''}`}>
                  <td className="px-3 py-2">
                    <span className="badge-neutral">{ROLE_LABEL[jd.role]}</span>
                  </td>
                  <td className="px-3 py-2 text-strong">{jd.title}</td>
                  <td className="px-3 py-2 text-body">{jd.company}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{jd.text.length.toLocaleString()} chars</td>
                  <td className="px-3 py-2">
                    <span className="flex gap-1">
                      {jd.seedKey ? <span className="badge-neutral">seed</span> : <span className="badge-info">added</span>}
                      {jd.archived && <span className="badge-warning">archived</span>}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <button type="button" className="btn-icon" onClick={() => openEdit(jd)} aria-label={`Edit ${jd.title}`} title="Edit">
                        <Pencil className="h-4 w-4" aria-hidden />
                      </button>
                      {jd.archived ? (
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => unarchive(jd)}
                          disabled={busyId === jd._id}
                          aria-label={`Restore ${jd.title}`}
                          title="Restore"
                        >
                          {busyId === jd._id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArchiveRestore className="h-4 w-4" aria-hidden />}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => setPendingArchive(jd)}
                          aria-label={`Archive ${jd.title}`}
                          title="Archive"
                        >
                          <Archive className="h-4 w-4" aria-hidden />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <SidePanel
        open={editing != null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Add job description' : 'Edit job description'}
        subtitle="Paste a real posting. Keep the location line in; the judge is told to ignore it."
        dirty={dirty}
        footer={
          <>
            <button type="button" className="btn-outline text-sm" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="btn text-sm" onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {editing === 'new' ? 'Add' : 'Save'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Role"
            labelClassName="block text-xs font-medium mb-1 text-muted"
            value={draft.role}
            onChange={(v) => setDraft((d) => ({ ...d, role: v as EvalRole }))}
            options={EVAL_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="jd-title" className="block text-xs font-medium mb-1 text-muted">
                Title <span className="text-red-700 dark:text-red-400" aria-hidden>*</span>
              </label>
              <input id="jd-title" className="input w-full text-sm" value={draft.title} maxLength={200} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="jd-company" className="block text-xs font-medium mb-1 text-muted">
                Company <span className="text-red-700 dark:text-red-400" aria-hidden>*</span>
              </label>
              <input id="jd-company" className="input w-full text-sm" value={draft.company} maxLength={200} onChange={(e) => setDraft((d) => ({ ...d, company: e.target.value }))} />
            </div>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor="jd-text" className="block text-xs font-medium text-muted">
                Job description <span className="text-red-700 dark:text-red-400" aria-hidden>*</span>
              </label>
              <span className="text-[11px] text-faint tabular-nums">
                {draft.text.length.toLocaleString()}/{TEXT_MAX.toLocaleString()}
              </span>
            </div>
            <textarea
              id="jd-text"
              className="input w-full text-sm"
              rows={18}
              value={draft.text}
              maxLength={TEXT_MAX}
              onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
              placeholder="Title, company, about the team, what you'll do, requirements, nice to have…"
            />
          </div>
        </div>
      </SidePanel>

      <ConfirmDialog
        open={pendingArchive != null}
        title="Archive this job description?"
        body={
          <>
            <strong>{pendingArchive?.title}</strong> will no longer be offered for new runs. Past runs keep their results. You can restore it later.
          </>
        }
        confirmLabel="Archive"
        tone="default"
        busy={busyId != null}
        onConfirm={confirmArchive}
        onCancel={() => setPendingArchive(null)}
      />
    </div>
  );
}
