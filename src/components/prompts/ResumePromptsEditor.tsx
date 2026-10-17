import { useEffect, useId, useRef, useState } from 'react';
import { Play, Plus, Radar, Star, Trash2 } from 'lucide-react';
import type { PromptRole, ResumePrompt } from '../../api/endpoints';
import ResumePromptField from '../ResumePromptField';
import { MAX_PROMPTS, MAX_PROMPT_NAME, NO_ROLE_LABEL, PROMPT_ROLES, PROMPT_ROLE_LABEL, newPromptId } from './promptRoles';

/**
 * A profile's resume prompts, one per role: a tab per prompt (★ default, • unsaved), the selected prompt's name, role,
 * default and delete controls, and its text (70%) beside the Eval panel (30%; the eval comes later).
 */
export default function ResumePromptsEditor({
  prompts,
  defaultId,
  onChange,
  dirtyIds,
  errors,
}: {
  prompts: ResumePrompt[];
  defaultId: string;
  onChange: (prompts: ResumePrompt[], defaultId: string) => void;
  /** Prompts with unsaved changes (their tab shows •). */
  dirtyIds: Set<string>;
  /** What's wrong with each prompt's name (id → message). */
  errors: Record<string, string>;
}) {
  const [selectedId, setSelectedId] = useState(prompts[0]?.id ?? '');
  const [lastIndex, setLastIndex] = useState(0);
  const nameRef = useRef<HTMLInputElement>(null);
  const [focusName, setFocusName] = useState(false);
  const ids = useId();

  // A saved prompt gets its real id from the server: keep the same tab selected by position.
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

  const select = (id: string) => {
    setSelectedId(id);
    setLastIndex(Math.max(0, prompts.findIndex((p) => p.id === id)));
  };
  const update = (patch: Partial<ResumePrompt>) =>
    onChange(prompts.map((p) => (p.id === current.id ? { ...p, ...patch } : p)), defaultId);
  const add = () => {
    const p: ResumePrompt = { id: newPromptId(), name: 'New prompt', roles: [], role: null, body: '' };
    onChange([...prompts, p], defaultId);
    setSelectedId(p.id);
    setLastIndex(prompts.length);
    setFocusName(true);
  };
  const remove = () => {
    if (isDefault || !window.confirm(`Delete the “${current.name}” prompt?`)) return;
    const i = prompts.findIndex((p) => p.id === current.id);
    const rest = prompts.filter((p) => p.id !== current.id);
    onChange(rest, defaultId);
    const next = rest[Math.min(i, rest.length - 1)];
    if (next) select(next.id);
  };

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Resume prompts" className="flex flex-wrap items-center gap-1.5">
        {prompts.map((p) => {
          const active = p.id === current.id;
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => select(p.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? 'border-sky-500 bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200'
                  : 'border-zinc-200 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800/60'
              } ${errors[p.id] ? 'border-red-400 dark:border-red-500' : ''}`}
            >
              <span className="max-w-[12rem] truncate">{p.name.trim() || 'Untitled'}</span>
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
          <button type="button" onClick={add} className="btn-outline btn-sm">
            <Plus className="h-3.5 w-3.5" aria-hidden /> Add prompt
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
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
        <div className="w-48">
          <label htmlFor={`${ids}-role`} className="form-label">
            Role
          </label>
          <select
            id={`${ids}-role`}
            className="input"
            value={current.role ?? ''}
            onChange={(e) => update({ role: (e.target.value || null) as PromptRole | null })}
          >
            <option value="">{NO_ROLE_LABEL}</option>
            {PROMPT_ROLES.map((r) => (
              <option key={r} value={r}>
                {PROMPT_ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        {!isDefault && (
          <button type="button" className="btn-outline btn-sm" onClick={() => onChange(prompts, current.id)}>
            <Star className="h-3.5 w-3.5" aria-hidden /> Set as default
          </button>
        )}
        <button
          type="button"
          className="btn-outline btn-sm"
          onClick={remove}
          disabled={isDefault}
          title={isDefault ? 'Make another prompt the default first' : 'Delete this prompt'}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
        </button>
      </div>
      {error && (
        <p id="prompt-name-error" className="text-xs text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[7fr_3fr]">
        <ResumePromptField
          value={current.body}
          onChange={(body) => update({ body })}
          label="Prompt"
          hint={
            isDefault
              ? 'Empty = inherit global.'
              : 'Empty = use this profile’s default prompt (or global if that’s empty too).'
          }
          defaultSource="global"
        />
        <aside aria-label="Eval" className="flex flex-col rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Eval</h3>
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
            <Radar className="h-8 w-8 text-zinc-300 dark:text-zinc-600" aria-hidden />
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">No eval yet</p>
            <p className="hint">This prompt’s eval diagram will show here.</p>
          </div>
          <button
            type="button"
            className="btn-outline btn-sm justify-center disabled:cursor-not-allowed disabled:opacity-50"
            disabled
            title="Coming soon"
          >
            <Play className="h-3.5 w-3.5" aria-hidden /> Run eval
          </button>
          <p className="hint mt-1 text-center">Coming soon</p>
        </aside>
      </div>
    </div>
  );
}
