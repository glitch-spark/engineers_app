import { useEffect, useId, useRef, useState } from 'react';
import { Plus, Star, Trash2, X } from 'lucide-react';
import type { PromptRole, ResumePrompt } from '../../api/endpoints';
import ConfirmDialog from '../ConfirmDialog';
import ResumePromptField from '../ResumePromptField';
import TemplatePane from './TemplatePane';
import { MAX_PROMPTS, MAX_PROMPT_NAME, NO_ROLE_LABEL, PROMPT_ROLES, PROMPT_ROLE_LABEL, newPromptId, unitRoles } from './promptRoles';

/**
 * A profile's tailoring units: a tab per unit (★ default, • unsaved); the selected unit's name, role marks, default
 * and delete controls; then its tailor draft (HTML template) and its tailoring prompt side by side. Saving is the
 * page's (one Save for every prompt).
 */
export default function ResumeUnitsEditor({
  prompts,
  defaultId,
  onChange,
  dirtyIds,
  errors,
}: {
  prompts: ResumePrompt[];
  defaultId: string;
  onChange: (prompts: ResumePrompt[], defaultId: string) => void;
  /** Units with unsaved changes (their tab shows •). */
  dirtyIds: Set<string>;
  /** What's wrong with each unit's name (id → message). */
  errors: Record<string, string>;
}) {
  const [selectedId, setSelectedId] = useState(prompts[0]?.id ?? '');
  const [lastIndex, setLastIndex] = useState(0);
  const nameRef = useRef<HTMLInputElement>(null);
  const [focusName, setFocusName] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ids = useId();

  // A saved unit gets its real id from the server: keep the same tab selected by position.
  const current = prompts.find((p) => p.id === selectedId) ?? prompts[Math.min(lastIndex, prompts.length - 1)];

  useEffect(() => {
    if (focusName) {
      nameRef.current?.select();
      setFocusName(false);
    }
  }, [focusName, current?.id]);

  if (!current) return null;
  const isDefault = current.id === defaultId;
  const error = errors[current.id];
  const roles = unitRoles(current);

  const select = (id: string) => {
    setSelectedId(id);
    setLastIndex(Math.max(0, prompts.findIndex((p) => p.id === id)));
  };
  const update = (patch: Partial<ResumePrompt>) =>
    onChange(prompts.map((p) => (p.id === current.id ? { ...p, ...patch } : p)), defaultId);
  const add = () => {
    const p: ResumePrompt = { id: newPromptId(), name: 'New unit', roles: [], body: '', templateHtml: '', templateName: '' };
    onChange([...prompts, p], defaultId);
    setSelectedId(p.id);
    setLastIndex(prompts.length);
    setFocusName(true);
  };
  const remove = () => {
    setConfirmDelete(false);
    if (isDefault) return;
    const i = prompts.findIndex((p) => p.id === current.id);
    const rest = prompts.filter((p) => p.id !== current.id);
    onChange(rest, defaultId);
    const next = rest[Math.min(i, rest.length - 1)];
    if (next) select(next.id);
  };
  const setRoles = (next: PromptRole[]) => update({ roles: next, role: null });

  return (
    <div className="space-y-4">
      {/* Tab bar: the units, on a line that separates them from the selected unit below */}
      <div role="tablist" aria-label="Resume units" className="flex flex-wrap items-end gap-1 border-b border-zinc-200 dark:border-zinc-700">
        {prompts.map((p) => {
          const active = p.id === current.id;
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => select(p.id)}
              className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'border-sky-600 text-sky-800 dark:border-sky-400 dark:text-sky-200'
                  : 'border-transparent text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
              } ${errors[p.id] ? 'text-red-700 dark:text-red-400' : ''}`}
            >
              <span className="max-w-[14rem] truncate">{p.name.trim() || 'Untitled'}</span>
              {p.id === defaultId && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" aria-label="default" />}
              {dirtyIds.has(p.id) && (
                <span className="text-sky-600 dark:text-sky-400" title="Unsaved changes" aria-label="unsaved changes">
                  •
                </span>
              )}
            </button>
          );
        })}
        {prompts.length < MAX_PROMPTS && (
          <button type="button" onClick={add} className="btn-outline btn-sm mb-1.5 ml-2">
            <Plus className="h-3.5 w-3.5" aria-hidden /> Add unit
          </button>
        )}
      </div>

      {/* The selected unit: its name, roles and default / delete, then its template, prompt and Eval cards */}
      <div className="flex flex-wrap items-end gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-700">
        <div className="min-w-[14rem] flex-1 sm:max-w-xs">
          <label htmlFor={`${ids}-name`} className="form-label">
            Name
          </label>
          <input
            id={`${ids}-name`}
            ref={nameRef}
            className="input"
            value={current.name}
            maxLength={MAX_PROMPT_NAME + 20}
            onChange={(e) => update({ name: e.target.value })}
            aria-invalid={!!error}
            aria-describedby={error ? 'prompt-name-error' : undefined}
          />
        </div>
        <div className="min-w-[16rem] flex-1">
          <span id={`${ids}-roles`} className="form-label">
            Roles
          </span>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-labelledby={`${ids}-roles`}>
            {roles.length === 0 && <span className="text-sm text-muted">{NO_ROLE_LABEL}</span>}
            {roles.map((r) => (
              <span
                key={r}
                className="inline-flex items-center gap-1 rounded-md bg-violet-100 py-0.5 pl-2 pr-1 text-xs font-semibold text-violet-800 dark:bg-violet-950/60 dark:text-violet-200"
              >
                {PROMPT_ROLE_LABEL[r]}
                <button
                  type="button"
                  className="rounded p-0.5 hover:bg-violet-200 dark:hover:bg-violet-900"
                  onClick={() => setRoles(roles.filter((x) => x !== r))}
                  aria-label={`Remove role ${PROMPT_ROLE_LABEL[r]}`}
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </span>
            ))}
            {roles.length < PROMPT_ROLES.length && (
              <select
                className="input !w-auto shrink-0 py-1 text-xs"
                value=""
                aria-label="Add role"
                onChange={(e) => e.target.value && setRoles([...roles, e.target.value as PromptRole])}
              >
                <option value="">+ role</option>
                {PROMPT_ROLES.filter((r) => !roles.includes(r)).map((r) => (
                  <option key={r} value={r}>
                    {PROMPT_ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
        {!isDefault && (
          <button type="button" className="btn-outline btn-sm" onClick={() => onChange(prompts, current.id)}>
            <Star className="h-3.5 w-3.5" aria-hidden /> Set as default
          </button>
        )}
        <button
          type="button"
          className="btn-outline btn-sm disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => setConfirmDelete(true)}
          disabled={isDefault}
          title={isDefault ? 'Make another unit the default first' : 'Delete this unit'}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
        </button>
      </div>
      {error && (
        <p id="prompt-name-error" className="text-xs text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-label="Tailor draft (HTML template)" className="flex min-w-0 flex-col rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/40">
          <TemplatePane
            html={current.templateHtml ?? ''}
            name={current.templateName ?? ''}
            onChange={(templateHtml, templateName) => update({ templateHtml, templateName })}
          />
        </section>
        <section aria-label="Prompt" className="flex min-w-0 flex-col rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/40">
          <ResumePromptField
            inCard
            value={current.body}
            onChange={(body) => update({ body })}
            label="Tailoring prompt"
            hint={
              isDefault
                ? 'Empty = inherit global.'
                : 'Empty = use this profile’s default prompt (or global if that’s empty too).'
            }
            defaultSource="global"
          />
        </section>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete the "${current.name.trim() || 'Untitled'}" unit?`}
        body={<p>Its tailor draft and prompt are removed when you save. Until then you can still leave without saving.</p>}
        confirmLabel="Delete"
        tone="danger"
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
