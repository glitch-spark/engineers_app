import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { JobApplyPromptOption } from '../../api/endpoints';
import { PROMPT_ROLE_LABEL } from '../prompts/promptRoles';

/**
 * The resume prompt a profile tailors this job with: the user's choice, else the prompt suggested from the job, else the
 * profile's default. Changing it saves at once.
 */
export function PromptCell({
  options,
  defaultId,
  suggestedId,
  chosenId,
  onChange,
}: {
  options: JobApplyPromptOption[];
  defaultId: string | null | undefined;
  suggestedId: string | null;
  chosenId: string | null;
  onChange: (promptId: string) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const has = (id: string | null | undefined): id is string => !!id && options.some((o) => o.id === id);
  const value = has(chosenId) ? chosenId : has(suggestedId) ? suggestedId : has(defaultId) ? defaultId : options[0]?.id;

  if (!value) return <span className="text-xs text-zinc-400">—</span>;
  if (options.length === 1) {
    return <span className="block max-w-[11rem] truncate text-zinc-700 dark:text-zinc-300">{options[0].name}</span>;
  }

  const label = (o: JobApplyPromptOption) => (o.role ? `${o.name} · ${PROMPT_ROLE_LABEL[o.role]}` : o.name);
  const tag = value === suggestedId && suggestedId !== defaultId ? 'Suggested' : value === defaultId ? 'Default' : '';

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        <select
          className="input w-auto max-w-[11rem] py-1 text-xs"
          value={value}
          disabled={saving}
          aria-label="Resume prompt"
          onChange={async (e) => {
            setSaving(true);
            try {
              await onChange(e.target.value);
            } finally {
              setSaving(false);
            }
          }}
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {label(o)}
            </option>
          ))}
        </select>
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" aria-hidden />}
      </div>
      {tag && (
        <span
          className={`text-[11px] ${tag === 'Suggested' ? 'font-medium text-violet-700 dark:text-violet-300' : 'text-zinc-500'}`}
          title={tag === 'Suggested' ? 'Matches the job’s role' : 'No prompt matches the job’s role'}
        >
          {tag}
        </span>
      )}
    </div>
  );
}
