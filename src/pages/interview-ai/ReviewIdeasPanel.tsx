import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import Modal from '../../components/Modal';
import * as api from '../../api/endpoints';
import { notify } from '../../lib/notify';

type ModalMode = 'create' | 'update' | 'delete' | null;

const blankForm = (): {
  title: string;
  minInterviews: number;
  maxInterviews: number;
  systemPrompt: string;
} => ({ title: '', minInterviews: 1, maxInterviews: 1, systemPrompt: '' });

export default function ReviewIdeasPanel() {
  const { data: skillsData, mutate: mutateSkills } = useSWR(['skills'], () => api.listSkills());
  const skills = skillsData?.skills ?? [];

  const { data: gp, mutate: mutateGlobal } = useSWR(['global-prompt'], () => api.getGlobalPrompt());

  const [mode, setMode] = useState<ModalMode>(null);
  const [active, setActive] = useState<api.Skill | null>(null);
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);

  const [globalText, setGlobalText] = useState<string>('');
  const [savingGlobal, setSavingGlobal] = useState(false);

  // Sync global prompt textarea when SWR data arrives.
  useEffect(() => {
    if (gp?.systemPrompt !== undefined) setGlobalText(gp.systemPrompt);
  }, [gp?.systemPrompt]);

  useEffect(() => {
    if (mode === 'create') {
      setForm(blankForm());
    } else if (mode === 'update' && active) {
      setForm({
        title: active.title,
        minInterviews: active.minInterviews,
        maxInterviews: active.maxInterviews,
        systemPrompt: active.systemPrompt,
      });
    }
  }, [mode, active]);

  const closeModal = () => {
    setMode(null);
    setActive(null);
  };

  const openCreate = () => {
    setActive(null);
    setMode('create');
  };
  const openUpdate = (s: api.Skill) => {
    setActive(s);
    setMode('update');
  };
  const openDelete = (s: api.Skill) => {
    setActive(s);
    setMode('delete');
  };

  const saveSkill = async () => {
    if (!form.title.trim()) {
      notify.error('Title is required');
      return;
    }
    if (form.minInterviews < 1) {
      notify.error('Min interviews must be at least 1');
      return;
    }
    if (form.maxInterviews < form.minInterviews) {
      notify.error('Max interviews must be ≥ min interviews');
      return;
    }
    setSaving(true);
    try {
      const body = {
        title: form.title.trim(),
        minInterviews: form.minInterviews,
        maxInterviews: form.maxInterviews,
        systemPrompt: form.systemPrompt,
      };
      if (mode === 'update' && active) {
        await api.updateSkill(active._id, body);
        notify.success('Skill updated');
      } else {
        await api.createSkill(body);
        notify.success('Skill created');
      }
      closeModal();
      mutateSkills();
    } catch (err) {
      notify.error(err, 'Failed to save skill');
    } finally {
      setSaving(false);
    }
  };

  const removeSkill = async () => {
    if (!active) return;
    setSaving(true);
    try {
      await api.deleteSkill(active._id);
      notify.success('Skill deleted');
      closeModal();
      mutateSkills();
    } catch (err) {
      notify.error(err, 'Failed to delete skill');
    } finally {
      setSaving(false);
    }
  };

  const saveGlobal = async () => {
    setSavingGlobal(true);
    try {
      await api.updateGlobalPrompt(globalText);
      notify.success('Global prompt saved');
      mutateGlobal();
    } catch (err) {
      notify.error(err, 'Failed to save global prompt');
    } finally {
      setSavingGlobal(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Skills CRUD */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="section-title">Skills</h2>
            <p className="text-sm text-muted">
              Each skill defines a system prompt and how many interviews it expects.
            </p>
          </div>
          <button type="button" className="btn" onClick={openCreate}>
            <Plus size={16} className="mr-1" /> Add skill
          </button>
        </div>

        <div className="card p-0 overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-100 dark:bg-zinc-800 text-left">
              <tr>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2 w-24">Min</th>
                <th className="px-3 py-2 w-24">Max</th>
                <th className="px-3 py-2">System prompt</th>
                <th className="px-3 py-2 w-32">Actions</th>
              </tr>
            </thead>
            <tbody>
              {skills.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted">
                    No skills yet. Add one to let users run AI reviews.
                  </td>
                </tr>
              ) : (
                skills.map((s) => (
                  <tr key={s._id} className="table-row">
                    <td className="px-3 py-2 font-medium">{s.title}</td>
                    <td className="px-3 py-2">{s.minInterviews}</td>
                    <td className="px-3 py-2">{s.maxInterviews}</td>
                    <td className="px-3 py-2 text-muted max-w-md">
                      <div className="line-clamp-2">{s.systemPrompt || '—'}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => openUpdate(s)}
                          title="Update"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => openDelete(s)}
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Global prompt */}
      <section>
        <h2 className="section-title mb-1">Global system prompt</h2>
        <p className="text-sm text-muted mb-3">
          Prepended to every skill prompt and to every custom-prompt run. Use this for
          house-style instructions ("act as a senior interview consultant…").
        </p>
        <textarea
          className="input w-full min-h-[160px] text-sm"
          value={globalText}
          onChange={(e) => setGlobalText(e.target.value)}
          maxLength={20000}
          placeholder="System prompt prefix used for all AI runs"
        />
        <div className="flex items-center justify-between mt-2">
          <div className="text-xs text-faint">{globalText.length}/20000</div>
          <button
            type="button"
            className="btn"
            onClick={saveGlobal}
            disabled={savingGlobal || globalText === (gp?.systemPrompt ?? '')}
            style={{ backgroundColor: '#2563eb', color: 'white' }}
          >
            {savingGlobal ? 'Saving…' : 'Save'}
          </button>
        </div>
      </section>

      {/* Skill create/update modal */}
      <Modal
        open={mode === 'create' || mode === 'update'}
        onClose={closeModal}
        title={mode === 'update' ? 'Update skill' : 'Add skill'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              className="input w-full"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              maxLength={200}
              placeholder="e.g. Suggest improvements from my interview"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">
                Min interviews <span className="text-red-500">*</span>
              </label>
              <input
                className="input w-full"
                type="number"
                min={1}
                value={form.minInterviews}
                onChange={(e) =>
                  setForm({ ...form, minInterviews: Math.max(1, Number(e.target.value) || 1) })
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Max interviews <span className="text-red-500">*</span>
              </label>
              <input
                className="input w-full"
                type="number"
                min={form.minInterviews}
                value={form.maxInterviews}
                onChange={(e) =>
                  setForm({ ...form, maxInterviews: Math.max(1, Number(e.target.value) || 1) })
                }
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">System prompt</label>
            <textarea
              className="input w-full min-h-[180px] text-sm"
              value={form.systemPrompt}
              onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
              maxLength={20000}
              placeholder="Act as a senior interview consultant…"
            />
            <div className="text-xs text-faint mt-1">{form.systemPrompt.length}/20000</div>
          </div>

          <div className="flex gap-2 justify-end pt-3 border-t border-zinc-200 dark:border-zinc-800">
            <button type="button" className="btn" onClick={closeModal} disabled={saving}>
              Cancel
            </button>
            <button
              type="button"
              className="btn"
              onClick={saveSkill}
              disabled={saving}
              style={{ backgroundColor: '#2563eb', color: 'white' }}
            >
              {saving ? 'Saving…' : mode === 'update' ? 'Save changes' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal open={mode === 'delete'} onClose={closeModal} title="Delete skill">
        <div className="space-y-4">
          <p className="text-sm text-body">
            Delete <span className="font-medium">{active?.title}</span>? Past runs that used
            this skill will keep their saved output.
          </p>
          <div className="flex gap-2 justify-end pt-3 border-t border-zinc-200 dark:border-zinc-800">
            <button type="button" className="btn" onClick={closeModal} disabled={saving}>
              Cancel
            </button>
            <button
              type="button"
              className="btn"
              onClick={removeSkill}
              disabled={saving}
              style={{ backgroundColor: '#dc2626', color: 'white' }}
            >
              {saving ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
